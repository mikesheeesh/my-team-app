import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants'; // <--- ΓΙΑ ΝΑ ΞΕΧΩΡΙΖΕΙ EXPO GO / APK
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

export default function InviteMembersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  const { teamId, teamName } = params;

  const [role, setRole] = useState('User');
  const [loading, setLoading] = useState(false);
  const [myRole, setMyRole] = useState('User'); 

  // Ανάκτηση του ρόλου μου για να δω τι δικαιώματα έχω
  useEffect(() => {
      const fetchMyRole = async () => {
          const user = auth.currentUser;
          if (user && teamId) {
              try {
                const teamSnap = await getDoc(doc(db, "teams", teamId as string));
                if (teamSnap.exists()) {
                    setMyRole(teamSnap.data().roles[user.uid] || 'User');
                }
              } catch(e) { console.log("Role fetch error"); }
          }
      };
      fetchMyRole();
  }, [teamId]);

  const handleShareInvite = async () => {
    // 1. ΕΛΕΓΧΟΣ ΙΝΤΕΡΝΕΤ
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected) {
        return Alert.alert("Offline", "Χρειάζεστε ίντερνετ για να δημιουργήσετε πρόσκληση.");
    }

    if (!teamId) return Alert.alert("Σφάλμα", "Λείπει το Team ID.");
    const user = auth.currentUser;
    if (!user) return Alert.alert("Σφάλμα", "Δεν είστε συνδεδεμένος.");

    setLoading(true);
    try {
        // 2. ΔΗΜΙΟΥΡΓΙΑ ΚΩΔΙΚΟΥ (6 γράμματα)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
        let shortCode = '';
        for (let i = 0; i < 6; i++) shortCode += chars.charAt(Math.floor(Math.random() * chars.length));
        
        // 3. ΕΓΓΡΑΦΗ ΣΤΗ ΒΑΣΗ
        await addDoc(collection(db, "invites"), {
            code: shortCode, 
            teamId: teamId,
            teamName: teamName || "Ομάδα",
            role: role,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
            status: 'active'
        });

        // 4. ΔΗΜΙΟΥΡΓΙΑ ΕΞΥΠΝΟΥ LINK
        // Αν τρέχεις Expo Go, θέλουμε exp://. Αν είναι APK, θέλουμε teamcamera://
        const isExpoGo = Constants.appOwnership === 'expo';
        const scheme = isExpoGo ? 'exp' : 'teamcamera';

        const deepLink = Linking.createURL('join', {
            scheme: scheme,
            queryParams: { inviteCode: shortCode },
        });

        console.log("Created Link:", deepLink); // Δες το στην κονσόλα

        // ΣΗΜΑΝΤΙΚΟ: Βάλε εδώ το link του APK σου από το Expo Dashboard
        const downloadLink = "https://expo.dev/artifacts/eas/....apk"; 
        
        const message = `👋 Πρόσκληση για την ομάδα "${teamName}"

1️⃣ Κατέβασε το App (αν δεν το έχεις):
${downloadLink}

2️⃣ Πάτα για είσοδο:
${deepLink}

🔑 Κωδικός: ${shortCode}
(Λήγει σε 2 λεπτά)`;
        
        // 5. ΚΟΙΝΟΠΟΙΗΣΗ
        // Προσοχή: Στείλτο με Viber/WhatsApp/Messenger για να είναι μπλε το Link
        await Share.share({
            message: message,
            title: `TeamCamera: ${teamName}`,
        });

    } catch (error: any) {
        Alert.alert("Σφάλμα", error.message);
    } finally {
        setLoading(false);
    }
  };

  const availableRoles = (myRole === 'Founder' || myRole === 'Admin') ? ['Admin', 'Supervisor', 'User'] : ['User'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Πρόσκληση Μέλους</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={24} color="#2563eb" />
            <Text style={styles.infoText}>
                Ο σύνδεσμος ανοίγει αυτόματα την εφαρμογή. 
                {"\n"}- Στείλτε το μέσω Viber/WhatsApp/Messenger.
                {"\n"}- Τα Email συχνά μπλοκάρουν αυτά τα links.
            </Text>
        </View>

        <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Ομάδα: {teamName}</Text>
            <View style={styles.timerTag}>
                <Ionicons name="timer-outline" size={14} color="#b45309" />
                <Text style={styles.timerText}>Λήξη σε 2 λεπτά</Text>
            </View>
        </View>

        <Text style={styles.sectionTitle}>Ρόλος:</Text>
        <View style={styles.rolesContainer}>
        {availableRoles.map((r) => (
            <TouchableOpacity key={r} style={[styles.roleBtn, role === r && styles.roleBtnActive]} onPress={() => setRole(r)}>
            <Text style={[styles.roleText, role === r && {color: 'white'}]}>{r}</Text>
            </TouchableOpacity>
        ))}
        </View>

        <TouchableOpacity style={styles.actionButton} onPress={handleShareInvite} disabled={loading}>
          {loading ? <ActivityIndicator color="white"/> : (
             <>
                <Ionicons name="share-social-outline" size={24} color="white" style={{marginRight: 10}} />
                <Text style={styles.actionButtonText}>Κοινοποίηση</Text>
             </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  backButton: { marginRight: 20 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20 },
  infoBox: { flexDirection:'row', alignItems:'center', backgroundColor: '#eff6ff', padding: 15, borderRadius: 10, marginBottom: 20 },
  infoText: { marginLeft: 10, color: '#1e40af', flex: 1, fontSize: 13 },
  summaryBox: { backgroundColor: 'white', padding: 20, borderRadius: 12, marginBottom: 30, borderWidth: 1, borderColor: '#e5e7eb', alignItems:'center' },
  summaryTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  timerTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#fcd34d' },
  timerText: { color: '#b45309', fontSize: 12, fontWeight: 'bold', marginLeft: 5 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  rolesContainer: { flexDirection: 'row', gap: 10, marginBottom: 30 },
  roleBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', backgroundColor: 'white' },
  roleBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  roleText: { fontWeight: 'bold', color: '#374151' },
  actionButton: { backgroundColor: '#2563eb', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', elevation: 5 },
  actionButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});