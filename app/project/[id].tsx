import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Network from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  
  const insets = useSafeAreaInsets(); 

  const PROJECT_CACHE_KEY = `cached_project_tasks_${projectId}`;

  const [cloudTasks, setCloudTasks] = useState<Task[]>([]);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [combinedTasks, setCombinedTasks] = useState<Task[]>([]);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false); 
  const [projectName, setProjectName] = useState(''); 
  
  // MODALS STATE
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);

  // CURRENT TASK STATE
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentTaskType, setCurrentTaskType] = useState<string>('measurement');
  const [inputValue, setInputValue] = useState('');
  
  // NEW TASK CREATION STATE
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskType, setNewTaskType] = useState<'photo' | 'measurement' | 'general'>('photo');
  
  // GALLERY STATE
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

  // 3. AUTO-SYNC LISTENER
  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener(state => {
        if (state.isConnected && state.type === 'wifi' && localTasks.length > 0 && !isSyncing) {
            console.log("Auto-Sync Triggered via WiFi!");
            performSync(localTasks);
        }
    });
    return () => unsubscribeNet();
  }, [localTasks, isSyncing]); 


  // 4. MERGE LISTS
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
      if (isSyncing) return;
      
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

      NetInfo.fetch().then(state => {
          if (state.isConnected && state.type === 'wifi') {
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

  const handleClearValue = async () => {
      if (currentTaskId) {
          setInputModalVisible(false);
          await updateTaskValue(currentTaskId, null, 'pending');
      }
  };

  const handleShare = async (uri: string) => {
    if (!uri) return;
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
        Alert.alert("Σφάλμα", "Η κοινοποίηση δεν είναι διαθέσιμη στη συσκευή σας.");
        return;
    }
    try {
        let fileUri = uri;
        if (uri.startsWith('data:')) {
            const base64Code = uri.split(',')[1];
            const filename = FileSystem.cacheDirectory + 'share_temp.jpg';
            await FileSystem.writeAsStringAsync(filename, base64Code, { encoding: 'base64' });
            fileUri = filename;
        }
        await Sharing.shareAsync(fileUri, {
            mimeType: 'image/jpeg',
            dialogTitle: 'Κοινοποίηση Φωτογραφίας'
        });
    } catch (error: any) {
        console.log("Share Error:", error);
        Alert.alert("Σφάλμα", "Απέτυχε η κοινοποίηση.");
    }
  };

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

      {/* HEADER */}
      <View style={styles.header}>
        <View style={{flexDirection:'row', alignItems:'center', flex:1}}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
            <View style={styles.projectLogoPlaceholder}><Ionicons name="document-text" size={24} color="white" /></View>
            <View style={{marginLeft: 15, flex:1}}>
                <Text style={styles.headerTitle} numberOfLines={1}>{projectName}</Text>
                <Text style={styles.headerSubtitle}>{completedTasks}/{totalTasks} Ολοκληρώθηκαν</Text>
            </View>
        </View>
        {isSyncing ? (
             <View style={styles.syncingBadge}><ActivityIndicator size="small" color="#ea580c" /></View>
        ) : localTasks.length > 0 && (
             <TouchableOpacity style={styles.syncButtonHeader} onPress={handleProjectSync}>
                 <Ionicons name="cloud-upload" size={20} color="#fff" />
                 <Text style={{color:'white', fontWeight:'bold', fontSize:12, marginLeft:5}}>Sync</Text>
             </TouchableOpacity>
        )}
      </View>

      {/* PROGRESS BAR */}
      {totalTasks > 0 && (
        <View style={styles.progressSection}>
            <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} /></View>
        </View>
      )}

      {/* TASKS LIST */}
      <FlatList 
        data={combinedTasks}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}
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
                    <Ionicons name={item.type === 'photo' ? "camera" : item.type === 'measurement' ? "construct" : "document-text"} size={22} color={item.status === 'completed' ? "#059669" : "#2563eb"} />
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

      {/* FAB BUTTON */}
      <TouchableOpacity 
        style={[styles.fab, { bottom: 30 + insets.bottom }]} 
        onPress={() => setCreateModalVisible(true)}
      >
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

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
                <Ionicons name="close" size={30} color="white" />
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
                    <Ionicons name="trash-outline" size={24} color="#ef4444" />
                    <Text style={[styles.toolText, {color:'#ef4444'}]}>Διαγραφή</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.toolBtn} onPress={() => selectedImageForView && handleShare(selectedImageForView)}>
                    <Ionicons name="share-outline" size={24} color="white" />
                    <Text style={styles.toolText}>Κοινοποίηση</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

      {/* CREATE TASK MODAL - NEW DESIGN */}
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
                style={[styles.input, {height: 60, textAlignVertical: 'top'}]} 
                placeholder="Λεπτομέρειες..." 
                value={newTaskDescription} 
                onChangeText={setNewTaskDescription} 
                multiline={true} 
                numberOfLines={2}
            />

            <Text style={styles.label}>Τύπος Εργασίας</Text>
            <View style={styles.optionsContainer}>
                {/* 1. PHOTO OPTION */}
                <TouchableOpacity 
                    style={[styles.optionCard, newTaskType === 'photo' && styles.optionCardActive]} 
                    onPress={() => setNewTaskType('photo')}
                >
                    <Ionicons name="camera" size={28} color={newTaskType === 'photo' ? 'white' : '#64748b'} />
                    <Text style={[styles.optionText, newTaskType === 'photo' && {color:'white'}]}>Φωτογραφία</Text>
                </TouchableOpacity>

                {/* 2. MEASUREMENT OPTION */}
                <TouchableOpacity 
                    style={[styles.optionCard, newTaskType === 'measurement' && styles.optionCardActive]} 
                    onPress={() => setNewTaskType('measurement')}
                >
                    <Ionicons name="construct" size={28} color={newTaskType === 'measurement' ? 'white' : '#64748b'} />
                    <Text style={[styles.optionText, newTaskType === 'measurement' && {color:'white'}]}>Μέτρηση</Text>
                </TouchableOpacity>

                {/* 3. GENERAL TEXT OPTION */}
                <TouchableOpacity 
                    style={[styles.optionCard, newTaskType === 'general' && styles.optionCardActive]} 
                    onPress={() => setNewTaskType('general')}
                >
                    <Ionicons name="document-text" size={28} color={newTaskType === 'general' ? 'white' : '#64748b'} />
                    <Text style={[styles.optionText, newTaskType === 'general' && {color:'white'}]}>Κείμενο</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.mainButton} onPress={handleAddTask}>
              <Text style={styles.mainButtonText}>ΔΗΜΙΟΥΡΓΙΑ</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* INPUT MODAL ΜΕ CLEAR OPTION & KEYBOARD FIX */}
      <InputModal 
        visible={inputModalVisible} 
        onClose={() => setInputModalVisible(false)} 
        onSave={saveInput}
        onClear={handleClearValue} 
        title={currentTaskType === 'measurement' ? "Καταγραφή Μέτρησης" : "Σημείωση Κειμένου"} 
        value={inputValue} 
        onChangeText={setInputValue}
        keyboardType="default" // <--- DEFAULT για όλα, ώστε να γράφεις 10x10, m, cm κλπ.
        isMultiline={currentTaskType === 'general'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', marginTop: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // --- HEADER & LIST ---
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 30, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  backButton: { marginRight: 15, padding: 5 },
  projectLogoPlaceholder: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', shadowColor: '#2563eb', shadowOpacity: 0.3, shadowRadius: 5 },
  
  syncButtonHeader: { flexDirection:'row', alignItems:'center', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#f97316', borderRadius: 20 },
  syncingBadge: { padding: 10 },

  progressSection: { backgroundColor: 'white', paddingBottom: 0 },
  progressBarBg: { height: 3, backgroundColor: '#e2e8f0', width: '100%' },
  progressBarFill: { height: '100%', backgroundColor: '#10b981' },

  content: { padding: 20 },
  
  // --- TASK CARD ---
  taskCard: { backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', shadowColor:'#64748b', shadowOpacity:0.05, shadowRadius:4, shadowOffset:{width:0, height:2}, elevation: 2 },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  iconBoxPending: { backgroundColor: '#eff6ff' },
  iconBoxCompleted: { backgroundColor: '#dcfce7' },
  
  taskTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
  taskDesc: { fontSize: 12, color: '#94a3b8' },
  taskValueText: { fontWeight: '700', color: '#059669', fontSize: 15 },
  
  taskThumbnail: { width: 48, height: 48, borderRadius: 10, borderWidth: 2, borderColor: '#f1f5f9' },
  badge: { position: 'absolute', bottom: -6, right: -6, backgroundColor: '#2563eb', borderRadius: 8, width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth:2, borderColor:'white' },
  badgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },

  // --- FAB ---
  fab: { position: 'absolute', right: 20, backgroundColor: '#2563eb', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6, zIndex: 999 },

  // --- MODAL STYLES (NEW) ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' }, 
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, elevation: 20 },
  
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalHeader: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  
  label: { fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, marginBottom: 20, fontSize: 16, color: '#0f172a' },
  
  // Options Grid
  optionsContainer: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 25 },
  optionCard: { flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  optionCardActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  optionText: { marginTop: 8, fontSize: 12, fontWeight: '700', color: '#64748b' },

  // Main Button
  mainButton: { backgroundColor: '#0f172a', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  mainButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },

  // --- LOADING & FULL SCREEN ---
  loadingOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  loadingBox: { padding: 20, backgroundColor: 'white', borderRadius: 10, elevation: 5 },
  loadingText: { marginTop: 10, color: '#333', fontWeight: 'bold' },

  modalBackground: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  fullImage: { width: '100%', height: '100%' },
  closeModal: { position: 'absolute', top: 50, right: 20, zIndex: 20, backgroundColor:'rgba(0,0,0,0.5)', borderRadius:20, padding: 5 },
  toolBar: { position: 'absolute', bottom: 40, flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  toolBtn: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: 15, borderRadius: 50 },
  toolText: { color: 'white', fontSize: 10, marginTop: 5, fontWeight: '600' },

  galleryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: '#000' },
  photoTile: { flex: 1/3, aspectRatio: 1, margin: 1, backgroundColor: '#222' },
  addPhotoTile: { flex: 1/3, aspectRatio: 1, margin: 1, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#444' },
});