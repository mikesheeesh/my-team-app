/**
 * Google Drive Sync Engine
 *
 * Orchestrates the full sync process:
 * 1. Get valid access token
 * 2. Load project + team data
 * 3. Hash-based change detection
 * 4. Create/ensure folder structure
 * 5. Download media from Firebase Storage → upload to Drive
 * 6. Generate PDFs for text/measurement tasks → upload to Drive
 * 7. Track sync state in Firestore
 */

import * as FileSystem from "expo-file-system/legacy";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { getValidAccessToken } from "./driveAuth";
import {
  getOrCreateFolder,
  uploadFileResumable,
} from "./driveApi";
import {
  generateMediaMetadataPdf,
  generateMeasurementsPdf,
  generateNotesPdf,
} from "./drivePdfGenerator";

// --- Types ---

type GeoPoint = { lat: number; lng: number };

interface PhotoTask {
  id: string;
  title: string;
  description?: string;
  type: "photo";
  status: string;
  images: string[];
  imageLocations: GeoPoint[];
  completedAt?: number;
}

interface VideoTask {
  id: string;
  title: string;
  description?: string;
  type: "video";
  status: string;
  videos: string[];
  videoLocations: GeoPoint[];
  completedAt?: number;
}

interface MeasurementTask {
  id: string;
  title: string;
  description?: string;
  type: "measurement";
  status: string;
  value: string;
  completedAt?: number;
}

interface GeneralTask {
  id: string;
  title: string;
  description?: string;
  type: "general";
  status: string;
  value: string;
  completedAt?: number;
}

type Task = PhotoTask | VideoTask | MeasurementTask | GeneralTask;

interface SyncState {
  lastSyncTimestamp: number;
  projects: {
    [projectId: string]: {
      lastSyncedTasksHash: string;
      syncedMedia: { [mediaKey: string]: { driveFileId: string; sourceUrl: string; syncedAt: number } };
      syncedPdfs: {
        [key: string]: {
          driveFileId: string;
          contentHash: string;
          syncedAt: number;
        };
      };
    };
  };
  folderIds: { [path: string]: string };
}

interface SyncProgress {
  current: number;
  total: number;
  message: string;
}

// --- Hash ---

const computeTasksHash = (tasks: Task[]): string => {
  const normalized = tasks.map((t) => ({
    id: t.id,
    type: t.type,
    title: t.title,
    description: t.description,
    status: t.status,
    ...(t.type === "photo"
      ? { images: (t as PhotoTask).images, imageLocations: (t as PhotoTask).imageLocations }
      : {}),
    ...(t.type === "video"
      ? { videos: (t as VideoTask).videos, videoLocations: (t as VideoTask).videoLocations }
      : {}),
    ...(t.type === "measurement" || t.type === "general"
      ? { value: (t as MeasurementTask | GeneralTask).value }
      : {}),
  }));
  const json = JSON.stringify(normalized);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash << 5) - hash + json.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
};

const computeContentHash = (data: any): string => {
  const json = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash << 5) - hash + json.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
};

// --- Sync State Management ---

const getSyncState = async (teamId: string): Promise<SyncState> => {
  try {
    const snap = await getDoc(doc(db, "driveSyncState", teamId));
    if (snap.exists()) return snap.data() as SyncState;
  } catch (e) {
    console.log("No existing sync state, creating new");
  }
  return { lastSyncTimestamp: 0, projects: {}, folderIds: {} };
};

const saveSyncState = async (
  teamId: string,
  state: SyncState
): Promise<void> => {
  await setDoc(doc(db, "driveSyncState", teamId), state);
};

// --- Folder Structure ---

const ensureFolderStructure = async (
  teamName: string,
  groupName: string,
  projectName: string,
  accessToken: string,
  syncState: SyncState
): Promise<{
  photos: string;
  videos: string;
  measurements: string;
  notes: string;
}> => {
  const getFolderId = async (
    pathKey: string,
    name: string,
    parentId: string
  ): Promise<string> => {
    if (syncState.folderIds[pathKey]) {
      return syncState.folderIds[pathKey];
    }
    const id = await getOrCreateFolder(name, parentId, accessToken);
    syncState.folderIds[pathKey] = id;
    return id;
  };

  // Level 0: Root
  const rootId = await getFolderId("root", "Ergon Work Management", "root");
  // Level 1: Team
  const teamId = await getFolderId(teamName, teamName, rootId);
  // Level 2: Group
  const groupKey = `${teamName}/${groupName}`;
  const groupId = await getFolderId(groupKey, groupName, teamId);
  // Level 3: Project
  const projectKey = `${teamName}/${groupName}/${projectName}`;
  const projectId = await getFolderId(projectKey, projectName, groupId);
  // Level 4: Type folders
  const photosId = await getFolderId(`${projectKey}/Φωτογραφίες`, "Φωτογραφίες", projectId);
  const videosId = await getFolderId(`${projectKey}/Βίντεο`, "Βίντεο", projectId);
  const measurementsId = await getFolderId(`${projectKey}/Μετρήσεις`, "Μετρήσεις", projectId);
  const notesId = await getFolderId(`${projectKey}/Κείμενο`, "Κείμενο", projectId);

  return {
    photos: photosId,
    videos: videosId,
    measurements: measurementsId,
    notes: notesId,
  };
};

