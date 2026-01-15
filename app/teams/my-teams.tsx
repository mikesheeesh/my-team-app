import { Ionicons } from '@expo/vector-icons';
import * as Network from 'expo-network';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, disableNetwork, doc, enableNetwork, getDocs, onSnapshot, query, updateDoc, waitForPendingWrites, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../../firebaseConfig';

type Role = 'Founder' | 'Admin' | 'Supervisor' | 'User';

interface Team {
  id: string;
  name: string;
  role: Role;
  type: string;
  membersCount: number;
}

export default function MyTeamsScreen() {
  const router = useRouter(); 
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Φόρτωση...');
  const [syncing, setSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
            onSnapshot(doc(db, "users", user.uid), { includeMetadataChanges: true }, (snap) => {
                if (snap.exists()) setUserName(snap.data().fullname || 'Χρήστης');
            });

            const q = query(collection(db, "teams"), where("memberIds", "array-contains", user.uid));
            const unsubscribeTeams = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
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
                setTeams(fetchedTeams);
                setLoading(false);
            });
            return () => unsubscribeTeams();
        } else { setLoading(false); }
    });
    return () => unsubscribeAuth();
  }, []);

  const runCleanup = async () => {
      let fixedCount = 0;
      try {
          const projectsSnap = await getDocs(collection(db, "projects"));
          const updates = projectsSnap.docs.map(async (projectDoc) => {
              const data = projectDoc.data();
              const tasks = data.tasks || [];
              let needsUpdate = false;
              const updatedTasks = tasks.map((task: any) => {
                  if (task.isLocal === true) {
                      fixedCount++;
                      needsUpdate = true;
                      return { ...task, isLocal: false }; 
                  }
                  return task;
              });
              if (needsUpdate) await updateDoc(projectDoc.ref, { tasks: updatedTasks });
          });
          await Promise.all(updates);
          return fixedCount;
      } catch (e) { return 0; }
  };

  const handleManualSync = async () => {
    if (isSyncingRef.current) return;
    const net = await Network.getNetworkStateAsync();
    if (!net.isInternetReachable) return Alert.alert("Offline", "Δεν βρέθηκε σήμα.");

    setSyncing(true);
    isSyncingRef.current = true;

    try {
        await enableNetwork(db);
        await Promise.race([waitForPendingWrites(db), new Promise(r => setTimeout(r, 15000))]);
        const count = await runCleanup();
        await waitForPendingWrites(db);
        
        if (count > 0) Alert.alert("Επιτυχία", `Συγχρονίστηκαν ${count} εργασίες!`);
        else Alert.alert("Ενημέρωση", "Όλα είναι ήδη συγχρονισμένα.");
    } catch (error) {
        Alert.alert("Σφάλμα", "Ο συγχρονισμός απέτυχε.");
    } finally {
        const currentNet = await Network.getNetworkStateAsync();
        if (currentNet.type !== Network.NetworkStateType.WIFI) {
            await disableNetwork(db).catch(() => {});
        }
        setSyncing(false);
        isSyncingRef.current = false;
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
        <View style={styles.header}>
          <View><Text style={styles.welcomeText}>Καλωσήρθατε,</Text><Text style={styles.userName}>{userName}</Text></View>
          <TouchableOpacity onPress={() => router.push('/profile')} style={styles.profileButton}><Ionicons name="person-circle-outline" size={30} color="#2563eb" /></TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.syncCard} onPress={handleManualSync} disabled={syncing}>
            {syncing ? <ActivityIndicator color="white"/> : <Ionicons name="cloud-upload-outline" size={24} color="white" />}
            <View style={{marginLeft: 10}}>
                <Text style={styles.syncText}>{syncing ? "Συγχρονισμός..." : "Συγχρονισμός Τώρα"}</Text>
                <Text style={styles.syncSubText}>Πατήστε για αποστολή & καθαρισμό</Text>
            </View>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Οι Ομάδες μου ({teams.length})</Text>
        {teams.length === 0 ? (
            <View style={styles.emptyState}><Ionicons name="people-outline" size={64} color="#ccc" /><Text style={{color: '#999'}}>Δεν βρέθηκαν ομάδες.</Text></View>
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
  syncCard: { backgroundColor: '#2563eb', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, elevation: 4 },
  syncText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  syncSubText: { color: '#bfdbfe', fontSize: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#334155', marginBottom: 15 },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 15, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  cardSubtitle: { color: '#64748b', fontSize: 12 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  roleText: { color: 'white', fontWeight: 'bold', fontSize: 10 },
  emptyState: { alignItems: 'center', marginTop: 50 },
});