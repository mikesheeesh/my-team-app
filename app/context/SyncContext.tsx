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

const OFFLINE_QUEUE_PREFIX = "offline_tasks_queue_";

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

        const localList = JSON.parse(json);
        if (localList.length === 0) {
          await AsyncStorage.removeItem(key);
          continue;
        }

        const projectRef = doc(db, "projects", projectId);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) {
          await AsyncStorage.removeItem(key);
          continue;
        }

        let currentCloudList = projectSnap.data().tasks || [];
        let changesMade = false;

        for (const task of localList) {
          let finalValue = task.value;
          let processedImages: string[] = [];

          // Images -> Base64
          if (task.images && task.images.length > 0) {
            for (const imgUri of task.images) {
              if (imgUri && imgUri.startsWith("file://")) {
                try {
                  const base64Data = await FileSystem.readAsStringAsync(
                    imgUri,
                    { encoding: "base64" },
                  );
                  processedImages.push(`data:image/jpeg;base64,${base64Data}`);
                } catch (e) {
                  console.log("Skip Img", e);
                }
              } else {
                processedImages.push(imgUri);
              }
            }
          }
          // Value -> Base64
          if (
            task.type === "photo" &&
            task.value &&
            task.value.startsWith("file://")
          ) {
            try {
              const base64Data = await FileSystem.readAsStringAsync(
                task.value,
                { encoding: "base64" },
              );
              finalValue = `data:image/jpeg;base64,${base64Data}`;
            } catch (e) {}
          }

          const { isLocal, ...cleanTask } = task;
          const taskReady = {
            ...cleanTask,
            value: finalValue,
            images:
              processedImages.length > 0
                ? processedImages
                : cleanTask.images || [],
          };

          const existingIndex = currentCloudList.findIndex(
            (t: any) => t.id === taskReady.id,
          );
          if (existingIndex !== -1) {
            currentCloudList[existingIndex] = taskReady;
          } else {
            currentCloudList.push(taskReady);
          }
          changesMade = true;
        }

        if (changesMade) {
          const safeList = JSON.parse(
            JSON.stringify(currentCloudList, (k, v) =>
              v === undefined ? null : v,
            ),
          );

          // 1. ΑΝΕΒΑΣΜΑ
          await updateDoc(projectRef, { tasks: safeList });
          console.log(`✅ Uploaded: ${projectId}`);

          // 2. ΕΝΗΜΕΡΩΣΗ UI (ΑΜΕΣΩΣ!)
          setJustSyncedProjectId(projectId);

          // 3. CLEANUP (Μετά την ενημέρωση UI για ταχύτητα)
          await AsyncStorage.removeItem(key);

          // Καθαρισμός του σήματος μετά από λίγο
          setTimeout(() => setJustSyncedProjectId(null), 2000);
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
