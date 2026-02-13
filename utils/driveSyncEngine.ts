/**
 * Google Drive Sync Engine
 *
 * Orchestrates the full sync process:
 * 1. Get valid access token
 * 2. Load project + team data
 * 3. Hash-based change detection
 * 4. Create/ensure folder structure
 * 5. Download media from Firebase Storage → upload to Drive
 * 6. Generate Excel for measurement/text tasks → upload to Drive
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
import { generateProjectExcel } from "./driveExcelGenerator";

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
  project: string;
  photos: string;
  videos: string;
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
  const projectFolderId = await getFolderId(projectKey, projectName, groupId);
  // Level 4: Media folders only (Excel goes directly in project folder)
  const photosId = await getFolderId(`${projectKey}/Φωτογραφίες`, "Φωτογραφίες", projectFolderId);
  const videosId = await getFolderId(`${projectKey}/Βίντεο`, "Βίντεο", projectFolderId);

  return {
    project: projectFolderId,
    photos: photosId,
    videos: videosId,
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

const uploadExcelToDrive = async (
  blob: Blob,
  filename: string,
  driveFolderId: string,
  accessToken: string,
  syncState: SyncState,
  projectId: string,
  contentHash: string
): Promise<void> => {
  try {
    // Check if content has changed
    const existing = syncState.projects[projectId]?.syncedPdfs?.["excel"];
    if (existing && existing.contentHash === contentHash) {
      return; // No changes
    }

    // Upload (update existing or create new)
    const driveFileId = await uploadFileResumable(
      filename,
      blob,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      driveFolderId,
      accessToken,
      existing?.driveFileId
    );

    // Track (reuse syncedPdfs map with key "excel")
    if (!syncState.projects[projectId]) {
      syncState.projects[projectId] = {
        lastSyncedTasksHash: "",
        syncedMedia: {},
        syncedPdfs: {},
      };
    }
    syncState.projects[projectId].syncedPdfs["excel"] = {
      driveFileId,
      contentHash,
      syncedAt: Date.now(),
    };
  } catch (error) {
    console.error(`Failed to upload Excel ${filename}:`, error);
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
    const measurementTasks = tasks.filter((t): t is MeasurementTask => t.type === "measurement");
    const generalTasks = tasks.filter((t): t is GeneralTask => t.type === "general");

    let totalMedia = 0;
    photoTasks.forEach((t) => (totalMedia += t.images.length));
    videoTasks.forEach((t) => (totalMedia += t.videos.length));
    // +1 for the Excel file (if there are measurement or general tasks)
    const hasExcelData = measurementTasks.length > 0 || generalTasks.length > 0;
    const totalItems = totalMedia + (hasExcelData ? 1 : 0);
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

      // Upload each photo (EXIF metadata is already embedded in the JPEG)
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
    }

    // 8. Generate and upload Excel (Μετρήσεις + Κείμενο sheets)
    if (hasExcelData) {
      if (abortRef?.current) return false;
      currentItem++;
      onProgress?.({
        current: currentItem,
        total: totalItems,
        message: "Excel: Μετρήσεις & Κείμενο...",
      });

      const excel = await generateProjectExcel(
        projectName,
        measurementTasks.map((t) => ({
          title: t.title,
          description: t.description,
          value: t.value,
          completedAt: t.completedAt,
          status: t.status,
        })),
        generalTasks.map((t) => ({
          title: t.title,
          description: t.description,
          value: t.value,
          completedAt: t.completedAt,
          status: t.status,
        }))
      );

      const contentHash = computeContentHash({
        measurements: measurementTasks.map((t) => ({ title: t.title, value: t.value, status: t.status, completedAt: t.completedAt })),
        general: generalTasks.map((t) => ({ title: t.title, value: t.value, status: t.status, completedAt: t.completedAt })),
      });

      await uploadExcelToDrive(
        excel.blob,
        `${projectName}.xlsx`,
        folders.project,
        accessToken,
        syncState,
        projectId,
        contentHash
      );

      // Clean up temp Excel file
      await FileSystem.deleteAsync(excel.uri, { idempotent: true });
    }

    // 9. Update sync state
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
