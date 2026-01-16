import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; // <--- ΠΡΟΣΘΗΚΗ
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

const PROFILE_CACHE_KEY = 'user_profile_data_cache';

export default function LoginScreen() {
  const router = useRouter();
  const [isRegistering, setIsRegistering] = useState(false);
  
  const [fullname, setFullname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Μετάφραση λαθών Firebase στα Ελληνικά
  const getFriendlyError = (errorMsg: string) => {
      if (errorMsg.includes('invalid-email')) return 'Το email δεν είναι έγκυρο.';
      if (errorMsg.includes('user-not-found')) return 'Δεν βρέθηκε χρήστης με αυτό το email.';
      if (errorMsg.includes('wrong-password')) return 'Λάθος κωδικός πρόσβασης.';
      if (errorMsg.includes('email-already-in-use')) return 'Το email χρησιμοποιείται ήδη.';
      if (errorMsg.includes('weak-password')) return 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.';
      if (errorMsg.includes('network-request-failed')) return 'Πρόβλημα σύνδεσης στο ίντερνετ.';
      return errorMsg; // Επιστροφή του αρχικού αν δεν το ξέρουμε
  };

  const handleAuth = async () => {
    if (!email || !password) return Alert.alert("Προσοχή", "Συμπληρώστε Email και Κωδικό.");
    if (isRegistering && !fullname.trim()) return Alert.alert("Προσοχή", "Το Όνομα είναι απαραίτητο.");

    setLoading(true);
    try {
      if (isRegistering) {
        // --- ΕΓΓΡΑΦΗ ---
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: fullname });
        
        const userData = {
          fullname: fullname,
          email: email.toLowerCase(),
          createdAt: new Date().toISOString(),
          phone: '',
          avatar: null
        };

        // Αποθήκευση στη βάση
        await setDoc(doc(db, "users", user.uid), userData);
        
        // Αποθήκευση στην Cache (για να φαίνεται αμέσως στο Profile/Dashboard)
        await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(userData));

        router.replace('/dashboard');

      } else {
        // --- ΣΥΝΔΕΣΗ ---
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Προσπάθεια ανάκτησης ονόματος για την Cache
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                // Αποθήκευση στην Cache
                await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
            }
        } catch (e) {
            console.log("Offline login (cache update skipped)");
        }

        router.replace('/dashboard');
      }
    } catch (error: any) {
      Alert.alert("Σφάλμα", getFriendlyError(error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1, backgroundColor:'white'}}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        
        <View style={styles.header}>
          <Text style={styles.title}>{isRegistering ? "Δημιουργία Λογαριασμού" : "Καλωσήρθατε Ξανά"}</Text>
        </View>

        <View style={styles.form}>
          {isRegistering && (
            <View>
                <Text style={styles.label}>Ονοματεπώνυμο</Text>
                <TextInput 
                    style={styles.input} 
                    value={fullname} 
                    onChangeText={setFullname} 
                    placeholder="Π.χ. Γιάννης Παπαδόπουλος"
                />
            </View>
          )}
          
          <Text style={styles.label}>Email</Text>
          <TextInput 
            style={styles.input} 
            value={email} 
            onChangeText={setEmail} 
            keyboardType="email-address" 
            autoCapitalize="none" 
            placeholder="name@example.com"
          />
          
          <Text style={styles.label}>Κωδικός</Text>
          <TextInput 
            style={styles.input} 
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry 
            placeholder="******"
          />

          <TouchableOpacity style={styles.btnPrimary} onPress={handleAuth} disabled={loading}>
            {loading ? <ActivityIndicator color="white"/> : <Text style={styles.btnText}>{isRegistering ? "Εγγραφή" : "Είσοδος"}</Text>}
          </TouchableOpacity>

          <View style={styles.toggleContainer}>
            <Text style={{color: '#666'}}>{isRegistering ? "Έχετε ήδη λογαριασμό;" : "Δεν έχετε λογαριασμό;"}</Text>
            <TouchableOpacity onPress={() => setIsRegistering(!isRegistering)}>
                <Text style={styles.toggleText}>{isRegistering ? " Σύνδεση" : " Εγγραφή"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ 
    container: { flexGrow: 1, padding: 30, paddingTop: 60 }, 
    backBtn: { marginBottom: 20 }, 
    header: { marginBottom: 40 }, 
    title: { fontSize: 28, fontWeight: 'bold', color: '#1e3a8a' }, 
    form: { gap: 15 }, 
    label: { fontWeight: 'bold', color: '#333', marginBottom: 5 }, 
    input: { borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 10, backgroundColor: '#f9fafb', fontSize: 16 }, 
    btnPrimary: { backgroundColor: '#2563eb', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 20, elevation: 2 }, 
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }, 
    toggleContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 }, 
    toggleText: { color: '#2563eb', fontWeight: 'bold', marginLeft: 5 } 
});