import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Network from 'expo-network';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import InputModal from '../components/InputModal';

// FIREBASE
import { onAuthStateChanged } from 'firebase/auth';
import { arrayRemove, deleteDoc, deleteField, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

type Role = 'Founder' | 'Admin' | 'Supervisor' | 'User';
type User = { id: string; email: string; role: Role; name: string };
type Project = { id: string; title: string; status: 'active' | 'pending'; supervisors: string[]; members: string[]; createdBy?: string; teamId?: string };
type Group = { id: string; title: string; projects: Project[] };

export default function TeamProjectsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); 
  const teamId = id as string;

  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<Role>('User'); 
  const [currentUserId, setCurrentUserId] = useState<string>(''); 

  const [teamName, setTeamName] = useState('');
  const [teamContact, setTeamContact] = useState('');
  const [teamLogo, setTeamLogo] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]); 

  // UI STATES
  const [menuVisible, setMenuVisible] = useState(false);
  const [usersModalVisible, setUsersModalVisible] = useState(false);
  const [projectSettingsVisible, setProjectSettingsVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<{groupId: string, project: Project} | null>(null);
  
  const [inputVisible, setInputVisible] = useState(false);
  const [inputMode, setInputMode] = useState<'teamName' | 'teamContact' | 'newGroup' | 'newProject'>('teamName');
  const [tempValue, setTempValue] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  
  const [moveModalVisible, setMoveModalVisible] = useState(false);

  // CACHE KEY
  const CACHE_KEY = `cached_team_${teamId}`;

  // --- 1. DATA LOADING (CACHE + REALTIME) ---
  useEffect(() => {
    if (!teamId) return;

    // A. Φόρτωση από Cache
    const loadCache = async () => {
        try {
            const cached = await AsyncStorage.getItem(CACHE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                setTeamName(data.name);
                setTeamContact(data.contactEmail || '');
                setTeamLogo(data.logo || null);
                setGroups(data.groups || []);
                if (data.myRole) setMyRole(data.myRole);
                if (data.users) setUsers(data.users);
                setLoading(false);
            }
        } catch (e) {}
    };
    loadCache();

    // B. Realtime Listener
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
            setCurrentUserId(user.uid);
            
            const teamRef = doc(db, "teams", teamId);
            const unsubscribeTeam = onSnapshot(teamRef, { includeMetadataChanges: true }, async (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data();

                setTeamName(data.name);
                setTeamContact(data.contactEmail || '');
                setTeamLogo(data.logo || null);
                setGroups(data.groups || []);

                let role = 'User';
                if (data.roles && data.roles[user.uid]) {
                  role = data.roles[user.uid] as Role;
                  setMyRole(role as Role);
                }

                // Φόρτωση Χρηστών
                let loadedUsers: User[] = [];
                if (data.memberIds && data.memberIds.length > 0) {
                    for (const uid of data.memberIds) {
                        let userData = { fullname: 'Μέλος', email: '...' };
                        try {
                            const userDoc = await getDoc(doc(db, "users", uid));
                            if (userDoc.exists()) { userData = userDoc.data() as any; }
                        } catch (e) {}

                        loadedUsers.push({
                            id: uid,
                            name: userData.fullname || 'Χρήστης',
                            email: uid === user.uid ? 'Εγώ' : (userData.email || '...'),
                            role: data.roles[uid] || 'User'
                        });
                    }
                    setUsers(loadedUsers);
                }

                // Update Cache
                const cacheData = {
                    name: data.name,
                    contactEmail: data.contactEmail,
                    logo: data.logo,
                    groups: data.groups,
                    myRole: role,
                    users: loadedUsers
                };
                AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
                
                setLoading(false);
              }
            }, (error) => {
                console.log("Team Snapshot Error (Offline is OK):", error);
                setLoading(false);
            });

            return () => unsubscribeTeam();
        } else {
            setLoading(false);
        }
    });

    return () => unsubscribeAuth();
  }, [teamId]);

  // --- HELPER: CHECK ONLINE ---
  const checkOnline = async () => {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected || !net.isInternetReachable) {
          Alert.alert("Offline", "Δεν έχετε ίντερνετ. Αυτή η ενέργεια δεν είναι διαθέσιμη.");
          return false;
      }
      return true;
  };

  // --- ACTIONS ---

  const updateTeamData = async (field: string, value: any) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;
    try { await updateDoc(doc(db, "teams", teamId), { [field]: value }); } 
    catch (err: any) { Alert.alert("Σφάλμα", err.message); }
  };

  const handleSaveInput = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) {
        setInputVisible(false);
        return;
    }

    if (!tempValue.trim()) return;
    
    try {
        if (inputMode === 'newProject' && activeGroupId) {
            const newProjectId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            const newProject: Project = { 
                id: newProjectId, 
                title: tempValue, 
                status: 'active', 
                supervisors: [currentUserId], 
                members: [],
                createdBy: currentUserId,
                teamId: teamId 
            };
            const updatedGroups = groups.map(g => g.id === activeGroupId ? { ...g, projects: [...g.projects, newProject] } : g);
            
            await updateTeamData('groups', updatedGroups);
            await setDoc(doc(db, "projects", newProjectId), { ...newProject, tasks: [], createdAt: serverTimestamp() });

        } else if (inputMode === 'newGroup') {
            const newGroup: Group = { id: Date.now().toString(), title: tempValue, projects: [] };
            await updateTeamData('groups', [...groups, newGroup]);

        } else if (inputMode === 'teamName') {
            await updateTeamData('name', tempValue);

        } else if (inputMode === 'teamContact') {
            await updateTeamData('contactEmail', tempValue);
        }
        
        setInputVisible(false);
        setTempValue('');
    } catch (error: any) { Alert.alert("Σφάλμα", error.message); }
  };

  const handleDeleteProject = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) return;

    if (!selectedProject) return;
    const { groupId, project } = selectedProject;
    
    Alert.alert("Διαγραφή Project", "Είστε σίγουροι;", [
        { text: "Ακύρωση" },
        { text: "Διαγραφή", style: 'destructive', onPress: async () => {
            const updatedGroups = groups.map(g => g.id === groupId ? { ...g, projects: g.projects.filter(p => p.id !== project.id) } : g);
            await updateTeamData('groups', updatedGroups);
            try { await deleteDoc(doc(db, "projects", project.id)); } catch(e) {}
            setProjectSettingsVisible(false);
        }}
    ]);
  };

  // --- ROLE MANAGEMENT & CLEANUP ---
  const changeUserRole = async (targetUser: User, action: 'promote' | 'demote' | 'kick') => {
    const isOnline = await checkOnline();
    if (!isOnline) return;

    if (myRole === 'Supervisor' && targetUser.role !== 'User') return Alert.alert("Απαγορεύεται", "Μπορείτε να διαχειριστείτε μόνο απλούς χρήστες.");
    if (targetUser.role === 'Founder') return Alert.alert("Απαγορεύεται", "Δεν πειράζουμε τον Ιδρυτή.");

    if (action === 'kick') {
        Alert.alert(
            "Διαγραφή Μέλους",
            `Είστε σίγουρος ότι θέλετε να αφαιρέσετε τον/την "${targetUser.name}" από την ομάδα;`,
            [
                { text: "Άκυρο", style: "cancel" },
                { 
                    text: "Διαγραφή", 
                    style: "destructive", 
                    onPress: async () => {
                        setUsers(prev => prev.filter(u => u.id !== targetUser.id));
                        await updateDoc(doc(db, "teams", teamId), { 
                            memberIds: arrayRemove(targetUser.id),
                            [`roles.${targetUser.id}`]: deleteField() 
                        });
                    }
                }
            ]
        );
        return;
    }

    // --- LOGIC ΑΛΛΑΓΗΣ ΡΟΛΟΥ ---
    let newRole: Role = targetUser.role;

    if (action === 'promote') {
      if (targetUser.role === 'User') newRole = 'Supervisor';
      else if (targetUser.role === 'Supervisor') newRole = 'Admin';
    } else if (action === 'demote') {
      if (targetUser.role === 'Admin') newRole = 'Supervisor';
      else if (targetUser.role === 'Supervisor') newRole = 'User';
    }

    // 1. Optimistic Update (UI Users List)
    setUsers(prevUsers => prevUsers.map(u => 
        u.id === targetUser.id ? { ...u, role: newRole } : u
    ));

    // 2. Firebase Update Team Role
    await updateDoc(doc(db, "teams", teamId), { [`roles.${targetUser.id}`]: newRole });

    // 3. --- DEEP CLEANUP ΣΕ ΟΛΑ ΤΑ ΕΠΙΠΕΔΑ ---
    // Εδώ υπολογίζουμε τη νέα δομή των Groups καθαρίζοντας τον χρήστη
    
    const updatedGroups = groups.map(group => {
        const updatedProjects = group.projects.map(project => {
            let pSupervisors = [...project.supervisors];
            let pMembers = [...project.members];
            let changed = false;

            if (newRole === 'User') {
                // Έγινε User -> Τον πετάμε από Supervisors
                if (pSupervisors.includes(targetUser.id)) {
                    pSupervisors = pSupervisors.filter(id => id !== targetUser.id);
                    changed = true;
                }
            } else if (newRole === 'Supervisor') {
                // Έγινε Supervisor -> Τον πετάμε από Members
                if (pMembers.includes(targetUser.id)) {
                    pMembers = pMembers.filter(id => id !== targetUser.id);
                    changed = true;
                }
            } else if (newRole === 'Admin' || newRole === 'Founder') {
                // Έγινε Admin -> Τον πετάμε από ΟΛΑ
                if (pSupervisors.includes(targetUser.id)) {
                    pSupervisors = pSupervisors.filter(id => id !== targetUser.id);
                    changed = true;
                }
                if (pMembers.includes(targetUser.id)) {
                    pMembers = pMembers.filter(id => id !== targetUser.id);
                    changed = true;
                }
            }

            if (changed) {
                // Ενημέρωση του ανεξάρτητου Project document
                updateDoc(doc(db, "projects", project.id), {
                    supervisors: pSupervisors,
                    members: pMembers
                }).catch(e => console.log("Project update failed:", e));

                return { ...project, supervisors: pSupervisors, members: pMembers };
            }
            return project;
        });
        return { ...group, projects: updatedProjects };
    });

    // 4. --- ΤΟ ΒΑΣΙΚΟ ΒΗΜΑ ΠΟΥ ΕΛΕΙΠΕ ---
    // Στέλνουμε τη νέα δομή Groups (με τα καθαρισμένα projects) πίσω στην ΟΜΑΔΑ
    // ώστε να μην τα ξανακατεβάσει λάθος.
    await updateTeamData('groups', updatedGroups);
    
    // Ενημέρωση UI
    setGroups(updatedGroups);
  };
  
  const toggleProjectRole = async (userId: string, type: 'supervisor' | 'member') => {
    const isOnline = await checkOnline();
    if (!isOnline) return;

    if (!selectedProject) return;
    const { groupId, project } = selectedProject;
    let updatedProject = { ...project };

    if (type === 'supervisor') {
        updatedProject.supervisors.includes(userId) 
            ? updatedProject.supervisors = updatedProject.supervisors.filter(id => id !== userId)
            : updatedProject.supervisors.push(userId);
    } else {
        updatedProject.members.includes(userId)
            ? updatedProject.members = updatedProject.members.filter(id => id !== userId)
            : updatedProject.members.push(userId);
    }
    const updatedGroups = groups.map(g => g.id === groupId ? { ...g, projects: g.projects.map(p => p.id === project.id ? updatedProject : p) } : g);
    
    await updateTeamData('groups', updatedGroups);
    try { await updateDoc(doc(db, "projects", project.id), { supervisors: updatedProject.supervisors, members: updatedProject.members }); } catch(e) {}
    setSelectedProject({ groupId, project: updatedProject });
  };

  // --- PICK LOGO ---
  const pickLogo = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) return;

    const result = await ImagePicker.launchImageLibraryAsync({ 
        mediaTypes: ImagePicker.MediaTypeOptions.Images, 
        allowsEditing: true, aspect: [1, 1], quality: 0.2, base64: true 
    });

    if (!result.canceled && result.assets[0].base64) {
        const imageUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await updateTeamData('logo', imageUri);
    }
  };

  const handleDeleteLogo = async () => {
    const isOnline = await checkOnline();
    if (!isOnline) return;

    Alert.alert("Διαγραφή Logo", "Θέλετε να αφαιρέσετε το λογότυπο και να επιστρέψετε στο αρχικό;", [
        { text: "Άκυρο" },
        {
            text: "Διαγραφή", style: 'destructive',
            onPress: async () => {
                await updateTeamData('logo', null);
                setMenuVisible(false);
                setTeamLogo(null);
            }
        }
    ]);
  };

  const openInput = async (mode: typeof inputMode, groupId?: string) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;

    setInputMode(mode);
    setTempValue('');
    if (groupId) setActiveGroupId(groupId);
    setMenuVisible(false);
    setInputVisible(true);
  };

  const handleInvite = async () => {
      const isOnline = await checkOnline();
      if (!isOnline) return;

      setMenuVisible(false); 
      router.push({ pathname: '/onboarding/invite', params: { teamId: teamId, teamName: teamName } });
  };

  const handleDeleteTeam = () => {
    Alert.alert("Διαγραφή Ομάδας", "ΠΡΟΣΟΧΗ: Θα διαγραφούν τα πάντα.", [
        { text: "Ακύρωση" },
        { text: "ΔΙΑΓΡΑΦΗ", style: 'destructive', onPress: async () => {
            const isOnline = await checkOnline();
            if (!isOnline) return;
            await deleteDoc(doc(db, "teams", teamId));
            router.replace('/dashboard');
        }}
    ]);
  };

  const handleDeleteGroup = async (groupId: string, projectCount: number) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;

    if (projectCount > 0) return Alert.alert("Αδύνατη Διαγραφή", "Το Group δεν είναι άδειο.");
    Alert.alert("Διαγραφή Group", "Είστε σίγουροι;", [{ text: "Όχι" }, { text: "Ναι", style: 'destructive', onPress: async () => {
        const updatedGroups = groups.filter(g => g.id !== groupId);
        await updateTeamData('groups', updatedGroups);
    }}]);
  };

  const handleMoveProject = async (targetGroupId: string) => {
    const isOnline = await checkOnline();
    if (!isOnline) return;

    if (!selectedProject) return;
    const { groupId: oldGroupId, project } = selectedProject;
    const updatedGroups = groups.map(g => {
        if (g.id === oldGroupId) return { ...g, projects: g.projects.filter(p => p.id !== project.id) };
        if (g.id === targetGroupId) return { ...g, projects: [...g.projects, project] };
        return g;
    });
    await updateTeamData('groups', updatedGroups);
    setMoveModalVisible(false);
    setProjectSettingsVisible(false);
    Alert.alert("Επιτυχία", "Το έργο μεταφέρθηκε.");
  };

  const visibleGroups = groups.map(g => {
      if (myRole !== 'User') return g; 
      const userProjects = g.projects.filter(p => p.members.includes(currentUserId) || p.supervisors.includes(currentUserId)); 
      return { ...g, projects: userProjects };
  }).filter(g => myRole !== 'User' || g.projects.length > 0);


  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563eb"/></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
            {teamLogo ? <Image source={{ uri: teamLogo }} style={styles.teamLogo} /> : <View style={styles.teamLogoPlaceholder}><Text style={{color:'white', fontWeight:'bold'}}>{teamName.charAt(0)}</Text></View>}
            <View style={{marginLeft: 10}}>
                <Text style={styles.headerTitle}>{teamName}</Text>
                <Text style={styles.headerSubtitle}>{myRole} • {teamContact}</Text>
            </View>
        </View>
        {(myRole === 'Founder' || myRole === 'Admin' || myRole === 'Supervisor') && (
            <TouchableOpacity onPress={() => setMenuVisible(true)}><Ionicons name="settings-outline" size={24} color="#333" /></TouchableOpacity>
        )}
      </View>

      <FlatList
        data={visibleGroups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
            <View style={{alignItems:'center', marginTop: 50}}>
                <Text style={{color:'#999'}}>Δεν υπάρχουν έργα ακόμα.</Text>
                {(myRole === 'Founder' || myRole === 'Admin') && <Text style={{color:'#2563eb'}}>Δημιουργήστε ένα Project Group!</Text>}
            </View>
        }
        ListFooterComponent={
            (myRole === 'Founder' || myRole === 'Admin') ? (
                <TouchableOpacity style={styles.addGroupBtn} onPress={() => openInput('newGroup')}>
                    <Ionicons name="folder-open-outline" size={24} color="#666" />
                    <Text style={styles.addGroupText}>Δημιουργία Project Group</Text>
                </TouchableOpacity>
            ) : null
        }
        renderItem={({ item: group }) => (
            <View style={styles.groupContainer}>
                <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{group.title}</Text>
                    {(myRole === 'Founder' || myRole === 'Admin') && (
                        <TouchableOpacity onPress={() => handleDeleteGroup(group.id, group.projects.length)}><Ionicons name="trash-bin-outline" size={18} color="#999" /></TouchableOpacity>
                    )}
                </View>
                {group.projects.map(project => (
                    <TouchableOpacity 
                        key={project.id} 
                        style={styles.projectCard}
                        onPress={() => router.push(`/project/${project.id}`)}
                        onLongPress={() => {
                            if(myRole !== 'User') { setSelectedProject({ groupId: group.id, project }); setProjectSettingsVisible(true); }
                        }}
                    >
                        <View>
                            <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                <View style={[styles.statusDot, {backgroundColor: project.status === 'active' ? '#22c55e' : '#f59e0b'}]} />
                                <Text style={styles.projectTitle}>{project.title}</Text>
                            </View>
                            <Text style={{fontSize:10, color:'#666', marginTop:2}}>Supervisors: {project.supervisors.length} | Members: {project.members.length}</Text>
                        </View>
                        {myRole !== 'User' && <Ionicons name="settings-sharp" size={16} color="#ddd" />}
                    </TouchableOpacity>
                ))}
                
                {(myRole === 'Founder' || myRole === 'Admin' || myRole === 'Supervisor') && (
                    <TouchableOpacity style={styles.addProjectBtn} onPress={() => openInput('newProject', group.id)}>
                        <Ionicons name="add" size={16} color="#2563eb" />
                        <Text style={styles.addProjectText}>Νέο Project</Text>
                    </TouchableOpacity>
                )}
            </View>
        )}
      />

      {/* MODALS */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
            <View style={styles.menuContent} onStartShouldSetResponder={() => true}>
                <Text style={styles.menuHeader}>Διαχείριση Ομάδας</Text>
                
                <TouchableOpacity style={styles.menuItem} onPress={handleInvite}><Ionicons name="person-add-outline" size={20} color="#333" /><Text style={styles.menuText}>Πρόσκληση Νέου Μέλους</Text></TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setUsersModalVisible(true); }}><Ionicons name="people-outline" size={20} color="#333" /><Text style={styles.menuText}>Λίστα Χρηστών</Text></TouchableOpacity>

                {(myRole === 'Founder' || myRole === 'Admin') && (
                    <>
                        <TouchableOpacity style={styles.menuItem} onPress={pickLogo}><Ionicons name="image-outline" size={20} color="#333" /><Text style={styles.menuText}>Αλλαγή Logo</Text></TouchableOpacity>
                        
                        {teamLogo && (
                            <TouchableOpacity style={styles.menuItem} onPress={handleDeleteLogo}>
                                <Ionicons name="trash-outline" size={20} color="red" />
                                <Text style={[styles.menuText, {color: 'red'}]}>Διαγραφή Logo</Text>
                            </TouchableOpacity>
                        )}
                        
                        <TouchableOpacity style={styles.menuItem} onPress={() => openInput('teamContact')}><Ionicons name="call-outline" size={20} color="#333" /><Text style={styles.menuText}>Αλλαγή Επικοινωνίας</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.menuItem} onPress={() => openInput('teamName')}><Ionicons name="create-outline" size={20} color="#333" /><Text style={styles.menuText}>Αλλαγή Ονόματος</Text></TouchableOpacity>
                    </>
                )}
                {myRole === 'Founder' && <TouchableOpacity style={styles.menuItem} onPress={handleDeleteTeam}><Ionicons name="trash-outline" size={20} color="red" /><Text style={[styles.menuText, {color:'red'}]}>Διαγραφή Ομάδας</Text></TouchableOpacity>}
                <TouchableOpacity style={styles.closeMenuBtn} onPress={() => setMenuVisible(false)}><Text style={{color: 'blue'}}>Κλείσιμο</Text></TouchableOpacity>
            </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={projectSettingsVisible} animationType="slide" onRequestClose={() => setProjectSettingsVisible(false)}>
        <SafeAreaView style={{flex: 1, backgroundColor: 'white'}}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Ρυθμίσεις Project</Text>
                <TouchableOpacity onPress={() => setProjectSettingsVisible(false)}><Ionicons name="close" size={28} color="#333" /></TouchableOpacity>
            </View>
            <ScrollView style={{padding: 20}}>
                
                {/* --- 1. SUPERVISORS LIST (ONLY SUPERVISORS SHOW HERE) --- */}
                <Text style={styles.sectionTitle}>1. Supervisors</Text>
                {users
                    .filter(u => u.role === 'Supervisor') 
                    .map(u => (
                    <TouchableOpacity key={u.id} style={styles.checkItem} onPress={() => toggleProjectRole(u.id, 'supervisor')}>
                         <Ionicons name={selectedProject?.project.supervisors.includes(u.id) ? "checkbox" : "square-outline"} size={24} color="#2563eb" />
                        <Text style={{marginLeft: 10}}>{u.name} <Text style={{fontSize:10, color:'#666'}}>({u.role})</Text></Text>
                    </TouchableOpacity>
                ))}
                
                <View style={{height: 20}} />
                
                {/* --- 2. MEMBERS LIST (ONLY USERS SHOW HERE) --- */}
                <Text style={styles.sectionTitle}>2. Μέλη (Users)</Text>
                {users
                    .filter(u => u.role === 'User') 
                    .map(u => (
                    <TouchableOpacity key={u.id} style={styles.checkItem} onPress={() => toggleProjectRole(u.id, 'member')}>
                         <Ionicons name={selectedProject?.project.members.includes(u.id) ? "checkbox" : "square-outline"} size={24} color="#16a34a" />
                        <Text style={{marginLeft: 10}}>{u.name}</Text>
                    </TouchableOpacity>
                ))}
                
                <View style={{height: 30}} />
                <TouchableOpacity style={styles.actionBtn} onPress={() => setMoveModalVisible(true)}><Ionicons name="folder-outline" size={20} color="#333" /><Text style={{fontWeight:'bold', marginLeft: 10}}>Μεταφορά σε άλλο Group</Text></TouchableOpacity>
                {myRole !== 'User' && (
                    <TouchableOpacity style={[styles.actionBtn, {borderColor:'red'}]} onPress={handleDeleteProject}><Ionicons name="trash-outline" size={20} color="red" /><Text style={{fontWeight:'bold', marginLeft: 10, color:'red'}}>Διαγραφή Project</Text></TouchableOpacity>
                )}
            </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={moveModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.menuContent}>
                <Text style={styles.menuHeader}>Επιλέξτε Group</Text>
                {groups.map(g => (
                    <TouchableOpacity key={g.id} style={[styles.menuItem, g.id === selectedProject?.groupId && {opacity: 0.5}]} disabled={g.id === selectedProject?.groupId} onPress={() => handleMoveProject(g.id)}>
                        <Ionicons name="folder-open" size={20} color="#333" /><Text style={styles.menuText}>{g.title}</Text>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.closeMenuBtn} onPress={() => setMoveModalVisible(false)}><Text style={{color:'red'}}>Ακύρωση</Text></TouchableOpacity>
            </View>
        </View>
      </Modal>

      <Modal visible={usersModalVisible} animationType="slide" onRequestClose={() => setUsersModalVisible(false)}>
         <SafeAreaView style={{flex: 1, backgroundColor: 'white'}}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Χρήστες ({users.length})</Text>
                <TouchableOpacity onPress={() => setUsersModalVisible(false)}><Ionicons name="close" size={28} color="#333" /></TouchableOpacity>
            </View>
            <FlatList 
                data={users}
                keyExtractor={u => u.id}
                contentContainerStyle={{padding: 20}}
                renderItem={({ item }) => (
                    <View style={styles.userCard}>
                        <View>
                            <Text style={{fontWeight:'bold'}}>{item.name}</Text>
                            <Text style={{fontSize:12, color:'#666'}}>{item.role}</Text>
                        </View>
                        {item.id !== currentUserId && item.role !== 'Founder' && (
                            (myRole === 'Admin' || myRole === 'Founder' || (myRole === 'Supervisor' && item.role === 'User')) && (
                                <View style={{flexDirection: 'row', gap: 10}}>
                                    
                                    {(myRole === 'Founder' || myRole === 'Admin') && item.role !== 'Admin' && (
                                        <TouchableOpacity onPress={() => changeUserRole(item, 'promote')}>
                                            <Ionicons name="arrow-up-circle" size={28} color="#22c55e" />
                                        </TouchableOpacity>
                                    )}

                                    {(myRole === 'Founder' || myRole === 'Admin') && item.role !== 'User' && (
                                        <TouchableOpacity onPress={() => changeUserRole(item, 'demote')}>
                                            <Ionicons name="arrow-down-circle" size={28} color="#f59e0b" />
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity onPress={() => changeUserRole(item, 'kick')}><Ionicons name="trash" size={28} color="#ef4444" /></TouchableOpacity>
                                </View>
                            )
                        )}
                    </View>
                )}
            />
         </SafeAreaView>
      </Modal>

      <InputModal visible={inputVisible} onClose={() => setInputVisible(false)} onSave={handleSaveInput} title={inputMode} value={tempValue} onChangeText={setTempValue} placeholder="Πληκτρολογήστε..." />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', marginTop: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 30, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backButton: { marginRight: 10 },
  teamLogo: { width: 40, height: 40, borderRadius: 8 },
  teamLogoPlaceholder: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  headerSubtitle: { color: '#666', fontSize: 10 },
  content: { padding: 20 },
  groupContainer: { marginBottom: 25 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 5 },
  groupTitle: { fontSize: 14, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' },
  projectCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 1 },
  projectTitle: { fontSize: 16, fontWeight: '600', color: '#334155' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  addProjectBtn: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  addProjectText: { color: '#2563eb', fontSize: 14, fontWeight: '500', marginLeft: 5 },
  addGroupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, borderWidth: 2, borderColor: '#e5e7eb', borderStyle: 'dashed', borderRadius: 12, marginTop: 10, marginBottom: 40 },
  addGroupText: { color: '#64748b', fontWeight: 'bold', marginLeft: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  menuContent: { backgroundColor: 'white', width: '90%', borderRadius: 16, padding: 20, elevation: 5 },
  menuHeader: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  menuText: { marginLeft: 15, fontSize: 16 },
  closeMenuBtn: { marginTop: 20, alignItems: 'center', padding: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 10, marginBottom: 5, color: '#111827' },
  checkItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', padding: 15, borderWidth: 1, borderColor: '#ccc', borderRadius: 10, marginBottom: 10, justifyContent: 'center' },
  userCard: { backgroundColor: '#f9fafb', padding: 15, borderRadius: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#eee' }, 
});