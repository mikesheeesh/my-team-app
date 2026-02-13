import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Network from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import InputModal from "../components/InputModal";
import { useDriveSync } from "../context/DriveSyncContext";
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
} from "../../utils/driveAuth";
import { deleteProjectMedia } from "../../utils/storageUtils";

// FIREBASE - Προστέθηκε το arrayUnion εδώ
import { onAuthStateChanged } from "firebase/auth";
import {
  arrayRemove,
  arrayUnion, // <--- ΔΙΟΡΘΩΣΗ ΕΔΩ
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

type Role = "Founder" | "Admin" | "Supervisor" | "User";
type User = { id: string; email: string; role: Role; name: string };
type Project = {
  id: string;
  title: string;
  status: "active" | "pending" | "completed";
  supervisors: string[];
  members: string[];
  createdBy?: string;
  teamId?: string;
};
type Group = { id: string; title: string; projects: Project[] };

export default function TeamProjectsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const teamId = id as string;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<Role>("User");
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [teamName, setTeamName] = useState("");
  const [teamContact, setTeamContact] = useState("");
  const [teamLogo, setTeamLogo] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const groupsRef = useRef<Group[]>([]);
  const userCacheRef = useRef(new Map<string, { fullname: string; email: string }>());
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [teamDriveConfig, setTeamDriveConfig] = useState<any>(null);

  // --- SEARCH & FILTER STATE ---
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "pending" | "completed"
  >("all");
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // --- NAVIGATION LOCK (500ms) ---
  const [isNavigating, setIsNavigating] = useState(false);

  const safeNavigate = (path: any) => {
    if (isNavigating) return;
    setIsNavigating(true);
    router.push(path);
    setTimeout(() => setIsNavigating(false), 500);
  };
  // -------------------------------

  // MODALS
  const [menuVisible, setMenuVisible] = useState(false);
  const [usersModalVisible, setUsersModalVisible] = useState(false);
  const [projectSettingsVisible, setProjectSettingsVisible] = useState(false);
  const [settingsSubMenuVisible, setSettingsSubMenuVisible] = useState(false);
  const [driveModalVisible, setDriveModalVisible] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const { isDriveSyncing, driveSyncProgress, triggerDriveSync } = useDriveSync();

  const [selectedProject, setSelectedProject] = useState<{
    groupId: string;
    project: Project;
  } | null>(null);
  const [moveModalVisible, setMoveModalVisible] = useState(false);

  // INPUT
  const [inputVisible, setInputVisible] = useState(false);
  const [inputMode, setInputMode] = useState<
    "teamName" | "newGroup" | "newProject"
  >("teamName");
  const [tempValue, setTempValue] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const CACHE_KEY = `cached_team_${teamId}`;

  // Keep groupsRef in sync with latest state
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  // 1. DATA LOADING (TEAM STRUCTURE)
  useEffect(() => {
    if (!teamId) return;

    const loadCache = async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          setTeamName(data.name);
          setTeamContact(data.contactEmail || "");
          setTeamLogo(data.logo || null);
          setGroups(data.groups || []);
          if (data.myRole) setMyRole(data.myRole);
          if (data.users) setUsers(data.users);
          setLoading(false);
        }
      } catch (e) {}
    };
    loadCache();

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUserId(user.uid);

        const teamRef = doc(db, "teams", teamId);
        const unsubscribeTeam = onSnapshot(
          teamRef,
          async (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();

              setTeamName(data.name);
              setTeamContact(data.contactEmail || "");
              setTeamLogo(data.logo || null);
              setTeamDriveConfig(data.driveConfig || null);

              const initialGroups = data.groups || [];

              // Αρχικοποίηση groups αν δεν υπάρχουν
              setGroups((prevGroups) => {
                if (prevGroups.length === 0) return initialGroups;
                // Αν υπάρχουν ήδη, κρατάμε τη δομή αλλά θα ενημερωθούν από τον άλλο listener
                // Απλά ενημερώνουμε τίτλους groups αν άλλαξαν
                return initialGroups.map((g: Group) => {
                  const existing = prevGroups.find((pg) => pg.id === g.id);
                  return existing ? { ...g, projects: existing.projects } : g;
                });
              });

              let role = "User";
              if (data.roles && data.roles[user.uid]) {
                role = data.roles[user.uid] as Role;
                setMyRole(role as Role);
              }

              let loadedUsers: User[] = [];
              if (data.memberIds && data.memberIds.length > 0) {
                for (const uid of data.memberIds) {
                  let cached = userCacheRef.current.get(uid);
                  if (!cached) {
                    try {
                      const userDoc = await getDoc(doc(db, "users", uid));
                      if (userDoc.exists()) {
                        const d = userDoc.data() as any;
                        cached = { fullname: d.fullname || "Μέλος", email: d.email || "..." };
                      } else {
                        cached = { fullname: "Μέλος", email: "..." };
                      }
                    } catch (e) {
                      cached = { fullname: "Μέλος", email: "..." };
                    }
                    userCacheRef.current.set(uid, cached);
                  }

                  loadedUsers.push({
                    id: uid,
                    name: cached.fullname,
                    email: uid === user.uid ? "Εγώ" : cached.email,
                    role: data.roles[uid] || "User",
                  });
                }
                setUsers(loadedUsers);
              }

              AsyncStorage.setItem(
                CACHE_KEY,
                JSON.stringify({
                  name: data.name,
                  contactEmail: data.contactEmail,
                  logo: data.logo,
                  groups: data.groups,
                  myRole: role,
                  users: loadedUsers,
                }),
              );

              setLoading(false);
            }
          },
          (error) => {
            console.log("Team Snapshot Error:", error);
            setLoading(false);
          },
        );

        return () => unsubscribeTeam();
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [teamId]);

  // 1.5. LOAD/SAVE FILTERS FROM ASYNCSTORAGE
  const FILTER_CACHE_KEY = `team_filters_${teamId}`;

  useEffect(() => {
    // Load saved filters on mount
    const loadFilters = async () => {
      try {
        const saved = await AsyncStorage.getItem(FILTER_CACHE_KEY);
        if (saved) {
          const { search, status } = JSON.parse(saved);
          if (search !== undefined) setSearchQuery(search);
          if (status !== undefined) setStatusFilter(status);
        }
      } catch (e) {
        console.log("Failed to load filters:", e);
      }
    };
    loadFilters();
  }, [teamId]);

  useEffect(() => {
    // Save filters whenever they change
    const saveFilters = async () => {
      try {
        await AsyncStorage.setItem(
          FILTER_CACHE_KEY,
          JSON.stringify({
            search: searchQuery,
            status: statusFilter,
          }),
        );
      } catch (e) {
        console.log("Failed to save filters:", e);
      }
    };
    saveFilters();
  }, [searchQuery, statusFilter, teamId]);

  // 2. LIVE PROJECT LISTENER (REAL-TIME UPDATES FOR COUNTS & STATUS)
  useEffect(() => {
    if (!teamId) return;
    const q = query(collection(db, "projects"), where("teamId", "==", teamId));

    const unsubscribeProjects = onSnapshot(q, (snapshot) => {
      // Φτιάχνουμε έναν χάρτη με τα φρέσκα δεδομένα από τη συλλογή 'projects'
      const freshProjectsMap = new Map();
      snapshot.docs.forEach((doc) => {
        freshProjectsMap.set(doc.id, { ...doc.data(), id: doc.id });
      });

      // Ενημερώνουμε τα groups ώστε να περιέχουν τα ΠΡΑΓΜΑΤΙΚΑ δεδομένα (counts, status)
      setGroups((currentGroups) => {
        let hasChanges = false;
        const updatedGroups = currentGroups.map((group) => ({
          ...group,
          projects: group.projects.map((proj) => {
            const freshData = freshProjectsMap.get(proj.id);
            if (freshData) {
              const tasks = freshData.tasks || [];
              let derivedStatus: "active" | "pending" | "completed" = freshData.status || "active";
              if (tasks.length > 0) {
                const done = tasks.filter((t: any) => t.status === "completed").length;
                if (done === tasks.length) derivedStatus = "completed";
                else if (done > 0) derivedStatus = "pending";
                else derivedStatus = "active";
              }
              if (proj.status !== derivedStatus) hasChanges = true;
              return {
                ...proj,
                status: derivedStatus,
                supervisors: freshData.supervisors || [],
                members: freshData.members || [],
              };
            }
            return proj;
          }),
        }));

        // Debounced sync στη βάση μόνο αν άλλαξε κάποιο status
        if (hasChanges) {
          if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
          syncDebounceRef.current = setTimeout(() => {
            // Use ref for latest groups (avoids stale closure after delete/create)
            const latestGroups = groupsRef.current;
            const groupsForDb = latestGroups.map((g) => ({
              id: g.id,
              title: g.title,
              projects: g.projects.map((p) => ({
                id: p.id,
                title: p.title,
                status: p.status,
                supervisors: p.supervisors || [],
                members: p.members || [],
                createdBy: p.createdBy || "",
                teamId: p.teamId || teamId,
              })),
            }));
            updateDoc(doc(db, "teams", teamId), { groups: groupsForDb }).catch(() => {});
          }, 5000);
        }

        return updatedGroups;
      });
    });

    return () => unsubscribeProjects();
  }, [teamId]);

  const checkOnline = async () => {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || !net.isInternetReachable) {
      Alert.alert("Offline", "Δεν έχετε ίντερνετ.");
      return false;
    }
    return true;
  };

  const updateTeamData = async (field: string, value: any) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    try {
      await updateDoc(doc(db, "teams", teamId), { [field]: value });
    } catch (err: any) {
      Alert.alert("Σφάλμα", err.message);
    }
  };

  const handleSaveInput = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) {
      setInputVisible(false);
      return;
    }

    if (!tempValue.trim()) return;

    try {
      if (inputMode === "newProject" && activeGroupId) {
        const newProjectId =
          Date.now().toString() + Math.random().toString(36).substr(2, 5);

        let initialSupervisors: string[] = [];
        if (myRole === "Supervisor") {
          initialSupervisors = [currentUserId];
        }

        const newProject: Project = {
          id: newProjectId,
          title: tempValue,
          status: "active",
          supervisors: initialSupervisors,
          members: [],
          createdBy: currentUserId,
          teamId: teamId,
        };

        // 1. Ενημέρωση της δομής του Group στο Team Doc
        const updatedGroups = groups.map((g) =>
          g.id === activeGroupId
            ? { ...g, projects: [...g.projects, newProject] }
            : g,
        );

        // Update local state immediately for UI refresh
        setGroups(updatedGroups);

        // Update Firestore
        await updateTeamData("groups", updatedGroups);

        // 2. Δημιουργία του εγγράφου στη συλλογή Projects
        await setDoc(doc(db, "projects", newProjectId), {
          ...newProject,
          tasks: [],
          createdAt: serverTimestamp(),
        });
      } else if (inputMode === "newGroup") {
        const newGroup: Group = {
          id: Date.now().toString(),
          title: tempValue,
          projects: [],
        };

        const updatedGroupsList = [...groups, newGroup];

        // Update local state immediately for UI refresh
        setGroups(updatedGroupsList);

        // Update Firestore
        await updateTeamData("groups", updatedGroupsList);
      } else if (inputMode === "teamName") {
        await updateTeamData("name", tempValue);
      }

      setInputVisible(false);
      setTempValue("");
      setMenuVisible(false);
      setSettingsSubMenuVisible(false);
    } catch (error: any) {
      Alert.alert("Σφάλμα", error.message);
    }
  };

  const changeUserRole = async (
    targetUser: User,
    action: "promote" | "demote" | "kick",
  ) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;

    if (myRole === "Supervisor" && targetUser.role !== "User")
      return Alert.alert(
        "Απαγορεύεται",
        "Μπορείτε να διαχειριστείτε μόνο απλούς χρήστες.",
      );
    if (targetUser.role === "Founder")
      return Alert.alert("Απαγορεύεται", "Δεν πειράζουμε τον Ιδρυτή.");

    if (action === "kick") {
      Alert.alert("Διαγραφή Μέλους", `Αφαίρεση "${targetUser.name}";`, [
        { text: "Άκυρο", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            setLoading(true); // Δείχνουμε ότι κάτι συμβαίνει
            try {
              // 1. ΔΙΑΓΡΑΦΗ ΑΠΟ ΤΗΝ ΟΜΑΔΑ
              setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
              await updateDoc(doc(db, "teams", teamId), {
                memberIds: arrayRemove(targetUser.id),
                [`roles.${targetUser.id}`]: deleteField(),
              });

              // 2. ΔΙΑΓΡΑΦΗ ΑΠΟ ΟΛΑ ΤΑ PROJECTS (Supervisors & Members)
              // Βρίσκουμε όλα τα projects αυτής της ομάδας
              const q = query(
                collection(db, "projects"),
                where("teamId", "==", teamId),
              );
              const querySnapshot = await getDocs(q);

              // Φτιάχνουμε ένα batch (ή promises) για να τα ενημερώσουμε όλα
              const updatePromises = querySnapshot.docs.map((doc) => {
                return updateDoc(doc.ref, {
                  supervisors: arrayRemove(targetUser.id),
                  members: arrayRemove(targetUser.id),
                });
              });

              await Promise.all(updatePromises);
            } catch (e) {
              console.log("Error removing user from projects:", e);
              Alert.alert(
                "Σφάλμα",
                "Ο χρήστης διαγράφηκε από την ομάδα, αλλά ίσως έμεινε σε κάποια projects.",
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ]);
      return;
    }

    let newRole: Role = targetUser.role;

    if (action === "promote") {
      if (targetUser.role === "User") newRole = "Supervisor";
      else if (targetUser.role === "Supervisor") newRole = "Admin";
    } else if (action === "demote") {
      if (targetUser.role === "Admin") newRole = "Supervisor";
      else if (targetUser.role === "Supervisor") newRole = "User";
    }

    if (newRole === targetUser.role) return;

    setUsers((prevUsers) =>
      prevUsers.map((u) =>
        u.id === targetUser.id ? { ...u, role: newRole } : u,
      ),
    );

    // Ενημέρωση του ρόλου στο Team Doc
    try {
      await updateDoc(doc(db, "teams", teamId), {
        [`roles.${targetUser.id}`]: newRole,
      });

      // Cleanup: Αφαίρεση από projects όταν αλλάζει ρόλος
      // ΔΕΝ προσθέτουμε αυτόματα στο νέο array, μόνο αφαιρούμε από το παλιό
      const q = query(
        collection(db, "projects"),
        where("teamId", "==", teamId),
      );
      const querySnapshot = await getDocs(q);

      const updatePromises = querySnapshot.docs.map((projectDoc) => {
        // Case 1: User → Supervisor → αφαίρεση από members[]
        if (targetUser.role === "User" && newRole === "Supervisor") {
          return updateDoc(projectDoc.ref, {
            members: arrayRemove(targetUser.id),
          });
        }
        // Case 2: Supervisor → User → αφαίρεση από supervisors[]
        else if (targetUser.role === "Supervisor" && newRole === "User") {
          return updateDoc(projectDoc.ref, {
            supervisors: arrayRemove(targetUser.id),
          });
        }
        // Case 3: Supervisor → Admin → αφαίρεση από supervisors[]
        else if (targetUser.role === "Supervisor" && newRole === "Admin") {
          return updateDoc(projectDoc.ref, {
            supervisors: arrayRemove(targetUser.id),
          });
        }
        // Case 4: Admin → Supervisor → τίποτα (οι Admins δεν ήταν σε projects)
        else {
          return Promise.resolve();
        }
      });

      await Promise.all(updatePromises);
    } catch (error) {
      console.error("Role update failed:", error);
      Alert.alert("Σφάλμα", "Η αλλαγή ρόλου απέτυχε.");
    }
  };

  const handleDeleteProject = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) return;

    if (!selectedProject) return;
    const { groupId, project } = selectedProject;

    Alert.alert("Διαγραφή Project", "Είστε σίγουροι;", [
      { text: "Ακύρωση" },
      {
        text: "Διαγραφή",
        style: "destructive",
        onPress: async () => {
          // Cancel any pending debounced sync (prevents stale data overwrite)
          if (syncDebounceRef.current) {
            clearTimeout(syncDebounceRef.current);
            syncDebounceRef.current = null;
          }

          // 1. Αφαίρεση από τη δομή του Group
          const updatedGroups = groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  projects: g.projects.filter((p) => p.id !== project.id),
                }
              : g,
          );

          // Update local state immediately for UI refresh
          setGroups(updatedGroups);

          // Update Firestore
          await updateTeamData("groups", updatedGroups);

          // 2. Διαγραφή media από Firebase Storage
          try {
            await deleteProjectMedia(teamId, project.id);
          } catch (e) {
            console.error("Storage cleanup failed:", e);
          }

          // 3. Διαγραφή του εγγράφου από τη συλλογή Projects
          try {
            await deleteDoc(doc(db, "projects", project.id));
          } catch (e) {}
          setProjectSettingsVisible(false);
        },
      },
    ]);
  };

  const toggleProjectRole = async (
    userId: string,
    type: "supervisor" | "member",
  ) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    if (!selectedProject) return;
    const { groupId, project } = selectedProject;

    // Ανανεωμένη λογική με arrayRemove/arrayUnion για ασφάλεια
    // Αντί να στέλνουμε όλο το array, στέλνουμε την εντολή προσθήκης/αφαίρεσης
    const projectRef = doc(db, "projects", project.id);
    const field = type === "supervisor" ? "supervisors" : "members";
    const currentList =
      type === "supervisor" ? project.supervisors : project.members;

    const isIncluded = currentList.includes(userId);

    try {
      if (isIncluded) {
        // Αφαίρεση
        await updateDoc(projectRef, {
          [field]: arrayRemove(userId),
        });
      } else {
        // Προσθήκη
        await updateDoc(projectRef, {
          [field]: arrayUnion(userId),
        });
      }

      // UI Optimistic Update (για να φαίνεται αμέσως στον χρήστη που το πάτησε)
      const updatedProject = { ...project };
      if (type === "supervisor") {
        updatedProject.supervisors = isIncluded
          ? updatedProject.supervisors.filter((id) => id !== userId)
          : [...updatedProject.supervisors, userId];
      } else {
        updatedProject.members = isIncluded
          ? updatedProject.members.filter((id) => id !== userId)
          : [...updatedProject.members, userId];
      }
      setSelectedProject({ groupId, project: updatedProject });
    } catch (e) {
      Alert.alert("Σφάλμα", "Η ενημέρωση απέτυχε");
    }
  };

  const pickLogo = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.2,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      const imageUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      await updateTeamData("logo", imageUri);
      setSettingsSubMenuVisible(false);
      setMenuVisible(false);
    }
  };

  const handleDeleteLogo = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    Alert.alert("Διαγραφή Logo", "Διαγραφή;", [
      { text: "Όχι" },
      {
        text: "Ναι",
        onPress: async () => {
          await updateTeamData("logo", null);
          setSettingsSubMenuVisible(false);
          setMenuVisible(false);
        },
      },
    ]);
  };

  const handleDeleteTeam = () => {
    Alert.alert("Διαγραφή Ομάδας", "ΠΡΟΣΟΧΗ: Θα διαγραφούν τα πάντα.", [
      { text: "Ακύρωση" },
      {
        text: "ΔΙΑΓΡΑΦΗ",
        style: "destructive",
        onPress: async () => {
          const isOnline = await checkOnline();
          if (!isOnline) return;
          await deleteDoc(doc(db, "teams", teamId));
          router.replace("/dashboard");
        },
      },
    ]);
  };

  const openInput = async (mode: typeof inputMode, groupId?: string) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    setInputMode(mode);
    setTempValue("");
    if (groupId) setActiveGroupId(groupId);
    setMenuVisible(false);
    setInputVisible(true);
  };

  const handleInvite = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    setMenuVisible(false);
    router.push({
      pathname: "/onboarding/invite",
      params: { teamId: teamId, teamName: teamName },
    });
  };

  const handleDeleteGroup = async (groupId: string, projectCount: number) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    if (projectCount > 0)
      return Alert.alert("Αδύνατη Διαγραφή", "Το Group δεν είναι άδειο.");
    Alert.alert("Διαγραφή Group", "Είστε σίγουροι;", [
      { text: "Όχι" },
      {
        text: "Ναι",
        style: "destructive",
        onPress: async () => {
          const updatedGroups = groups.filter((g) => g.id !== groupId);
          await updateTeamData("groups", updatedGroups);
        },
      },
    ]);
  };

  const handleMoveProject = async (targetGroupId: string) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    if (!selectedProject) return;
    const { groupId: oldGroupId, project } = selectedProject;
    const updatedGroups = groups.map((g) => {
      if (g.id === oldGroupId)
        return {
          ...g,
          projects: g.projects.filter((p) => p.id !== project.id),
        };
      if (g.id === targetGroupId)
        return { ...g, projects: [...g.projects, project] };
      return g;
    });

    // Update local state immediately for UI refresh
    setGroups(updatedGroups);

    // Update Firestore
    await updateTeamData("groups", updatedGroups);
    setMoveModalVisible(false);
    setProjectSettingsVisible(false);
  };

  // SEARCH & FILTER LOGIC
  const visibleGroups = groups
    .map((g) => {
      // 1. Filter by role (existing logic)
      let roleFilteredProjects = g.projects;
      if (myRole === "User") {
        roleFilteredProjects = g.projects.filter(
          (p) =>
            p.members.includes(currentUserId) ||
            p.supervisors.includes(currentUserId),
        );
      }

      // 2. Filter by status
      let statusFilteredProjects = roleFilteredProjects;
      if (statusFilter !== "all") {
        statusFilteredProjects = roleFilteredProjects.filter(
          (p) => p.status === statusFilter,
        );
      }

      // 3. Filter by search query (project title only - Option 1)
      let searchFilteredProjects = statusFilteredProjects;
      if (searchQuery.trim()) {
        searchFilteredProjects = statusFilteredProjects.filter((p) =>
          p.title.toLowerCase().includes(searchQuery.toLowerCase()),
        );
      }

      return { ...g, projects: searchFilteredProjects };
    })
    .filter((g) => myRole !== "User" || g.projects.length > 0);

  if (loading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          {teamLogo ? (
            <Image source={{ uri: teamLogo }} style={styles.teamLogo} />
          ) : (
            <View style={styles.teamLogoPlaceholder}>
              <Text style={{ color: "white", fontWeight: "bold" }}>
                {teamName.charAt(0)}
              </Text>
            </View>
          )}
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.headerTitle}>{teamName}</Text>
            <Text style={styles.headerSubtitle}>
              {myRole} • {teamContact}
            </Text>
          </View>
        </View>

        {isDriveSyncing && (
          <View style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}>
            <ActivityIndicator size="small" color="#4285f4" />
          </View>
        )}

        {(myRole === "Founder" ||
          myRole === "Admin" ||
          myRole === "Supervisor") && (
          <TouchableOpacity onPress={() => setMenuVisible(true)}>
            <Ionicons name="settings-outline" size={24} color="#333" />
          </TouchableOpacity>
        )}
      </View>

      {/* SEARCH & FILTER BAR - COMPACT VERSION */}
      <View style={styles.filterContainer}>
        <View style={styles.searchBar}>
          <Ionicons
            name="search"
            size={18}
            color="#94a3b8"
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Αναζήτηση projects..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Icon Button */}
        <TouchableOpacity
          style={[
            styles.filterIconBtn,
            statusFilter !== "all" && styles.filterIconBtnActive,
          ]}
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={statusFilter !== "all" ? "#2563eb" : "#64748b"}
          />
          {statusFilter !== "all" && (
            <View style={styles.filterBadge}>
              <View style={styles.filterBadgeDot} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* CONTENT */}
      <FlatList
        data={visibleGroups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 100 + insets.bottom },
        ]}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 50 }}>
            <Ionicons name="folder-open-outline" size={64} color="#ccc" />
            <Text style={{ color: "#999", marginTop: 10 }}>
              Δεν υπάρχουν έργα.
            </Text>
            {(myRole === "Founder" || myRole === "Admin") && (
              <Text style={{ color: "#2563eb", fontWeight: "bold" }}>
                Πατήστε το Γρανάζι για Νέο Group!
              </Text>
            )}
          </View>
        }
        renderItem={({ item: group }) => (
          <View style={styles.groupContainer}>
            <View style={styles.groupHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name="folder"
                  size={18}
                  color="#64748b"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.groupTitle}>{group.title}</Text>
              </View>
              {(myRole === "Founder" || myRole === "Admin") && (
                <TouchableOpacity
                  onPress={() =>
                    handleDeleteGroup(group.id, group.projects.length)
                  }
                >
                  <Ionicons name="trash-bin-outline" size={18} color="#999" />
                </TouchableOpacity>
              )}
            </View>

            {group.projects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={[
                  styles.projectCard,
                  project.status === "completed" && styles.projectCardCompleted,
                ]}
                // ΑΛΛΑΓΗ ΕΔΩ: Χρήση του safeNavigate
                onPress={() => safeNavigate(`/project/${project.id}`)}
                onLongPress={() => {
                  if (myRole !== "User") {
                    setSelectedProject({ groupId: group.id, project });
                    setProjectSettingsVisible(true);
                  }
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={[
                      styles.projectIconBox,
                      {
                        backgroundColor:
                          project.status === "completed"
                            ? "#f0fdf4"
                            : "#dbeafe",
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        project.status === "completed"
                          ? "checkmark-done"
                          : "document-text"
                      }
                      size={20}
                      color={
                        project.status === "completed" ? "#16a34a" : "#2563eb"
                      }
                    />
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <Text
                      style={[
                        styles.projectTitle,
                        project.status === "completed" &&
                          styles.projectTitleCompleted,
                      ]}
                    >
                      {project.title}
                    </Text>
                    {/* ΕΔΩ ΘΑ ΒΛΕΠΕΙΣ ΤΟΥΣ ΣΩΣΤΟΥΣ ΑΡΙΘΜΟΥΣ ΑΜΕΣΩΣ */}
                    <Text style={styles.projectMeta}>
                      Sup:{" "}
                      {project.supervisors ? project.supervisors.length : 0} •
                      Mem: {project.members ? project.members.length : 0}
                    </Text>
                  </View>
                </View>
                {myRole !== "User" && (
                  <Ionicons
                    name="ellipsis-vertical"
                    size={16}
                    color="#cbd5e1"
                  />
                )}
              </TouchableOpacity>
            ))}

            {(myRole === "Founder" ||
              myRole === "Admin" ||
              myRole === "Supervisor") && (
              <TouchableOpacity
                style={styles.addProjectBtn}
                onPress={() => openInput("newProject", group.id)}
              >
                <Ionicons name="add" size={20} color="#2563eb" />
                <Text style={styles.addProjectText}>Νέο Project</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      {/* --- MENU MODAL (GRID) --- */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeader}>Ενέργειες Ομάδας</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <View style={styles.optionsGrid}>
              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => openInput("newGroup")}
              >
                <View
                  style={[styles.optionIcon, { backgroundColor: "#eff6ff" }]}
                >
                  <Ionicons name="folder-open" size={28} color="#2563eb" />
                </View>
                <Text style={styles.optionText}>Νέο Group</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                onPress={handleInvite}
              >
                <View
                  style={[styles.optionIcon, { backgroundColor: "#f0fdf4" }]}
                >
                  <Ionicons name="person-add" size={28} color="#16a34a" />
                </View>
                <Text style={styles.optionText}>Πρόσκληση</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => {
                  setMenuVisible(false);
                  setUsersModalVisible(true);
                }}
              >
                <View
                  style={[styles.optionIcon, { backgroundColor: "#fef3c7" }]}
                >
                  <Ionicons name="people" size={28} color="#d97706" />
                </View>
                <Text style={styles.optionText}>Μέλη</Text>
              </TouchableOpacity>

              {(myRole === "Founder" || myRole === "Admin") && (
                <TouchableOpacity
                  style={styles.optionCard}
                  onPress={() => {
                    setMenuVisible(false);
                    setSettingsSubMenuVisible(true);
                  }}
                >
                  <View
                    style={[styles.optionIcon, { backgroundColor: "#f1f5f9" }]}
                  >
                    <Ionicons name="settings" size={28} color="#64748b" />
                  </View>
                  <Text style={styles.optionText}>Ρυθμίσεις</Text>
                </TouchableOpacity>
              )}
            </View>

            {myRole === "Founder" && (
              <TouchableOpacity
                style={styles.deleteTeamBtn}
                onPress={handleDeleteTeam}
              >
                <Text style={{ color: "red", fontWeight: "bold" }}>
                  Διαγραφή Ομάδας
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* --- SUB MENU SETTINGS --- */}
      <Modal visible={settingsSubMenuVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}
          >
            <Text style={styles.modalHeader}>Ρυθμίσεις</Text>

            <TouchableOpacity style={styles.menuItem} onPress={pickLogo}>
              <Ionicons name="image-outline" size={20} color="#333" />
              <Text style={styles.menuText}>Αλλαγή Logo</Text>
            </TouchableOpacity>
            {teamLogo && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleDeleteLogo}
              >
                <Ionicons name="trash-outline" size={20} color="red" />
                <Text style={[styles.menuText, { color: "red" }]}>
                  Διαγραφή Logo
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => openInput("teamName")}
            >
              <Ionicons name="create-outline" size={20} color="#333" />
              <Text style={styles.menuText}>Αλλαγή Ονόματος</Text>
            </TouchableOpacity>

            {(myRole === "Founder" || myRole === "Admin") && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setSettingsSubMenuVisible(false);
                  setDriveModalVisible(true);
                }}
              >
                <Ionicons name="cloud-upload-outline" size={20} color="#4285f4" />
                <Text style={[styles.menuText, { color: "#4285f4" }]}>
                  Google Drive Sync
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.closeMenuBtn}
              onPress={() => setSettingsSubMenuVisible(false)}
            >
              <Text style={{ color: "blue" }}>Πίσω</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- GOOGLE DRIVE MODAL --- */}
      <Modal visible={driveModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}
          >
            <Text style={styles.modalHeader}>Google Drive Sync</Text>

            {(() => {
              const driveConfig = teamDriveConfig;
              const connected = !!(driveConfig?.refreshToken && driveConfig?.connectedEmail);

              if (connected) {
                return (
                  <View>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e", marginRight: 8 }} />
                      <Text style={{ fontSize: 14, color: "#16a34a", fontWeight: "600" }}>Συνδεδεμένο</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                      Email: {driveConfig.connectedEmail}
                    </Text>
                    <Text style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                      Συνδέθηκε: {new Date(driveConfig.connectedAt).toLocaleDateString("el-GR")}
                    </Text>

                    {isDriveSyncing && driveSyncProgress && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, backgroundColor: "#eff6ff", padding: 10, borderRadius: 8 }}>
                        <ActivityIndicator size="small" color="#4285f4" />
                        <Text style={{ marginLeft: 8, fontSize: 12, color: "#3b82f6" }}>
                          {driveSyncProgress.message} ({driveSyncProgress.current}/{driveSyncProgress.total})
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#4285f4", padding: 14, borderRadius: 10, marginBottom: 10 }}
                      onPress={() => triggerDriveSync(teamId)}
                      disabled={isDriveSyncing}
                    >
                      <Ionicons name="sync-outline" size={18} color="white" />
                      <Text style={{ color: "white", fontWeight: "600", marginLeft: 8 }}>
                        {isDriveSyncing ? "Συγχρονισμός..." : "Συγχρονισμός Τώρα"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: 10, borderWidth: 1, borderColor: "#ef4444" }}
                      onPress={async () => {
                        Alert.alert(
                          "Αποσύνδεση Drive",
                          "Θέλετε να αποσυνδέσετε το Google Drive;",
                          [
                            { text: "Άκυρο", style: "cancel" },
                            {
                              text: "Αποσύνδεση",
                              style: "destructive",
                              onPress: async () => {
                                try {
                                  await disconnectGoogleDrive(teamId);
                                  Alert.alert("Επιτυχία", "Το Google Drive αποσυνδέθηκε.");
                                  setDriveModalVisible(false);
                                } catch {
                                  Alert.alert("Σφάλμα", "Αποτυχία αποσύνδεσης.");
                                }
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                      <Text style={{ color: "#ef4444", fontWeight: "600", marginLeft: 8 }}>
                        Αποσύνδεση Google Drive
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              } else {
                return (
                  <View>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#94a3b8", marginRight: 8 }} />
                      <Text style={{ fontSize: 14, color: "#64748b", fontWeight: "600" }}>Μη Συνδεδεμένο</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: "#64748b", marginBottom: 20, lineHeight: 20 }}>
                      Συνδέστε το Google Drive της ομάδας για αυτόματο backup φωτογραφιών, βίντεο και αρχείων.
                    </Text>

                    <TouchableOpacity
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#4285f4", padding: 14, borderRadius: 10 }}
                      onPress={async () => {
                        setDriveConnecting(true);
                        const result = await connectGoogleDrive(teamId);
                        setDriveConnecting(false);
                        if (result.success) {
                          Alert.alert("Επιτυχία", "Το Google Drive συνδέθηκε!");
                        } else {
                          Alert.alert("Σφάλμα", result.error || "Αποτυχία σύνδεσης.");
                        }
                      }}
                      disabled={driveConnecting}
                    >
                      {driveConnecting ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Ionicons name="cloud-upload-outline" size={18} color="white" />
                      )}
                      <Text style={{ color: "white", fontWeight: "600", marginLeft: 8 }}>
                        {driveConnecting ? "Σύνδεση..." : "Σύνδεση Google Drive"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }
            })()}

            <TouchableOpacity
              style={styles.closeMenuBtn}
              onPress={() => setDriveModalVisible(false)}
            >
              <Text style={{ color: "blue" }}>Κλείσιμο</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- SETTINGS MODAL (PROJECT) --- */}
      <Modal
        visible={projectSettingsVisible}
        animationType="slide"
        onRequestClose={() => setProjectSettingsVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Ρυθμίσεις Project</Text>
            <TouchableOpacity onPress={() => setProjectSettingsVisible(false)}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{
              padding: 20,
              paddingBottom: 50 + insets.bottom,
            }}
          >
            <Text style={styles.sectionTitle}>1. Supervisors</Text>
            {users
              .filter((u) => u.role === "Supervisor")
              .map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.checkItem}
                  onPress={() => toggleProjectRole(u.id, "supervisor")}
                >
                  <Ionicons
                    name={
                      selectedProject?.project.supervisors.includes(u.id)
                        ? "checkbox"
                        : "square-outline"
                    }
                    size={24}
                    color="#2563eb"
                  />
                  <Text style={{ marginLeft: 10 }}>{u.name}</Text>
                </TouchableOpacity>
              ))}
            <View style={{ height: 20 }} />
            <Text style={styles.sectionTitle}>2. Μέλη (Users)</Text>
            {users
              .filter((u) => u.role === "User")
              .map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.checkItem}
                  onPress={() => toggleProjectRole(u.id, "member")}
                >
                  <Ionicons
                    name={
                      selectedProject?.project.members.includes(u.id)
                        ? "checkbox"
                        : "square-outline"
                    }
                    size={24}
                    color="#16a34a"
                  />
                  <Text style={{ marginLeft: 10 }}>{u.name}</Text>
                </TouchableOpacity>
              ))}
            <View style={{ height: 30 }} />
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setMoveModalVisible(true)}
            >
              <Ionicons name="folder-outline" size={20} color="#333" />
              <Text style={{ fontWeight: "bold", marginLeft: 10 }}>
                Μεταφορά σε άλλο Group
              </Text>
            </TouchableOpacity>
            {myRole !== "User" && (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: "red" }]}
                onPress={handleDeleteProject}
              >
                <Ionicons name="trash-outline" size={20} color="red" />
                <Text
                  style={{ fontWeight: "bold", marginLeft: 10, color: "red" }}
                >
                  Διαγραφή Project
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MOVE MODAL */}
      <Modal visible={moveModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}
          >
            <Text style={styles.modalHeader}>Επιλέξτε Group</Text>
            {groups.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[
                  styles.menuItem,
                  g.id === selectedProject?.groupId && { opacity: 0.5 },
                ]}
                disabled={g.id === selectedProject?.groupId}
                onPress={() => handleMoveProject(g.id)}
              >
                <Ionicons name="folder-open" size={20} color="#333" />
                <Text style={styles.menuText}>{g.title}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.closeMenuBtn}
              onPress={() => setMoveModalVisible(false)}
            >
              <Text style={{ color: "red" }}>Ακύρωση</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* USERS MODAL */}
      <Modal
        visible={usersModalVisible}
        animationType="slide"
        onRequestClose={() => setUsersModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Χρήστες ({users.length})</Text>
            <TouchableOpacity onPress={() => setUsersModalVisible(false)}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{
              padding: 20,
              paddingBottom: 50 + insets.bottom,
            }}
            renderItem={({ item }) => (
              <View style={styles.userCard}>
                <View>
                  <Text style={{ fontWeight: "bold" }}>{item.name}</Text>
                  <Text style={{ fontSize: 12, color: "#666" }}>
                    {item.role}
                  </Text>
                </View>
                {item.id !== currentUserId &&
                  item.role !== "Founder" &&
                  (myRole === "Admin" ||
                    myRole === "Founder" ||
                    (myRole === "Supervisor" && item.role === "User")) && (
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      {(myRole === "Founder" || myRole === "Admin") &&
                        item.role !== "Admin" && (
                          <TouchableOpacity
                            onPress={() => changeUserRole(item, "promote")}
                          >
                            <Ionicons
                              name="arrow-up-circle"
                              size={28}
                              color="#22c55e"
                            />
                          </TouchableOpacity>
                        )}
                      {(myRole === "Founder" || myRole === "Admin") &&
                        item.role !== "User" && (
                          <TouchableOpacity
                            onPress={() => changeUserRole(item, "demote")}
                          >
                            <Ionicons
                              name="arrow-down-circle"
                              size={28}
                              color="#f59e0b"
                            />
                          </TouchableOpacity>
                        )}
                      <TouchableOpacity
                        onPress={() => changeUserRole(item, "kick")}
                      >
                        <Ionicons name="trash" size={28} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  )}
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* FILTER MODAL - BOTTOM SHEET */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeader}>Φίλτρα</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <Text
              style={{
                fontSize: 14,
                color: "#64748b",
                marginBottom: 16,
                fontWeight: "600",
              }}
            >
              ΚΑΤΑΣΤΑΣΗ PROJECT
            </Text>

            {/* Filter Options */}
            <TouchableOpacity
              style={[
                styles.filterOption,
                statusFilter === "all" && styles.filterOptionActive,
              ]}
              onPress={() => {
                setStatusFilter("all");
                setFilterModalVisible(false);
              }}
            >
              <Ionicons
                name={statusFilter === "all" ? "radio-button-on" : "radio-button-off"}
                size={24}
                color={statusFilter === "all" ? "#2563eb" : "#cbd5e1"}
              />
              <Text
                style={[
                  styles.filterOptionText,
                  statusFilter === "all" && styles.filterOptionTextActive,
                ]}
              >
                Όλα
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterOption,
                statusFilter === "active" && styles.filterOptionActive,
              ]}
              onPress={() => {
                setStatusFilter("active");
                setFilterModalVisible(false);
              }}
            >
              <Ionicons
                name={statusFilter === "active" ? "radio-button-on" : "radio-button-off"}
                size={24}
                color={statusFilter === "active" ? "#2563eb" : "#cbd5e1"}
              />
              <Text
                style={[
                  styles.filterOptionText,
                  statusFilter === "active" && styles.filterOptionTextActive,
                ]}
              >
                Ενεργά
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: "#dbeafe" }]}>
                <Text style={{ color: "#2563eb", fontSize: 10, fontWeight: "700" }}>
                  ACTIVE
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterOption,
                statusFilter === "pending" && styles.filterOptionActive,
              ]}
              onPress={() => {
                setStatusFilter("pending");
                setFilterModalVisible(false);
              }}
            >
              <Ionicons
                name={statusFilter === "pending" ? "radio-button-on" : "radio-button-off"}
                size={24}
                color={statusFilter === "pending" ? "#2563eb" : "#cbd5e1"}
              />
              <Text
                style={[
                  styles.filterOptionText,
                  statusFilter === "pending" && styles.filterOptionTextActive,
                ]}
              >
                Εκκρεμή
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: "#fef3c7" }]}>
                <Text style={{ color: "#d97706", fontSize: 10, fontWeight: "700" }}>
                  PENDING
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterOption,
                statusFilter === "completed" && styles.filterOptionActive,
              ]}
              onPress={() => {
                setStatusFilter("completed");
                setFilterModalVisible(false);
              }}
            >
              <Ionicons
                name={statusFilter === "completed" ? "radio-button-on" : "radio-button-off"}
                size={24}
                color={statusFilter === "completed" ? "#2563eb" : "#cbd5e1"}
              />
              <Text
                style={[
                  styles.filterOptionText,
                  statusFilter === "completed" && styles.filterOptionTextActive,
                ]}
              >
                Ολοκληρωμένα
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: "#dcfce7" }]}>
                <Text style={{ color: "#16a34a", fontSize: 10, fontWeight: "700" }}>
                  DONE
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <InputModal
        visible={inputVisible}
        onClose={() => setInputVisible(false)}
        onSave={handleSaveInput}
        title={
          inputMode === "newGroup"
            ? "Νέο Project Group"
            : inputMode === "newProject"
              ? "Νέο Project"
              : "Επεξεργασία"
        }
        value={tempValue}
        onChangeText={setTempValue}
        placeholder="Πληκτρολογήστε..."
        keyboardType="default"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", marginTop: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    paddingTop: 30,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: { marginRight: 10 },
  teamLogo: { width: 40, height: 40, borderRadius: 8 },
  teamLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "bold", color: "#111827" },
  headerSubtitle: { color: "#666", fontSize: 10 },
  content: { padding: 20 },

  // SEARCH & FILTER STYLES
  filterContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "white",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#1e293b",
  },
  filterIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    position: "relative",
  },
  filterIconBtnActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  filterBadge: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  filterBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 12,
  },
  filterOptionActive: {
    backgroundColor: "#f8fafc",
  },
  filterOptionText: {
    flex: 1,
    fontSize: 16,
    color: "#334155",
    fontWeight: "500",
  },
  filterOptionTextActive: {
    color: "#2563eb",
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  // GROUPS & PROJECTS UI
  groupContainer: { marginBottom: 30 },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 5,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  projectCard: {
    backgroundColor: "white",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#64748b",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  // --- COMPLETED STYLES ---
  projectCardCompleted: {
    backgroundColor: "#f0fdf4", // Ανοιχτό πράσινο background
    borderColor: "#86efac", // Πράσινο border
    borderWidth: 1,
    opacity: 0.8,
  },
  projectTitleCompleted: {
    textDecorationLine: "line-through",
    color: "#94a3b8",
  },
  // ------------------------

  projectIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  projectTitle: { fontSize: 16, fontWeight: "600", color: "#334155" },
  projectMeta: { fontSize: 11, color: "#94a3b8", marginTop: 2 },

  addProjectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginTop: 5,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  addProjectText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },

  // --- NICE MODAL STYLES (Menu Grid) ---
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    elevation: 20,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalHeader: { fontSize: 20, fontWeight: "800", color: "#0f172a" },

  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  optionCard: {
    width: "48%",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  optionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  optionText: { fontSize: 14, fontWeight: "700", color: "#1e293b" },

  deleteTeamBtn: { marginTop: 20, alignSelf: "center", padding: 10 },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  menuText: { marginLeft: 15, fontSize: 16, color: "#334155" },
  closeMenuBtn: { marginTop: 20, alignItems: "center", padding: 10 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 5,
    color: "#111827",
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    marginBottom: 10,
    justifyContent: "center",
  },
  userCard: {
    backgroundColor: "#f9fafb",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
  },
});
