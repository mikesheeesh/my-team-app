import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Network from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing'; // <--- Σιγουρέψου ότι υπάρχει
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
// Fix για Expo SDK 52+
import * as FileSystem from 'expo-file-system/legacy';

// FIREBASE
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

import InputModal from '../components/InputModal';

type Task = {
  id: string;
  title: string;
  description?: string;
  type: 'photo' | 'measurement' | 'general';
  status: 'pending' | 'completed';
  value: string | null;
  images?: string[];
  isLocal?: boolean; 
};

const OFFLINE_QUEUE_KEY = 'offline_tasks_queue_';

export default function ProjectDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); 
  const projectId = id as string;

  const PROJECT_CACHE_KEY = `cached_project_tasks_${projectId}`;

  const [cloudTasks, setCloudTasks] = useState<Task[]>([]);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [combinedTasks, setCombinedTasks] = useState<Task[]>([]);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false); 
  const [projectName, setProjectName] = useState(''); 
  
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);

  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentTaskType, setCurrentTaskType] = useState<string>('measurement');
  const [inputValue, setInputValue] = useState('');
  
  // Create Task States
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskType, setNewTaskType] = useState<'photo' | 'measurement' | 'general'>('photo');
  
  // Selection States
  const [activeTaskForGallery, setActiveTaskForGallery] = useState<Task | null>(null);
  const [selectedImageForView, setSelectedImageForView] = useState<string | null>(null);

  // 1. INITIAL LOAD
  useEffect(() => {
      const loadInitialData = async () => {
          try {
              const cachedData = await AsyncStorage.getItem(PROJECT_CACHE_KEY);
              if (cachedData) {
                  const parsed = JSON.parse(cachedData);
                  if (parsed.tasks) setCloudTasks(parsed.tasks);
                  if (parsed.name) setProjectName(parsed.name);
              }

              const localQueue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY + projectId);
              if (localQueue) {
                  setLocalTasks(JSON.parse(localQueue));
              }
          } catch (e) { console.log("Cache load error:", e); }
          setLoading(false); 
      };
      loadInitialData();
  }, [projectId]);

  // 2. FIREBASE LISTENER
  useEffect(() => {
    if (!projectId) return;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
            const projectRef = doc(db, "projects", projectId);
            const unsubscribeSnapshot = onSnapshot(projectRef, (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data();
                const fetchedTasks = data.tasks || [];
                const fetchedName = data.name || 'Project';

                setCloudTasks(fetchedTasks);
                setProjectName(fetchedName);

                AsyncStorage.setItem(PROJECT_CACHE_KEY, JSON.stringify({
                    name: fetchedName,
                    tasks: fetchedTasks
                }));
              }
            }, (error) => {
                console.log("Offline mode (snapshot error):", error);
            });
            return () => unsubscribeSnapshot();
        }
    });
    return () => unsubscribeAuth();
  }, [projectId]);

  // 3. MERGE LISTS
  useEffect(() => {
      const taskMap = new Map<string, Task>();
      cloudTasks.forEach(task => taskMap.set(task.id, task));
      localTasks.forEach(task => taskMap.set(task.id, task));
      setCombinedTasks(Array.from(taskMap.values()));
  }, [cloudTasks, localTasks]);


  // --- SYNC ENGINE ---
  const handleProjectSync = async () => {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected || !net.isInternetReachable) return Alert.alert("Σφάλμα", "Δεν έχετε ίντερνετ.");

      if (net.type !== Network.NetworkStateType.WIFI) {
          Alert.alert("Χρήση Δεδομένων", "Είστε με δεδομένα. Συνέχεια;", [
              { text: "Όχι", style: 'cancel' },
              { text: "Ναι", onPress: () => performSync(localTasks) }
          ]);
      } else {
          performSync(localTasks);
      }
  };

  const performSync = async (tasksToUpload: Task[]) => {
      if (tasksToUpload.length === 0) return;
      setIsSyncing(true);
      
      try {
          const projectRef = doc(db, "projects", projectId);
          const projectSnap = await getDoc(projectRef);
          
          if (!projectSnap.exists()) throw new Error("Project not found");

          let currentCloudList: Task[] = projectSnap.data().tasks || [];
          let changesMade = false;

          for (const task of tasksToUpload) {
              let processedImages: string[] = [];
              if (task.images && task.images.length > 0) {
                  for (const imgUri of task.images) {
                      if (imgUri.startsWith('file://')) {
                          try {
                              const base64Data = await FileSystem.readAsStringAsync(imgUri, { encoding: 'base64' });
                              processedImages.push(`data:image/jpeg;base64,${base64Data}`);
                          } catch (e) { console.log("Image skip:", e); }
                      } else {
                          processedImages.push(imgUri);
                      }
                  }
              }

              const { isLocal, ...cleanTask } = task;
              const taskReady = { ...cleanTask, images: processedImages };

              const existingIndex = currentCloudList.findIndex(t => t.id === taskReady.id);
              if (existingIndex !== -1) {
                  currentCloudList[existingIndex] = taskReady;
              } else {
                  currentCloudList.push(taskReady);
              }
              changesMade = true;
          }

          if (changesMade) {
              await updateDoc(projectRef, { tasks: currentCloudList });
              setLocalTasks([]);
              await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY + projectId);
          }

      } catch (error: any) {
          console.log("Background Sync Failed:", error.message);
      } finally {
          setIsSyncing(false);
      }
  };

  // --- SAVE LOCAL ---
  const saveTaskLocallyAndTrySync = async (task: Task) => {
      let newLocalList = [...localTasks];
      const existingIndex = newLocalList.findIndex(t => t.id === task.id);

      if (existingIndex !== -1) {
          newLocalList[existingIndex] = { ...task, isLocal: true };
      } else {
          newLocalList.push({ ...task, isLocal: true });
      }

      setLocalTasks(newLocalList);
      AsyncStorage.setItem(OFFLINE_QUEUE_KEY + projectId, JSON.stringify(newLocalList));

      if (activeTaskForGallery && activeTaskForGallery.id === task.id) {
          setActiveTaskForGallery(task);
      }

      Network.getNetworkStateAsync().then(net => {
          if (net.isConnected && net.type === Network.NetworkStateType.WIFI) {
              performSync(newLocalList); 
          }
      });
  };

  // --- ACTIONS ---
  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return Alert.alert("Προσοχή", "Γράψτε έναν τίτλο.");
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const newTask: Task = { 
        id: uniqueId, 
        title: newTaskTitle,
        description: newTaskDescription,
        type: newTaskType, 
        status: 'pending', 
        value: null,
        images: [], 
        isLocal: true 
    };
    setCreateModalVisible(false);
    setNewTaskTitle('');
    setNewTaskDescription('');
    await saveTaskLocallyAndTrySync(newTask);
  };

  const updateTaskValue = async (taskId: string, val: string | null, status: 'completed' | 'pending' = 'completed') => {
      const taskToUpdate = combinedTasks.find(t => t.id === taskId);
      if (!taskToUpdate) return;
      const updatedTask: Task = { ...taskToUpdate, value: val, status: status, isLocal: true };
      await saveTaskLocallyAndTrySync(updatedTask);
  };

  const addImageToTask = async (taskId: string, newImageUri: string) => {
      const taskToUpdate = combinedTasks.find(t => t.id === taskId);
      if (!taskToUpdate) return;
      const currentImages = taskToUpdate.images || [];
      const updatedImages = [...currentImages, newImageUri];
      const updatedTask: Task = { 
          ...taskToUpdate, 
          images: updatedImages, 
          status: 'completed', 
          isLocal: true 
      };
      await saveTaskLocallyAndTrySync(updatedTask);
  };

  const removeImageFromTask = async (imgUri: string) => {
      if (!activeTaskForGallery) return;
      const currentImages = activeTaskForGallery.images || [];
      const updatedImages = currentImages.filter(img => img !== imgUri);
      const updatedTask: Task = {
          ...activeTaskForGallery,
          images: updatedImages,
          status: updatedImages.length > 0 ? 'completed' : 'pending',
          isLocal: true
      };
      if (updatedImages.length === 0) setSelectedImageForView(null); 
      await saveTaskLocallyAndTrySync(updatedTask);
  };

  const saveInput = async () => { 
      if (inputValue && currentTaskId) { 
          setInputModalVisible(false); 
          await updateTaskValue(currentTaskId, inputValue, 'completed'); 
      } 
  };

  // --- SMART SHARE FUNCTION (FIXED) ---
  const handleShare = async (uri: string) => {
    if (!uri) return;

    // 1. Έλεγχος αν η συσκευή υποστηρίζει Sharing
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
        Alert.alert("Σφάλμα", "Η κοινοποίηση δεν είναι διαθέσιμη στη συσκευή σας.");
        return;
    }

    try {
        let fileUri = uri;

        // 2. Αν είναι Base64 (δηλαδή Offline/Sync δεδομένο), πρέπει να το κάνουμε αρχείο
        if (uri.startsWith('data:')) {
            // Καθαρίζουμε το header "data:image/jpeg;base64,"
            const base64Code = uri.split(',')[1];
            
            // Δημιουργούμε ένα προσωρινό όνομα αρχείου
            const filename = FileSystem.cacheDirectory + 'share_temp.jpg';
            
            // Γράφουμε τα δεδομένα στο δίσκο
            await FileSystem.writeAsStringAsync(filename, base64Code, {
                encoding: FileSystem.EncodingType.Base64
            });
            
            // Πλέον μοιραζόμαστε το αρχείο, όχι το κείμενο Base64
            fileUri = filename;
        }

        // 3. Κοινοποίηση
        await Sharing.shareAsync(fileUri, {
            mimeType: 'image/jpeg',
            dialogTitle: 'Κοινοποίηση Φωτογραφίας'
        });

    } catch (error: any) {
        console.log("Share Error:", error);
        Alert.alert("Σφάλμα", "Απέτυχε η κοινοποίηση.");
    }
  };

  // --- CAMERA & HELPERS ---
  const saveImageToDevice = async (tempUri: string) => {
      try {
          // @ts-ignore
          const docDir = FileSystem.documentDirectory; 
          if (!docDir) return tempUri;
          const fileName = tempUri.split('/').pop(); 
          const newPath = docDir + fileName; 
          await FileSystem.moveAsync({ from: tempUri, to: newPath });
          return newPath; 
      } catch (e) { return tempUri; }
  };

  const launchCamera = async (taskId: string) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Προσοχή", "Δώστε άδεια κάμερας.");
    
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.4 });

    if (!result.canceled && result.assets[0].uri) {
      setProcessing(true);
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
            result.assets[0].uri, 
            [{ resize: { width: 600 } }],
            { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
        );
        const permanentUri = await saveImageToDevice(manipResult.uri);
        setProcessing(false); 
        await addImageToTask(taskId, permanentUri);
      } catch (error: any) { setProcessing(false); Alert.alert("Σφάλμα", "Η φωτογραφία δεν αποθηκεύτηκε."); } 
    }
  };

  const handleDeleteTaskCompletely = (task: Task) => {
    Alert.alert("Διαγραφή", `Διαγραφή "${task.title}";`, [{ text: "Άκυρο", style: "cancel" }, { text: "Διαγραφή", style: "destructive", onPress: async () => {
        const net = await Network.getNetworkStateAsync();
        if (net.isConnected && net.type === Network.NetworkStateType.WIFI) {
             const updatedCloudList = cloudTasks.filter(t => t.id !== task.id);
             await updateDoc(doc(db, "projects", projectId), { tasks: updatedCloudList });
        } else {
             Alert.alert("Offline", "Η διαγραφή απαιτεί WiFi.");
        }
    }}]);
  };

  const handleTaskPress = (task: Task) => {
    if (task.type === 'photo') { 
        setActiveTaskForGallery(task);
        setGalleryModalVisible(true);
    } else { 
        setCurrentTaskId(task.id); 
        setCurrentTaskType(task.type); 
        setInputValue(task.value || ''); 
        setInputModalVisible(true); 
    }
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
                <Text style={styles.loadingText}>Επεξεργασία...</Text>
            </View>
        </View>
      )}

      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center', flex:1}}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
            <View style={styles.projectLogoPlaceholder}><Ionicons name="document-text" size={20} color="white" /></View>
            <View style={{marginLeft: 15, flex:1}}>
                <Text style={styles.headerTitle} numberOfLines={1}>{projectName}</Text>
                <Text style={styles.headerSubtitle}>{completedTasks}/{totalTasks} Ολοκληρώθηκαν</Text>
            </View>
        </View>
        {isSyncing ? (
             <View style={styles.syncingBadge}><ActivityIndicator size="small" color="#ea580c" /></View>
        ) : localTasks.length > 0 && (
             <TouchableOpacity style={styles.syncButtonHeader} onPress={handleProjectSync}>
                 <Ionicons name="cloud-upload" size={24} color="#fff" />
                 <Text style={{color:'white', fontWeight:'bold', fontSize:12, marginLeft:5}}>Sync</Text>
             </TouchableOpacity>
        )}
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
          <View style={[styles.taskCard, item.isLocal && { borderColor: '#f97316', borderWidth: 1, backgroundColor: '#fff7ed' }]}>
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
                    {item.description ? <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text> : null}
                    
                    {item.isLocal && (
                        <View style={{flexDirection:'row', alignItems:'center', marginTop: 4}}>
                            <Ionicons name="cloud-offline" size={12} color="#f97316" />
                            <Text style={{fontSize: 10, color: '#f97316', marginLeft: 4, fontWeight:'bold'}}>
                                {isSyncing ? 'Ανεβαίνει...' : 'Προς Ανέβασμα'}
                            </Text>
                        </View>
                    )}
                  </View>
              </View>
              
              {item.type === 'photo' ? (
                  item.images && item.images.length > 0 ? (
                      <View style={{alignItems:'center'}}>
                          <Image source={{ uri: item.images[item.images.length - 1] }} style={styles.taskThumbnail} resizeMode="cover" />
                          <View style={styles.badge}><Text style={styles.badgeText}>{item.images.length}</Text></View>
                      </View>
                  ) : <Ionicons name="camera-outline" size={24} color="#cbd5e1" />
              ) : (
                  item.status === 'completed' ? <Text style={styles.taskValueText}>{item.value}</Text> : <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              )}

            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setCreateModalVisible(true)}><Ionicons name="add" size={32} color="white" /></TouchableOpacity>

      {/* GALLERY MODAL */}
      <Modal visible={galleryModalVisible} animationType="slide" onRequestClose={() => setGalleryModalVisible(false)}>
        <SafeAreaView style={{flex:1, backgroundColor:'#000'}}>
            <View style={styles.galleryHeader}>
                <Text style={{color:'white', fontSize:18, fontWeight:'bold'}}>{activeTaskForGallery?.title}</Text>
                <TouchableOpacity onPress={() => setGalleryModalVisible(false)}><Ionicons name="close-circle" size={32} color="white"/></TouchableOpacity>
            </View>
            <View style={{flex:1, padding:10}}>
                <FlatList
                    data={[...(activeTaskForGallery?.images || []), 'ADD_BUTTON']}
                    keyExtractor={(item, index) => index.toString()}
                    numColumns={3}
                    renderItem={({item}) => {
                        if (item === 'ADD_BUTTON') {
                            return (
                                <TouchableOpacity style={styles.addPhotoTile} onPress={() => activeTaskForGallery && launchCamera(activeTaskForGallery.id)}>
                                    <Ionicons name="camera" size={32} color="#666" />
                                    <Text style={{color:'#666', marginTop:5}}>Προσθήκη</Text>
                                </TouchableOpacity>
                            );
                        }
                        return (
                            <TouchableOpacity style={styles.photoTile} onPress={() => setSelectedImageForView(item)}>
                                <Image source={{uri: item}} style={{width:'100%', height:'100%'}} resizeMode="cover" />
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>
        </SafeAreaView>
      </Modal>

      {/* FULL SCREEN IMAGE VIEW */}
      <Modal visible={!!selectedImageForView} transparent={true} onRequestClose={() => setSelectedImageForView(null)}>
        <View style={styles.modalBackground}>
            {selectedImageForView && <Image source={{ uri: selectedImageForView }} style={styles.fullImage} resizeMode="contain" />}
            <TouchableOpacity style={styles.closeModal} onPress={() => setSelectedImageForView(null)}>
                <Ionicons name="close-circle" size={40} color="white" />
            </TouchableOpacity>
            <View style={styles.toolBar}>
                <TouchableOpacity style={styles.toolBtn} onPress={() => {
                    if (selectedImageForView) {
                        Alert.alert("Διαγραφή", "Να διαγραφεί η φωτογραφία;", [
                            {text:"Όχι"}, 
                            {text:"Ναι", style:'destructive', onPress: () => removeImageFromTask(selectedImageForView)}
                        ]);
                    }
                }}>
                    <Ionicons name="trash-outline" size={28} color="#ef4444" />
                    <Text style={[styles.toolText, {color:'#ef4444'}]}>Διαγραφή</Text>
                </TouchableOpacity>
                {/* SHARE BUTTON */}
                <TouchableOpacity style={styles.toolBtn} onPress={() => selectedImageForView && handleShare(selectedImageForView)}>
                    <Ionicons name="share-outline" size={28} color="white" />
                    <Text style={styles.toolText}>Κοινοποίηση</Text>
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
            <TextInput style={[styles.input, {height: 80, textAlignVertical: 'top'}]} placeholder="Περιγραφή (προαιρετικό)..." value={newTaskDescription} onChangeText={setNewTaskDescription} multiline={true} numberOfLines={3}/>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 30, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  syncButtonHeader: { flexDirection:'row', alignItems:'center', padding: 8, backgroundColor: '#ea580c', borderRadius: 20, paddingHorizontal: 12, elevation: 3 },
  syncingBadge: { padding: 10 },
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
  taskDesc: { fontSize: 12, color: '#64748b', marginTop: 2, fontStyle: 'italic' }, 
  taskThumbnail: { width: 50, height: 50, borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
  badge: { position: 'absolute', bottom: -5, right: -5, backgroundColor: '#2563eb', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  taskValueText: { fontWeight: 'bold', color: '#059669', fontSize: 16 },
  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#2563eb', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, zIndex: 999 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', width: '90%', borderRadius: 16, padding: 20, elevation: 5 },
  modalHeader: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 15, fontSize: 16 }, 
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
  galleryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: '#111' },
  photoTile: { flex: 1/3, aspectRatio: 1, margin: 1, backgroundColor: '#222' },
  addPhotoTile: { flex: 1/3, aspectRatio: 1, margin: 1, backgroundColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
}); 