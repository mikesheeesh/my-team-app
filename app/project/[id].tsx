import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Network from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// FIREBASE
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

import InputModal from "../components/InputModal";
import { useSync } from "../context/SyncContext";

// --- TYPES ---
type Task = {
  id: string;
  title: string;
  description?: string;
  type: "photo" | "measurement" | "general";
  status: "pending" | "completed";
  value: string | null;
  images?: string[];
  isLocal?: boolean;
};

const OFFLINE_QUEUE_KEY = "offline_tasks_queue_";

// --- TASK ITEM ---
const TaskItem = ({
  item,
  onPress,
  onLongPress,
  isSyncing,
}: {
  item: Task;
  onPress: (t: Task) => void;
  onLongPress: (t: Task) => void;
  isSyncing: boolean;
}) => {
  if (!item) return null;

  return (
    <View style={styles.cardContainer}>
      <TouchableOpacity
        style={[
          styles.cardInner,
          item.isLocal && styles.cardLocalBorder, // Πορτοκαλί περίγραμμα αν είναι local
        ]}
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress(item)}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        {/* ICON LEFT */}
        <View
          style={[
            styles.iconContainer,
            item.status === "completed" ? styles.bgGreen : styles.bgBlue,
          ]}
        >
          <Ionicons
            name={
              item.type === "photo"
                ? "camera"
                : item.type === "measurement"
                  ? "construct"
                  : "document-text"
            }
            size={20}
            color={item.status === "completed" ? "#059669" : "#2563eb"}
          />
        </View>

        {/* TEXT MIDDLE */}
        <View style={styles.textContainer}>
          <Text style={styles.titleText} numberOfLines={1}>
            {item.title || "Χωρίς Τίτλο"}
          </Text>

          {item.description ? (
            <Text style={styles.descText} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}

          {item.isLocal && (
            <Text style={styles.localText}>
              {isSyncing ? "Ανεβαίνει..." : "Αναμονή"}
            </Text>
          )}
        </View>

        {/* RIGHT CONTENT */}
        <View style={styles.rightContainer}>
          {item.type === "photo" ? (
            item.images && item.images.length > 0 ? (
              <View style={styles.thumbnailBox}>
                <Image
                  source={{ uri: item.images[item.images.length - 1] }}
                  style={styles.thumbImage}
                />
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.images.length}</Text>
                </View>
              </View>
            ) : (
              <Ionicons name="camera-outline" size={24} color="#ccc" />
            )
          ) : item.status === "completed" ? (
            <Text style={styles.valueText} numberOfLines={1}>
              {item.value}
            </Text>
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};

export default function ProjectDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const projectId = id as string;
  const insets = useSafeAreaInsets();
  const { isSyncing, syncNow, justSyncedProjectId } = useSync();

  const PROJECT_CACHE_KEY = `cached_project_tasks_${projectId}`;

  const [cloudTasks, setCloudTasks] = useState<Task[]>([]);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [projectName, setProjectName] = useState("");

  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);

  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentTaskType, setCurrentTaskType] = useState<string>("measurement");
  const [inputValue, setInputValue] = useState("");

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskType, setNewTaskType] = useState<
    "photo" | "measurement" | "general"
  >("photo");

  const [activeTaskForGallery, setActiveTaskForGallery] = useState<Task | null>(
    null,
  );
  const [selectedImageForView, setSelectedImageForView] = useState<
    string | null
  >(null);

  // LOAD CACHE
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const cachedData = await AsyncStorage.getItem(PROJECT_CACHE_KEY);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          setCloudTasks(parsed.tasks || []);
          setProjectName(parsed.name || "");
          setTeamId(parsed.teamId);
        }
        const localQueue = await AsyncStorage.getItem(
          OFFLINE_QUEUE_KEY + projectId,
        );
        if (localQueue) setLocalTasks(JSON.parse(localQueue));
      } catch (e) {}
      setLoading(false);
    };
    loadInitialData();
  }, [projectId]);

  // FIRESTORE LISTENER
  useEffect(() => {
    if (!projectId) return;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const projectRef = doc(db, "projects", projectId);
        const unsubscribeSnapshot = onSnapshot(projectRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const fetchedTasks = data.tasks || [];
            const fetchedName = data.title || "Project";
            const fetchedTeamId = data.teamId;

            setCloudTasks(fetchedTasks);
            setProjectName(fetchedName);
            if (fetchedTeamId) setTeamId(fetchedTeamId);

            // CLEAN LOCAL ONLY IF IN CLOUD
            if (fetchedTasks.length > 0) {
              setLocalTasks((prevLocal) => {
                const cloudIds = new Set(fetchedTasks.map((t: Task) => t.id));
                const remaining = prevLocal.filter((t) => !cloudIds.has(t.id));
                AsyncStorage.setItem(
                  OFFLINE_QUEUE_KEY + projectId,
                  JSON.stringify(remaining),
                );
                return remaining;
              });
            }

            AsyncStorage.setItem(
              PROJECT_CACHE_KEY,
              JSON.stringify({
                name: fetchedName,
                tasks: fetchedTasks,
                teamId: fetchedTeamId,
              }),
            ).catch((e) => {});
          }
        });
        return () => unsubscribeSnapshot();
      }
    });
    return () => unsubscribeAuth();
  }, [projectId]);

  useEffect(() => {
    if (justSyncedProjectId === projectId) setLocalTasks([]);
  }, [justSyncedProjectId, projectId]);

  // MERGE LISTS
  const combinedTasks = useMemo(() => {
    const taskMap = new Map<string, Task>();
    cloudTasks.forEach((task) => {
      if (task && task.id) taskMap.set(task.id, task);
    });
    localTasks.forEach((task) => {
      if (task && task.id) taskMap.set(task.id, task);
    });
    return Array.from(taskMap.values()).filter((t) => t && t.id);
  }, [cloudTasks, localTasks]);

  const updateTeamProjectStatus = async (
    newStatus: "active" | "completed",
    currentTeamId: string,
  ) => {
    if (!currentTeamId) return;
    try {
      const teamRef = doc(db, "teams", currentTeamId);
      const teamSnap = await getDoc(teamRef);
      if (teamSnap.exists()) {
        const teamData = teamSnap.data();
        const groups = teamData.groups || [];
        const updatedGroups = groups.map((g: any) => ({
          ...g,
          projects: g.projects.map((p: any) =>
            p.id === projectId ? { ...p, status: newStatus } : p,
          ),
        }));
        await updateDoc(teamRef, { groups: updatedGroups });
      }
    } catch (e) {}
  };

  const handleSmartTaskUpdate = async (
    updatedTask: Task,
    isNew: boolean = false,
  ) => {
    const taskWithLocalFlag = { ...updatedTask, isLocal: true };

    setLocalTasks((prev) => {
      const newLocalList = [...prev];
      const existingIndex = newLocalList.findIndex(
        (t) => t.id === updatedTask.id,
      );
      if (existingIndex !== -1) newLocalList[existingIndex] = taskWithLocalFlag;
      else newLocalList.push(taskWithLocalFlag);

      AsyncStorage.setItem(
        OFFLINE_QUEUE_KEY + projectId,
        JSON.stringify(newLocalList),
      );
      return newLocalList;
    });

    if (activeTaskForGallery && activeTaskForGallery.id === updatedTask.id) {
      setActiveTaskForGallery(taskWithLocalFlag);
    }

    const net = await Network.getNetworkStateAsync();
    const isWiFi =
      net.isConnected &&
      net.isInternetReachable &&
      net.type === Network.NetworkStateType.WIFI;

    if (isWiFi) {
      try {
        await syncNow();
        const tempCombined = [
          ...combinedTasks.filter((t) => t.id !== updatedTask.id),
          updatedTask,
        ];
        const allCompleted =
          tempCombined.length > 0 &&
          tempCombined.every((t) => t.status === "completed");
        const projectStatus = allCompleted ? "completed" : "active";
        updateDoc(doc(db, "projects", projectId), {
          status: projectStatus,
        }).catch((e) => {});
        if (teamId) updateTeamProjectStatus(projectStatus, teamId);
      } catch (e) {}
    }
  };

  const handleDeleteTaskCompletely = useCallback(
    (task: Task) => {
      Alert.alert("Διαγραφή", `Διαγραφή "${task.title}";`, [
        { text: "Άκυρο", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            setCloudTasks((prev) => prev.filter((t) => t.id !== task.id));
            setLocalTasks((prev) => {
              const newLocal = prev.filter((t) => t.id !== task.id);
              AsyncStorage.setItem(
                OFFLINE_QUEUE_KEY + projectId,
                JSON.stringify(newLocal),
              );
              return newLocal;
            });

            const net = await Network.getNetworkStateAsync();
            if (net.isConnected && net.type === Network.NetworkStateType.WIFI) {
              try {
                const updatedCloudList = cloudTasks.filter(
                  (t) => t.id !== task.id,
                );
                const allCompleted =
                  updatedCloudList.length > 0 &&
                  updatedCloudList.every((t) => t.status === "completed");
                const projectStatus = allCompleted ? "completed" : "active";
                await updateDoc(doc(db, "projects", projectId), {
                  tasks: updatedCloudList,
                  status: projectStatus,
                });
                if (teamId) updateTeamProjectStatus(projectStatus, teamId);
              } catch (e) {}
            } else {
              Alert.alert("Offline", "Η διαγραφή έγινε τοπικά.");
            }
          },
        },
      ]);
    },
    [cloudTasks, projectId, teamId],
  );

  const handleTaskPress = useCallback((task: Task) => {
    if (task.type === "photo") {
      setActiveTaskForGallery(task);
      setGalleryModalVisible(true);
    } else {
      setCurrentTaskId(task.id);
      setCurrentTaskType(task.type);
      setInputValue(task.value || "");
      setInputModalVisible(true);
    }
  }, []);

  const handleProjectSync = async () => {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || !net.isInternetReachable)
      return Alert.alert("Σφάλμα", "Δεν έχετε σύνδεση.");
    if (net.type === Network.NetworkStateType.CELLULAR) {
      Alert.alert("Δεδομένα", "Συγχρονισμός με δεδομένα;", [
        { text: "Άκυρο", style: "cancel" },
        { text: "Ναι", onPress: async () => await syncNow() },
      ]);
    } else {
      await syncNow();
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return Alert.alert("Προσοχή", "Γράψτε τίτλο.");
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const newTask: Task = {
      id: uniqueId,
      title: newTaskTitle,
      description: newTaskDescription,
      type: newTaskType,
      status: "pending",
      value: null,
      images: [],
      isLocal: true,
    };
    setCreateModalVisible(false);
    setNewTaskTitle("");
    setNewTaskDescription("");
    await handleSmartTaskUpdate(newTask, true);
  };

  const saveInput = async () => {
    if (inputValue && currentTaskId) {
      const task = combinedTasks.find((t) => t.id === currentTaskId);
      if (task) {
        setInputModalVisible(false);
        await handleSmartTaskUpdate({
          ...task,
          value: inputValue,
          status: "completed",
        });
      }
    }
  };

  const handleClearValue = async () => {
    if (currentTaskId) {
      const task = combinedTasks.find((t) => t.id === currentTaskId);
      if (task) {
        // ΔΙΟΡΘΩΣΗ: Κλείνουμε το modal αμέσως μόλις πατηθεί το καδάκι
        setInputModalVisible(false);
        await handleSmartTaskUpdate({
          ...task,
          value: null,
          status: "pending",
        });
      }
    }
  };

  const saveImageToDevice = async (tempUri: string) => {
    try {
      // @ts-ignore
      const docDir = FileSystem.documentDirectory;
      if (!docDir) return tempUri;
      const fileName = tempUri.split("/").pop();
      const newPath = docDir + fileName;
      await FileSystem.moveAsync({ from: tempUri, to: newPath });
      return newPath;
    } catch (e) {
      return tempUri;
    }
  };

  const launchCamera = async (taskId: string) => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.4,
    });
    if (!result.canceled && result.assets[0].uri) {
      setProcessing(true);
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 800 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
        );
        const permanentUri = await saveImageToDevice(manipResult.uri);
        setProcessing(false);
        const task = combinedTasks.find((t) => t.id === taskId);
        if (task) {
          const updatedImages = [...(task.images || []), permanentUri];
          await handleSmartTaskUpdate({
            ...task,
            images: updatedImages,
            status: "completed",
          });
        }
      } catch (e) {
        setProcessing(false);
      }
    }
  };

  const removeImageFromTask = async (imgUri: string) => {
    setSelectedImageForView(null);
    if (!activeTaskForGallery) return;
    const updatedImages =
      activeTaskForGallery.images?.filter((img) => img !== imgUri) || [];
    const status = updatedImages.length > 0 ? "completed" : "pending";
    await handleSmartTaskUpdate({
      ...activeTaskForGallery,
      images: updatedImages,
      status: status as "pending" | "completed",
    });
  };

  const handleShare = async (uri: string) => {
    try {
      await Sharing.shareAsync(uri, { mimeType: "image/jpeg" });
    } catch (e) {}
  };

  const totalTasks = combinedTasks.length;
  const completedTasks = combinedTasks.filter(
    (t) => t.status === "completed",
  ).length;
  const progressPercent =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {processing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      )}

      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <View style={styles.projectLogoPlaceholder}>
            <Ionicons name="document-text" size={24} color="white" />
          </View>
          <View style={{ marginLeft: 15, flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {projectName}
            </Text>
            <Text style={styles.headerSubtitle}>
              {completedTasks}/{totalTasks} Ολοκληρώθηκαν
            </Text>
          </View>
        </View>
        {isSyncing ? (
          <View style={styles.syncingBadge}>
            <ActivityIndicator size="small" color="#ea580c" />
          </View>
        ) : (
          localTasks.length > 0 && (
            <TouchableOpacity
              style={styles.syncButtonHeader}
              onPress={handleProjectSync}
            >
              <Ionicons name="cloud-upload" size={18} color="#fff" />
              <Text style={styles.syncText}>Sync</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* PROGRESS */}
      {totalTasks > 0 && (
        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View
              style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
            />
          </View>
        </View>
      )}

      {/* LIST */}
      <FlatList
        data={combinedTasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskItem
            item={item}
            onPress={handleTaskPress}
            onLongPress={handleDeleteTaskCompletely}
            isSyncing={isSyncing}
          />
        )}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 100 + insets.bottom },
        ]}
        removeClippedSubviews={false}
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: 30 + insets.bottom }]}
        onPress={() => setCreateModalVisible(true)}
      >
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      {/* GALLERY */}
      <Modal
        visible={galleryModalVisible}
        animationType="slide"
        onRequestClose={() => setGalleryModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={styles.galleryHeader}>
            <TouchableOpacity
              onPress={() => setGalleryModalVisible(false)}
              style={{ marginRight: 15 }}
            >
              <Ionicons name="arrow-back" size={28} color="white" />
            </TouchableOpacity>
            <Text style={styles.galleryTitle}>
              {activeTaskForGallery?.title}
            </Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={{ flex: 1, padding: 1 }}>
            <FlatList
              data={[...(activeTaskForGallery?.images || []), "ADD_BUTTON"]}
              keyExtractor={(item, index) => index.toString()}
              numColumns={3}
              renderItem={({ item }) => {
                if (item === "ADD_BUTTON") {
                  return (
                    <TouchableOpacity
                      style={styles.addPhotoTile}
                      onPress={() =>
                        activeTaskForGallery &&
                        launchCamera(activeTaskForGallery.id)
                      }
                    >
                      <Ionicons name="camera" size={32} color="#666" />
                      <Text style={styles.addPhotoText}>Προσθήκη</Text>
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    style={styles.photoTile}
                    onPress={() => setSelectedImageForView(item)}
                  >
                    <Image
                      source={{ uri: item }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* FULL SCREEN IMAGE */}
      <Modal
        visible={!!selectedImageForView}
        transparent={true}
        onRequestClose={() => setSelectedImageForView(null)}
      >
        <View style={styles.modalBackground}>
          {selectedImageForView && (
            <Image
              source={{ uri: selectedImageForView }}
              style={styles.fullImage}
              contentFit="contain"
            />
          )}
          <TouchableOpacity
            style={styles.closeModal}
            onPress={() => setSelectedImageForView(null)}
          >
            <Ionicons name="arrow-back" size={30} color="white" />
          </TouchableOpacity>
          <View style={styles.toolBar}>
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => {
                if (selectedImageForView) {
                  Alert.alert("Διαγραφή", "Να διαγραφεί;", [
                    { text: "Όχι" },
                    {
                      text: "Ναι",
                      style: "destructive",
                      onPress: () => removeImageFromTask(selectedImageForView),
                    },
                  ]);
                }
              }}
            >
              <Ionicons name="trash-outline" size={24} color="#ef4444" />
              <Text style={[styles.toolText, { color: "#ef4444" }]}>
                Διαγραφή
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() =>
                selectedImageForView && handleShare(selectedImageForView)
              }
            >
              <Ionicons name="share-outline" size={24} color="white" />
              <Text style={styles.toolText}>Κοινοποίηση</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CREATE MODAL */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeader}>Νέα Ανάθεση</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Τίτλος</Text>
            <TextInput
              style={styles.input}
              placeholder="π.χ. Έλεγχος Κουζίνας"
              autoFocus
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
            />
            <Text style={styles.label}>Περιγραφή</Text>
            <TextInput
              style={[styles.input, { height: 60 }]}
              placeholder="Λεπτομέρειες..."
              value={newTaskDescription}
              onChangeText={setNewTaskDescription}
              multiline={true}
            />
            <Text style={styles.label}>Τύπος Εργασίας</Text>
            <View style={styles.optionsContainer}>
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  newTaskType === "photo" && styles.optionCardActive,
                ]}
                onPress={() => setNewTaskType("photo")}
              >
                <Ionicons
                  name="camera"
                  size={28}
                  color={newTaskType === "photo" ? "white" : "#64748b"}
                />
                <Text
                  style={[
                    styles.optionText,
                    newTaskType === "photo" && { color: "white" },
                  ]}
                >
                  Φωτογραφία
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  newTaskType === "measurement" && styles.optionCardActive,
                ]}
                onPress={() => setNewTaskType("measurement")}
              >
                <Ionicons
                  name="construct"
                  size={28}
                  color={newTaskType === "measurement" ? "white" : "#64748b"}
                />
                <Text
                  style={[
                    styles.optionText,
                    newTaskType === "measurement" && { color: "white" },
                  ]}
                >
                  Μέτρηση
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  newTaskType === "general" && styles.optionCardActive,
                ]}
                onPress={() => setNewTaskType("general")}
              >
                <Ionicons
                  name="document-text"
                  size={28}
                  color={newTaskType === "general" ? "white" : "#64748b"}
                />
                <Text
                  style={[
                    styles.optionText,
                    newTaskType === "general" && { color: "white" },
                  ]}
                >
                  Κείμενο
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.mainButton} onPress={handleAddTask}>
              <Text style={styles.mainButtonText}>ΔΗΜΙΟΥΡΓΙΑ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <InputModal
        visible={inputModalVisible}
        onClose={() => setInputModalVisible(false)}
        onSave={saveInput}
        onClear={handleClearValue}
        title={
          currentTaskType === "measurement"
            ? "Καταγραφή Μέτρησης"
            : "Σημείωση Κειμένου"
        }
        value={inputValue}
        onChangeText={setInputValue}
        keyboardType="default"
        isMultiline={currentTaskType === "general"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", marginTop: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    paddingTop: 30,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  headerSubtitle: { color: "#64748b", fontSize: 12, fontWeight: "600" },
  backButton: { marginRight: 15, padding: 5 },
  projectLogoPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  syncButtonHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#f97316",
    borderRadius: 20,
  },
  syncText: { color: "white", fontWeight: "bold", fontSize: 12, marginLeft: 5 },
  syncingBadge: { padding: 10 },
  progressSection: { backgroundColor: "white", paddingBottom: 0 },
  progressBarBg: { height: 3, backgroundColor: "#e2e8f0", width: "100%" },
  progressBarFill: { height: "100%", backgroundColor: "#10b981" },
  content: { padding: 20 },

  // NEW STABLE CARD STYLE
  cardContainer: {
    backgroundColor: "white",
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    minHeight: 70, // Σταθερό ελάχιστο ύψος
    overflow: "hidden",
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    minHeight: 70,
  },
  cardLocalBorder: {
    borderWidth: 1,
    borderColor: "#f97316",
    backgroundColor: "#fff7ed",
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  bgBlue: { backgroundColor: "#eff6ff" },
  bgGreen: { backgroundColor: "#dcfce7" },

  textContainer: { flex: 1, justifyContent: "center" },
  titleText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 2,
  },
  descText: { fontSize: 13, color: "#94a3b8" },
  localText: {
    fontSize: 11,
    color: "#f97316",
    fontWeight: "bold",
    marginTop: 2,
  },

  rightContainer: {
    minWidth: 40,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  valueText: {
    fontWeight: "700",
    color: "#059669",
    fontSize: 15,
    maxWidth: 100,
    textAlign: "right",
  },
  thumbnailBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#eee",
  },
  thumbImage: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#2563eb",
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  badgeText: { color: "white", fontSize: 9, fontWeight: "bold" },

  fab: {
    position: "absolute",
    right: 20,
    backgroundColor: "#2563eb",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    zIndex: 999,
  },

  // Modal & Rest
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
  label: { fontSize: 13, fontWeight: "700", color: "#64748b", marginBottom: 8 },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    fontSize: 16,
    color: "#0f172a",
  },
  optionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 25,
  },
  optionCard: {
    flex: 1,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  optionCardActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  optionText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  mainButton: {
    backgroundColor: "#0f172a",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  mainButtonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255,255,255,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  loadingBox: {
    padding: 24,
    backgroundColor: "white",
    borderRadius: 16,
    elevation: 10,
    alignItems: "center",
  },
  loadingText: { marginTop: 12, color: "#333", fontWeight: "bold" },
  modalBackground: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  fullImage: { width: "100%", height: "100%" },
  closeModal: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 8,
  },
  toolBar: {
    position: "absolute",
    bottom: 40,
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  toolBtn: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 30,
    minWidth: 80,
    justifyContent: "center",
  },
  toolText: { color: "white", fontSize: 11, marginTop: 5, fontWeight: "600" },
  galleryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 50,
    backgroundColor: "#000",
  },
  galleryTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  photoTile: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: 1,
    backgroundColor: "#222",
  },
  addPhotoTile: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: 1,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  addPhotoText: { color: "#666", marginTop: 5, fontSize: 12 },
});
