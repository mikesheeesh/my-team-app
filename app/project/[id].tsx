import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ResizeMode, Video } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Network from "expo-network";
import * as Print from "expo-print";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
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

// STORAGE UTILITIES
import {
  deleteMediaFromStorage,
  uploadImageToStorage,
  uploadVideoToStorage,
  generateMediaId,
} from "../../utils/storageUtils";

// VIDEO COMPRESSION
import { compressVideo } from "../../utils/videoCompressor";

// EXIF METADATA
import { embedExifData } from "../../utils/exifUtils";
import { embedVideoGps } from "../../utils/mp4GpsUtils";

import ImageEditorModal from "../components/ImageEditorModal";
import InputModal from "../components/InputModal";
import { useSync } from "../context/SyncContext";

// --- TYPES ---
type GeoPoint = { lat: number; lng: number };

type PhotoTask = {
  id: string;
  title: string;
  description?: string;
  type: "photo";
  status: "pending" | "completed";
  images: string[];
  imageLocations: GeoPoint[];
  isLocal?: boolean;
  completedAt?: number; // Unix timestamp when task was completed
};

type VideoTask = {
  id: string;
  title: string;
  description?: string;
  type: "video";
  status: "pending" | "completed";
  videos: string[];
  videoLocations: GeoPoint[];
  isLocal?: boolean;
  completedAt?: number; // Unix timestamp when task was completed
};

type MeasurementTask = {
  id: string;
  title: string;
  description?: string;
  type: "measurement";
  status: "pending" | "completed";
  value: string;
  isLocal?: boolean;
  completedAt?: number; // Unix timestamp when task was completed
};

type GeneralTask = {
  id: string;
  title: string;
  description?: string;
  type: "general";
  status: "pending" | "completed";
  value: string;
  isLocal?: boolean;
  completedAt?: number; // Unix timestamp when task was completed
};

type Task = PhotoTask | VideoTask | MeasurementTask | GeneralTask;

// Backward compatibility helper for old VideoTask format
function normalizeVideoTask(task: any): Task {
  if (task.type === "video") {
    // Old format: value + videoLocation → New format: videos[] + videoLocations[]
    if ("value" in task && !("videos" in task)) {
      return {
        ...task,
        videos: task.value ? [task.value] : [],
        videoLocations: task.videoLocation ? [task.videoLocation] : [],
      } as VideoTask;
    }
  }
  return task as Task;
}

const OFFLINE_QUEUE_KEY = "offline_tasks_queue_";
const PROJECT_CACHE_KEY_PREFIX = "cached_project_tasks_";

