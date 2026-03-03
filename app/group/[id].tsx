import { Ionicons } from "@expo/vector-icons";
import * as Network from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { deleteProjectMedia } from "../../utils/storageUtils";

import { onAuthStateChanged } from "firebase/auth";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  isClosed?: boolean;
};
type Group = { id: string; title: string; projects: Project[] };

export default function GroupScreen() {
  const router = useRouter();
  const { id: groupId, teamId } = useLocalSearchParams<{
    id: string;
    teamId: string;
  }>();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<Role>("User");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [groupTitle, setGroupTitle] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const projectsRef = useRef<Project[]>([]);
  const allGroupsRef = useRef<Group[]>([]);
  const userCacheRef = useRef(
    new Map<string, { fullname: string; email: string }>(),
  );
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "pending" | "completed"
  >("all");
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Navigation lock
  const [isNavigating, setIsNavigating] = useState(false);
  const safeNavigate = (path: any) => {
    if (isNavigating) return;
    setIsNavigating(true);
    router.push(path);
    setTimeout(() => setIsNavigating(false), 500);
  };

  // Modals
  const [projectSettingsVisible, setProjectSettingsVisible] = useState(false);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Input
  const [inputVisible, setInputVisible] = useState(false);
  const [tempValue, setTempValue] = useState("");

  // Keep refs in sync
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  useEffect(() => {
    allGroupsRef.current = allGroups;
  }, [allGroups]);

  const checkOnline = async () => {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || !net.isInternetReachable) {
      Alert.alert("Offline", "Δεν έχετε ίντερνετ.");
      return false;
    }
    return true;
  };

  const updateGroupsInTeam = async (updatedGroups: Group[]) => {
    try {
      await updateDoc(doc(db, "teams", teamId), { groups: updatedGroups });
    } catch (err: any) {
      Alert.alert("Σφάλμα", err.message);
    }
  };

  // 1. DATA LOADING
  useEffect(() => {
    if (!teamId || !groupId) return;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUserId(user.uid);

        const teamRef = doc(db, "teams", teamId);
        const unsubscribeTeam = onSnapshot(
          teamRef,
          async (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const groups: Group[] = data.groups || [];
              const currentGroup = groups.find((g: Group) => g.id === groupId);

              if (currentGroup) {
                setGroupTitle(currentGroup.title);
                setProjects((prev) => {
                  if (prev.length === 0) return currentGroup.projects;
                  // Merge: keep fresh statuses/roles from 2nd listener, update titles/structure
                  return currentGroup.projects.map((p: Project) => {
                    const existing = prev.find((ep) => ep.id === p.id);
                    return existing
                      ? {
                          ...p,
                          status: existing.status,
                          supervisors: existing.supervisors,
                          members: existing.members,
                        }
                      : p;
                  });
                });
              }

              setAllGroups(groups);

              if (data.roles && data.roles[user.uid]) {
                setMyRole(data.roles[user.uid] as Role);
              }

              if (data.memberIds && data.memberIds.length > 0) {
                const loadedUsers: User[] = [];
                for (const uid of data.memberIds) {
                  let cached = userCacheRef.current.get(uid);
                  if (!cached) {
                    try {
                      const userDoc = await getDoc(doc(db, "users", uid));
                      if (userDoc.exists()) {
                        const d = userDoc.data() as any;
                        cached = {
                          fullname: d.fullname || "Μέλος",
                          email: d.email || "...",
                        };
                      } else {
                        cached = { fullname: "Μέλος", email: "..." };
                      }
                    } catch {
                      cached = { fullname: "Μέλος", email: "..." };
                    }
                    userCacheRef.current.set(uid, cached);
                  }
                  loadedUsers.push({
                    id: uid,
                    name: cached.fullname,
                    email: uid === user.uid ? "Εγώ" : cached.email,
                    role: data.roles?.[uid] || "User",
                  });
                }
                setUsers(loadedUsers);
              }

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
  }, [teamId, groupId]);

  // 2. LIVE PROJECT STATUS UPDATES
  useEffect(() => {
    if (!teamId) return;
    const q = query(collection(db, "projects"), where("teamId", "==", teamId));

    const unsubscribeProjects = onSnapshot(q, (snapshot) => {
      const freshProjectsMap = new Map();
      snapshot.docs.forEach((doc) => {
        freshProjectsMap.set(doc.id, { ...doc.data(), id: doc.id });
      });

      setProjects((currentProjects) => {
        let hasChanges = false;
        const updated = currentProjects.map((proj) => {
          const freshData = freshProjectsMap.get(proj.id);
          if (freshData) {
            const tasks = freshData.tasks || [];
            let derivedStatus: "active" | "pending" | "completed" = "pending";
            if (tasks.length > 0) {
              const done = tasks.filter(
                (t: any) => t.status === "completed",
              ).length;
              if (done === tasks.length) derivedStatus = "completed";
              else if (done > 0) derivedStatus = "active";
              else derivedStatus = "pending";
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
        });

        if (hasChanges) {
          if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
          syncDebounceRef.current = setTimeout(() => {
            const latestProjects = projectsRef.current;
            const latestAllGroups = allGroupsRef.current;
            const groupsForDb = latestAllGroups.map((g) => ({
              id: g.id,
              title: g.title,
              projects: (g.id === groupId ? latestProjects : g.projects).map(
                (p) => ({
                  id: p.id,
                  title: p.title,
                  status: p.status,
                  supervisors: p.supervisors || [],
                  members: p.members || [],
                  createdBy: p.createdBy || "",
                  teamId: p.teamId || teamId,
                  isClosed: p.isClosed || false,
                }),
              ),
            }));
            updateDoc(doc(db, "teams", teamId), {
              groups: groupsForDb,
            }).catch(() => {});
          }, 5000);
        }

        return updated;
      });
    });

    return () => unsubscribeProjects();
  }, [teamId, groupId]);

  const handleAddProject = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    setTempValue("");
    setInputVisible(true);
  };

  const handleSaveProject = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) {
      setInputVisible(false);
      return;
    }
    if (!tempValue.trim()) return;

    try {
      const newProjectId =
        Date.now().toString() + Math.random().toString(36).substr(2, 5);
      let initialSupervisors: string[] = [];
      if (myRole === "Supervisor") initialSupervisors = [currentUserId];

      const newProject: Project = {
        id: newProjectId,
        title: tempValue,
        status: "active",
        supervisors: initialSupervisors,
        members: [],
        createdBy: currentUserId,
        teamId,
      };

      const updatedProjects = [...projects, newProject];
      setProjects(updatedProjects);

      const updatedGroups = allGroups.map((g) =>
        g.id === groupId ? { ...g, projects: updatedProjects } : g,
      );
      await updateGroupsInTeam(updatedGroups);

      await setDoc(doc(db, "projects", newProjectId), {
        ...newProject,
        tasks: [],
        createdAt: serverTimestamp(),
      });

      setInputVisible(false);
      setTempValue("");
    } catch (error: any) {
      Alert.alert("Σφάλμα", error.message);
    }
  };

  const handleDeleteProject = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    if (!selectedProject) return;
    if (selectedProject.isClosed) {
      Alert.alert("Κλειστό Υποέργο", "Δεν μπορείτε να διαγράψετε κλειστό υποέργο. Ανοίξτε το πρώτα από το Admin Panel.");
      return;
    }

    Alert.alert("Διαγραφή Υποέργου", "Είστε σίγουροι;", [
      { text: "Ακύρωση" },
      {
        text: "Διαγραφή",
        style: "destructive",
        onPress: async () => {
          if (syncDebounceRef.current) {
            clearTimeout(syncDebounceRef.current);
            syncDebounceRef.current = null;
          }

          const updatedProjects = projects.filter(
            (p) => p.id !== selectedProject.id,
          );
          setProjects(updatedProjects);

          const updatedGroups = allGroups.map((g) =>
            g.id === groupId ? { ...g, projects: updatedProjects } : g,
          );
          await updateGroupsInTeam(updatedGroups);

          try {
            await deleteProjectMedia(teamId, selectedProject.id);
          } catch {}
          try {
            await deleteDoc(doc(db, "projects", selectedProject.id));
          } catch {}
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

    const projectRef = doc(db, "projects", selectedProject.id);
    const field = type === "supervisor" ? "supervisors" : "members";
    const currentList =
      type === "supervisor"
        ? selectedProject.supervisors
        : selectedProject.members;
    const isIncluded = currentList.includes(userId);

    try {
      if (isIncluded) {
        await updateDoc(projectRef, { [field]: arrayRemove(userId) });
      } else {
        await updateDoc(projectRef, { [field]: arrayUnion(userId) });
      }

      const updated = { ...selectedProject };
      if (type === "supervisor") {
        updated.supervisors = isIncluded
          ? updated.supervisors.filter((id) => id !== userId)
          : [...updated.supervisors, userId];
      } else {
        updated.members = isIncluded
          ? updated.members.filter((id) => id !== userId)
          : [...updated.members, userId];
      }
      setSelectedProject(updated);
    } catch {
      Alert.alert("Σφάλμα", "Η ενημέρωση απέτυχε");
    }
  };

  const handleMoveProject = async (targetGroupId: string) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    if (!selectedProject) return;

    const updatedProjects = projects.filter((p) => p.id !== selectedProject.id);
    setProjects(updatedProjects);

    const updatedGroups = allGroups.map((g) => {
      if (g.id === groupId)
        return { ...g, projects: g.projects.filter((p) => p.id !== selectedProject.id) };
      if (g.id === targetGroupId)
        return { ...g, projects: [...g.projects, selectedProject] };
      return g;
    });
    setAllGroups(updatedGroups);

    await updateGroupsInTeam(updatedGroups);
    setMoveModalVisible(false);
    setProjectSettingsVisible(false);
  };

  // Filter visible projects
  const visibleProjects = projects
    .filter((p) => {
      if (myRole === "User") {
        return (
          p.members.includes(currentUserId) ||
          p.supervisors.includes(currentUserId)
        );
      }
      return true;
    })
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter(
      (p) =>
        !searchQuery.trim() ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()),
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerTitle}>{groupTitle}</Text>
          <Text style={styles.headerSubtitle}>
            Project • {projects.length} υποέργα
          </Text>
        </View>
        {(myRole === "Founder" ||
          myRole === "Admin" ||
          myRole === "Supervisor") && (
          <TouchableOpacity style={styles.addBtn} onPress={handleAddProject}>
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* SEARCH & FILTER */}
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
            placeholder="Αναζήτηση υποέργων..."
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

      {/* ΥΠΟΕΡΓΑ LIST */}
      <FlatList
        data={visibleProjects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 100 + insets.bottom },
        ]}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 50 }}>
            <Ionicons name="document-outline" size={64} color="#ccc" />
            <Text style={{ color: "#999", marginTop: 10 }}>
              Δεν υπάρχουν υποέργα.
            </Text>
            {(myRole === "Founder" ||
              myRole === "Admin" ||
              myRole === "Supervisor") && (
              <Text style={{ color: "#2563eb", fontWeight: "bold" }}>
                Πατήστε + για Νέο Υποέργο!
              </Text>
            )}
          </View>
        }
        renderItem={({ item: project }) => (
          <TouchableOpacity
            style={[
              styles.projectCard,
              project.status === "completed" && styles.projectCardCompleted,
              project.isClosed && styles.projectCardClosed,
            ]}
            onPress={() => safeNavigate(`/project/${project.id}`)}
            onLongPress={() => {
              if (myRole !== "User") {
                setSelectedProject(project);
                setProjectSettingsVisible(true);
              }
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <View
                style={[
                  styles.projectIconBox,
                  {
                    backgroundColor: project.isClosed
                      ? "#f1f5f9"
                      : project.status === "completed" ? "#f0fdf4" : "#dbeafe",
                  },
                ]}
              >
                <Ionicons
                  name={
                    project.isClosed
                      ? "lock-closed"
                      : project.status === "completed"
                      ? "checkmark-done"
                      : "document-text"
                  }
                  size={20}
                  color={
                    project.isClosed
                      ? "#94a3b8"
                      : project.status === "completed" ? "#16a34a" : "#2563eb"
                  }
                />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={[
                      styles.projectTitle,
                      (project.status === "completed" || project.isClosed) &&
                        styles.projectTitleCompleted,
                    ]}
                  >
                    {project.title}
                  </Text>
                  {project.isClosed && (
                    <View style={styles.closedBadge}>
                      <Text style={styles.closedBadgeText}>ΚΛΕΙΣΤΟ</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.projectMeta}>
                  Sup: {project.supervisors ? project.supervisors.length : 0} •
                  Mem: {project.members ? project.members.length : 0}
                </Text>
              </View>
            </View>
            {myRole !== "User" && (
              <Ionicons name="ellipsis-vertical" size={16} color="#cbd5e1" />
            )}
          </TouchableOpacity>
        )}
      />

      {/* ΥΠΟΕΡΓΟ SETTINGS MODAL */}
      <Modal
        visible={projectSettingsVisible}
        animationType="slide"
        onRequestClose={() => setProjectSettingsVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Ρυθμίσεις Υποέργου</Text>
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
                      selectedProject?.supervisors.includes(u.id)
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
                      selectedProject?.members.includes(u.id)
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
                Μεταφορά σε άλλο Project
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
                  Διαγραφή Υποέργου
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
            <Text style={styles.modalHeader}>Επιλέξτε Project</Text>
            {allGroups.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[
                  styles.menuItem,
                  g.id === groupId && { opacity: 0.5 },
                ]}
                disabled={g.id === groupId}
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

      {/* FILTER MODAL */}
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
              ΚΑΤΑΣΤΑΣΗ ΥΠΟΕΡΓΟΥ
            </Text>
            {(
              [
                { key: "all", label: "Όλα" },
                { key: "active", label: "Ενεργά", badge: "ACTIVE", bg: "#dbeafe", color: "#2563eb" },
                { key: "pending", label: "Εκκρεμή", badge: "PENDING", bg: "#fef3c7", color: "#d97706" },
                { key: "completed", label: "Ολοκληρωμένα", badge: "DONE", bg: "#dcfce7", color: "#16a34a" },
              ] as const
            ).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.filterOption,
                  statusFilter === opt.key && styles.filterOptionActive,
                ]}
                onPress={() => {
                  setStatusFilter(opt.key);
                  setFilterModalVisible(false);
                }}
              >
                <Ionicons
                  name={
                    statusFilter === opt.key
                      ? "radio-button-on"
                      : "radio-button-off"
                  }
                  size={24}
                  color={statusFilter === opt.key ? "#2563eb" : "#cbd5e1"}
                />
                <Text
                  style={[
                    styles.filterOptionText,
                    statusFilter === opt.key && styles.filterOptionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {"badge" in opt && (
                  <View
                    style={[styles.statusBadge, { backgroundColor: opt.bg }]}
                  >
                    <Text
                      style={{
                        color: opt.color,
                        fontSize: 10,
                        fontWeight: "700",
                      }}
                    >
                      {opt.badge}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      <InputModal
        visible={inputVisible}
        onClose={() => setInputVisible(false)}
        onSave={handleSaveProject}
        title="Νέο Υποέργο"
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
  backButton: { marginRight: 4 },
  headerTitle: { fontSize: 16, fontWeight: "bold", color: "#111827" },
  headerSubtitle: { color: "#666", fontSize: 10 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  content: { padding: 20 },

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
  searchInput: { flex: 1, fontSize: 15, color: "#1e293b" },
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
  filterBadge: { position: "absolute", top: 8, right: 8 },
  filterBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
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
  projectCardCompleted: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
    borderWidth: 1,
    opacity: 0.8,
  },
  projectCardClosed: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    opacity: 0.7,
  },
  closedBadge: {
    backgroundColor: "#e2e8f0",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  closedBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 0.5,
  },
  projectIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  projectTitle: { fontSize: 16, fontWeight: "600", color: "#334155" },
  projectTitleCompleted: {
    textDecorationLine: "line-through",
    color: "#94a3b8",
  },
  projectMeta: { fontSize: 11, color: "#94a3b8", marginTop: 2 },

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

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  menuText: { marginLeft: 15, fontSize: 16, color: "#334155" },
  closeMenuBtn: { marginTop: 20, alignItems: "center", padding: 10 },

  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 12,
  },
  filterOptionActive: { backgroundColor: "#f8fafc" },
  filterOptionText: {
    flex: 1,
    fontSize: 16,
    color: "#334155",
    fontWeight: "500",
  },
  filterOptionTextActive: { color: "#2563eb", fontWeight: "700" },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

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
});