// --- Media Sync ---

const downloadAndUploadMedia = async (
  storageUrl: string,
  mediaKey: string, // e.g. "task123/photo_1" - stable key for tracking
  filename: string,
  mimeType: string,
  driveFolderId: string,
  accessToken: string,
  syncState: SyncState,
  projectId: string
): Promise<string | null> => {
  // Check if already synced with same URL (no changes)
  const projectSync = syncState.projects[projectId];
  const existing = projectSync?.syncedMedia?.[mediaKey];
  if (existing && existing.sourceUrl === storageUrl) {
    return existing.driveFileId;
  }

  try {
    // Download from Firebase Storage to local temp
    const tempPath = FileSystem.cacheDirectory + filename;
    const downloadResult = await FileSystem.downloadAsync(storageUrl, tempPath);

    // Convert to blob
    const response = await fetch(downloadResult.uri);
    const blob = await response.blob();

    // Upload to Drive - update existing file if URL changed (e.g. edited photo)
    const existingFileId = existing?.driveFileId;
    const driveFileId = await uploadFileResumable(
      filename, blob, mimeType, driveFolderId, accessToken, existingFileId
    );

    // Clean up temp file
    await FileSystem.deleteAsync(tempPath, { idempotent: true });

    // Track as synced (by stable key, not URL)
    if (!syncState.projects[projectId]) {
      syncState.projects[projectId] = {
        lastSyncedTasksHash: "",
        syncedMedia: {},
        syncedPdfs: {},
      };
    }
    syncState.projects[projectId].syncedMedia[mediaKey] = {
      driveFileId,
      sourceUrl: storageUrl,
      syncedAt: Date.now(),
    };

    return driveFileId;
  } catch (error) {
    console.error(`Failed to sync media ${filename}:`, error);
    return null;
  }
};

const uploadPdfToDrive = async (
  pdfUri: string,
  filename: string,
  driveFolderId: string,
  accessToken: string,
  syncState: SyncState,
  projectId: string,
  pdfKey: string,
  contentHash: string
): Promise<void> => {
  try {
    // Check if PDF content has changed
    const existing = syncState.projects[projectId]?.syncedPdfs?.[pdfKey];
    if (existing && existing.contentHash === contentHash) {
      return; // No changes
    }

    // Read the PDF file
    const response = await fetch(pdfUri);
    const blob = await response.blob();

    // Upload (update existing or create new)
    const driveFileId = await uploadFileResumable(
      filename,
      blob,
      "application/pdf",
      driveFolderId,
      accessToken,
      existing?.driveFileId
    );

    // Clean up temp PDF
    await FileSystem.deleteAsync(pdfUri, { idempotent: true });

    // Track
    if (!syncState.projects[projectId]) {
      syncState.projects[projectId] = {
        lastSyncedTasksHash: "",
        syncedMedia: {},
        syncedPdfs: {},
      };
    }
    syncState.projects[projectId].syncedPdfs[pdfKey] = {
      driveFileId,
      contentHash,
      syncedAt: Date.now(),
    };
  } catch (error) {
    console.error(`Failed to upload PDF ${filename}:`, error);
    // Clean up temp file on error too
    try { await FileSystem.deleteAsync(pdfUri, { idempotent: true }); } catch {}
  }
};

// --- Main Sync Functions ---

/**
 * Sync a single project to Google Drive
 */
