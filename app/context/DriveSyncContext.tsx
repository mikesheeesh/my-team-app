/**
 * DriveSyncContext
 *
 * Manages automatic Google Drive sync:
 * - Listens for project changes via onSnapshot
 * - Debounces 30 seconds after last change
 * - WiFi-only for media sync
 * - Provides sync status to UI
 */

import NetInfo, { NetInfoStateType } from "@react-native-community/netinfo";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert } from "react-native";
import { auth, db } from "../../firebaseConfig";
import { isDriveConnected } from "../../utils/driveAuth";
import { syncTeamToDrive } from "../../utils/driveSyncEngine";

const SYNC_DEBOUNCE_MS = 5_000; // 5 seconds after last change

interface SyncProgress {
  current: number;
  total: number;
  message: string;
}

interface DriveSyncContextType {
  isDriveSyncing: boolean;
  driveSyncProgress: SyncProgress | null;
  lastDriveSyncTime: number | null;
  triggerDriveSync: (teamId: string) => Promise<void>;
}

const DriveSyncContext = createContext<DriveSyncContextType>({
  isDriveSyncing: false,
  driveSyncProgress: null,
  lastDriveSyncTime: null,
  triggerDriveSync: async () => {},
});

export const useDriveSync = () => useContext(DriveSyncContext);

export const DriveSyncProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [driveSyncProgress, setDriveSyncProgress] =
    useState<SyncProgress | null>(null);
  const [lastDriveSyncTime, setLastDriveSyncTime] = useState<number | null>(
    null
  );

  const isSyncingRef = useRef(false);
  const abortRef = useRef(false);
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const connectedTeamsRef = useRef<Map<string, any>>(new Map());

  // Check WiFi
  const isWiFiConnected = async (): Promise<boolean> => {
    try {
      const state = await NetInfo.fetch();
      return state.isConnected === true && state.type === NetInfoStateType.wifi;
    } catch {
      return false;
    }
  };

  // Manual/forced sync for a specific team
  const triggerDriveSync = async (teamId: string) => {
    if (isSyncingRef.current) return;

    const hasWiFi = await isWiFiConnected();
    if (!hasWiFi) {
      Alert.alert("Drive Sync", "Δεν υπάρχει σύνδεση WiFi");
      return;
    }

    isSyncingRef.current = true;
    setIsDriveSyncing(true);
    abortRef.current = false;

    try {
      const success = await syncTeamToDrive(
        teamId,
        (progress) => setDriveSyncProgress(progress),
        abortRef
      );
      setLastDriveSyncTime(Date.now());
      if (success) {
        Alert.alert("Drive Sync", "Ο συγχρονισμός ολοκληρώθηκε!");
      } else {
        Alert.alert("Drive Sync", "Ο συγχρονισμός απέτυχε. Δοκιμάστε ξανά.");
      }
    } catch (error: any) {
      console.error("Manual drive sync failed:", error);
      Alert.alert("Drive Sync Error", error.message || "Άγνωστο σφάλμα");
    } finally {
      isSyncingRef.current = false;
      setIsDriveSyncing(false);
      setDriveSyncProgress(null);
    }
  };

  // Auto-sync on project changes (debounced)
  const scheduleSync = (teamId: string) => {
    // Clear existing timer for this team
    const existing = debounceTimersRef.current.get(teamId);
    if (existing) clearTimeout(existing);

    // Set new debounce timer
    const timer = setTimeout(async () => {
      debounceTimersRef.current.delete(teamId);

      if (isSyncingRef.current) return;

      const hasWiFi = await isWiFiConnected();
      if (!hasWiFi) {
        console.log("Drive auto-sync: No WiFi, postponing");
        return;
      }

      // Check if Drive is still connected
      const teamDoc = connectedTeamsRef.current.get(teamId);
      if (!teamDoc || !isDriveConnected(teamDoc)) return;

      console.log("Drive auto-sync: Starting for team", teamId);
      isSyncingRef.current = true;
      setIsDriveSyncing(true);
      abortRef.current = false;

      try {
        await syncTeamToDrive(
          teamId,
          (progress) => setDriveSyncProgress(progress),
          abortRef
        );
        setLastDriveSyncTime(Date.now());
      } catch (error) {
        console.error("Auto drive sync failed:", error);
      } finally {
        isSyncingRef.current = false;
        setIsDriveSyncing(false);
        setDriveSyncProgress(null);
      }
    }, SYNC_DEBOUNCE_MS);

    debounceTimersRef.current.set(teamId, timer);
  };

  // Listen for auth + team changes to set up project listeners
  useEffect(() => {
    let unsubAuth: (() => void) | null = null;
    const unsubTeams: (() => void)[] = [];
    const unsubProjects: (() => void)[] = [];

    unsubAuth = onAuthStateChanged(auth, async (user) => {
      // Clean up previous listeners
      unsubTeams.forEach((u) => u());
      unsubTeams.length = 0;
      unsubProjects.forEach((u) => u());
      unsubProjects.length = 0;

      if (!user) return;

      // Listen for teams the user is a member of
      const teamsQuery = query(
        collection(db, "teams"),
        where("memberIds", "array-contains", user.uid)
      );

      const unsubTeamListener = onSnapshot(teamsQuery, (snapshot) => {
        // Clean up old project listeners
        unsubProjects.forEach((u) => u());
        unsubProjects.length = 0;

        for (const teamDoc of snapshot.docs) {
          const teamData = teamDoc.data();
          const teamId = teamDoc.id;

          // Cache team data
          connectedTeamsRef.current.set(teamId, teamData);

          // Only listen if Drive is connected
          if (!isDriveConnected(teamData)) continue;

          // Listen to projects for this team
          const projectsQuery = query(
            collection(db, "projects"),
            where("teamId", "==", teamId)
          );

          const unsubProjectListener = onSnapshot(
            projectsQuery,
            (projectSnap) => {
              // Any project change triggers debounced sync
              if (projectSnap.docChanges().length > 0) {
                scheduleSync(teamId);
              }
            }
          );

          unsubProjects.push(unsubProjectListener);
        }
      });

      unsubTeams.push(unsubTeamListener);
    });

    // WiFi drop detection - abort ongoing sync
    const unsubNet = NetInfo.addEventListener((state) => {
      const hasWiFi =
        state.isConnected === true && state.type === NetInfoStateType.wifi;
      if (!hasWiFi && isSyncingRef.current) {
        console.log("Drive sync: WiFi dropped, aborting");
        abortRef.current = true;
      }
    });

    return () => {
      unsubAuth?.();
      unsubTeams.forEach((u) => u());
      unsubProjects.forEach((u) => u());
      unsubNet();
      // Clear all debounce timers
      debounceTimersRef.current.forEach((timer) => clearTimeout(timer));
      debounceTimersRef.current.clear();
    };
  }, []);

  return (
    <DriveSyncContext.Provider
      value={{
        isDriveSyncing,
        driveSyncProgress,
        lastDriveSyncTime,
        triggerDriveSync,
      }}
    >
      {children}
    </DriveSyncContext.Provider>
  );
};
