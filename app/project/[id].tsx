import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Network from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
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
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
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

// --- MEMOIZED LIST ITEM COMPONENT ---
const TaskItem = memo(
  ({
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
    return (
      <View
        style={[
          styles.taskCard,
          // 1. ΔΙΑΚΡΙΣΗ ΟΛΟΚΛΗΡΩΜΕΝΩΝ: Αλλάζουμε το φόντο και το opacity
          item.status === "completed" && {
            backgroundColor: "#f8fafc",
            opacity: 0.8,
          },
          item.isLocal && {
            borderColor: "#f97316",
            borderWidth: 1,
            backgroundColor: "#fff7ed",
          },
        ]}
      >
        <TouchableOpacity
          style={styles.taskCardInner}
          onPress={() => onPress(item)}
          onLongPress={() => onLongPress(item)}
          delayLongPress={500}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <View
              style={[
                styles.iconBox,
                item.status === "completed"
                  ? styles.iconBoxCompleted
                  : styles.iconBoxPending,
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
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.taskTitle,
                  item.status === "completed" && {
                    color: "#64748b",
                    textDecorationLine: "line-through",
                  },
                ]}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              {item.description ? (
                <Text style={styles.taskDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}

              {item.isLocal && (
                <View style={styles.localBadgeRow}>
                  <Ionicons name="cloud-offline" size={12} color="#f97316" />
                  <Text style={styles.localBadgeText}>
                    {isSyncing ? "Ανεβαίνει..." : "Προς Ανέβασμα"}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View
            style={{
              alignItems: "flex-end",
              justifyContent: "center",
              minWidth: 40,
            }}
          >
            {item.type === "photo" ? (
              item.images && item.images.length > 0 ? (
                <View style={styles.thumbnailContainer}>
                  <Image
                    source={{ uri: item.images[item.images.length - 1] }}
                    style={styles.taskThumbnail}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.images.length}</Text>
                  </View>
                </View>
              ) : (
                <Ionicons name="camera-outline" size={24} color="#cbd5e1" />
              )
            ) : item.status === "completed" && item.value ? (
              <Text style={styles.taskValueText}>{item.value}</Text>
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item === nextProps.item &&
      prevProps.isSyncing === nextProps.isSyncing
    );
  },
);

export default function ProjectDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const projectId = id as string;
  const insets = useSafeAreaInsets();
  const { isSyncing, syncNow, justSyncedProjectId } = useSync();

  const PROJECT_CACHE_KEY = `cached_project_tasks_${projectId}`;

  const [cloudTasks, setCloudTasks] = useState<Task[]>([]);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);

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

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const cachedData = await AsyncStorage.getItem(PROJECT_CACHE_KEY);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          if (parsed.tasks) setCloudTasks(parsed.tasks);
          if (parsed.name) setProjectName(parsed.name);
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

  useEffect(() => {
    if (!projectId) return;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const projectRef = doc(db, "projects", projectId);
        const unsubscribeSnapshot = onSnapshot(
          projectRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const fetchedTasks = data.tasks || [];
              const fetchedName = data.name || "Project";
              setCloudTasks(fetchedTasks);
              setProjectName(fetchedName);
              AsyncStorage.setItem(
                PROJECT_CACHE_KEY,
                JSON.stringify({ name: fetchedName, tasks: fetchedTasks }),
              ).catch((err) => console.log(err));
            }
          },
          (error) => console.log(error),
        );
        return () => unsubscribeSnapshot();
      }
    });
    return () => unsubscribeAuth();
  }, [projectId]);

  useEffect(() => {
    if (justSyncedProjectId === projectId) {
      setLocalTasks([]);
    }
  }, [justSyncedProjectId, projectId]);

  const combinedTasks = useMemo(() => {
    const taskMap = new Map<string, Task>();
    cloudTasks.forEach((task) => taskMap.set(task.id, task));
    localTasks.forEach((task) => taskMap.set(task.id, task));
    return Array.from(taskMap.values());
  }, [cloudTasks, localTasks]);

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
                await updateDoc(doc(db, "projects", projectId), {
                  tasks: updatedCloudList,
                });
              } catch (e) {
                console.log(e);
              }
            } else {
              Alert.alert(
                "Offline",
                "Η οριστική διαγραφή στο Cloud απαιτεί WiFi.",
              );
            }
          },
        },
      ]);
    },
    [cloudTasks, projectId],
  );

  const saveTaskLocallyAndTrySync = async (task: Task) => {
    setLocalTasks((prev) => {
      const newLocalList = [...prev];
      const existingIndex = newLocalList.findIndex((t) => t.id === task.id);
      const taskToSave = { ...task, isLocal: true };
      if (existingIndex !== -1) {
        newLocalList[existingIndex] = taskToSave;
      } else {
        newLocalList.push(taskToSave);
      }
      AsyncStorage.setItem(
        OFFLINE_QUEUE_KEY + projectId,
        JSON.stringify(newLocalList),
      );
      return newLocalList;
    });
    setCloudTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...task, isLocal: true } : t)),
    );
    if (activeTaskForGallery && activeTaskForGallery.id === task.id) {
      setActiveTaskForGallery(task);
    }
    const net = await Network.getNetworkStateAsync();
    if (net.isConnected && net.type === Network.NetworkStateType.WIFI) {
      syncNow().catch((e) => console.log(e));
    }
  };

  const handleSmartTaskUpdate = async (updatedTask: Task) => {
    const net = await Network.getNetworkStateAsync();
    if (net.isConnected && net.isInternetReachable) {
      const cleanTask = { ...updatedTask };
      delete cleanTask.isLocal;
      setCloudTasks((prev) =>
        prev.map((t) => (t.id === updatedTask.id ? cleanTask : t)),
      );
      setLocalTasks((prev) => {
        const newLocal = prev.filter((t) => t.id !== updatedTask.id);
        AsyncStorage.setItem(
          OFFLINE_QUEUE_KEY + projectId,
          JSON.stringify(newLocal),
        );
        return newLocal;
      });
      if (activeTaskForGallery && activeTaskForGallery.id === updatedTask.id) {
        setActiveTaskForGallery(cleanTask);
      }
      try {
        const newTasksList = cloudTasks.map((t) =>
          t.id === updatedTask.id ? cleanTask : t,
        );
        await updateDoc(doc(db, "projects", projectId), {
          tasks: newTasksList,
        });
      } catch (e) {
        saveTaskLocallyAndTrySync(updatedTask);
      }
    } else {
      saveTaskLocallyAndTrySync(updatedTask);
    }
  };

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
      return Alert.alert("Σφάλμα", "Δεν έχετε ίντερνετ.");
    await syncNow();
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim())
      return Alert.alert("Προσοχή", "Γράψτε έναν τίτλο.");
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
    await handleSmartTaskUpdate(newTask);
  };

  const updateTaskValue = async (
    taskId: string,
    val: string | null,
    status: "completed" | "pending",
  ) => {
    const taskToUpdate = combinedTasks.find((t) => t.id === taskId);
    if (!taskToUpdate) return;
    setInputModalVisible(false);
    const updatedTask: Task = {
      ...taskToUpdate,
      value: val,
      status: status,
      isLocal: true,
    };
    await handleSmartTaskUpdate(updatedTask);
  };

  const addImageToTask = async (taskId: string, newImageUri: string) => {
    const taskToUpdate = combinedTasks.find((t) => t.id === taskId);
    if (!taskToUpdate) return;
    const updatedImages = [...(taskToUpdate.images || []), newImageUri];
    const updatedTask: Task = {
      ...taskToUpdate,
      images: updatedImages,
      status: "completed",
      isLocal: true,
    };
    await handleSmartTaskUpdate(updatedTask);
  };

  const removeImageFromTask = async (imgUri: string) => {
    if (!activeTaskForGallery) return;
    const currentImages = activeTaskForGallery.images || [];
    const updatedImages = currentImages.filter((img) => img !== imgUri);
    const updatedTask: Task = {
      ...activeTaskForGallery,
      images: updatedImages,
      status: updatedImages.length > 0 ? "completed" : "pending",
      isLocal: true,
    };
    if (updatedImages.length === 0) setSelectedImageForView(null);
    await handleSmartTaskUpdate(updatedTask);
  };

  const saveInput = async () => {
    if (inputValue && currentTaskId) {
      await updateTaskValue(currentTaskId, inputValue, "completed");
    }
  };

  const handleClearValue = async () => {
    if (currentTaskId) {
      await updateTaskValue(currentTaskId, null, "pending");
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
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      return Alert.alert("Προσοχή", "Δώστε άδεια κάμερας.");
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
        await addImageToTask(taskId, permanentUri);
      } catch (error: any) {
        setProcessing(false);
        Alert.alert("Σφάλμα", "Η φωτογραφία δεν αποθηκεύτηκε.");
      }
    }
  };

  const handleShare = async (uri: string) => {
    if (!uri) return;
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) return Alert.alert("Σφάλμα", "Share not available");
    await Sharing.shareAsync(uri, {
      mimeType: "image/jpeg",
      dialogTitle: "Κοινοποίηση",
    });
  };

  const totalTasks = combinedTasks.length;
  const completedTasks = combinedTasks.filter(
    (t) => t.status === "completed",
  ).length;
  const progressPercent =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const renderItem = useCallback(
    ({ item }: { item: Task }) => (
      <TaskItem
        item={item}
        onPress={handleTaskPress}
        onLongPress={handleDeleteTaskCompletely}
        isSyncing={isSyncing}
      />
    ),
    [handleTaskPress, handleDeleteTaskCompletely, isSyncing],
  );

  const keyExtractor = useCallback((item: Task) => item.id, []);

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
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Επεξεργασία...</Text>
          </View>
        </View>
      )}

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

      {totalTasks > 0 && (
        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View
              style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
            />
          </View>
        </View>
      )}

      <FlatList
        data={combinedTasks}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={combinedTasks}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 100 + insets.bottom },
        ]}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: 30 + insets.bottom }]}
        onPress={() => setCreateModalVisible(true)}
      >
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      <Modal
        visible={galleryModalVisible}
        animationType="slide"
        onRequestClose={() => setGalleryModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          {/* 2. GALLERY HEADER: Αλλαγή Χ σε Βέλος αριστερά */}
          <View style={styles.galleryHeader}>
            <TouchableOpacity
              onPress={() => setGalleryModalVisible(false)}
              style={{ marginRight: 15 }}
            >
              <Ionicons name="arrow-back" size={28} color="white" />
            </TouchableOpacity>
            <Text style={styles.galleryTitle} numberOfLines={1}>
              {activeTaskForGallery?.title}
            </Text>
            {/* Empty view for spacing balance if needed, or remove */}
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
            <Ionicons name="close" size={30} color="white" />
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
              style={[styles.input, { height: 60, textAlignVertical: "top" }]}
              placeholder="Λεπτομέρειες..."
              value={newTaskDescription}
              onChangeText={setNewTaskDescription}
              multiline={true}
              numberOfLines={2}
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  projectLogoPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  syncButtonHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#f97316",
    borderRadius: 20,
  },
  syncText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 12,
    marginLeft: 5,
  },
  syncingBadge: { padding: 10 },

  progressSection: { backgroundColor: "white", paddingBottom: 0 },
  progressBarBg: { height: 3, backgroundColor: "#e2e8f0", width: "100%" },
  progressBarFill: { height: "100%", backgroundColor: "#10b981" },

  content: { padding: 20 },

  taskCard: {
    backgroundColor: "white",
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#64748b",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: "hidden",
    minHeight: 80,
  },
  taskCardInner: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 80,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  iconBoxPending: { backgroundColor: "#eff6ff" },
  iconBoxCompleted: { backgroundColor: "#dcfce7" },
  taskTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 2,
  },
  taskDesc: { fontSize: 13, color: "#94a3b8" },
  taskValueText: { fontWeight: "700", color: "#059669", fontSize: 15 },

  thumbnailContainer: { alignItems: "center" },
  taskThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  badge: {
    position: "absolute",
    bottom: -6,
    right: -6,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  badgeText: { color: "white", fontSize: 10, fontWeight: "bold" },

  localBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  localBadgeText: {
    fontSize: 11,
    color: "#f97316",
    marginLeft: 4,
    fontWeight: "bold",
  },

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
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    zIndex: 999,
  },

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

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
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
  mainButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
    letterSpacing: 1,
  },

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
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
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
    right: 20,
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
    padding: 15,
    borderRadius: 50,
    width: 80,
    height: 80,
    justifyContent: "center",
  },
  toolText: { color: "white", fontSize: 11, marginTop: 5, fontWeight: "600" },
  galleryHeader: {
    flexDirection: "row",
    justifyContent: "flex-start", // Changed to align arrow left
    alignItems: "center",
    padding: 20,
    paddingTop: 10,
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
