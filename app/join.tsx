import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo'; // <--- 1. ΕΛΕΓΧΟΣ ΙΝΤΕΡΝΕΤ
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// FIREBASE
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export default function JoinTeamScreen() {
  const router = useRouter();
  
  // Διαβάζουμε και το 'inviteCode' (από το deep link) και το 'code' (χειροκίνητο)
  const { inviteCode, code: paramCode } = useLocalSearchParams(); 
  
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 1. ΑΥΣΤΗΡΟΣ ΕΛΕΓΧΟΣ ΣΥΝΔΕΣΗΣ ΧΡΗΣΤΗ
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!user) {
            Alert.alert("Προσοχή", "Πρέπει να συνδεθείτε πρώτα.", [
                { text: "OK", onPress: () => router.replace('/') }
            ]);
        } else {
            setCheckingAuth(false);
        }
    });
    return () => unsubscribe();
  }, []);

  // 2. ΑΥΤΟΜΑΤΗ ΣΥΜΠΛΗΡΩΣΗ ΑΠΟ LINK
  useEffect(() => {
    if (inviteCode) {
        setCode(String(inviteCode).toUpperCase());
    } else if (paramCode) {
        setCode(String(paramCode).toUpperCase());
    }
  }, [inviteCode, paramCode]);

  const handleJoin = async () => {
    // --- ΕΛΕΓΧΟΣ ΙΝΤΕΡΝΕΤ ---
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
        return Alert.alert("Offline", "Απαιτείται σύνδεση στο ίντερνετ για να μπείτε σε ομάδα.");
    }
    // ------------------------

    if (!code || code.length < 6) return Alert.alert("Προσοχή", "Εισάγετε έγκυρο κωδικό.");

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    setLoading(true);
    try {
        // Αναζήτηση πρόσκλησης
        const q = query(collection(db, "invites"), where("code", "==", code.trim().toUpperCase()));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            Alert.alert("Λάθος", "Ο κωδικός δεν υπάρχει ή έχει λήξει.");
            setLoading(false);
            return;
        }

        const inviteDoc = snapshot.docs[0];
        const inviteData = inviteDoc.data();

        // Έλεγχος Χρόνου (2 λεπτά)
        const now = new Date();
        const createdAt = inviteData.createdAt?.toDate(); 

        if (createdAt) {
            const diffInSeconds = (now.getTime() - createdAt.getTime()) / 1000;
            if (diffInSeconds > 120) { // 120 δευτερόλεπτα = 2 λεπτά
                await deleteDoc(inviteDoc.ref); // Διαγραφή ληγμένου
                Alert.alert("Έληξε", "Ο κωδικός έληξε. Ζητήστε νέο.");
                setLoading(false);
                return;
            }
        }

        // ΕΓΓΡΑΦΗ ΣΤΗΝ ΟΜΑΔΑ
        const teamRef = doc(db, "teams", inviteData.teamId);
        await updateDoc(teamRef, {
            memberIds: arrayUnion(userId),
            [`roles.${userId}`]: inviteData.role 
        });

        // Διαγραφή της πρόσκλησης αφού χρησιμοποιήθηκε
        await deleteDoc(inviteDoc.ref);

        Alert.alert("Επιτυχία", "Καλωσήρθατε στην ομάδα!");
        router.replace('/dashboard');

    } catch (error: any) {
        Alert.alert("Σφάλμα", error.message);
        setLoading(false);
    }
  };

  if (checkingAuth) {
      return (
          <SafeAreaView style={[styles.container, {justifyContent:'center', alignItems:'center'}]}>
              <ActivityIndicator size="large" color="#2563eb" />
          </SafeAreaView>
      );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={28} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Είσοδος με Κωδικό</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.iconBox}>
            <Ionicons name="enter-outline" size={50} color="#2563eb" />
        </View>
        
        <Text style={styles.label}>Εισάγετε τον 6ψήφιο κωδικό:</Text>
        
        <TextInput
            style={styles.input}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="XXXXXX"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
        />
        
        <Text style={styles.helperText}>Ο κωδικός λήγει σε 2 λεπτά.</Text>
        
        <TouchableOpacity style={styles.btn} onPress={handleJoin} disabled={loading}>
            {loading ? <ActivityIndicator color="white"/> : <Text style={styles.btnText}>Είσοδος</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { padding: 20, paddingTop: 50, flexDirection:'row', alignItems:'center', gap: 20 },
  headerTitle: { fontSize: 20, fontWeight:'bold' },
  content: { padding: 30, paddingTop: 40, alignItems: 'center' },
  iconBox: { width: 100, height: 100, backgroundColor: '#eff6ff', borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
  label: { fontWeight:'bold', marginBottom: 15, color:'#333', fontSize: 16 },
  input: { borderWidth: 2, borderColor: '#2563eb', borderRadius: 12, padding: 15, fontSize: 28, textAlign:'center', letterSpacing: 5, fontWeight:'bold', color: '#333', width: '100%', marginBottom: 10, backgroundColor: '#f9fafb' },
  helperText: { textAlign:'center', color:'#ef4444', marginTop: 5, marginBottom: 30, fontSize: 13, fontWeight:'600' },
  btn: { backgroundColor: '#2563eb', padding: 18, borderRadius: 12, alignItems:'center', width: '100%', elevation: 3 },
  btnText: { color:'white', fontWeight:'bold', fontSize: 18 }
});