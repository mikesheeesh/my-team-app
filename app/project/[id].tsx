import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Network from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayRemove, arrayUnion, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../../firebaseConfig';

import InputModal from '../components/InputModal';

type Task = {
  id: string;
  title: string;
  type: 'photo' | 'measurement' | 'general';
  status: 'pending' | 'completed';
  value: string | null;
  isLocal?: boolean; 
};

const OFFLINE_QUEUE_KEY = 'offline_tasks_queue_';

export default function ProjectDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); 
  const projectId = id as string;

  const [cloudTasks, setCloudTasks] = useState<Task[]>([]);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [combinedTasks, setCombinedTasks] = useState<Task[]>([]);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [projectName, setProjectName] = useState(''); 
  
  // UI States
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentTaskType, setCurrentTaskType] = useState<string>('measurement');
  const [inputValue, setInputValue] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState<'photo' | 'measurement' | 'general'>('photo');
  
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // 1. Fetch Cloud Data
  useEffect(() => {
    if (!projectId) return;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
            const projectRef = doc(db, "projects", projectId);
            const unsubscribeSnapshot = onSnapshot(projectRef, (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data();
                setCloudTasks(data.tasks || []);
                setProjectName(data.name || 'Project');
              }
              setLoading(false);
            }, (error) => {
                console.log("Cloud fetch error (normal if offline):", error);
                setLoading(false);
            });
            return () => unsubscribeSnapshot();
        } else { setLoading(false); }
    });
    return () => unsubscribeAuth();
  }, [projectId]);

  // 2. Fetch Local Data
  useEffect(() => {
      loadLocalTasks();
  }, [projectId]);

  const loadLocalTasks = async () => {
      try {
          const json = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY + projectId);
          if (json) setLocalTasks(JSON.parse(json));
      } catch (e) { console.log("Local load error", e); }
  };

  // 3. ΣΩΣΤΗ ΣΥΓΧΩΝΕΥΣΗ (Αποφυγή διπλότυπων)
  useEffect(() => {
      // Αν ένα Cloud Task έχει γίνει Local, το κρύβουμε από τη λίστα Cloud για να μην φαίνεται διπλό
      const localIds = new Set(localTasks.map(t => t.id));
      const filteredCloudTasks = cloudTasks.filter(t => !localIds.has(t.id));

      setCombinedTasks([...localTasks, ...filteredCloudTasks]);
  }, [cloudTasks, localTasks]);


  // --- HELPERS ---

  const saveImageToDevice = async (tempUri: string) => {
      try {
          // @ts-ignore
          const docDir = FileSystem.documentDirectory; 
          if (!docDir) return tempUri;

          const fileName = tempUri.split('/').pop(); 
          const newPath = docDir + fileName; 
          
          await FileSystem.moveAsync({ from: tempUri, to: newPath });
          return newPath; 
      } catch (e) {
          console.log("Error moving file:", e);
          return tempUri; 
      }
  };

  const shouldSaveLocally = async () => {
      const net = await Network.getNetworkStateAsync();
      // Αν δεν έχει ίντερνετ Ή δεν είναι WIFI -> Τοπικά
      if (!net.isConnected || !net.isInternetReachable || net.type !== Network.NetworkStateType.WIFI) {
          return true;
      }
      return false;
  };

  const saveToLocalStorage = async (updatedLocalTasks: Task[]) => {
      setLocalTasks(updatedLocalTasks);
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY + projectId, JSON.stringify(updatedLocalTasks));
  };


  // --- CRUD ACTIONS ---

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return Alert.alert("Προσοχή", "Γράψτε έναν τίτλο.");
    
    const goLocal = await shouldSaveLocally();

    const newTask: Task = { 
        id: Date.now().toString(), 
        title: newTaskTitle, 
        type: newTaskType, 
        status: 'pending', 
        value: null,
        isLocal: goLocal 
    };
    
    if (goLocal) {
        const newLocalList = [newTask, ...localTasks];
        await saveToLocalStorage(newLocalList);
        Alert.alert("Τοπική Αποθήκευση", "Η εργασία αποθηκεύτηκε στο κινητό.");
    } else {
        try {
            await updateDoc(doc(db, "projects", projectId), { tasks: arrayUnion(newTask) });
        } catch (error: any) { Alert.alert("Σφάλμα", error.message); }
    }
    setNewTaskTitle('');
    setCreateModalVisible(false);
  };

  const updateTaskValue = async (taskId: string, val: string | null, status: 'completed' | 'pending' = 'completed') => {
    const goLocal = await shouldSaveLocally();
    const isAlreadyLocal = localTasks.find(t => t.id === taskId);

    // ΑΝ ΔΕΝ ΕΧΟΥΜΕ WIFI ή ΑΝ Η ΕΡΓΑΣΙΑ ΕΙΝΑΙ ΗΔΗ ΤΟΠΙΚΗ
    if (isAlreadyLocal || goLocal) {
        
        let newLocalList = [...localTasks];

        if (isAlreadyLocal) {
            // Περίπτωση 1: Η εργασία είναι ήδη τοπική -> Απλά την ενημερώνουμε
            newLocalList = newLocalList.map(t => t.id === taskId ? { ...t, status, value: val } : t);
        } else {
            // Περίπτωση 2: Η εργασία ήταν Cloud, αλλά δεν έχουμε Wi-Fi
            // Την "κλωνοποιούμε" τοπικά για να μην χαθεί η αλλαγή
            const taskToConvert = cloudTasks.find(t => t.id === taskId);
            if (taskToConvert) {
                const convertedTask: Task = {
                    ...taskToConvert,
                    status: status,
                    value: val,
                    isLocal: true // Την μαρκάρουμε ως τοπική
                };
                newLocalList.push(convertedTask);
            }
        }
        
        await saveToLocalStorage(newLocalList);
        
        if (goLocal && !isAlreadyLocal) {
             Alert.alert("Offline Save", "Η εργασία μετατράπηκε σε τοπική μέχρι να βρείτε Wi-Fi.");
        }

    } else {
        // --- ONLINE UPDATE (FIREBASE) ---
        const updatedTasks = cloudTasks.map(t => t.id === taskId ? { ...t, status, value: val } : t);
        updateDoc(doc(db, "projects", projectId), { tasks: updatedTasks }).catch(e => console.log(e));
    }
  };

  // --- CAMERA LOGIC ---
  const launchCamera = async (taskId: string) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Προσοχή", "Δώστε άδεια κάμερας.");
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7, 
    });
    
    if (!result.canceled && result.assets[0].uri) {
      setProcessing(true);
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
            result.assets[0].uri,
            [{ resize: { width: 1024 } }], 
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );

        const permanentUri = await saveImageToDevice(manipResult.uri);
        
        await updateTaskValue(taskId, permanentUri, 'completed');
        
        setProcessing(false); 
      } catch (error: any) {
          setProcessing(false);
          console.log(error);
          Alert.alert("Σφάλμα", "Η φωτογραφία δεν αποθηκεύτηκε.");
      } 
    }
  };

  const handleDeletePhoto = () => {
      if (!selectedTask) return;
      Alert.alert("Διαγραφή Φωτογραφίας", "Η φωτογραφία θα διαγραφεί.", [
          { text: "Άκυρο", style: "cancel" },
          { text: "Διαγραφή", style: "destructive", onPress: async () => {
              const taskId = selectedTask.id;
              setSelectedTask(null);
              await updateTaskValue(taskId, null, 'pending'); 
          }}
      ]);
  };

  const handleRetakePhoto = () => {
      if (!selectedTask) return;
      const taskId = selectedTask.id;
      setSelectedTask(null);
      setTimeout(() => launchCamera(taskId), 500);
  };
  
  const handleDeleteTaskCompletely = (task: Task) => {
    Alert.alert("Διαγραφή", `Διαγραφή "${task.title}";`, [
        { text: "Άκυρο", style: "cancel" },
        { text: "Διαγραφή", style: "destructive", onPress: async () => {
            if (task.isLocal) {
                const newLocal = localTasks.filter(t => t.id !== task.id);
                await saveToLocalStorage(newLocal);
            } else {
                const goLocal = await shouldSaveLocally();
                if (!goLocal) {
                    await updateDoc(doc(db, "projects", projectId), { tasks: arrayRemove(task) });
                } else {
                    Alert.alert("Αδύνατο", "Χρειάζεστε Wi-Fi για να διαγράψετε Cloud εργασίες.");
                }
            }
        }}
    ]);
  };

  const handleTaskPress = (task: Task) => {
    if (task.type === 'photo') {
        if (task.status === 'completed' && task.value) {
            setSelectedTask(task); 
        } else {
            launchCamera(task.id);
        }
    } else {
      setCurrentTaskId(task.id); 
      setCurrentTaskType(task.type); 
      setInputValue(task.value || ''); 
      setInputModalVisible(true);
    }
  };

  const saveInput = async () => {
    if (inputValue && currentTaskId) {
        await updateTaskValue(currentTaskId, inputValue, 'completed');
        setInputModalVisible(false);
    }
  };

  const handleShare = async () => {
      if (!selectedTask?.value) return;
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) return;
      try {
        await Sharing.shareAsync(selectedTask.value); 
      } catch (error: any) {}
  };

  // --- RENDER ---
  const totalTasks = combinedTasks.length;
  const completedTasks = combinedTasks.filter(t => t.status === 'completed').length;
  const progressPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563eb"/></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      {processing && (
        <View style={styles.loadingOverlay}>
            <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingText}>Αποθήκευση...</Text>
            </View>
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <View style={styles.projectLogoPlaceholder}><Ionicons name="document-text" size={20} color="white" /></View>
        <View style={{marginLeft: 15, flex: 1}}>
          <Text style={styles.headerTitle}>{projectName}</Text>
          <Text style={styles.headerSubtitle}>{completedTasks}/{totalTasks} Ολοκληρώθηκαν</Text>
        </View>
      </View>

      {totalTasks > 0 && (
        <View style={styles.progressSection}>
            <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} /></View>
        </View>
      )}

      <FlatList 
        data={combinedTasks}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <View style={[styles.taskCard, item.isLocal && { borderColor: '#f97316', borderWidth: 1 }]}>
            <TouchableOpacity 
              style={{flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}} 
              onPress={() => handleTaskPress(item)}
              onLongPress={() => handleDeleteTaskCompletely(item)}
              delayLongPress={500}
            >
              <View style={{flexDirection:'row', alignItems:'center', flex:1}}>
                  <View style={[styles.iconBox, item.status === 'completed' ? styles.iconBoxCompleted : styles.iconBoxPending]}>
                    <Ionicons name={item.type === 'photo' ? "camera" : item.type === 'measurement' ? "speedometer" : "document-text"} size={20} color={item.status === 'completed' ? "#059669" : "#2563eb"} />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={[styles.taskTitle, item.status === 'completed' && {color:'#64748b'}]} numberOfLines={2}>{item.title}</Text>
                    {item.isLocal && (
                        <View style={{flexDirection:'row', alignItems:'center', marginTop: 4}}>
                            <Ionicons name="cloud-offline" size={12} color="#f97316" />
                            <Text style={{fontSize: 10, color: '#f97316', marginLeft: 4, fontWeight:'bold'}}>
                                Αποθηκευμένο στο κινητό
                            </Text>
                        </View>
                    )}
                  </View>
              </View>
              {item.status === 'completed' && item.value ? (
                 item.type === 'photo' ? <Image source={{ uri: item.value }} style={styles.taskThumbnail} resizeMode="cover" /> : <Text style={styles.taskValueText}>{item.value}</Text>
              ) : <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />}
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setCreateModalVisible(true)}><Ionicons name="add" size={32} color="white" /></TouchableOpacity>

      {/* --- Modals --- */}
      <Modal visible={!!selectedTask} transparent={true} onRequestClose={() => setSelectedTask(null)}>
        <View style={styles.modalBackground}>
            {selectedTask?.value && <Image source={{ uri: selectedTask.value }} style={styles.fullImage} resizeMode="contain" />}
            <TouchableOpacity style={styles.closeModal} onPress={() => setSelectedTask(null)}>
                <Ionicons name="close-circle" size={40} color="white" />
            </TouchableOpacity>
            <View style={styles.toolBar}>
                <TouchableOpacity style={styles.toolBtn} onPress={handleDeletePhoto}>
                    <Ionicons name="trash-outline" size={28} color="#ef4444" />
                    <Text style={[styles.toolText, {color:'#ef4444'}]}>Διαγραφή</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toolBtn} onPress={handleShare}>
                    <Ionicons name="share-outline" size={28} color="white" />
                    <Text style={styles.toolText}>Κοινοποίηση</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toolBtn} onPress={handleRetakePhoto}>
                    <Ionicons name="camera-outline" size={28} color="#3b82f6" />
                    <Text style={[styles.toolText, {color:'#3b82f6'}]}>Νέα Λήψη</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

      <Modal visible={createModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>Νέα Ανάθεση</Text>
            <TextInput style={styles.input} placeholder="Τίτλος..." autoFocus value={newTaskTitle} onChangeText={setNewTaskTitle} />
            <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom: 20}}>
              {['photo', 'measurement', 'general'].map((t) => (
                 <TouchableOpacity key={t} style={[styles.typeBtn, newTaskType === t && styles.typeBtnActive]} onPress={() => setNewTaskType(t as any)}>
                    <Text style={[styles.typeBtnText, newTaskType === t && {color:'white'}]}>{t === 'photo' ? 'Φώτο' : t === 'measurement' ? 'Μέτρηση' : 'Κείμενο'}</Text>
                 </TouchableOpacity>
              ))}
            </View>
            <View style={{flexDirection:'row', justifyContent:'space-between'}}>
              <TouchableOpacity style={[styles.btn, {backgroundColor:'#f3f4f6'}]} onPress={() => setCreateModalVisible(false)}><Text style={{color:'#666'}}>Ακύρωση</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, {backgroundColor:'#2563eb'}]} onPress={handleAddTask}><Text style={{color:'white', fontWeight:'bold'}}>Προσθήκη</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <InputModal visible={inputModalVisible} onClose={() => setInputModalVisible(false)} onSave={saveInput} title="Καταγραφή" value={inputValue} onChangeText={setInputValue} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', marginTop: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  loadingBox: { backgroundColor: 'white', padding: 25, borderRadius: 15, alignItems: 'center', elevation: 10 },
  loadingText: { marginTop: 15, fontWeight: 'bold', fontSize: 16, color: '#333' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 30, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backButton: { marginRight: 10 },
  projectLogoPlaceholder: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  headerSubtitle: { color: '#666', fontSize: 12 },
  progressSection: { backgroundColor: 'white', paddingBottom: 0 },
  progressBarBg: { height: 4, backgroundColor: '#e5e7eb', width: '100%' },
  progressBarFill: { height: '100%', backgroundColor: '#10b981' },
  content: { padding: 20, paddingBottom: 100 },
  taskCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 1, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:2, shadowOffset:{width:0, height:1} },
  iconBox: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  iconBoxPending: { backgroundColor: '#eff6ff' },
  iconBoxCompleted: { backgroundColor: '#dcfce7' },
  taskTitle: { fontSize: 15, fontWeight: '600', color: '#334155' },
  taskThumbnail: { width: 50, height: 50, borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
  taskValueText: { fontWeight: 'bold', color: '#059669', fontSize: 16 },
  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#2563eb', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, zIndex: 999 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', width: '90%', borderRadius: 16, padding: 20, elevation: 5 },
  modalHeader: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 16 },
  typeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginHorizontal: 3 },
  typeBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  typeBtnText: { fontSize: 12, fontWeight: 'bold', color: '#333' },
  btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
  modalBackground: { flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '80%' },
  closeModal: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  toolBar: { position: 'absolute', bottom: 40, flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingHorizontal: 20 },
  toolBtn: { alignItems: 'center', padding: 10 },
  toolText: { color: 'white', fontSize: 12, marginTop: 4, fontWeight: 'bold' },
});