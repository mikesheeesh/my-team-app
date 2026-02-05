import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoStateType } from "@react-native-community/netinfo"; // <--- ΔΙΟΡΘΩΣΗ 1
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert } from "react-native";
// Fix για Expo SDK 52+
import * as FileSystem from "expo-file-system/legacy";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import {
  uploadImageToStorage,
  uploadVideoToStorage,
  uploadBase64ToStorage,
  generateMediaId,
} from "../../utils/storageUtils";

const OFFLINE_QUEUE_PREFIX = "offline_tasks_queue_";
const MAX_SYNC_RETRIES = 3;

interface QueuedTask {
  task: any;
  retryCount: number;
}

// Validate if a local file:// URI still exists
const validateFileExists = async (uri: string): Promise<boolean> => {
  if (!uri || !uri.startsWith("file://")) return true;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
};

type SyncContextType = {
  isSyncing: boolean;
  syncNow: () => Promise<void>;
  justSyncedProjectId: string | null;
};

const SyncContext = createContext<SyncContextType>({
  isSyncing: false,
  syncNow: async () => {},
  justSyncedProjectId: null,
});

export const useSync = () => useContext(SyncContext);

export const SyncProvider = ({ children }: { children: React.ReactNode }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSyncedProjectId, setJustSyncedProjectId] = useState<string | null>(
    null,
  );

  const isSyncingRef = useRef(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setSyncState = (status: boolean) => {
    setIsSyncing(status);
    isSyncingRef.current = status;
  };

  // 1. LISTENER (Αυτόματος συγχρονισμός ΜΟΝΟ σε WiFi)
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // ΔΙΟΡΘΩΣΗ 2: Χρήση NetInfoStateType.wifi (μικρά γράμματα)
      if (
        state.isConnected &&
        state.type === NetInfoStateType.wifi &&
        !isSyncingRef.current
      ) {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

        syncTimeoutRef.current = setTimeout(() => {
          performGlobalSync();
        }, 1000);
      }
    });

    return () => {
      unsubscribe();
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

  // 2. Η ΚΥΡΙΑ ΛΟΓΙΚΗ ΤΟΥ SYNC (Εσωτερική συνάρτηση)
  const performGlobalSync = async () => {
    if (isSyncingRef.current) return;
    setSyncState(true);

    try {
      const keys = await AsyncStorage.getAllKeys();
      const queueKeys = keys.filter((k) => k.startsWith(OFFLINE_QUEUE_PREFIX));

      if (queueKeys.length === 0) {
        setSyncState(false);
        return;
      }

      console.log("⚡ Instant Sync Started...");

      for (const key of queueKeys) {
        const projectId = key.replace(OFFLINE_QUEUE_PREFIX, "");
        const json = await AsyncStorage.getItem(key);
        if (!json) continue;

        const rawList = JSON.parse(json);
        if (rawList.length === 0) {
          await AsyncStorage.removeItem(key);
          continue;
        }

        // Migrate old format (Task[]) to new format (QueuedTask[]) for backward compat
        let localList: QueuedTask[] = rawList.map((item: any) =>
          item.task ? item : { task: item, retryCount: 0 }
        );

        const projectRef = doc(db, "projects", projectId);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) {
          await AsyncStorage.removeItem(key);
          continue;
        }

        let currentCloudList = projectSnap.data().tasks || [];
        let changesMade = false;

        // Get teamId for Storage paths
        const teamId = projectSnap.data().teamId;
        if (!teamId) {
          console.error("⚠️ No teamId found for project:", projectId);
          await AsyncStorage.removeItem(key);
          continue;
        }

        // Track successfully synced tasks for removal
        const syncedTaskIds: string[] = [];

        for (const queuedItem of localList) {
          const task = queuedItem.task;
          let taskFailed = false;
          let finalValue = task.value;
          let processedImages: string[] = [];

          // Images -> Firebase Storage
          if (task.images && task.images.length > 0) {
            for (const imgUri of task.images) {
              if (!imgUri) continue;

              try {
                if (imgUri.startsWith("file://")) {
                  // Validate file exists before upload
                  const fileExists = await validateFileExists(imgUri);
                  if (!fileExists) {
                    console.warn("⚠️ Image file not found, skipping:", imgUri);
                    taskFailed = true; // Mark task as having issues
                    continue; // Skip this image
                  }
                  // Local file → Upload to Storage
                  const mediaId = generateMediaId();
                  const storageUrl = await uploadImageToStorage(
                    imgUri,
                    teamId,
                    projectId,
                    task.id,
                    mediaId
                  );
                  processedImages.push(storageUrl);
                  console.log("✓ Uploaded local image to Storage");
                } else if (imgUri.startsWith("data:image")) {
                  // Base64 data → Migrate to Storage
                  const mediaId = generateMediaId();
                  const storageUrl = await uploadBase64ToStorage(
                    imgUri,
                    teamId,
                    projectId,
                    task.id,
                    mediaId,
                    "image"
                  );
                  processedImages.push(storageUrl);
                  console.log("✓ Migrated base64 image to Storage");
                } else if (imgUri.startsWith("https://firebasestorage")) {
                  // Already in Storage → Keep as-is
                  processedImages.push(imgUri);
                } else {
                  // Unknown format → Keep as-is
                  processedImages.push(imgUri);
                }
              } catch (e) {
                console.error("Failed to process image:", e);
                taskFailed = true;
                // Don't keep invalid file:// URIs - they'll never work
                if (!imgUri.startsWith("file://")) {
                  processedImages.push(imgUri);
                }
              }
            }
          }

          // Videos -> Firebase Storage (for video arrays)
          let processedVideos: string[] = [];
          if (task.type === "video" && (task as any).videos) {
            const videoTask = task as any;
            for (const videoUri of videoTask.videos) {
              if (!videoUri) continue;

              try {
                if (videoUri.startsWith("file://")) {
                  // Validate file exists before upload
                  const fileExists = await validateFileExists(videoUri);
                  if (!fileExists) {
                    console.warn("⚠️ Video file not found, skipping:", videoUri);
                    taskFailed = true;
                    continue;
                  }
                  const mediaId = generateMediaId();
                  const storageUrl = await uploadVideoToStorage(
                    videoUri,
                    teamId,
                    projectId,
                    task.id,
                    mediaId
                  );
                  processedVideos.push(storageUrl);
                  console.log("✓ Uploaded local video to Storage");
                } else if (videoUri.startsWith("https://firebasestorage")) {
                  processedVideos.push(videoUri);
                } else if (videoUri.startsWith("data:video")) {
                  const mediaId = generateMediaId();
                  const storageUrl = await uploadBase64ToStorage(
                    videoUri,
                    teamId,
                    projectId,
                    task.id,
                    mediaId,
                    "video"
                  );
                  processedVideos.push(storageUrl);
                  console.log("✓ Migrated base64 video to Storage");
                } else {
                  processedVideos.push(videoUri);
                }
              } catch (error) {
                console.error("Video upload error:", error);
                taskFailed = true;
                // Don't keep invalid file:// URIs
                if (!videoUri.startsWith("file://")) {
                  processedVideos.push(videoUri);
                }
              }
            }
          }

          // Value -> Firebase Storage (for measurement/general only, not video)
          if (task.value && task.type !== "video") {
            try {
              if (task.value.startsWith("file://")) {
                // Validate file exists before upload
                const fileExists = await validateFileExists(task.value);
                if (!fileExists) {
                  console.warn("⚠️ Task value file not found:", task.value);
                  taskFailed = true;
                  finalValue = ""; // Clear invalid file reference
                } else {
                  // Local file → Upload to Storage (photos only, for backward compat)
                  const mediaId = generateMediaId();
                  if (task.type === "photo") {
                    finalValue = await uploadImageToStorage(
                      task.value,
                      teamId,
                      projectId,
                      task.id,
                      mediaId
                    );
                    console.log("✓ Uploaded local photo to Storage");
                  } else {
                    // measurement/general: keep as-is
                    finalValue = task.value;
                  }
                }
              } else if (task.value.startsWith("data:image")) {
                // Base64 data → Migrate to Storage
                const mediaId = generateMediaId();
                finalValue = await uploadBase64ToStorage(
                  task.value,
                  teamId,
                  projectId,
                  task.id,
                  mediaId,
                  "image"
                );
                console.log("✓ Migrated base64 image to Storage");
              } else {
                // Already Storage URL or text value → Keep as-is
                finalValue = task.value;
              }
            } catch (e) {
              console.error("Failed to process task value:", e);
              taskFailed = true;
              // Don't keep invalid file:// URIs
              if (!task.value.startsWith("file://")) {
                finalValue = task.value;
              } else {
                finalValue = "";
              }
            }
          }

          const { isLocal, ...cleanTask } = task;
          const taskReady: any = {
            ...cleanTask,
            images:
              processedImages.length > 0
                ? processedImages
                : cleanTask.images || [],
          };

          // Add videos for video tasks
          if (task.type === "video") {
            taskReady.videos = processedVideos.length > 0 ? processedVideos : (cleanTask as any).videos || [];
            taskReady.videoLocations = (cleanTask as any).videoLocations || [];
            // Remove old value field from video tasks
            delete taskReady.value;
          } else {
            // For measurement/general tasks, keep value
            taskReady.value = finalValue;
          }

          const existingIndex = currentCloudList.findIndex(
            (t: any) => t.id === taskReady.id,
          );
          if (existingIndex !== -1) {
            currentCloudList[existingIndex] = taskReady;
          } else {
            currentCloudList.push(taskReady);
          }
          changesMade = true;

          // Track this task as successfully synced (if no failures)
          if (!taskFailed) {
            syncedTaskIds.push(task.id);
          } else {
            // Increment retry counter for failed tasks
            queuedItem.retryCount++;
            console.log(`⚠️ Task ${task.id} failed, retry count: ${queuedItem.retryCount}`);
          }
        }

        if (changesMade) {
          const safeList = JSON.parse(
            JSON.stringify(currentCloudList, (k, v) =>
              v === undefined ? null : v,
            ),
          );

          // 1. ΑΝΕΒΑΣΜΑ
          try {
            await updateDoc(projectRef, { tasks: safeList });
            console.log(`✅ Uploaded: ${projectId}`);

            // 2. ΕΝΗΜΕΡΩΣΗ UI (ΑΜΕΣΩΣ!)
            setJustSyncedProjectId(projectId);

            // 3. CLEANUP - Remove only successfully synced tasks
            // Also remove tasks that exceeded max retries
            const remainingTasks = localList.filter((item) => {
              const taskId = item.task.id;

              // Remove if successfully synced
              if (syncedTaskIds.includes(taskId)) {
                return false;
              }

              // Remove if max retries exceeded
              if (item.retryCount >= MAX_SYNC_RETRIES) {
                console.error(`❌ Task ${taskId} exceeded max retries (${MAX_SYNC_RETRIES}), removing from queue`);
                return false;
              }

              // Keep for retry
              return true;
            });

            if (remainingTasks.length > 0) {
              // Save updated queue with retry counts
              await AsyncStorage.setItem(key, JSON.stringify(remainingTasks));
              console.log(`⏳ ${remainingTasks.length} tasks remaining in queue for retry`);
            } else {
              // All tasks synced, remove queue
              await AsyncStorage.removeItem(key);
            }

            // Καθαρισμός του σήματος μετά από λίγο
            setTimeout(() => setJustSyncedProjectId(null), 2000);
          } catch (updateError) {
            console.error(`❌ updateDoc failed for ${projectId}:`, updateError);
            // Increment retry count for all tasks that were being synced
            for (const item of localList) {
              if (syncedTaskIds.includes(item.task.id)) {
                item.retryCount++;
              }
            }
            // Save updated retry counts
            await AsyncStorage.setItem(key, JSON.stringify(localList));
          }
        }
      }
    } catch (error) {
      console.error("Sync Error:", error);
    } finally {
      // 4. ΚΑΜΙΑ ΚΑΘΥΣΤΕΡΗΣΗ - ΚΛΕΙΣΙΜΟ SPINNER ΑΜΕΣΩΣ
      setSyncState(false);
    }
  };

  // 3. ΧΕΙΡΟΚΙΝΗΤΟΣ ΣΥΓΧΡΟΝΙΣΜΟΣ (ΜΕ ΕΛΕΓΧΟ DATA)
  const handleManualSync = async () => {
    const netState = await NetInfo.fetch();

    if (!netState.isConnected) {
      Alert.alert("Offline", "Δεν υπάρχει σύνδεση στο διαδίκτυο.");
      return;
    }

    // ΔΙΟΡΘΩΣΗ 3: Χρήση NetInfoStateType.wifi
    if (netState.type === NetInfoStateType.wifi) {
      await performGlobalSync();
    }
    // ΔΙΟΡΘΩΣΗ 4: Χρήση NetInfoStateType.cellular
    else if (netState.type === NetInfoStateType.cellular) {
      Alert.alert(
        "Χρήση Δεδομένων",
        "Είστε συνδεδεμένοι με δεδομένα κινητής. Θέλετε να προχωρήσετε σε συγχρονισμό;",
        [
          { text: "Άκυρο", style: "cancel" },
          {
            text: "Ναι, Συνέχεια",
            onPress: () => performGlobalSync(),
          },
        ],
      );
    }
    // Άλλο δίκτυο
    else {
      await performGlobalSync();
    }
  };

  return (
    <SyncContext.Provider
      value={{ isSyncing, syncNow: handleManualSync, justSyncedProjectId }}
    >
      {children}
    </SyncContext.Provider>
  );
};
