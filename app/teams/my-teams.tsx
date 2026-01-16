import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// Fix για Expo SDK 52+
import * as FileSystem from 'expo-file-system/legacy';

// FIREBASE
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

type Role = 'Founder' | 'Admin' | 'Supervisor' | 'User';

interface Team {
  id: string;
  name: string;
  role: Role;
  type: string;
  membersCount: number;
}

const TEAMS_CACHE_KEY = 'cached_my_teams';

// Βοηθητική: Καθαρίζει τα δεδομένα από undefined για να μην σκάει η Firebase
const sanitizeData = (data: any) => {
    return JSON.parse(JSON.stringify(data, (key, value) => {
        return value === undefined ? null : value;
    }));
};

export default function MyTeamsScreen() {
  const router = useRouter(); 
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Χρήστης');
  
  // Sync States
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // 1. ΦΟΡΤΩΣΗ ΑΠΟ CACHE (Offline First)
  // Αυτό τρέχει ΠΑΝΤΑ πρώτο για να δείξει δεδομένα αμέσως
  useEffect(() => {
      const initLoad = async () => {
          try {
              // Φόρτωση Ομάδων
              const cached = await AsyncStorage.getItem(TEAMS_CACHE_KEY);
              if (cached) {
                  setTeams(JSON.parse(cached));
              }
              
              // Έλεγχος για εκκρεμότητες (Sync Badge)
              const keys = await AsyncStorage.getAllKeys();
              const queueKeys = keys.filter(k => k.startsWith('offline_tasks_queue_'));
              setPendingCount(queueKeys.length);
              
          } catch (e) { console.log("Cache load error:", e); }
          
          setLoading(false); // Σταματάμε το loading ακόμα και αν δεν βρήκε cache
      };
      initLoad();
  }, []);

  // 2. ΣΥΝΔΕΣΗ ME FIREBASE (Realtime Updates)
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Ανάκτηση Ονόματος Χρήστη
            onSnapshot(doc(db, "users", user.uid), (snap) => {
                if (snap.exists()) setUserName(snap.data().fullname || 'Χρήστης');
            }, (err) => console.log("User fetch err (offline ok):", err));

            // Ανάκτηση Ομάδων
            const q = query(collection(db, "teams"), where("memberIds", "array-contains", user.uid));
            const unsubscribeTeams = onSnapshot(q, (snapshot) => {
                const fetchedTeams: Team[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    fetchedTeams.push({
                        id: doc.id,
                        name: data.name,
                        type: data.type || 'Γενικό',
                        role: data.roles[user.uid] as Role || 'User',
                        membersCount: data.memberIds ? data.memberIds.length : 1
                    });
                });
                
                // Ενημερώνουμε State και Cache
                // (Μόνο αν πήραμε δεδομένα, για να μην διαγράψουμε την cache αν είμαστε offline)
                if (fetchedTeams.length > 0 || !snapshot.metadata.fromCache) {
                    setTeams(fetchedTeams);
                    AsyncStorage.setItem(TEAMS_CACHE_KEY, JSON.stringify(fetchedTeams));
                }
                setLoading(false);
            }, (error) => {
                console.log("Teams fetch error (offline mode):", error);
                setLoading(false);
            });
            return () => unsubscribeTeams();
        } else {
            // Αν δεν υπάρχει χρήστης, περιμένουμε λίγο μήπως φορτώσει το persistence
            setLoading(false);
        }
    });
    return () => unsubscribeAuth();
  }, []);


  // 3. LOGIC ΣΥΓΧΡΟΝΙΣΜΟΥ (Manual Sync Button)
  const handleManualSync = async () => {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || !net.isInternetReachable) return Alert.alert("Offline", "Δεν έχετε ίντερνετ.");

    setIsSyncing(true);

    try {
        const keys = await AsyncStorage.getAllKeys();
        const queueKeys = keys.filter(k => k.startsWith('offline_tasks_queue_'));
        
        if (queueKeys.length === 0) {
            Alert.alert("Ενημέρωση", "Δεν υπάρχουν εκκρεμότητες προς ανέβασμα.");
            setIsSyncing(false);
            return;
        }

        let totalUploaded = 0;

        for (const key of queueKeys) {
            // Το ID του project είναι στο τέλος του κλειδιού
            const projectId = key.replace('offline_tasks_queue_', '');
            const json = await AsyncStorage.getItem(key);
            if (!json) continue;

            const localList = JSON.parse(json);
            if (localList.length === 0) continue;

            // A. Λήψη τρέχουσας κατάστασης από Cloud
            const projectRef = doc(db, "projects", projectId);
            const projectSnap = await getDoc(projectRef);

            if (!projectSnap.exists()) {
                // Αν το project διαγράφηκε, καθαρίζουμε τα τοπικά
                await AsyncStorage.removeItem(key);
                continue; 
            }

            let currentCloudList = projectSnap.data().tasks || [];
            let changesMade = false;

            // B. Επεξεργασία Tasks & Εικόνων
            for (const task of localList) {
                let finalValue = task.value;
                let processedImages: string[] = [];

                // Base64 Image Conversion (για λίστα εικόνων)
                if (task.images && task.images.length > 0) {
                    for (const imgUri of task.images) {
                        if (imgUri && imgUri.startsWith('file://')) {
                            try {
                                const base64Data = await FileSystem.readAsStringAsync(imgUri, { encoding: 'base64' });
                                processedImages.push(`data:image/jpeg;base64,${base64Data}`);
                            } catch (e) { console.log("Image skip", e); }
                        } else {
                            processedImages.push(imgUri); // Ήδη έτοιμο
                        }
                    }
                }
                
                // Fallback για παλιά tasks που είχαν μονή εικόνα στο value
                if (task.type === 'photo' && task.value && task.value.startsWith('file://')) {
                     try {
                        const base64Data = await FileSystem.readAsStringAsync(task.value, { encoding: 'base64' });
                        finalValue = `data:image/jpeg;base64,${base64Data}`;
                    } catch (e) { console.log("Single image skip", e); }
                }

                const { isLocal, ...cleanTask } = task;
                const taskReady = { 
                    ...cleanTask, 
                    value: finalValue,
                    images: processedImages.length > 0 ? processedImages : (cleanTask.images || [])
                };

                // C. Merge (Αντικατάσταση ή Προσθήκη)
                const existingIndex = currentCloudList.findIndex((t:any) => t.id === taskReady.id);
                if (existingIndex !== -1) {
                    currentCloudList[existingIndex] = taskReady;
                } else {
                    currentCloudList.push(taskReady);
                }
                changesMade = true;
                totalUploaded++;
            }

            // D. Upload
            if (changesMade) {
                const safeList = sanitizeData(currentCloudList);
                await updateDoc(projectRef, { tasks: safeList });
                await AsyncStorage.removeItem(key);
            }
        }

        Alert.alert("Επιτυχία", `Συγχρονίστηκαν ${totalUploaded} εργασίες!`);
        setPendingCount(0);

    } catch (error: any) {
        console.error("Sync Error:", error);
        Alert.alert("Σφάλμα", "Ο συγχρονισμός απέτυχε. Δοκιμάστε ξανά.");
    } finally {
        setIsSyncing(false);
    }
  };

  const getRoleStyle = (role: Role) => {
    switch (role) {
      case 'Founder': return { bg: '#fff7ed', border: '#f97316', text: '#c2410c', label: 'ΙΔΡΥΤΗΣ' };
      case 'Admin': return { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8', label: 'ADMIN' };
      case 'Supervisor': return { bg: '#f0fdf4', border: '#22c55e', text: '#15803d', label: 'SUPERVISOR' };
      default: return { bg: 'white', border: '#e5e7eb', text: '#6b7280', label: 'ΜΕΛΟΣ' };
    }
  };

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563eb"/></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <View><Text style={styles.welcomeText}>Λίστα Ομάδων</Text><Text style={styles.userName}>{userName}</Text></View>
          <TouchableOpacity onPress={() => router.push('/profile')} style={styles.profileButton}><Ionicons name="person-circle-outline" size={30} color="#2563eb" /></TouchableOpacity>
        </View>

        {/* SYNC CARD */}
        <TouchableOpacity 
            style={[styles.syncCard, pendingCount > 0 ? {backgroundColor:'#ea580c'} : {backgroundColor:'#2563eb'}]} 
            onPress={handleManualSync} 
            disabled={isSyncing}
        >
            {isSyncing ? <ActivityIndicator color="white"/> : <Ionicons name={pendingCount > 0 ? "cloud-upload" : "checkmark-circle"} size={24} color="white" />}
            <View style={{marginLeft: 10}}>
                <Text style={styles.syncText}>{isSyncing ? "Συγχρονισμός..." : (pendingCount > 0 ? "Εκκρεμούν Uploads" : "Όλα Εντάξει")}</Text>
                <Text style={styles.syncSubText}>
                    {pendingCount > 0 ? `Έχετε ${pendingCount} projects με αλλαγές.` : "Τα δεδομένα σας είναι ενημερωμένα."}
                </Text>
            </View>
        </TouchableOpacity>

        {/* TEAMS LIST */}
        <Text style={styles.sectionTitle}>Οι Ομάδες μου ({teams.length})</Text>
        {teams.length === 0 ? (
            <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color="#ccc" />
                <Text style={{color: '#999', marginTop: 10}}>Δεν βρέθηκαν ομάδες.</Text>
                <Text style={{color: '#999', fontSize: 12}}>Αν είστε offline, ίσως δεν έχουν κατέβει ακόμα.</Text>
            </View>
        ) : (
            teams.map((team) => {
              const styleProps = getRoleStyle(team.role);
              return (
                <TouchableOpacity key={team.id} style={[styles.card, {borderColor: styleProps.border, borderWidth: 1}]} onPress={() => router.push({ pathname: `/team/${team.id}`, params: { role: team.role, teamName: team.name } })}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{team.name}</Text>
                    <View style={[styles.roleBadge, { backgroundColor: styleProps.border }]}><Text style={styles.roleText}>{styleProps.label}</Text></View>
                  </View>
                  <Text style={styles.cardSubtitle}>{team.type} • {team.membersCount} μέλη</Text>
                </TouchableOpacity>
              );
            })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 30 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  welcomeText: { color: '#64748b', fontSize: 14 },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
  profileButton: { padding: 5 },
  syncCard: { padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, elevation: 4 },
  syncText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  syncSubText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#334155', marginBottom: 15 },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  cardSubtitle: { color: '#64748b', fontSize: 12 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  roleText: { color: 'white', fontWeight: 'bold', fontSize: 10 },
  emptyState: { alignItems: 'center', marginTop: 50 },
});