export const syncProjectToDrive = async (
  teamId: string,
  projectId: string,
  onProgress?: (progress: SyncProgress) => void,
  abortRef?: { current: boolean }
): Promise<boolean> => {
  try {
    // 1. Get valid access token
    const accessToken = await getValidAccessToken(teamId);
    if (!accessToken) {
      console.log("Drive not connected or token refresh failed");
      return false;
    }

    // 2. Load project data
    const projectSnap = await getDoc(doc(db, "projects", projectId));
    if (!projectSnap.exists()) return false;
    const projectData = projectSnap.data();
    const tasks: Task[] = (projectData.tasks || []).map((t: any) => t as Task);
    const projectName = projectData.title || "Χωρίς Τίτλο";

    // 3. Load team data
    const teamSnap = await getDoc(doc(db, "teams", teamId));
    if (!teamSnap.exists()) return false;
    const teamData = teamSnap.data();
    const teamName = teamData.name || "Χωρίς Όνομα";

    // Find which group this project belongs to
    let groupName = "Χωρίς Ομάδα";
    for (const group of teamData.groups || []) {
      if (group.projects?.some((p: any) => p.id === projectId)) {
        groupName = group.title;
        break;
      }
    }

    // 4. Check hash - skip if no changes
    const syncState = await getSyncState(teamId);
    const currentHash = computeTasksHash(tasks);
    const prevHash = syncState.projects[projectId]?.lastSyncedTasksHash;
    if (currentHash === prevHash) {
      console.log(`Drive sync: No changes for project ${projectName}`);
      return true;
    }

    onProgress?.({ current: 0, total: 1, message: "Δημιουργία φακέλων..." });

    // 5. Ensure folder structure
    const folders = await ensureFolderStructure(
      teamName, groupName, projectName, accessToken, syncState
    );

    if (abortRef?.current) return false;

    // Initialize project sync state
    if (!syncState.projects[projectId]) {
      syncState.projects[projectId] = {
        lastSyncedTasksHash: "",
        syncedMedia: {},
        syncedPdfs: {},
      };
    }

    // Count total items for progress
    const photoTasks = tasks.filter((t): t is PhotoTask => t.type === "photo" && (t as PhotoTask).images?.length > 0);
    const videoTasks = tasks.filter((t): t is VideoTask => t.type === "video" && (t as VideoTask).videos?.length > 0);
    const measurementTasks = tasks.filter((t): t is MeasurementTask => t.type === "measurement" && t.status === "completed");
    const generalTasks = tasks.filter((t): t is GeneralTask => t.type === "general" && t.status === "completed");

    let totalMedia = 0;
    photoTasks.forEach((t) => (totalMedia += t.images.length));
    videoTasks.forEach((t) => (totalMedia += t.videos.length));
    const totalPdfs = (photoTasks.length > 0 ? photoTasks.length : 0) +
      (videoTasks.length > 0 ? videoTasks.length : 0) +
      (measurementTasks.length > 0 ? 1 : 0) +
      (generalTasks.length > 0 ? 1 : 0);
    const totalItems = totalMedia + totalPdfs;
    let currentItem = 0;

    // 6. Sync photo tasks
    for (const task of photoTasks) {
      if (abortRef?.current) return false;

      // Create task subfolder inside Φωτογραφίες
      const taskFolderKey = `photos/${task.id}`;
      const taskFolderId = await getOrCreateFolder(
        task.title, folders.photos, accessToken
      );
      syncState.folderIds[taskFolderKey] = taskFolderId;

      // Upload each photo
      for (let i = 0; i < task.images.length; i++) {
        if (abortRef?.current) return false;
        const imgUrl = task.images[i];
        if (!imgUrl?.startsWith("https://")) continue;

        currentItem++;
        onProgress?.({
          current: currentItem,
          total: totalItems,
          message: `Φωτογραφίες: ${task.title}...`,
        });

        const filename = `photo_${i + 1}.jpg`;
        const mediaKey = `${task.id}/photo_${i + 1}`;
        await downloadAndUploadMedia(
          imgUrl, mediaKey, filename, "image/jpeg", taskFolderId, accessToken, syncState, projectId
        );
      }

      // Generate Στοιχεία.pdf for this photo task
      const metadataItems = task.images.map((img, i) => ({
        filename: `photo_${i + 1}.jpg`,
        description: task.description,
        location: task.imageLocations?.[i],
        date: task.completedAt ? new Date(task.completedAt).toLocaleDateString("el-GR") : undefined,
      }));

      const contentHash = computeContentHash(metadataItems);
      const pdfUri = await generateMediaMetadataPdf(task.title, "photo", metadataItems);
      currentItem++;
      onProgress?.({
        current: currentItem,
        total: totalItems,
        message: `PDF: ${task.title}...`,
      });

      await uploadPdfToDrive(
        pdfUri, "Στοιχεία.pdf", taskFolderId, accessToken, syncState, projectId,
        `photos/${task.id}/metadata`, contentHash
      );
    }

    // 7. Sync video tasks
    for (const task of videoTasks) {
      if (abortRef?.current) return false;

      // Create task subfolder inside Βίντεο
      const taskFolderKey = `videos/${task.id}`;
      const taskFolderId = await getOrCreateFolder(
        task.title, folders.videos, accessToken
      );
      syncState.folderIds[taskFolderKey] = taskFolderId;

      // Upload each video
      for (let i = 0; i < task.videos.length; i++) {
        if (abortRef?.current) return false;
        const videoUrl = task.videos[i];
        if (!videoUrl?.startsWith("https://")) continue;

        currentItem++;
        onProgress?.({
          current: currentItem,
          total: totalItems,
          message: `Βίντεο: ${task.title}...`,
        });

        const filename = `video_${i + 1}.mp4`;
        const mediaKey = `${task.id}/video_${i + 1}`;
        await downloadAndUploadMedia(
          videoUrl, mediaKey, filename, "video/mp4", taskFolderId, accessToken, syncState, projectId
        );
      }

      // Generate Στοιχεία.pdf for this video task
      const metadataItems = task.videos.map((vid, i) => ({
        filename: `video_${i + 1}.mp4`,
        description: task.description,
        location: task.videoLocations?.[i],
        date: task.completedAt ? new Date(task.completedAt).toLocaleDateString("el-GR") : undefined,
      }));

      const contentHash = computeContentHash(metadataItems);
      const pdfUri = await generateMediaMetadataPdf(task.title, "video", metadataItems);
      currentItem++;
      onProgress?.({
        current: currentItem,
        total: totalItems,
        message: `PDF: ${task.title}...`,
      });

      await uploadPdfToDrive(
        pdfUri, "Στοιχεία.pdf", taskFolderId, accessToken, syncState, projectId,
        `videos/${task.id}/metadata`, contentHash
      );
    }

    // 8. Sync measurements PDF
    if (measurementTasks.length > 0) {
      if (abortRef?.current) return false;
      currentItem++;
      onProgress?.({
        current: currentItem,
        total: totalItems,
        message: "PDF: Μετρήσεις...",
      });

      const tasksData = measurementTasks.map((t) => ({
        title: t.title,
        description: t.description,
        value: t.value,
        completedAt: t.completedAt,
      }));
      const contentHash = computeContentHash(tasksData);
      const pdfUri = await generateMeasurementsPdf(projectName, tasksData);
      await uploadPdfToDrive(
        pdfUri, "μετρήσεις.pdf", folders.measurements, accessToken, syncState, projectId,
        "measurements", contentHash
      );
    }

    // 9. Sync notes PDF
    if (generalTasks.length > 0) {
      if (abortRef?.current) return false;
      currentItem++;
      onProgress?.({
        current: currentItem,
        total: totalItems,
        message: "PDF: Σημειώσεις...",
      });

      const tasksData = generalTasks.map((t) => ({
        title: t.title,
        description: t.description,
        value: t.value,
        completedAt: t.completedAt,
      }));
      const contentHash = computeContentHash(tasksData);
      const pdfUri = await generateNotesPdf(projectName, tasksData);
      await uploadPdfToDrive(
        pdfUri, "σημειώσεις.pdf", folders.notes, accessToken, syncState, projectId,
        "notes", contentHash
      );
    }

    // 10. Update sync state
    syncState.projects[projectId].lastSyncedTasksHash = currentHash;
    syncState.lastSyncTimestamp = Date.now();
    await saveSyncState(teamId, syncState);

    console.log(`Drive sync complete for project: ${projectName}`);
    return true;
  } catch (error) {
    console.error("Drive sync error:", error);
    return false;
  }
};

/**
 * Sync all projects for a team
 */
export const syncTeamToDrive = async (
  teamId: string,
  onProgress?: (progress: SyncProgress) => void,
  abortRef?: { current: boolean }
): Promise<boolean> => {
  try {
    const teamSnap = await getDoc(doc(db, "teams", teamId));
    if (!teamSnap.exists()) return false;
    const teamData = teamSnap.data();

    // Collect all project IDs from groups
    const projectIds: string[] = [];
    for (const group of teamData.groups || []) {
      for (const project of group.projects || []) {
        projectIds.push(project.id);
      }
    }

    if (projectIds.length === 0) return true;

    let successCount = 0;
    for (let i = 0; i < projectIds.length; i++) {
      if (abortRef?.current) return false;

      onProgress?.({
        current: i + 1,
        total: projectIds.length,
        message: `Project ${i + 1}/${projectIds.length}...`,
      });

      const success = await syncProjectToDrive(
        teamId, projectIds[i], undefined, abortRef
      );
      if (success) successCount++;
    }

    console.log(`Team sync complete: ${successCount}/${projectIds.length} projects`);
    return successCount > 0;
  } catch (error) {
    console.error("Team sync error:", error);
    return false;
  }
};
