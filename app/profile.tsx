import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// FIREBASE
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

import InputModal from './components/InputModal';

export default function ProfileScreen() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  
  // Edit States
  const [modalVisible, setModalVisible] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editField, setEditField] = useState<'fullname' | 'phone'>('fullname');

  // --- 1. OFFLINE DATA FETCHING ---
  useEffect(() => {
    // Βήμα 1: Περιμένουμε το Auth να διαβάσει από τη μνήμη
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);

        // Βήμα 2: Ακούμε τις αλλαγές (και από Cache)
        const unsubscribeSnapshot = onSnapshot(userRef, { includeMetadataChanges: true }, (docSnap) => {
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          } else {
            // Αν δεν υπάρχει έγγραφο user (σπάνιο), δείχνουμε τα βασικά από το Auth
            setUserData({ fullname: user.displayName || 'Χρήστης', email: user.email });
          }
          setLoading(false);
        }, (error) => {
            console.log("Profile Fetch Error:", error);
            setLoading(false);
        });

        return () => unsubscribeSnapshot();
      } else {
        // Αν δεν βρεθεί χρήστης, τον στέλνουμε στο login
        router.replace('/login');
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // --- ACTIONS ---

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/login');
    } catch (error: any) {
      Alert.alert("Σφάλμα", error.message);
    }
  };

  const openEdit = (field: 'fullname' | 'phone', currentValue: string) => {
      setEditField(field);
      setEditValue(currentValue || '');
      setModalVisible(true);
  };

  const saveEdit = async () => {
      if (!auth.currentUser) return;
      
      try {
          // Το updateDoc δουλεύει offline (μπαίνει σε ουρά)
          const userRef = doc(db, "users", auth.currentUser.uid);
          await updateDoc(userRef, { [editField]: editValue });
          setModalVisible(false);
      } catch (error: any) {
          Alert.alert("Σφάλμα", "Η αποθήκευση απέτυχε: " + error.message);
      }
  };

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563eb"/></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Το Προφίλ μου</Text>
        <View style={{width: 24}} /> 
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* AVATAR SECTION */}
        <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>
                    {userData?.fullname ? userData.fullname.charAt(0).toUpperCase() : 'U'}
                </Text>
            </View>
            <Text style={styles.nameText}>{userData?.fullname || 'Ανώνυμος'}</Text>
            <Text style={styles.emailText}>{userData?.email}</Text>
        </View>

        {/* DETAILS SECTION */}
        <View style={styles.section}>
            <Text style={styles.sectionHeader}>Προσωπικά Στοιχεία</Text>
            
            <TouchableOpacity style={styles.row} onPress={() => openEdit('fullname', userData?.fullname)}>
                <View style={styles.rowIcon}>
                    <Ionicons name="person-outline" size={20} color="#666" />
                </View>
                <View style={styles.rowData}>
                    <Text style={styles.label}>Ονοματεπώνυμο</Text>
                    <Text style={styles.value}>{userData?.fullname || '-'}</Text>
                </View>
                <Ionicons name="create-outline" size={20} color="#2563eb" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.row} onPress={() => openEdit('phone', userData?.phone)}>
                <View style={styles.rowIcon}>
                    <Ionicons name="call-outline" size={20} color="#666" />
                </View>
                <View style={styles.rowData}>
                    <Text style={styles.label}>Τηλέφωνο</Text>
                    <Text style={styles.value}>{userData?.phone || 'Προσθέστε τηλέφωνο'}</Text>
                </View>
                <Ionicons name="create-outline" size={20} color="#2563eb" />
            </TouchableOpacity>

            <View style={styles.row}>
                <View style={styles.rowIcon}>
                    <Ionicons name="mail-outline" size={20} color="#666" />
                </View>
                <View style={styles.rowData}>
                    <Text style={styles.label}>Email</Text>
                    <Text style={[styles.value, {color:'#999'}]}>{userData?.email}</Text>
                </View>
                {/* Email cannot be edited easily */}
            </View>
        </View>

        {/* LOGOUT BUTTON */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
            <Text style={styles.logoutText}>Αποσύνδεση</Text>
        </TouchableOpacity>

      </ScrollView>

      <InputModal 
        visible={modalVisible} 
        onClose={() => setModalVisible(false)} 
        onSave={saveEdit} 
        title={editField === 'fullname' ? "Αλλαγή Ονόματος" : "Αλλαγή Τηλεφώνου"}
        value={editValue} 
        onChangeText={setEditValue} 
        placeholder="Γράψτε εδώ..."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 50, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  content: { padding: 20 },
  avatarSection: { alignItems: 'center', marginBottom: 30 },
  avatarContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', marginBottom: 15, elevation: 5 },
  avatarText: { fontSize: 40, color: 'white', fontWeight: 'bold' },
  nameText: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  emailText: { fontSize: 14, color: '#64748b' },
  section: { backgroundColor: 'white', borderRadius: 16, padding: 5, elevation: 2, marginBottom: 20 },
  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#334155', margin: 15, marginBottom: 5 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowIcon: { width: 40, alignItems: 'center' },
  rowData: { flex: 1 },
  label: { fontSize: 12, color: '#64748b' },
  value: { fontSize: 16, color: '#1e293b', fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, backgroundColor: '#fee2e2', borderRadius: 12 },
  logoutText: { color: '#ef4444', fontWeight: 'bold', fontSize: 16, marginLeft: 10 },
});