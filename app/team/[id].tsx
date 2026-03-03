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
  Linking,
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
  getValidAccessToken,
} from "../../utils/driveAuth";
import { revokeEmailAccess } from "../../utils/driveApi";

// FIREBASE - Προστέθηκε το arrayUnion εδώ
import { onAuthStateChanged } from "firebase/auth";
import {
  arrayRemove,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
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
  isClosed?: boolean;
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
  const [teamDriveConfig, setTeamDriveConfig] = useState<any>(null);

  // --- SEARCH STATE ---
  const [searchQuery, setSearchQuery] = useState("");

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
  const [settingsSubMenuVisible, setSettingsSubMenuVisible] = useState(false);
  const [driveModalVisible, setDriveModalVisible] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const { isDriveSyncing, driveSyncProgress, triggerDriveSync } = useDriveSync();

  // INPUT
  const [inputVisible, setInputVisible] = useState(false);
  const [inputMode, setInputMode] = useState<"teamName" | "newGroup">(
    "teamName",
  );
  const [tempValue, setTempValue] = useState("");

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

              // Άμεση ενημέρωση — η ομάδα δεν έχει 2ο listener, χρησιμοποιούμε πάντα τα φρέσκα δεδομένα
              setGroups(initialGroups);

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
      if (inputMode === "newGroup") {
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

              // 3. ΑΚΥΡΩΣΗ DRIVE ΠΡΟΣΒΑΣΗΣ (μόνο αν ήταν Admin ή Founder)
              if (targetUser.role === "Admin" || targetUser.role === "Founder") {
                try {
                  const accessToken = await getValidAccessToken(teamId);
                  if (accessToken) {
                    const syncDoc = await getDoc(doc(db, "driveSyncState", teamId));
                    const syncData = syncDoc.data();
                    if (syncData) {
                      const teamSnap = await getDoc(doc(db, "teams", teamId));
                      const tName = teamSnap.data()?.name;
                      const teamFolderId = tName ? syncData.folderIds?.[tName] : null;
                      if (teamFolderId && targetUser.email) {
                        await revokeEmailAccess(teamFolderId, targetUser.email, accessToken);
                      }
                      // Remove from sharedWith list
                      const sharedWith: string[] = syncData.sharedWith || [];
                      const updated = sharedWith.filter((uid) => uid !== targetUser.id);
                      await updateDoc(doc(db, "driveSyncState", teamId), { sharedWith: updated });
                    }
                  }
                } catch (e) {
                  console.log("Drive revoke error:", e);
                }
              }
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

      // Ακύρωση Drive πρόσβασης αν demote από Admin σε χαμηλότερο ρόλο
      // (Founder check not needed — guarded at line 302)
      if (action === "demote" && targetUser.role === "Admin") {
        try {
          const accessToken = await getValidAccessToken(teamId);
          if (accessToken) {
            const syncDoc = await getDoc(doc(db, "driveSyncState", teamId));
            const syncData = syncDoc.data();
            if (syncData) {
              const teamFolderId = syncData.folderIds?.[teamName];
              if (teamFolderId && targetUser.email) {
                await revokeEmailAccess(teamFolderId, targetUser.email, accessToken);
              }
              const sharedWith: string[] = syncData.sharedWith || [];
              const updated = sharedWith.filter((uid) => uid !== targetUser.id);
              await updateDoc(doc(db, "driveSyncState", teamId), { sharedWith: updated });
            }
          }
        } catch (e) {
          console.log("Drive revoke on demote error:", e);
        }
      }
    } catch (error) {
      console.error("Role update failed:", error);
      Alert.alert("Σφάλμα", "Η αλλαγή ρόλου απέτυχε.");
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

  const openInput = async (mode: typeof inputMode) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    setInputMode(mode);
    setTempValue("");
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
      return Alert.alert("Αδύνατη Διαγραφή", "Το Project δεν είναι άδειο.");
    Alert.alert("Διαγραφή Project", "Είστε σίγουροι;", [
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


  // SEARCH LOGIC — filter groups by title
  const visibleGroups = groups
    .filter((g) => {
      // Role filter: Users only see groups where they have at least one assigned project
      if (myRole === "User") {
        return g.projects.some(
          (p) =>
            p.members.includes(currentUserId) ||
            p.supervisors.includes(currentUserId),
        );
      }
      return true;
    })
    .filter((g) =>
      !searchQuery.trim() ||
      g.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );

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

      {/* SEARCH BAR */}
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
              Δεν υπάρχουν projects.
            </Text>
            {(myRole === "Founder" || myRole === "Admin") && (
              <Text style={{ color: "#2563eb", fontWeight: "bold" }}>
                Πατήστε το Γρανάζι για Νέο Project!
              </Text>
            )}
          </View>
        }
        renderItem={({ item: group }) => {
          const allClosed =
            group.projects.length > 0 &&
            group.projects.every((p) => p.isClosed);
          return (
            <TouchableOpacity
              style={[styles.groupCard, allClosed && styles.groupCardCompleted]}
              onPress={() =>
                safeNavigate({
                  pathname: `/group/${group.id}`,
                  params: { teamId },
                })
              }
            >
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                <View style={[styles.groupIconBox, allClosed && { backgroundColor: "#dcfce7" }]}>
                  <Ionicons
                    name={allClosed ? "checkmark-circle" : "folder"}
                    size={22}
                    color={allClosed ? "#16a34a" : "#2563eb"}
                  />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={[styles.groupTitle, allClosed && { color: "#16a34a" }]}>
                    {group.title}
                  </Text>
                  <Text style={styles.groupMeta}>
                    {allClosed ? "✅ Ολοκληρωμένο" : `${group.projects.length} υποέργα`}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                {(myRole === "Founder" || myRole === "Admin") && (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteGroup(group.id, group.projects.length);
                    }}
                  >
                    <Ionicons name="trash-bin-outline" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                )}
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </View>
            </TouchableOpacity>
          );
        }}
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
                <Text style={styles.optionText}>Νέο Project</Text>
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

              {(myRole === "Founder" || myRole === "Admin") && (
                <TouchableOpacity
                  style={styles.optionCard}
                  onPress={async () => {
                    const net = await Network.getNetworkStateAsync();
                    if (!net.isConnected) {
                      Alert.alert("Offline", "Δεν υπάρχει σύνδεση στο διαδίκτυο.");
                      return;
                    }
                    setMenuVisible(false);
                    Linking.openURL("https://ergon-work.web.app/admin/");
                  }}
                >
                  <View
                    style={[styles.optionIcon, { backgroundColor: "#eff6ff" }]}
                  >
                    <Ionicons name="globe-outline" size={28} color="#3b82f6" />
                  </View>
                  <Text style={styles.optionText}>Admin Panel</Text>
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
                      onPress={async () => {
                        const net = await Network.getNetworkStateAsync();
                        if (!net.isConnected) {
                          Alert.alert("Offline", "Δεν υπάρχει σύνδεση στο διαδίκτυο.");
                          return;
                        }
                        triggerDriveSync(teamId);
                      }}
                      disabled={isDriveSyncing}
                    >
                      <Ionicons name="sync-outline" size={18} color="white" />
                      <Text style={{ color: "white", fontWeight: "600", marginLeft: 8 }}>
                        {isDriveSyncing ? "Συγχρονισμός..." : "Συγχρονισμός Τώρα"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#34a853", padding: 14, borderRadius: 10, marginBottom: 10 }}
                      onPress={async () => {
                        const net = await Network.getNetworkStateAsync();
                        if (!net.isConnected) {
                          Alert.alert("Offline", "Δεν υπάρχει σύνδεση στο διαδίκτυο.");
                          return;
                        }
                        try {
                          const syncDoc = await getDoc(doc(db, "driveSyncState", teamId));
                          const folderIds = syncDoc.data()?.folderIds;
                          if (!folderIds) {
                            Alert.alert("Σφάλμα", "Δεν έχει γίνει ακόμα συγχρονισμός. Κάντε πρώτα συγχρονισμό.");
                            return;
                          }
                          const folderId = folderIds[teamName] || folderIds["root"];
                          if (!folderId) {
                            Alert.alert("Σφάλμα", "Δεν βρέθηκε φάκελος Drive. Κάντε πρώτα συγχρονισμό.");
                            return;
                          }
                          await Linking.openURL(`https://drive.google.com/drive/folders/${folderId}`);
                        } catch {
                          Alert.alert("Σφάλμα", "Αποτυχία ανοίγματος Google Drive.");
                        }
                      }}
                    >
                      <Ionicons name="folder-open-outline" size={18} color="white" />
                      <Text style={{ color: "white", fontWeight: "600", marginLeft: 8 }}>
                        Άνοιγμα στο Drive
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: 10, borderWidth: 1, borderColor: "#ef4444" }}
                      onPress={async () => {
                        const net = await Network.getNetworkStateAsync();
                        if (!net.isConnected) {
                          Alert.alert("Offline", "Δεν υπάρχει σύνδεση στο διαδίκτυο.");
                          return;
                        }
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
                        const net = await Network.getNetworkStateAsync();
                        if (!net.isConnected) {
                          Alert.alert("Offline", "Δεν υπάρχει σύνδεση στο διαδίκτυο.");
                          return;
                        }
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


      <InputModal
        visible={inputVisible}
        onClose={() => setInputVisible(false)}
        onSave={handleSaveInput}
        title={inputMode === "newGroup" ? "Νέο Project" : "Επεξεργασία"}
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

  // PROJECTS (GROUPS) FOLDER CARDS
  groupCard: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#64748b",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  groupCardCompleted: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
    borderWidth: 1.5,
  },
  groupIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
  },
  groupMeta: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
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
