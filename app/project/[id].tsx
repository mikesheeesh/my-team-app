import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ResizeMode, Video } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
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
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

import InputModal from "../components/InputModal";
import { useSync } from "../context/SyncContext";

// --- TYPES ---
type Task = {
  id: string;
  title: string;
  description?: string;
  type: "photo" | "measurement" | "general" | "video";
  status: "pending" | "completed";
  value: string | null;
  images?: string[];
  isLocal?: boolean;
};

const OFFLINE_QUEUE_KEY = "offline_tasks_queue_";
const PROJECT_CACHE_KEY_PREFIX = "cached_project_tasks_";

// --- TASK ITEM ---
const TaskItem = ({ item, onPress, onLongPress, isSyncing }: any) => {
  if (!item) return null;

  let iconName: any = "document-text";
  if (item.type === "photo") iconName = "camera";
  else if (item.type === "measurement") iconName = "construct";
  else if (item.type === "video") iconName = "videocam";

  return (
    <View style={styles.cardContainer}>
      <TouchableOpacity
        style={[styles.cardInner, item.isLocal && styles.cardLocalBorder]}
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress(item)}
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
              item.status === "completed" && { color: "#64748b" },
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
          {item.type === "photo" || item.type === "video" ? (
            item.images && item.images.length > 0 ? (
              <View style={styles.thumbnailBox}>
                {item.type === "video" ? (
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
                ) : (
                  <Image
                    source={{ uri: item.images[item.images.length - 1] }}
                    style={styles.thumbImage}
                  />
                )}
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.images.length}</Text>
                </View>
              </View>
            ) : (
              <Ionicons
                name={
                  item.type === "video" ? "videocam-outline" : "camera-outline"
                }
                size={24}
                color="#cbd5e1"
              />
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
  const { isSyncing, syncNow } = useSync();

  const CACHE_KEY = PROJECT_CACHE_KEY_PREFIX + projectId;
  const QUEUE_KEY = OFFLINE_QUEUE_KEY + projectId;

  const [cloudTasks, setCloudTasks] = useState<Task[]>([]);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectStatus, setProjectStatus] = useState<"active" | "completed">(
    "active",
  );
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // UI States
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);

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

  const videoRef = useRef<Video>(null);

  // --- INIT LOAD ---
  useEffect(() => {
    const init = async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const d = JSON.parse(cached);
          setCloudTasks(d.tasks || []);
          setProjectName(d.name || "");
          setProjectStatus(d.status || "active");
        }
        const local = await AsyncStorage.getItem(QUEUE_KEY);
        if (local) setLocalTasks(JSON.parse(local));
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
            const fetched = data.tasks || [];
            setCloudTasks(fetched);
            setProjectName(data.title || "Project");
            setProjectStatus(data.status || "active");
            AsyncStorage.setItem(
              CACHE_KEY,
              JSON.stringify({
                name: data.title,
                tasks: fetched,
                status: data.status,
              }),
            );
          }
        });
      }
    });
    return () => unsub && unsub();
  }, [projectId]);

  // --- MERGE LISTS ---
  const combinedTasks = useMemo(() => {
    const map = new Map<string, Task>();
    cloudTasks.forEach((t) => map.set(t.id, t));
    localTasks.forEach((t) => map.set(t.id, t));
    return Array.from(map.values()).filter((t) => t && t.id);
  }, [cloudTasks, localTasks]);

  // --- AUTO COMPLETE LOGIC ---
  useEffect(() => {
    if (loading || combinedTasks.length === 0) return;
    const allDone = combinedTasks.every((t) => t.status === "completed");
    const newStatus = allDone ? "completed" : "active";

    if (newStatus !== projectStatus) {
      setProjectStatus(newStatus);
      updateDoc(doc(db, "projects", projectId), { status: newStatus }).catch(
        (e) => console.log("Status update delayed (offline)"),
      );
      AsyncStorage.getItem(CACHE_KEY).then((cached) => {
        if (cached) {
          const d = JSON.parse(cached);
          AsyncStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ ...d, status: newStatus }),
          );
        }
      });
    }
  }, [combinedTasks]);

  // --- STRICT CLEANUP ---
  useEffect(() => {
    if (localTasks.length === 0) return;
    const cloudMap = new Map(cloudTasks.map((t) => [t.id, t]));

    const remainingLocal = localTasks.filter((localT) => {
      const cloudT = cloudMap.get(localT.id);
      if (!cloudT) return true;
      if (localT.value !== cloudT.value) return true;
      if (localT.status !== cloudT.status) return true;
      if ((localT.images?.length || 0) !== (cloudT.images?.length || 0))
        return true;
      return false;
    });

    if (remainingLocal.length !== localTasks.length) {
      setLocalTasks(remainingLocal);
      AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remainingLocal));
    }
  }, [cloudTasks, localTasks]);

  // --- AUTO SYNC (WIFI) ---
  useEffect(() => {
    const sub = Network.addNetworkStateListener(async (state) => {
      if (
        state.isConnected &&
        state.type === Network.NetworkStateType.WIFI &&
        localTasks.length > 0
      ) {
        await syncNow();
      }
    });
    return () => sub && sub.remove();
  }, [localTasks]);

  // --- ACTIONS ---
  const saveTaskLocal = async (task: Task) => {
    const taskWithFlag = { ...task, isLocal: true };
    setLocalTasks((prev) => {
      const newLocalMap = new Map(prev.map((t) => [t.id, t]));
      newLocalMap.set(taskWithFlag.id, taskWithFlag);
      const newLocalList = Array.from(newLocalMap.values());
      AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(newLocalList));
      return newLocalList;
    });
    if (activeTaskForGallery && activeTaskForGallery.id === task.id)
      setActiveTaskForGallery(taskWithFlag);

    const net = await Network.getNetworkStateAsync();
    if (net.isConnected && net.type === Network.NetworkStateType.WIFI) {
      syncNow().catch((e) => console.log("Sync skipped/failed"));
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim())
      return Alert.alert("Προσοχή", "Τίτλος υποχρεωτικός");
    const newItem: Task = {
      id: Date.now().toString(),
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
    await saveTaskLocal(newItem);
  };
  const handleSaveInput = async () => {
    setInputModalVisible(false);
    if (currentTaskId && inputValue) {
      const t = combinedTasks.find((x) => x.id === currentTaskId);
      if (t)
        await saveTaskLocal({ ...t, value: inputValue, status: "completed" });
    }
  };
  const handleClearValue = async () => {
    setInputModalVisible(false);
    if (currentTaskId) {
      const t = combinedTasks.find((x) => x.id === currentTaskId);
      if (t) await saveTaskLocal({ ...t, value: null, status: "pending" });
    }
  };
  const addMediaToTask = async (tid: string, uri: string) => {
    const t = combinedTasks.find((x) => x.id === tid);
    if (t) {
      const imgs = [...(t.images || []), uri];
      await saveTaskLocal({ ...t, images: imgs, status: "completed" });
    }
  };

  const removeMediaFromTask = async (uri: string) => {
    setSelectedMediaForView(null);
    if (activeTaskForGallery) {
      const imgs = activeTaskForGallery.images?.filter((i) => i !== uri) || [];
      const st = imgs.length > 0 ? "completed" : "pending";
      await saveTaskLocal({
        ...activeTaskForGallery,
        images: imgs,
        status: st as any,
      });
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

  const handleDeleteCompletely = (task: Task) => {
    Alert.alert("Διαγραφή", "Σίγουρα;", [
      { text: "Όχι" },
      {
        text: "Ναι",
        style: "destructive",
        onPress: async () => {
          setLocalTasks((prev) => {
            const remaining = prev.filter((t) => t.id !== task.id);
            AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
            return remaining;
          });
          setCloudTasks((prev) => prev.filter((t) => t.id !== task.id));
          const net = await Network.getNetworkStateAsync();
          if (net.isConnected && net.type === Network.NetworkStateType.WIFI) {
            const updated = cloudTasks.filter((t) => t.id !== task.id);
            updateDoc(doc(db, "projects", projectId), { tasks: updated }).catch(
              (e) => {},
            );
          }
        },
      },
    ]);
  };

  // --- CAMERA LOGIC (PHOTO & VIDEO) ---
  const launchCamera = async (task: Task) => {
    try {
      // A. VIDEO HANDLING
      if (task.type === "video") {
        const r = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Videos,
          allowsEditing: true,
          videoMaxDuration: 4,
          quality: 0,
        });

        if (!r.canceled && r.assets[0].uri) {
          setProcessing(true);
          try {
            const videoUri = r.assets[0].uri;

            // 1. ΕΛΕΓΧΟΣ ΜΕΓΕΘΟΥΣ
            const fileInfo = await FileSystem.getInfoAsync(videoUri);
            if (fileInfo.exists && fileInfo.size > 900000) {
              Alert.alert(
                "Πολύ μεγάλο αρχείο",
                "Το βίντεο ξεπερνά το όριο του 1MB.",
              );
              setProcessing(false);
              return;
            }

            // 2. CONVERT TO BASE64
            const base64Video = await FileSystem.readAsStringAsync(videoUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const finalUri = `data:video/mp4;base64,${base64Video}`;

            await addMediaToTask(task.id, finalUri);
          } catch (e) {
            console.log("Video Error", e);
            Alert.alert("Σφάλμα", "Απέτυχε η αποθήκευση του βίντεο.");
          } finally {
            setProcessing(false);
          }
        }
      }
      // B. PHOTO HANDLING
      else {
        const r = await ImagePicker.launchCameraAsync({
          quality: 0.5,
          base64: true,
        });
        if (!r.canceled && r.assets[0].uri) {
          setProcessing(true);
          try {
            const m = await ImageManipulator.manipulateAsync(
              r.assets[0].uri,
              [{ resize: { width: 800 } }],
              {
                compress: 0.4,
                format: ImageManipulator.SaveFormat.JPEG,
                base64: true,
              },
            );

            if (m.base64) {
              const base64Img = `data:image/jpeg;base64,${m.base64}`;
              await addMediaToTask(task.id, base64Img);
            }
          } catch (e) {
            Alert.alert("Σφάλμα", "Η φωτογραφία ήταν πολύ μεγάλη.");
          } finally {
            setProcessing(false);
          }
        }
      }
    } catch (e) {
      Alert.alert("Error", "Camera failed");
      setProcessing(false);
    }
  };

  const handleShare = async (uri: string) => {
    if (!(await Sharing.isAvailableAsync())) return;

    try {
      const isVideo = uri.startsWith("data:video");
      const ext = isVideo ? ".mp4" : ".jpg";
      const base64Data = uri.split("base64,")[1];
      const filename = FileSystem.cacheDirectory + `temp_share${ext}`;

      await FileSystem.writeAsStringAsync(filename, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(filename);
    } catch (error) {
      Alert.alert("Σφάλμα", "Δεν ήταν δυνατή η κοινοποίηση.");
    }
  };

  const handleSyncPress = async () => {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) return Alert.alert("No Internet");
    syncNow();
  };

  const generatePDF = async () => {
    setProcessing(true);
    try {
      let rowsHTML = "";
      combinedTasks.forEach((task, index) => {
        // Logic για το Status Badge
        const isDone = task.status === "completed";
        const statusBadge = isDone
          ? `<span class="badge badge-success">Ολοκληρώθηκε</span>`
          : `<span class="badge badge-pending">Εκκρεμεί</span>`;
        // Logic για το Value (Αποτέλεσμα)
        let valueDisplay = "-";
        if (task.type === "video") {
          valueDisplay = `<div class="media-tag">🎥 Βίντεο</div>`;
        } else if (task.type === "photo") {
          valueDisplay = `<div class="media-tag">📷 Φωτογραφίες (${task.images?.length || 0})</div>`;
        } else if (task.value) {
          valueDisplay = `<div class="value-box">${task.value}</div>`;
        }
        // Logic για την περιγραφή (να φαίνεται αχνά από κάτω)
        const descHTML = task.description
          ? `<div style="color: #6b7280; font-size: 11px; margin-top: 4px;">${task.description}</div>`
          : "";
        rowsHTML += `
            <tr>
                <td style="text-align: center; color: #6b7280;">${index + 1}</td>
                <td>
                    <div style="font-weight: 600; color: #111827;">${task.title}</div>
                    ${descHTML}
                </td>
                <td>${statusBadge}</td>
                <td>${valueDisplay}</td>
            </tr>`;
      });
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                body { font-family: 'Inter', Helvetica, Arial, sans-serif; padding: 40px; color: #1f2937; -webkit-print-color-adjust: exact; }
                .header { margin-bottom: 40px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
                .title-box h1 { margin: 0; color: #111827; font-size: 24px; text-transform: uppercase; letter-spacing: -0.5px; }
                .title-box p { margin: 5px 0 0; color: #6b7280; font-size: 12px; }
                .meta-box { text-align: right; }
                .meta-box div { font-size: 12px; color: #4b5563; margin-bottom: 4px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
                th { text-align: left; background-color: #f9fafb; color: #6b7280; padding: 12px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; }
                td { padding: 16px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
                .badge { padding: 4px 10px; border-radius: 99px; font-size: 10px; font-weight: 700; text-transform: uppercase; display: inline-block; }
                .badge-success { background-color: #dcfce7; color: #166534; }
                .badge-pending { background-color: #f3f4f6; color: #4b5563; }
                .value-box { background: #eff6ff; color: #1e3a8a; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-weight: bold; display: inline-block; border: 1px solid #dbeafe; }
                .media-tag { color: #4b5563; font-style: italic; font-size: 12px; background: #f3f4f6; padding: 4px 8px; border-radius: 4px; display: inline-block; }
                .footer { margin-top: 50px; text-align: center; color: #9ca3af; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title-box">
                    <h1>${projectName}</h1>
                    <p>Αναφορά Εργασιών</p>
                </div>
                <div class="meta-box">
                    <div><strong>Ημερομηνία:</strong> ${new Date().toLocaleDateString("el-GR")}</div>
                    <div><strong>Tasks:</strong> ${combinedTasks.length} Σύνολο</div>
                    <div><strong>Status:</strong> ${projectStatus === "completed" ? "ΟΛΟΚΛΗΡΩΜΕΝΟ" : "ΣΕ ΕΞΕΛΙΞΗ"}</div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 5%; text-align: center;">#</th>
                        <th style="width: 45%">Εργασια / Περιγραφη</th>
                        <th style="width: 20%">Κατασταση</th>
                        <th style="width: 30%">Αποτελεσμα / Αρχειο</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
                </tbody>
            </table>
            <div class="footer">
                Δημιουργήθηκε από την εφαρμογή Ergon Work Management &bull; ${new Date().toLocaleTimeString("el-GR")}
            </div>
        </body>
        </html>
        `;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (e) {
      Alert.alert("PDF Error", "Προέκυψε σφάλμα κατά τη δημιουργία του PDF.");
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
              } else {
                setCurrentTaskId(t.id);
                setCurrentTaskType(t.type);
                setInputValue(t.value || "");
                setCurrentTaskDescription(t.description || "");
                setInputModalVisible(true);
              }
            }}
            onLongPress={handleDeleteCompletely}
            isSyncing={isSyncing}
          />
        )}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
      />

      <TouchableOpacity
        style={[
          styles.fab,
          { bottom: 20 + insets.bottom },
          projectStatus === "completed" && { backgroundColor: "#94a3b8" },
        ]}
        disabled={projectStatus === "completed"}
        onPress={() => setCreateModalVisible(true)}
      >
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      {/* NEW TASK MODAL */}
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
              <Text style={styles.modalHeader}>Νέα Ανάθεση</Text>
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
                onPress={handleAddTask}
              >
                <Text style={styles.mainButtonText}>ΔΗΜΙΟΥΡΓΙΑ</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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

      {/* GALLERY MODAL */}
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
              {/* ΝΕΟ: Εμφάνιση Περιγραφής */}
              {activeTaskForGallery?.description ? (
                <Text style={styles.galleryDesc} numberOfLines={2}>
                  {activeTaskForGallery.description}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={{ flex: 1, padding: 1 }}>
            <FlatList
              data={[...(activeTaskForGallery?.images || []), "ADD"]}
              numColumns={3}
              renderItem={({ item }) =>
                item === "ADD" ? (
                  <TouchableOpacity
                    style={styles.addPhotoTile}
                    onPress={() =>
                      activeTaskForGallery && launchCamera(activeTaskForGallery)
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
                ) : (
                  <TouchableOpacity
                    style={styles.photoTile}
                    onPress={() => setSelectedMediaForView(item)}
                  >
                    {activeTaskForGallery?.type === "video" ? (
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
                        <Text
                          style={{
                            color: "white",
                            fontSize: 10,
                            position: "absolute",
                            bottom: 5,
                          }}
                        >
                          VIDEO
                        </Text>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: item }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    )}
                  </TouchableOpacity>
                )
              }
              keyExtractor={(item, index) => index.toString()}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* FULL SCREEN MEDIA MODAL */}
      <Modal
        visible={!!selectedMediaForView}
        transparent
        onRequestClose={() => setSelectedMediaForView(null)}
      >
        <View style={styles.modalBackground}>
          {selectedMediaForView?.startsWith("data:video") ? (
            <Video
              ref={videoRef}
              style={styles.fullImage}
              source={{ uri: selectedMediaForView }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              isLooping
              shouldPlay
            />
          ) : (
            <Image
              source={{ uri: selectedMediaForView || "" }}
              style={styles.fullImage}
              contentFit="contain"
            />
          )}

          <TouchableOpacity
            style={styles.closeModal}
            onPress={() => setSelectedMediaForView(null)}
          >
            <Ionicons name="arrow-back" size={30} color="white" />
          </TouchableOpacity>
          <View style={styles.toolBar}>
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
});