// --- GALLERY PHOTO TILE (with error state for deleted/unavailable files) ---
const GalleryPhotoTile = ({ uri, onPress }: { uri: string; onPress: () => void }) => {
  const [hasError, setHasError] = useState(false);
  useEffect(() => { setHasError(false); }, [uri]);
  return (
    <TouchableOpacity style={styles.photoTile} onPress={onPress}>
      {hasError ? (
        <View style={{ width: "100%", height: "100%", backgroundColor: "#1e293b", justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="image-outline" size={28} color="#475569" />
          <Text style={{ color: "#475569", fontSize: 10, marginTop: 4 }}>Μη διαθέσιμο</Text>
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={() => setHasError(true)}
        />
      )}
    </TouchableOpacity>
  );
};

// --- TASK ITEM ---
const TaskItem = ({ item, onPress, onLongPress, isSyncing }: any) => {
  if (!item) return null;
  const [thumbError, setThumbError] = useState(false);

  // Reset error when URI changes (e.g. file:// temp → Firebase URL after sync)
  const lastImageUri = item.type === "photo" && item.images?.length > 0
    ? item.images[item.images.length - 1]
    : null;
  useEffect(() => {
    setThumbError(false);
  }, [lastImageUri]);

  let iconName: any = "document-text";
  if (item.type === "photo") iconName = "camera";
  else if (item.type === "measurement") iconName = "construct";
  else if (item.type === "video") iconName = "videocam";

  return (
    <View style={styles.cardContainer}>
      <TouchableOpacity
        style={[styles.cardInner, item.isLocal && styles.cardLocalBorder]}
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress(item)} // Ενεργό μόνο σε mobile
        delayLongPress={500}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.iconContainer,
            item.status === "completed" ? styles.bgGreen : styles.bgBlue,
          ]}
        >
          <Ionicons
            name={iconName}
            size={22}
            color={item.status === "completed" ? "#059669" : "#2563eb"}
          />
        </View>
        <View style={styles.textContainer}>
          <Text
            style={[
              styles.titleText,
              item.status === "completed" && {
                color: "#64748b",
                textDecorationLine: "line-through",
              },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {item.description ? (
            <Text style={styles.descText} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}

          {item.isLocal && (
            <View style={styles.localBadgeRow}>
              <Ionicons name="cloud-offline" size={12} color="#f97316" />
              <Text style={styles.localText}>
                {isSyncing ? "Συγχρονισμός..." : "Αναμονή Δικτύου"}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.rightContainer}>
          {item.type === "photo" ? (
            item.images.length > 0 ? (
              <View style={styles.thumbnailBox}>
                {thumbError ? (
                  <View style={[styles.thumbImage, { backgroundColor: "#1e293b", justifyContent: "center", alignItems: "center" }]}>
                    <Ionicons name="image-outline" size={20} color="#475569" />
                  </View>
                ) : (
                  <Image
                    source={{ uri: item.images[item.images.length - 1] }}
                    style={styles.thumbImage}
                    onError={() => setThumbError(true)}
                  />
                )}
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.images.length}</Text>
                </View>
              </View>
            ) : (
              <Ionicons name="camera-outline" size={24} color="#cbd5e1" />
            )
          ) : item.type === "video" ? (
            item.videos && item.videos.length > 0 ? (
              <View style={styles.thumbnailBox}>
                <View
                  style={[
                    styles.thumbImage,
                    {
                      backgroundColor: "#000",
                      justifyContent: "center",
                      alignItems: "center",
                    },
                  ]}
                >
                  <Ionicons name="play" size={20} color="white" />
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.videos.length}</Text>
                </View>
              </View>
            ) : (
              <Ionicons name="videocam-outline" size={24} color="#cbd5e1" />
            )
          ) : item.status === "completed" ? (
            <Text style={styles.valueText} numberOfLines={1}>
              {item.value}
            </Text>
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
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

  const CACHE_KEY = PROJECT_CACHE_KEY_PREFIX + projectId;
  const QUEUE_KEY = OFFLINE_QUEUE_KEY + projectId;

  const [cloudTasks, setCloudTasks] = useState<Task[]>([]);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectStatus, setProjectStatus] = useState<
    "active" | "pending" | "completed"
  >("active");
  const [teamId, setTeamId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // UI States
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);

  // --- EDITOR STATES ---
  const [editorVisible, setEditorVisible] = useState(false);
  const [tempImageUri, setTempImageUri] = useState<string | null>(null);
  const [tempImageDims, setTempImageDims] = useState<{ w: number; h: number } | null>(null);
  const [tempGpsLoc, setTempGpsLoc] = useState<GeoPoint | undefined>(undefined);
  const [taskForEditing, setTaskForEditing] = useState<Task | null>(null);
  const [reEditingIndex, setReEditingIndex] = useState<number | null>(null); // For re-editing existing photos

  const [selectedTaskForOptions, setSelectedTaskForOptions] =
    useState<Task | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [currentTaskType, setCurrentTaskType] = useState("measurement");
  const [currentTaskDescription, setCurrentTaskDescription] = useState("");

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskType, setNewTaskType] = useState<
    "photo" | "measurement" | "general" | "video"
  >("photo");

  const [activeTaskForGallery, setActiveTaskForGallery] = useState<Task | null>(
    null,
  );
  const [selectedMediaForView, setSelectedMediaForView] = useState<
    string | null
  >(null);
  const [mediaViewError, setMediaViewError] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);

  const videoRef = useRef<Video>(null);

  // --- LOCATION PERMISSION ---
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("Location permission denied");
      }
    })();
  }, []);

  // --- INIT LOAD ---
  useEffect(() => {
    const init = async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const d = JSON.parse(cached);
          setCloudTasks((d.tasks || []).map(normalizeVideoTask));
          setProjectName(d.name || "");
          setProjectStatus(d.status || "active");
          setTeamId(d.teamId || "");
        }
        const local = await AsyncStorage.getItem(QUEUE_KEY);
        if (local) setLocalTasks(JSON.parse(local).map(normalizeVideoTask));
      } catch (e) {
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [projectId]);

  // --- CLOUD LISTENER ---
  useEffect(() => {
    if (!projectId) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        return onSnapshot(doc(db, "projects", projectId), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const fetched = (data.tasks || []).map(normalizeVideoTask);
            setCloudTasks(fetched);
            setProjectName(data.title || "Project");
            setProjectStatus(data.status || "active");
            setTeamId(data.teamId || "");
            AsyncStorage.setItem(
              CACHE_KEY,
              JSON.stringify({
                name: data.title,
                tasks: fetched,
                status: data.status,
                teamId: data.teamId,
              }),
            );
          }
        });
      }
    });
    return () => unsub && unsub();
  }, [projectId]);

  // --- SYNC COMPLETION LISTENER ---
  useEffect(() => {
    if (justSyncedProjectId === projectId) {
      // Sync completed for this project - clear local queue
      console.log("✅ Sync completed for this project - clearing local queue");
      setLocalTasks([]);
      AsyncStorage.removeItem(QUEUE_KEY);
    }
  }, [justSyncedProjectId, projectId]);

  // --- MERGE LISTS ---
  const combinedTasks = useMemo(() => {
    const map = new Map<string, Task>();
    cloudTasks.forEach((t) => map.set(t.id, normalizeVideoTask(t)));
    localTasks.forEach((t) => map.set(t.id, normalizeVideoTask(t)));
    return Array.from(map.values()).filter((t) => t && t.id);
  }, [cloudTasks, localTasks]);

  // --- AUTOMATIC STATUS ONLY ---
  // Ελέγχουμε αν άλλαξε κάτι στα tasks και ενημερώνουμε το status ΑΥΤΟΜΑΤΑ
  // NEW LOGIC: active → pending → completed
  useEffect(() => {
    if (combinedTasks.length === 0) {
      // No tasks → reset to active
      if (projectStatus !== "active") {
        updateProjectStatus("active");
      }
      return;
    }

    const completedCount = combinedTasks.filter(
      (t) => t.status === "completed",
    ).length;
    const totalCount = combinedTasks.length;

    let newStatus: "active" | "pending" | "completed";

    if (completedCount === totalCount) {
      // Όλα τα tasks ολοκληρώθηκαν
      newStatus = "completed";
    } else if (completedCount > 0) {
      // Κάποια tasks ολοκληρώθηκαν (αλλά όχι όλα)
      newStatus = "pending";
    } else {
      // Κανένα task δεν ολοκληρώθηκε
      newStatus = "active";
    }

    // Ενημέρωση μόνο αν άλλαξε
    if (newStatus !== projectStatus) {
      updateProjectStatus(newStatus);
    }
  }, [combinedTasks]); // Τρέχει όποτε αλλάξει κάτι στα tasks

  // Reset media states when switching to a different file
  useEffect(() => {
    setMediaViewError(false);
    setMediaLoaded(false);
  }, [selectedMediaForView]);

  // --- AUTO-REFRESH GALLERY ---
  useEffect(() => {
    if (activeTaskForGallery) {
      const updatedTask = combinedTasks.find(t => t.id === activeTaskForGallery.id);
      if (updatedTask) {
        setActiveTaskForGallery(updatedTask);

        // If currently viewing deleted media, reset view
        if (selectedMediaForView) {
          const isPhotoStillThere = updatedTask.type === "photo" &&
            updatedTask.images.includes(selectedMediaForView);
          const isVideoStillThere = updatedTask.type === "video" &&
            updatedTask.videos.includes(selectedMediaForView);

          if (!isPhotoStillThere && !isVideoStillThere) {
            setSelectedMediaForView(null);
          }
        }
      }
    }
  }, [combinedTasks]);

  const updateProjectStatus = async (
    newStatus: "active" | "pending" | "completed",
  ) => {
    setProjectStatus(newStatus); // Ενημέρωση τοπικά για άμεση απόκριση

    const net = await Network.getNetworkStateAsync();
    if (net.isConnected) {
      try {
        // Ενημέρωση και στη βάση
        await updateDoc(doc(db, "projects", projectId), { status: newStatus });
      } catch (e) {
        console.log("Status update failed", e);
      }
    }
  };

  // --- STRICT CLEANUP ---
  useEffect(() => {
    if (localTasks.length === 0) return;
    const cloudMap = new Map(cloudTasks.map((t) => [t.id, t]));

    const remainingLocal = localTasks.filter((localT) => {
      const cloudT = cloudMap.get(localT.id);
      if (!cloudT) return true;

      // Check if types match
      if (localT.type !== cloudT.type) return true;

      const localStatus = localT.status;
      const cloudStatus = cloudT.status;

      // Type-specific comparisons
      if (localT.type === "photo" && cloudT.type === "photo") {
        const localImgCount = localT.images.length;
        const cloudImgCount = cloudT.images.length;
        if (localStatus === cloudStatus && localImgCount === cloudImgCount) {
          return false;
        }
      } else if (localT.type === "video" && cloudT.type === "video") {
        const localVidCount = localT.videos.length;
        const cloudVidCount = cloudT.videos.length;
        if (localStatus === cloudStatus && localVidCount === cloudVidCount) {
          return false;
        }
      } else if (
        (localT.type === "measurement" || localT.type === "general") &&
        (cloudT.type === "measurement" || cloudT.type === "general")
      ) {
        const localVal = localT.value;
        const cloudVal = cloudT.value;
        if (localVal === cloudVal && localStatus === cloudStatus) {
          return false;
        }
      }

      return true;
    });

    if (remainingLocal.length !== localTasks.length) {
      setLocalTasks(remainingLocal);
      AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remainingLocal));
    }
  }, [cloudTasks, localTasks]);

  // --- ACTIONS ---
  const saveTaskLocal = async (task: Task) => {
    // Auto-add completedAt timestamp when task becomes completed
    let taskToSave = { ...task };
    if (task.status === "completed" && !task.completedAt) {
      taskToSave = { ...task, completedAt: Date.now() };
    } else if (task.status === "pending") {
      // Remove completedAt if task goes back to pending
      const { completedAt, ...rest } = taskToSave as any;
      taskToSave = rest as Task;
    }

    // Check connectivity (WiFi or cellular if enabled)
    const net = await Network.getNetworkStateAsync();
    const hasWiFi = net.isConnected && net.type === Network.NetworkStateType.WIFI;
    const hasCellular = net.isConnected && net.type === Network.NetworkStateType.CELLULAR;
    const cellularEnabled = (await AsyncStorage.getItem("cellular_data_enabled")) === "true";
    const canUploadDirectly = hasWiFi || (cellularEnabled && hasCellular);

    if (canUploadDirectly && teamId) {
      // Connected → Upload directly to Firestore/Storage
      console.log(`📡 ${hasWiFi ? "WiFi" : "Cellular"} detected - Uploading directly to cloud...`);
      try {
        let finalTask: any = { ...taskToSave };

        // Upload media to Storage if file:// URI exists
        if (taskToSave.type === "photo" && taskToSave.images?.length > 0) {
          const uploadedImages: string[] = [];
          for (const imgUri of taskToSave.images) {
            if (imgUri.startsWith("file://")) {
              const mediaId = generateMediaId();
              const storageUrl = await uploadImageToStorage(imgUri, teamId, projectId, taskToSave.id, mediaId);
              uploadedImages.push(storageUrl);
            } else {
              uploadedImages.push(imgUri);
            }
          }
          finalTask.images = uploadedImages;
        } else if (taskToSave.type === "video" && taskToSave.videos?.length > 0) {
          const uploadedVideos: string[] = [];
          for (const videoUri of taskToSave.videos) {
            if (videoUri.startsWith("file://")) {
              const mediaId = generateMediaId();
              const storageUrl = await uploadVideoToStorage(videoUri, teamId, projectId, taskToSave.id, mediaId);
              uploadedVideos.push(storageUrl);
            } else {
              uploadedVideos.push(videoUri);
            }
          }
          finalTask.videos = uploadedVideos;
        }

        // Remove isLocal flag
        const { isLocal, ...cleanTask } = finalTask;

        // Update Firestore directly
        const projectRef = doc(db, "projects", projectId);
        const projectSnap = await getDoc(projectRef);
        if (projectSnap.exists()) {
          const currentTasks = projectSnap.data().tasks || [];
          const existingIndex = currentTasks.findIndex((t: any) => t.id === cleanTask.id);
          if (existingIndex !== -1) {
            currentTasks[existingIndex] = cleanTask;
          } else {
            currentTasks.push(cleanTask);
          }
          await updateDoc(projectRef, { tasks: currentTasks });
          console.log("✅ Uploaded directly to Firestore");

          // Update local cloudTasks state immediately for UI refresh
          setCloudTasks(currentTasks);
        }
      } catch (error) {
        console.error("❌ Direct upload failed:", error);
        // Fallback to local save
        const taskWithFlag = { ...taskToSave, isLocal: true };
        setLocalTasks((prev) => {
          const newLocalMap = new Map(prev.map((t) => [t.id, t]));
          newLocalMap.set(taskWithFlag.id, taskWithFlag);
          const newLocalList = Array.from(newLocalMap.values());
          AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(newLocalList));
          return newLocalList;
        });
        if (activeTaskForGallery && activeTaskForGallery.id === taskToSave.id)
          setActiveTaskForGallery(taskWithFlag);
      }
    } else {
      // No connection or cellular disabled → Save locally
      console.log("💾 No direct upload available - Saving locally...");
      const taskWithFlag = { ...taskToSave, isLocal: true };
      setLocalTasks((prev) => {
        const newLocalMap = new Map(prev.map((t) => [t.id, t]));
        newLocalMap.set(taskWithFlag.id, taskWithFlag);
        const newLocalList = Array.from(newLocalMap.values());
        AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(newLocalList));
        return newLocalList;
      });

      if (activeTaskForGallery && activeTaskForGallery.id === taskToSave.id)
        setActiveTaskForGallery(taskWithFlag);
    }
  };

  // --- CREATE / EDIT ---
  const openCreateModal = () => {
    setEditingTaskId(null);
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskType("photo");
    setCreateModalVisible(true);
  };

  const handleSaveTask = async () => {
    if (!newTaskTitle.trim())
      return Alert.alert("Προσοχή", "Τίτλος υποχρεωτικός");

    let taskToSave: Task;
    const baseTask = {
      id: editingTaskId || Date.now().toString(),
      title: newTaskTitle,
      description: newTaskDescription,
      status: (editingTaskId ? combinedTasks.find((t) => t.id === editingTaskId)?.status : "pending") as "pending" | "completed",
      isLocal: true,
    };

    if (newTaskType === "photo") {
      const existingTask = editingTaskId ? combinedTasks.find((t) => t.id === editingTaskId) : null;
      taskToSave = {
        ...baseTask,
        type: "photo",
        images: existingTask?.type === "photo" ? existingTask.images : [],
        imageLocations: existingTask?.type === "photo" ? existingTask.imageLocations : [],
      };
    } else if (newTaskType === "video") {
      const existingTask = editingTaskId ? combinedTasks.find((t) => t.id === editingTaskId) : null;
      taskToSave = {
        ...baseTask,
        type: "video",
        videos: existingTask?.type === "video" ? existingTask.videos : [],
        videoLocations: existingTask?.type === "video" ? existingTask.videoLocations : [],
      };
    } else if (newTaskType === "measurement") {
      const existingTask = editingTaskId ? combinedTasks.find((t) => t.id === editingTaskId) : null;
      const existingValue = existingTask?.type === "measurement" || existingTask?.type === "general" ? existingTask.value : "";
      taskToSave = {
        ...baseTask,
        type: "measurement",
        value: existingValue,
      };
    } else {
      const existingTask = editingTaskId ? combinedTasks.find((t) => t.id === editingTaskId) : null;
      const existingValue = existingTask?.type === "general" || existingTask?.type === "measurement" ? existingTask.value : "";
      taskToSave = {
        ...baseTask,
        type: "general",
        value: existingValue,
      };
    }

    setCreateModalVisible(false);
    setNewTaskTitle("");
    setNewTaskDescription("");
    setEditingTaskId(null);
    await saveTaskLocal(taskToSave);
  };

  const handleLongPressTask = (task: Task) => {
    if (Platform.OS !== "web") {
      setSelectedTaskForOptions(task);
      setOptionsModalVisible(true);
    }
  };

  const handleEditOption = () => {
    if (selectedTaskForOptions) {
      setEditingTaskId(selectedTaskForOptions.id);
      setNewTaskTitle(selectedTaskForOptions.title);
      setNewTaskDescription(selectedTaskForOptions.description || "");
      setNewTaskType(selectedTaskForOptions.type);
      setOptionsModalVisible(false);
      setCreateModalVisible(true);
    }
  };

  const handleDeleteOption = () => {
    setOptionsModalVisible(false);
    if (selectedTaskForOptions) handleDeleteCompletely(selectedTaskForOptions);
  };

  const handleDeleteCompletely = (task: Task) => {
    Alert.alert("Διαγραφή", "Σίγουρα;", [
      { text: "Όχι", style: "cancel" },
      {
        text: "Διαγραφή",
        style: "destructive",
        onPress: async () => {
          // Delete media from Firebase Storage
          const mediaUrls: string[] = [];
          if (task.type === "photo" && task.images) {
            mediaUrls.push(...task.images);
          } else if (task.type === "video" && task.videos) {
            mediaUrls.push(...task.videos);
          }
          for (const url of mediaUrls) {
            deleteMediaFromStorage(url).catch(() => {});
          }

          setLocalTasks((prev) => {
            const remaining = prev.filter((t) => t.id !== task.id);
            AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
            return remaining;
          });
          setCloudTasks((prev) => prev.filter((t) => t.id !== task.id));
          const net = await Network.getNetworkStateAsync();
          if (net.isConnected) {
            const updated = cloudTasks.filter((t) => t.id !== task.id);
            updateDoc(doc(db, "projects", projectId), { tasks: updated }).catch(
              (e) => {},
            );
          }
        },
      },
    ]);
  };

  // --- CAMERA LOGIC ---
  const launchCamera = async (task: Task) => {
    try {
      // 1. Start GPS fetch in background (non-blocking)
      const gpsPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch((e) => {
        console.log("GPS Failed:", e);
        return null;
      });

      // 2. Launch camera immediately (don't wait for GPS)
      if (task.type === "video") {
        const r = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Videos,
          videoMaxDuration: 4, // 4 seconds max (can be longer now that we compress)
          videoQuality: 0, // 0 = Low quality (native value, works on Android too)
        });

        if (!r.canceled && r.assets[0].uri) {
          setProcessing(true);
          try {
            const videoUri = r.assets[0].uri;

            console.log("🎥 Video captured, starting compression...");

            // COMPRESS VIDEO (WhatsApp-style compression)
            const { uri: compressedUri, compressionRatio } = await compressVideo(
              videoUri,
              (progress) => {
                console.log(`  Compressing: ${Math.round(progress * 100)}%`);
              }
            );

            console.log(`✓ Video compressed (${compressionRatio.toFixed(0)}% smaller)`);

            // Wait for GPS to complete
            const gpsResult = await gpsPromise;
            const gpsLoc = gpsResult ? { lat: gpsResult.coords.latitude, lng: gpsResult.coords.longitude } : undefined;

            // Embed GPS coordinates into the MP4 file
            const finalVideoUri = await embedVideoGps(compressedUri, gpsLoc);

            // OFFLINE-FIRST: Save file with GPS to AsyncStorage
            console.log("💾 Saving video to AsyncStorage...");
            await addMediaToTask(
              task.id,
              finalVideoUri,
              gpsLoc
            );

            console.log("✓ Compressed video saved successfully (offline-first)");
            console.log("  - Will upload to Storage when online via SyncContext");
          } catch (e: any) {
            console.error("❌ Video compression/save error:", e);
            Alert.alert("Σφάλμα", e.message || "Απέτυχε η συμπίεση του βίντεο.");
          } finally {
            setProcessing(false);
          }
        }
      } else {
        // --- PHOTO: Direct to Drawing Editor ---
        const r = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1, // Max resolution - compression handled by ImageManipulator (70%)
        });

        if (!r.canceled && r.assets[0].uri) {
          // Wait for GPS to complete
          const gpsResult = await gpsPromise;
          const gpsLoc = gpsResult ? { lat: gpsResult.coords.latitude, lng: gpsResult.coords.longitude } : undefined;

          // To Drawing Editor
          setTaskForEditing(task);
          setTempImageUri(r.assets[0].uri);
          setTempImageDims({ w: r.assets[0].width, h: r.assets[0].height });
          setTempGpsLoc(gpsLoc);
          setReEditingIndex(null);
          setEditorVisible(true);
        }
      }
    } catch (e) {
      Alert.alert("Error", "Camera failed");
      setProcessing(false);
    }
  };

  const launchGallery = async (task: Task) => {
    try {
      const gpsPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);

      if (task.type === "video") {
        const r = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        });

        if (!r.canceled && r.assets[0].uri) {
          setProcessing(true);
          try {
            const videoUri = r.assets[0].uri;
            const { uri: compressedUri, compressionRatio } = await compressVideo(
              videoUri,
              (progress) => {
                console.log(`  Compressing: ${Math.round(progress * 100)}%`);
              }
            );
            console.log(`✓ Video compressed (${compressionRatio.toFixed(0)}% smaller)`);

            const gpsResult = await gpsPromise;
            const gpsLoc = gpsResult ? { lat: gpsResult.coords.latitude, lng: gpsResult.coords.longitude } : undefined;

            const finalVideoUri = await embedVideoGps(compressedUri, gpsLoc);
            await addMediaToTask(task.id, finalVideoUri, gpsLoc);
          } catch (e: any) {
            Alert.alert("Σφάλμα", e.message || "Απέτυχε η συμπίεση του βίντεο.");
          } finally {
            setProcessing(false);
          }
        }
      } else {
        const r = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1, // Max resolution - compression handled by ImageManipulator (70%)
        });

        if (!r.canceled && r.assets[0].uri) {
          const gpsResult = await gpsPromise;
          const gpsLoc = gpsResult ? { lat: gpsResult.coords.latitude, lng: gpsResult.coords.longitude } : undefined;

          setTaskForEditing(task);
          setTempImageUri(r.assets[0].uri);
          setTempImageDims({ w: r.assets[0].width, h: r.assets[0].height });
          setTempGpsLoc(gpsLoc);
          setReEditingIndex(null);
          setEditorVisible(true);
        }
      }
    } catch (e) {
      Alert.alert("Σφάλμα", "Αποτυχία πρόσβασης στη συλλογή");
      setProcessing(false);
    }
  };

  const [mediaPickerVisible, setMediaPickerVisible] = useState(false);

  const showMediaPicker = (task: Task) => {
    setMediaPickerVisible(true);
  };

  const handleEditorSave = async (editedUri: string) => {
    setEditorVisible(false);
    setProcessing(true);

    try {
      console.log("📸 Starting image save process (OFFLINE-FIRST)...");
      console.log("  - Edited URI:", editedUri);
      console.log("  - Re-editing index:", reEditingIndex);

      // Compress with 70% quality, NO RESIZE (full camera resolution)
      const m = await ImageManipulator.manipulateAsync(
        editedUri,
        [{ rotate: 0 }], // Apply EXIF orientation to pixel data
        {
          compress: 0.7, // 70% quality
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      console.log("✓ Image compressed successfully");
      console.log("  - Compressed file:// URI:", m.uri);

      if (!m.uri) {
        throw new Error("Η επεξεργασία εικόνας δεν παρήγαγε URI");
      }

      if (!taskForEditing) {
        throw new Error("Δεν βρέθηκε το task για επεξεργασία");
      }

      // Embed EXIF metadata (GPS + date) into the JPEG
      const finalUri = await embedExifData(m.uri, tempGpsLoc, new Date());
      console.log("  - Final URI (with EXIF):", finalUri);

      // Check if we're re-editing an existing photo
      if (reEditingIndex !== null && taskForEditing.type === "photo") {
        // REPLACE existing image at index
        console.log("🔄 Replacing image at index:", reEditingIndex);
        await replaceMediaInTask(taskForEditing.id, reEditingIndex, finalUri);
        console.log("✓ Image replaced successfully");
      } else {
        // ADD new image (original behavior)
        console.log("💾 Saving file:// URI to AsyncStorage...");
        await addMediaToTask(
          taskForEditing.id,
          finalUri, // Save local file:// URI with EXIF, NOT Storage URL
          tempGpsLoc,
        );
        console.log("✓ Image saved successfully (offline-first)");
      }

      console.log("  - Will upload to Storage when online via SyncContext");
    } catch (e: any) {
      console.error("❌ Image save error:", e);
      console.error("  - Error message:", e.message);
      Alert.alert(
        "Σφάλμα",
        e.message || "Απέτυχε η αποθήκευση της επεξεργασμένης εικόνας."
      );
    } finally {
      setProcessing(false);
      setTempImageUri(null);
      setTempImageDims(null);
      setTaskForEditing(null);
      setReEditingIndex(null); // Reset re-edit mode
    }
  };

  const addMediaToTask = async (
    tid: string,
    uri: string,
    location?: GeoPoint,
  ) => {
    const t = combinedTasks.find((x) => x.id === tid);
    if (!t) return;

    if (t.type === "photo") {
      const imgs = [...t.images, uri];
      const newLoc = location || { lat: 0, lng: 0 };
      const locs = [...t.imageLocations, newLoc];

      await saveTaskLocal({
        ...t,
        images: imgs,
        imageLocations: locs,
        status: "completed",
      });
    } else if (t.type === "video") {
      const vids = [...t.videos, uri];
      const newLoc = location || { lat: 0, lng: 0 };
      const locs = [...t.videoLocations, newLoc];

      await saveTaskLocal({
        ...t,
        videos: vids,
        videoLocations: locs,
        status: "completed",
      });
    }
  };

  // Replace an existing image at a specific index (for re-editing)
  const replaceMediaInTask = async (
    tid: string,
    index: number,
    newUri: string,
  ) => {
    const t = combinedTasks.find((x) => x.id === tid);
    if (!t || t.type !== "photo") return;

    const newImages = [...t.images];
    const oldUri = newImages[index];

    // Delete old image from Storage if it's a Storage URL
    if (oldUri && oldUri.startsWith("https://firebasestorage.googleapis.com")) {
      const net = await Network.getNetworkStateAsync();
      const hasWiFi = net.isConnected && net.type === Network.NetworkStateType.WIFI;
      if (hasWiFi) {
        try {
          await deleteMediaFromStorage(oldUri);
          console.log("✓ Old image deleted from Storage");
        } catch (error) {
          console.error("Failed to delete old image from Storage:", error);
        }
      }
    }

    // Replace the image at the index
    newImages[index] = newUri;

    await saveTaskLocal({
      ...t,
      images: newImages,
      // Keep the same location for the replaced image
      status: "completed",
    });
  };

  const removeMediaFromTask = async (uri: string) => {
    if (!activeTaskForGallery) return;

    // DELETE FROM STORAGE (only if WiFi available and it's a Storage URL)
    const net = await Network.getNetworkStateAsync();
    const hasWiFi = net.isConnected && net.type === Network.NetworkStateType.WIFI;

    if (uri && uri.startsWith("https://firebasestorage.googleapis.com") && hasWiFi) {
      try {
        await deleteMediaFromStorage(uri);
        console.log("✓ Media deleted from Storage");
      } catch (error) {
        console.error("Failed to delete from Storage:", error);
        // Continue anyway - remove from task even if Storage delete fails
      }
    } else if (uri && uri.startsWith("https://firebasestorage.googleapis.com") && !hasWiFi) {
      console.log("💾 No WiFi - Media marked for deletion (will delete when online)");
      // Task will be saved locally with updated images/value
      // SyncContext will handle deletion when WiFi available
    }

    // REMOVE FROM TASK (works offline)
    if (activeTaskForGallery.type === "photo") {
      const idx = activeTaskForGallery.images.findIndex((i: string) => i === uri);
      if (idx !== -1) {
        const newImages = [...activeTaskForGallery.images];
        const newLocs = [...activeTaskForGallery.imageLocations];

        newImages.splice(idx, 1);
        if (newLocs.length > idx) newLocs.splice(idx, 1);

        const st = newImages.length > 0 ? "completed" : "pending";
        setSelectedMediaForView(null);
        await saveTaskLocal({
          ...activeTaskForGallery,
          images: newImages,
          imageLocations: newLocs,
          status: st as "completed" | "pending",
        });
      }
    } else if (activeTaskForGallery.type === "video") {
      const idx = activeTaskForGallery.videos.findIndex((v: string) => v === uri);
      if (idx !== -1) {
        const newVideos = [...activeTaskForGallery.videos];
        const newLocs = [...activeTaskForGallery.videoLocations];
        newVideos.splice(idx, 1);
        newLocs.splice(idx, 1);

        setSelectedMediaForView(null);
        await saveTaskLocal({
          ...activeTaskForGallery,
          videos: newVideos,
          videoLocations: newLocs,
          status: newVideos.length > 0 ? "completed" : "pending",
        });
      }
    }
  };

  // Open the editor to re-edit an existing photo
  const handleOpenReEdit = () => {
    if (!selectedMediaForView || !activeTaskForGallery) return;
    if (activeTaskForGallery.type !== "photo") return;

    // Find the index of the selected media in the task
    const task = activeTaskForGallery as PhotoTask;
    const index = task.images.indexOf(selectedMediaForView);
    if (index === -1) return;

    // Set up for re-editing
    setReEditingIndex(index);
    setTempImageUri(selectedMediaForView);
    setTempImageDims(null); // Firebase URL — natural dims not available
    setTaskForEditing(activeTaskForGallery);
    setSelectedMediaForView(null); // Close the viewer
    setEditorVisible(true);
  };

  const handleSaveInput = async () => {
    setInputModalVisible(false);
    if (currentTaskId && inputValue) {
      const t = combinedTasks.find((x) => x.id === currentTaskId);
      if (t && (t.type === "measurement" || t.type === "general")) {
        await saveTaskLocal({ ...t, value: inputValue, status: "completed" });
      }
    }
  };
  const handleClearValue = async () => {
    setInputModalVisible(false);
    if (currentTaskId) {
      const t = combinedTasks.find((x) => x.id === currentTaskId);
      if (t && (t.type === "measurement" || t.type === "general")) {
        await saveTaskLocal({ ...t, value: "", status: "pending" });
      }
    }
  };
  const confirmDeleteMedia = () => {
    if (!selectedMediaForView) return;
    Alert.alert("Διαγραφή", "Διαγραφή αρχείου;", [
      { text: "Άκυρο", style: "cancel" },
      {
        text: "Διαγραφή",
        style: "destructive",
        onPress: () => removeMediaFromTask(selectedMediaForView),
      },
    ]);
  };

  // --- MAP & SHARE ---
  const openMediaLocation = () => {
    if (!selectedMediaForView || !activeTaskForGallery) return;

    if (activeTaskForGallery.type === "photo") {
      const idx = activeTaskForGallery.images.indexOf(selectedMediaForView);
      if (idx !== -1 && activeTaskForGallery.imageLocations[idx]) {
        const loc = activeTaskForGallery.imageLocations[idx];
        if (loc.lat !== 0 && loc.lng !== 0) {
          const url = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
          Linking.openURL(url);
        } else {
          Alert.alert(
            "Πληροφορία",
            "Δεν έχει καταγραφεί τοποθεσία για αυτό το αρχείο.",
          );
        }
      }
    } else if (activeTaskForGallery.type === "video") {
      const idx = activeTaskForGallery.videos.indexOf(selectedMediaForView);
      if (idx !== -1 && activeTaskForGallery.videoLocations[idx]) {
        const loc = activeTaskForGallery.videoLocations[idx];
        if (loc.lat !== 0 && loc.lng !== 0) {
          const url = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
          Linking.openURL(url);
        } else {
          Alert.alert(
            "Πληροφορία",
            "Δεν έχει καταγραφεί τοποθεσία για αυτό το βίντεο.",
          );
        }
      }
    } else {
      Alert.alert(
        "Πληροφορία",
        "Η τοποθεσία είναι διαθέσιμη μόνο για φωτογραφίες και βίντεο.",
      );
    }
  };

  const handleShare = async (uri: string) => {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Σφάλμα", "Η κοινοποίηση δεν είναι διαθέσιμη σε αυτή τη συσκευή.");
      return;
    }

    if (!uri) {
      Alert.alert("Σφάλμα", "Δεν υπάρχει αρχείο για κοινοποίηση.");
      return;
    }

    try {
      console.log("📤 Sharing URI:", uri.substring(0, 100));

      // Handle local file:// URIs (offline-first)
      if (uri.startsWith("file://")) {
        console.log("📤 Sharing local file");
        await Sharing.shareAsync(uri);
        return;
      }

      // Handle remote URLs (Firebase Storage, etc.) - MUST download first on Android
      if (uri.startsWith("https://")) {
        console.log("📤 Downloading remote file for sharing...");
        const isVideo = uri.includes(".mp4") || uri.includes("video");
        const ext = isVideo ? ".mp4" : ".jpg";
        const tempFile = FileSystem.cacheDirectory + `share_temp_${Date.now()}${ext}`;

        const downloadResult = await FileSystem.downloadAsync(uri, tempFile);

        if (downloadResult.status === 200) {
          console.log("📤 Downloaded, now sharing:", tempFile);
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: isVideo ? "video/mp4" : "image/jpeg",
          });
        } else {
          console.error("📤 Download failed:", downloadResult.status);
          Alert.alert("Σφάλμα", "Αποτυχία λήψης αρχείου για κοινοποίηση.");
        }
        return;
      }

      // Handle base64 data URIs (legacy)
      if (uri.startsWith("data:")) {
        console.log("📤 Sharing base64 data");
        const isVideo = uri.startsWith("data:video");
        const ext = isVideo ? ".mp4" : ".jpg";
        const base64Data = uri.split("base64,")[1];
        if (!base64Data) {
          Alert.alert("Σφάλμα", "Μη έγκυρα δεδομένα εικόνας.");
          return;
        }
        const filename = FileSystem.cacheDirectory + `temp_share${ext}`;
        await FileSystem.writeAsStringAsync(filename, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(filename);
        return;
      }

      // Fallback - unknown format
      console.warn("📤 Unknown URI format:", uri.substring(0, 50));
      Alert.alert("Σφάλμα", "Μη υποστηριζόμενη μορφή αρχείου.");
    } catch (error) {
      console.error("Share error:", error);
      Alert.alert("Σφάλμα", "Δεν ήταν δυνατή η κοινοποίηση.");
    }
  };
  const handleSyncPress = async () => {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) return Alert.alert("No Internet");
    syncNow();
  };

  // --- GENERATE PDF ---
  const generatePDF = async () => {
    setProcessing(true);
    try {
      const dateStr = new Date().toLocaleDateString("el-GR", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Helper function to format completion date
      const formatCompletedDate = (timestamp?: number) => {
        if (!timestamp) return null;
        return new Date(timestamp).toLocaleDateString("el-GR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      };

      // Helper function to generate GPS link
      const generateGpsLink = (loc: GeoPoint) => {
        if (!loc || loc.lat === 0 || loc.lng === 0) return null;
        return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
      };

      let tasksHTML = "";

      combinedTasks.forEach((task, index) => {
        const isDone = task.status === "completed";

        // Status Badge Logic
        const statusBadge = isDone
          ? `<span class="badge badge-success">✓ ΟΛΟΚΛΗΡΩΘΗΚΕ</span>`
          : `<span class="badge badge-pending">ΕΚΚΡΕΜΕΙ</span>`;

        // Completion Date
        const completedDateStr = formatCompletedDate(task.completedAt);
        const dateHTML = completedDateStr
          ? `<div class="completed-date">📅 ${completedDateStr}</div>`
          : "";

        // Description Logic
        const descHTML = task.description
          ? `<div class="desc">${task.description}</div>`
          : "";

        // Icon selection based on type
        let typeIcon = "📝";
        let typeLabel = "Κείμενο";
        if (task.type === "photo") { typeIcon = "📷"; typeLabel = "Φωτογραφία"; }
        if (task.type === "video") { typeIcon = "🎥"; typeLabel = "Βίντεο"; }
        if (task.type === "measurement") { typeIcon = "📏"; typeLabel = "Μέτρηση"; }

        // Generate media section (thumbnails + GPS links)
        let mediaHTML = "";

        if (task.type === "photo" && task.images.length > 0) {
          // GPS links for photos (all photos, no limit)
          const gpsLinks = task.imageLocations
            .map((loc, i) => {
              const url = generateGpsLink(loc);
              return url ? `<a href="${url}" class="gps-link" target="_blank">📍 Φωτο ${i + 1}</a>` : null;
            })
            .filter(Boolean)
            .join(" ");

          mediaHTML = `
            <div class="media-section">
              <div class="media-count photo-count">📷 ${task.images.length} Φωτογραφίες</div>
              ${gpsLinks ? `<div class="gps-row">${gpsLinks}</div>` : ""}
            </div>
          `;
        } else if (task.type === "video" && task.videos.length > 0) {
          // Video count and GPS links
          const gpsLinks = task.videoLocations
            .map((loc, i) => {
              const url = generateGpsLink(loc);
              return url ? `<a href="${url}" class="gps-link" target="_blank">📍 Βίντεο ${i + 1}</a>` : null;
            })
            .filter(Boolean)
            .slice(0, 4)
            .join(" ");

          mediaHTML = `
            <div class="media-section">
              <div class="media-count video-count">🎥 ${task.videos.length} Βίντεο</div>
              ${gpsLinks ? `<div class="gps-row">${gpsLinks}</div>` : ""}
            </div>
          `;
        } else if ((task.type === "measurement" || task.type === "general") && task.value) {
          mediaHTML = `
            <div class="media-section">
              <div class="value-box">${task.value}</div>
            </div>
          `;
        }

        tasksHTML += `
          <div class="task-card ${isDone ? 'completed' : ''}">
            <div class="task-header">
              <div class="task-number">${index + 1}</div>
              <div class="task-info">
                <div class="task-title-row">
                  <span class="task-title">${typeIcon} ${task.title}</span>
                  <span class="task-type">${typeLabel}</span>
                </div>
                ${descHTML}
                ${dateHTML}
              </div>
              <div class="task-status">
                ${statusBadge}
              </div>
            </div>
            ${mediaHTML}
          </div>
        `;
      });

      // Build photo appendix section - full-size photos grouped by task
      let photosAppendixHTML = "";
      const photoTasksForAppendix = combinedTasks.filter(
        (t) => t.type === "photo" && t.images.length > 0
      );
      if (photoTasksForAppendix.length > 0) {
        let photoPagesHTML = "";
        photoTasksForAppendix.forEach((task) => {
          const validImages = task.images.filter((img: string) => img.startsWith("https://"));
          if (validImages.length === 0) return;
          // First photo: task title + number + photo
          photoPagesHTML += `
            <div class="photo-page">
              <div class="photo-page-title">📷 ${task.title}</div>
              <div class="photo-page-number">Φωτογραφία 1</div>
              <center><img src="${validImages[0]}" class="photo-full" onerror="this.parentElement.parentElement.style.display='none'" /></center>
            </div>
          `;
          // Rest: just number + photo (each on own page)
          for (let i = 1; i < validImages.length; i++) {
            photoPagesHTML += `
              <div class="photo-page">
                <div class="photo-page-number">Φωτογραφία ${i + 1}</div>
                <center><img src="${validImages[i]}" class="photo-full" onerror="this.parentElement.parentElement.style.display='none'" /></center>
              </div>
            `;
          }
        });
        if (photoPagesHTML) {
          photosAppendixHTML = photoPagesHTML;
        }
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1.0">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

                body {
                    font-family: 'Inter', Helvetica, Arial, sans-serif;
                    padding: 30px;
                    color: #1e293b;
                    background: #ffffff;
                    font-size: 12px;
                }

                /* HEADER */
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    border-bottom: 3px solid #2563eb;
                    padding-bottom: 20px;
                    margin-bottom: 25px;
                }
                .logo-placeholder {
                    width: 50px;
                    height: 50px;
                    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                    color: white;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    font-weight: bold;
                    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
                }
                .project-info h1 {
                    margin: 0;
                    font-size: 20px;
                    color: #0f172a;
                    letter-spacing: -0.5px;
                }
                .project-info p {
                    margin: 4px 0 0;
                    color: #64748b;
                    font-size: 11px;
                }
                .meta-info {
                    text-align: right;
                    font-size: 10px;
                    color: #64748b;
                }
                .meta-info strong { color: #334155; }

                /* SUMMARY CARDS */
                .summary {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 25px;
                }
                .card {
                    flex: 1;
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                    padding: 14px;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                }
                .card-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
                .card-value { font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px; }
                .card-value.green { color: #059669; }

                /* TASK CARDS */
                .task-card {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    margin-bottom: 12px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .task-card.completed {
                    border-left: 4px solid #10b981;
                }
                .task-header {
                    display: flex;
                    align-items: flex-start;
                    padding: 14px;
                    gap: 12px;
                }
                .task-number {
                    width: 28px;
                    height: 28px;
                    background: #f1f5f9;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    color: #64748b;
                    font-size: 12px;
                    flex-shrink: 0;
                }
                .task-info {
                    flex: 1;
                }
                .task-title-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .task-title {
                    font-weight: 700;
                    color: #1e293b;
                    font-size: 13px;
                }
                .task-type {
                    font-size: 9px;
                    color: #94a3b8;
                    background: #f1f5f9;
                    padding: 2px 6px;
                    border-radius: 4px;
                    text-transform: uppercase;
                    font-weight: 600;
                }
                .desc {
                    color: #64748b;
                    font-size: 11px;
                    margin-top: 4px;
                    font-style: italic;
                    line-height: 1.4;
                }
                .completed-date {
                    font-size: 10px;
                    color: #10b981;
                    margin-top: 4px;
                    font-weight: 500;
                }
                .task-status {
                    flex-shrink: 0;
                }

                /* BADGES */
                .badge {
                    padding: 5px 10px;
                    border-radius: 6px;
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                    display: inline-block;
                    white-space: nowrap;
                }
                .badge-success {
                    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
                    color: #166534;
                    border: 1px solid #86efac;
                }
                .badge-pending {
                    background: #f8fafc;
                    color: #64748b;
                    border: 1px solid #e2e8f0;
                }

                /* MEDIA SECTION */
                .media-section {
                    background: #f8fafc;
                    padding: 12px 14px;
                    border-top: 1px solid #f1f5f9;
                }
                .media-count {
                    font-size: 11px;
                    font-weight: 600;
                    margin-bottom: 8px;
                }
                .photo-count { color: #db2777; }
                .video-count { color: #ea580c; }

                /* PHOTOS APPENDIX */
                .photos-appendix {
                    margin-top: 30px;
                }
                .photo-page {
                    page-break-before: always;
                    text-align: center;
                    padding-top: 20px;
                }
                .photo-page-title {
                    font-size: 15px;
                    font-weight: 700;
                    color: #1e293b;
                    margin-bottom: 8px;
                    background: #f8fafc;
                    padding: 8px 12px;
                    border-radius: 6px;
                    border: 1px solid #e2e8f0;
                    display: inline-block;
                }
                .photo-page-number {
                    font-size: 12px;
                    font-weight: 600;
                    color: #64748b;
                    margin-bottom: 10px;
                }
                .photo-full {
                    max-width: 100%;
                    max-height: 80vh;
                    height: auto;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                }

                .gps-row {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .gps-link {
                    font-size: 10px;
                    color: #2563eb;
                    text-decoration: none;
                    background: #eff6ff;
                    padding: 4px 8px;
                    border-radius: 4px;
                    border: 1px solid #dbeafe;
                    font-weight: 500;
                }
                .gps-link:hover {
                    background: #dbeafe;
                }

                /* VALUE BOXES */
                .value-box {
                    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
                    color: #1d4ed8;
                    padding: 8px 14px;
                    border-radius: 8px;
                    font-family: 'Courier New', monospace;
                    font-weight: 700;
                    display: inline-block;
                    border: 1px solid #bfdbfe;
                    font-size: 13px;
                }

                /* FOOTER */
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    color: #94a3b8;
                    font-size: 9px;
                    border-top: 1px solid #f1f5f9;
                    padding-top: 15px;
                }

                /* PRINT STYLES */
                @media print {
                    body { padding: 20px; }
                    .task-card { break-inside: avoid; }
                    .photo-group { break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="logo-placeholder">${projectName.charAt(0).toUpperCase()}</div>
                    <div class="project-info">
                        <h1>${projectName}</h1>
                        <p>Αναφορά Προόδου & Εργασιών</p>
                    </div>
                </div>
                <div class="meta-info">
                    <div><strong>Ημερομηνία Αναφοράς:</strong> ${dateStr}</div>
                    <div style="margin-top: 4px;"><strong>Κωδικός Έργου:</strong> #${projectId.slice(0, 8).toUpperCase()}</div>
                </div>
            </div>

            <div class="summary">
                <div class="card">
                    <div class="card-label">ΣΥΝΟΛΟ ΕΡΓΑΣΙΩΝ</div>
                    <div class="card-value">${totalTasks}</div>
                </div>
                <div class="card">
                    <div class="card-label">ΟΛΟΚΛΗΡΩΜΕΝΕΣ</div>
                    <div class="card-value green">${completedTasks}</div>
                </div>
                <div class="card">
                    <div class="card-label">ΠΡΟΟΔΟΣ</div>
                    <div class="card-value" style="color: ${progressPercent === 100 ? "#059669" : "#2563eb"};">
                        ${Math.round(progressPercent)}%
                    </div>
                </div>
                <div class="card">
                    <div class="card-label">ΚΑΤΑΣΤΑΣΗ</div>
                    <div class="card-value" style="color: ${projectStatus === "completed" ? "#059669" : projectStatus === "pending" ? "#f59e0b" : "#2563eb"}; font-size: 11px; margin-top: 8px;">
                        ${projectStatus === "completed" ? "✅ ΟΛΟΚΛΗΡΩΜΕΝΟ" : projectStatus === "pending" ? "⏳ ΣΕ ΕΞΕΛΙΞΗ" : "🔄 ΕΝΕΡΓΟ"}
                    </div>
                </div>
            </div>

            <div class="tasks-section">
                ${tasksHTML}
            </div>

            ${photosAppendixHTML}

            <div class="footer">
                <strong>Ergon Work Management</strong> • Αυτόματη Αναφορά • ${new Date().toLocaleString("el-GR")}
            </div>
        </body>
        </html>
        `;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (e) {
      Alert.alert("PDF Error", "Δεν ήταν δυνατή η δημιουργία του PDF.");
    } finally {
      setProcessing(false);
    }
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
          <Text style={{ marginTop: 10, fontWeight: "bold", color: "#333" }}>
            Επεξεργασία Media...
          </Text>
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

          {/* HEADER ICON - DISPLAY ONLY (REMOVED ONPRESS) */}
          <View
            style={[
              styles.projectLogoPlaceholder,
              projectStatus === "completed" && { backgroundColor: "#10b981" },
            ]}
          >
            <Ionicons
              name={
                projectStatus === "completed"
                  ? "checkmark-done"
                  : "document-text"
              }
              size={24}
              color="white"
            />
          </View>

          <View style={{ marginLeft: 15, flex: 1 }}>
            <Text
              style={[
                styles.headerTitle,
                projectStatus === "completed" && {
                  textDecorationLine: "line-through",
                  color: "#94a3b8",
                },
              ]}
              numberOfLines={1}
            >
              {projectName}
            </Text>
            <Text style={styles.headerSubtitle}>
              {completedTasks}/{totalTasks} Ολοκληρώθηκαν
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {!isSyncing && localTasks.length > 0 && (
            <TouchableOpacity
              style={styles.syncButtonHeader}
              onPress={handleSyncPress}
            >
              <Ionicons name="cloud-upload" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={generatePDF}>
            <Ionicons name="print-outline" size={20} color="#2563eb" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${progressPercent}%`,
                backgroundColor:
                  projectStatus === "completed" ? "#10b981" : "#2563eb",
              },
            ]}
          />
        </View>
      </View>

      <FlatList
        data={combinedTasks}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <TaskItem
            item={item}
            onPress={(t: Task) => {
              if (t.type === "photo" || t.type === "video") {
                setActiveTaskForGallery(t);
                setGalleryModalVisible(true);
              } else if (t.type === "measurement" || t.type === "general") {
                setCurrentTaskId(t.id);
                setCurrentTaskType(t.type);
                setInputValue(t.value || "");
                setCurrentTaskDescription(t.description || "");
                setInputModalVisible(true);
              }
            }}
            onLongPress={handleLongPressTask}
            isSyncing={isSyncing}
          />
        )}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
      />

      {/* FAB - Κρύβεται ΑΥΤΟΜΑΤΑ αν είναι completed */}
      {Platform.OS !== "web" && projectStatus !== "completed" && (
        <TouchableOpacity
          style={[styles.fab, { bottom: 20 + insets.bottom }]}
          onPress={openCreateModal}
        >
          <Ionicons name="add" size={32} color="white" />
        </TouchableOpacity>
      )}

      {/* MODALS */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          enabled={Platform.OS === "ios"}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalContent,
              { paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeader}>
                {editingTaskId ? "Επεξεργασία" : "Νέα Ανάθεση"}
              </Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>Τίτλος</Text>
              <TextInput
                style={styles.input}
                placeholder="π.χ. Έλεγχος Σωληνώσεων"
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
                multiline
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
                    size={24}
                    color={newTaskType === "photo" ? "white" : "#64748b"}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      newTaskType === "photo" && { color: "white" },
                    ]}
                  >
                    Φώτο
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.optionCard,
                    newTaskType === "video" && styles.optionCardActive,
                  ]}
                  onPress={() => setNewTaskType("video")}
                >
                  <Ionicons
                    name="videocam"
                    size={24}
                    color={newTaskType === "video" ? "white" : "#64748b"}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      newTaskType === "video" && { color: "white" },
                    ]}
                  >
                    Βίντεο
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
                    size={24}
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
                    size={24}
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
              <TouchableOpacity
                style={styles.mainButton}
                onPress={handleSaveTask}
              >
                <Text style={styles.mainButtonText}>
                  {editingTaskId ? "ΑΠΟΘΗΚΕΥΣΗ" : "ΔΗΜΙΟΥΡΓΙΑ"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={optionsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsModalVisible(false)}
      >
        <View style={styles.optionsOverlay}>
          <View style={styles.optionsMenuContainer}>
            <View style={styles.optionsHeader}>
              <Text style={styles.optionsTitle}>
                {selectedTaskForOptions?.title}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={handleEditOption}
            >
              <Ionicons name="pencil" size={22} color="#2563eb" />
              <Text style={[styles.optionTextBase, { color: "#2563eb" }]}>
                Επεξεργασία
              </Text>
            </TouchableOpacity>
            <View style={styles.separator} />
            <TouchableOpacity
              style={styles.optionButton}
              onPress={handleDeleteOption}
            >
              <Ionicons name="trash" size={22} color="#ef4444" />
              <Text style={[styles.optionTextBase, { color: "#ef4444" }]}>
                Διαγραφή
              </Text>
            </TouchableOpacity>
            <View style={styles.separator} />
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => setOptionsModalVisible(false)}
            >
              <Text style={[styles.optionTextBase, { color: "#64748b" }]}>
                Άκυρο
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MEDIA PICKER (Κάμερα / Συλλογή) */}
      <Modal
        visible={mediaPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMediaPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setMediaPickerVisible(false)}
        >
          <View style={[styles.pickerContainer, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.pickerRow}>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => {
                  setMediaPickerVisible(false);
                  if (activeTaskForGallery) launchCamera(activeTaskForGallery);
                }}
              >
                <Ionicons name="camera" size={28} color="#2563eb" />
                <Text style={styles.pickerBtnText}>Κάμερα</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => {
                  setMediaPickerVisible(false);
                  if (activeTaskForGallery) launchGallery(activeTaskForGallery);
                }}
              >
                <Ionicons name="images" size={28} color="#2563eb" />
                <Text style={styles.pickerBtnText}>Συλλογή</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.pickerCancel}
              onPress={() => setMediaPickerVisible(false)}
            >
              <Text style={styles.pickerCancelText}>Ακύρωση</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* CUSTOM IMAGE EDITOR (Only show if not web) */}
      {Platform.OS !== "web" && (
        <ImageEditorModal
          visible={editorVisible}
          imageUri={tempImageUri}
          imageNaturalWidth={tempImageDims?.w}
          imageNaturalHeight={tempImageDims?.h}
          onClose={() => {
            setEditorVisible(false);
            setTempImageUri(null);
            setTempImageDims(null);
            setReEditingIndex(null); // Reset re-edit mode to prevent overwriting new photos
          }}
          onSave={handleEditorSave}
        />
      )}

      <InputModal
        visible={inputModalVisible}
        onClose={() => setInputModalVisible(false)}
        onSave={handleSaveInput}
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
        description={currentTaskDescription}
      />

      <Modal
        visible={galleryModalVisible}
        animationType="slide"
        onRequestClose={() => setGalleryModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "black" }}>
          <View style={styles.galleryHeader}>
            <TouchableOpacity
              onPress={() => setGalleryModalVisible(false)}
              style={{ marginRight: 15 }}
            >
              <Ionicons name="arrow-back" size={28} color="white" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.galleryTitle} numberOfLines={1}>
                {activeTaskForGallery?.title}
              </Text>
              {activeTaskForGallery?.description ? (
                <Text style={styles.galleryDesc} numberOfLines={2}>
                  {activeTaskForGallery.description}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={{ flex: 1, padding: 1 }}>
            <FlatList
              data={[
                ...(activeTaskForGallery?.type === "photo" || activeTaskForGallery?.type === "video"
                  ? activeTaskForGallery.type === "photo"
                    ? activeTaskForGallery.images
                    : activeTaskForGallery.videos || []
                  : []),
                "ADD"
              ]}
              numColumns={3}
              renderItem={({ item }) =>
                item === "ADD" ? (
                  <TouchableOpacity
                    style={styles.addPhotoTile}
                    onPress={() =>
                      activeTaskForGallery && showMediaPicker(activeTaskForGallery)
                    }
                  >
                    <Ionicons
                      name={
                        activeTaskForGallery?.type === "video"
                          ? "videocam"
                          : "camera"
                      }
                      size={32}
                      color="#666"
                    />
                    <Text style={styles.addPhotoText}>Προσθήκη</Text>
                  </TouchableOpacity>
                ) : activeTaskForGallery?.type === "video" ? (
                  <TouchableOpacity
                    style={styles.photoTile}
                    onPress={() => setSelectedMediaForView(item)}
                  >
                    <View
                      style={{
                        width: "100%",
                        height: "100%",
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: "#111",
                      }}
                    >
                      <Ionicons name="play-circle" size={40} color="white" />
                      <Text style={{ color: "white", fontSize: 10, position: "absolute", bottom: 5 }}>
                        VIDEO
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <GalleryPhotoTile
                    uri={item}
                    onPress={() => setSelectedMediaForView(item)}
                  />
                )
              }
              keyExtractor={(item, index) => index.toString()}
            />
          </View>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!selectedMediaForView}
        transparent
        onRequestClose={() => setSelectedMediaForView(null)}
      >
        <View style={[
          styles.modalBackground,
          (selectedMediaForView?.startsWith("data:video") ||
            activeTaskForGallery?.type === "video") && {
            paddingBottom: insets.bottom + 20,
          },
        ]}>
          {/* Show Video component for video tasks (file://, data:video, Storage URLs) */}
          {mediaViewError ? (
            <View style={[styles.fullImage, { justifyContent: "center", alignItems: "center" }]}>
              <Ionicons name="image-outline" size={64} color="#475569" />
              <Text style={{ color: "#94a3b8", marginTop: 16, fontSize: 16, fontWeight: "600" }}>
                Αρχείο μη διαθέσιμο
              </Text>
              <Text style={{ color: "#64748b", marginTop: 6, fontSize: 13, textAlign: "center", paddingHorizontal: 40 }}>
                Το αρχείο ενδέχεται να έχει διαγραφεί από το storage
              </Text>
            </View>
          ) : (selectedMediaForView?.startsWith("data:video") ||
            activeTaskForGallery?.type === "video") ? (
            <Video
              ref={videoRef}
              style={styles.fullImage}
              source={{ uri: selectedMediaForView || "" }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              isLooping
              shouldPlay
              onReadyForDisplay={() => setMediaLoaded(true)}
              onError={() => setMediaViewError(true)}
            />
          ) : (
            <Image
              source={{ uri: selectedMediaForView || "" }}
              style={styles.fullImage}
              contentFit="contain"
              onLoad={() => setMediaLoaded(true)}
              onError={() => setMediaViewError(true)}
            />
          )}
          <TouchableOpacity
            style={styles.closeModal}
            onPress={() => setSelectedMediaForView(null)}
          >
            <Ionicons name="arrow-back" size={30} color="white" />
          </TouchableOpacity>
          {mediaLoaded && (
            <View
              style={[
                styles.toolBar,
                // Move toolbar higher for videos to stay above native video controls
                (selectedMediaForView?.startsWith("data:video") ||
                  activeTaskForGallery?.type === "video") && {
                  bottom: insets.bottom + 120,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.toolBtn}
                onPress={openMediaLocation}
              >
                <Ionicons name="map" size={24} color="#3b82f6" />
                <Text style={[styles.toolText, { color: "#3b82f6" }]}>
                  Χάρτης
                </Text>
              </TouchableOpacity>
              {/* Edit button - only for photos, not videos */}
              {activeTaskForGallery?.type === "photo" && Platform.OS !== "web" && (
                <TouchableOpacity
                  style={styles.toolBtn}
                  onPress={handleOpenReEdit}
                >
                  <Ionicons name="brush" size={24} color="#10b981" />
                  <Text style={[styles.toolText, { color: "#10b981" }]}>
                    Σχεδίαση
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.toolBtn}
                onPress={() => confirmDeleteMedia()}
              >
                <Ionicons name="trash-outline" size={24} color="#ef4444" />
                <Text style={[styles.toolText, { color: "#ef4444" }]}>
                  Διαγραφή
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.toolBtn}
                onPress={() =>
                  selectedMediaForView && handleShare(selectedMediaForView)
                }
              >
                <Ionicons name="share-outline" size={24} color="white" />
                <Text style={styles.toolText}>Κοινοποίηση</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    maxWidth: 140,
  },
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
    width: 36,
    height: 36,
    backgroundColor: "#f97316",
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  iconBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#eff6ff",
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  progressSection: { backgroundColor: "white", paddingBottom: 0 },
  progressBarBg: { height: 3, backgroundColor: "#e2e8f0", width: "100%" },
  progressBarFill: { height: "100%", backgroundColor: "#10b981" },
  cardContainer: {
    backgroundColor: "white",
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#64748b",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    minHeight: 80,
    overflow: "hidden",
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    justifyContent: "space-between",
    minHeight: 80,
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
  textContainer: { flex: 1, paddingRight: 10 },
  titleText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 2,
  },
  descText: { fontSize: 13, color: "#94a3b8" },
  localBadgeRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  localText: {
    fontSize: 11,
    color: "#f97316",
    marginLeft: 4,
    fontWeight: "bold",
  },
  rightContainer: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
  },
  valueText: {
    fontWeight: "700",
    color: "#059669",
    fontSize: 15,
    maxWidth: 120,
    textAlign: "right",
  },
  thumbnailBox: { alignItems: "center" },
  thumbImage: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    elevation: 20,
    maxHeight: "80%",
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
    alignItems: "center",
    padding: 20,
    paddingTop: 50,
    backgroundColor: "#000",
  },
  galleryTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  galleryDesc: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
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

  optionsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    paddingBottom: 30,
    paddingHorizontal: 10,
  },
  optionsMenuContainer: {
    backgroundColor: "white",
    borderRadius: 14,
    overflow: "hidden",
  },
  optionsHeader: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    alignItems: "center",
  },
  optionsTitle: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  optionTextBase: { fontSize: 17, fontWeight: "600" },
  separator: { height: 1, backgroundColor: "#f1f5f9" },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  pickerContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  pickerRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  pickerBtn: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    gap: 6,
  },
  pickerBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  pickerCancel: {
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  pickerCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#94a3b8",
  },
});
