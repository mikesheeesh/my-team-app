import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Network from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// FILE SYSTEM (Καθαρό import)
import * as FileSystem from 'expo-file-system';

// FIREBASE
import { onAuthStateChanged } from 'firebase/auth';
import { arrayRemove, arrayUnion, disableNetwork, doc, onSnapshot, updateDoc } from 'firebase/firestore';
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

export default function ProjectDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); 
  const projectId = id as string;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [projectName, setProjectName] = useState(''); 
  const [canEdit, setCanEdit] = useState(false); 
  
  // UI States
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentTaskType, setCurrentTaskType] = useState<string>('measurement');
  const [inputValue, setInputValue] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState<'photo' | 'measurement' | 'general'>('photo');
  
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // 1. DATA FETCHING
  useEffect(() => {
    if (!projectId) return;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
            const projectRef = doc(db, "projects", projectId);
            // includeMetadataChanges: true -> Για να βλέπουμε αμέσως τις αλλαγές offline
            const unsubscribeSnapshot = onSnapshot(projectRef, { includeMetadataChanges: true }, (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data();
                setTasks(data.tasks || []);
                setProjectName(data.name || 'Project');
                setCanEdit(true); 
              }
              setLoading(false);
            }, (error) => {
                console.log("Error loading project:", error);
                setLoading(false);
            });
            return () => unsubscribeSnapshot();
        } else {
            setLoading(false);
        }
    });
    return () => unsubscribeAuth();
  }, [projectId]);

  // --- HELPER: DATA SAVER MODE ---
  // Ελέγχει αν είμαστε με 4G/5G και κλείνει το ίντερνετ για να μην χρεωθούμε
  const checkAndLockNetwork = async () => {
      const net = await Network.getNetworkStateAsync();
      const isCellular = net.isInternetReachable && net.type !== Network.NetworkStateType.WIFI;
      
      if (isCellular) {
          console.log("🔒 Cellular Detected: Switching to Offline Queue.");
          await disableNetwork(db).catch(() => {});
          return true; // Γυρίσαμε σε Offline Mode
      }
      
      if (!net.isInternetReachable) return true; // Ήδη offline

      return false; // WiFi (στέλνουμε κανονικά)
  };

  // --- ACTIONS ---

  const handleShare = async () => {
      if (!selectedTask?.value) return;
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) return;
      try {
          if (selectedTask.value.startsWith('data:image')) {
             
             // SDK 54 FIX: @ts-ignore για το cacheDirectory
             // @ts-ignore 
             const filename = FileSystem.cacheDirectory + 'temp_share.jpg';
             
             const base64Code = selectedTask.value.split('base64,')[1];
             
             // SDK 54 FIX: encoding: 'base64' (string)
             await FileSystem.writeAsStringAsync(filename, base64Code, { encoding: 'base64' });
             
             await Sharing.shareAsync(filename);
          } else { await Sharing.shareAsync(selectedTask.value); }
      } catch (error: any) {}
  };

  const handleDeletePhoto = () => {
      if (!selectedTask) return;
      Alert.alert("Διαγραφή Φωτογραφίας", "Η εργασία θα γίνει ξανά εκκρεμής.", [
          { text: "Άκυρο", style: "cancel" },
          { text: "Διαγραφή", style: "destructive", onPress: async () => {
              setSelectedTask(null);
              await updateTaskValue(selectedTask.id, null, 'pending', false); 
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
    Alert.alert("Διαγραφή Εργασίας", `Διαγραφή "${task.title}";`, [
        { text: "Άκυρο", style: "cancel" },
        { text: "Διαγραφή", style: "destructive", onPress: async () => {
            try {
                await updateDoc(doc(db, "projects", projectId), {
                    tasks: arrayRemove(task)
                });
            } catch (error: any) { Alert.alert("Σφάλμα", error.message); }
        }}
    ]);
  };

  // --- CAMERA LOGIC ---
  const launchCamera = async (taskId: string) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Προσοχή", "Δώστε άδεια κάμερας.");
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8, 
      base64: true, 
    });
    
    if (!result.canceled && result.assets[0].base64) {
      setProcessing(true);

      try {
        const manipResult = await ImageManipulator.manipulateAsync(
            result.assets[0].uri,
            [{ resize: { width: 1024 } }], 
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        const imageBase64 = `data:image/jpeg;base64,${manipResult.base64}`;

        // 1. ΤΡΑΒΑΜΕ ΤΟΝ ΔΙΑΚΟΠΤΗ
        const isLocalMode = await checkAndLockNetwork();

        // 2. ΑΠΟΘΗΚΕΥΣΗ
        const savePromise = updateTaskValue(taskId, imageBase64, 'completed', isLocalMode);
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2000));

        await Promise.race([savePromise, timeoutPromise]);

        setProcessing(false); 

        if (isLocalMode) {
            setTimeout(() => {
                Alert.alert("Data Saver", "Η φωτογραφία κρατήθηκε τοπικά. Θα σταλεί με Sync ή WiFi.");
            }, 500);
        }

      } catch (error: any) {
          setProcessing(false);
          console.log("Camera Error:", error);
          Alert.alert("Σφάλμα", "Η φωτογραφία δεν αποθηκεύτηκε.");
      } 
    }
  };

  const updateTaskValue = async (taskId: string, val: string | null, status: 'completed' | 'pending' = 'completed', isLocal: boolean = false) => {
    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, status, value: val, isLocal } : t);
    updateDoc(doc(db, "projects", projectId), { tasks: updatedTasks })
      .catch(e => console.log("Update Error (Background):", e));
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return Alert.alert("Προσοχή", "Γράψτε έναν τίτλο.");
    
    const isLocalMode = await checkAndLockNetwork();

    const newTask: Task = { id: Date.now().toString(), title: newTaskTitle, type: newTaskType, status: 'pending', value: null, isLocal: isLocalMode };
    
    try {
      await updateDoc(doc(db, "projects", projectId), { tasks: arrayUnion(newTask) });
      setNewTaskTitle('');
      setCreateModalVisible(false);
      
      if (isLocalMode) {
         Alert.alert("Data Saver", "Η εργασία αποθηκεύτηκε τοπικά.");
      }
    } catch (error: any) { Alert.alert("Σφάλμα", error.message); }
  };

  const handleTaskPress = (task: Task) => {
    if (task.type === 'photo') {
        if (task.status === 'completed' && task.value) {
            setSelectedTask(task); 
        } else {
            launchCamera(task.id);
        }
    } else {
      setCurrentTaskId(task.id); setCurrentTaskType(task.type); setInputValue(task.value || ''); setInputModalVisible(true);
    }
  };

  const saveInput = async () => {
    if (inputValue && currentTaskId) {
        const isLocalMode = await checkAndLockNetwork();

        await updateTaskValue(currentTaskId, inputValue, 'completed', isLocalMode);
        setInputModalVisible(false);

        if (isLocalMode) {
            Alert.alert("Data Saver", "Η μέτρηση αποθηκεύτηκε τοπικά.");
        }
    }
  };

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const progressPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563eb"/></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      {processing && (
        <View style={styles.loadingOverlay}>
            <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingText}>Επεξεργασία...</Text>
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
        data={tasks}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <View style={styles.taskCard}>
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
                        <View style={{flexDirection:'row', alignItems:'center', marginTop: 2}}>
                            <Ionicons name="cloud-offline" size={12} color="#f59e0b" />
                            <Text style={{fontSize: 10, color: '#f59e0b', marginLeft: 4}}>
                                {item.status === 'completed' ? 'Αναμονή Sync' : 'Τοπική Εργασία'}
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

      {/* --- FAB --- */}
      <TouchableOpacity style={styles.fab} onPress={() => setCreateModalVisible(true)}><Ionicons name="add" size={32} color="white" /></TouchableOpacity>

      {/* --- FULL SCREEN MODAL --- */}
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

      {/* CREATE TASK MODAL */}
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