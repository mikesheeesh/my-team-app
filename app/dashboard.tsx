import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// FIREBASE
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export default function DashboardScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('Φόρτωση...');
  const [loading, setLoading] = useState(true);

  // 1. ΔΙΑΧΕΙΡΙΣΗ ΚΟΥΜΠΙΟΥ "ΠΙΣΩ" (ΔΙΟΡΘΩΜΕΝΟ)
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        BackHandler.exitApp();
        return true;
      };

      // ΝΕΟΣ ΤΡΟΠΟΣ: Κρατάμε το subscription
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      // Και καλούμε το remove() πάνω στο subscription
      return () => subscription.remove();
    }, [])
  );

  // 2. AUTH & DATA LISTENER
  useFocusEffect(
    useCallback(() => {
      const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
           const userRef = doc(db, "users", user.uid);
           const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
               if (docSnap.exists()) {
                   const data = docSnap.data();
                   setUserName(data.fullname || user.displayName || 'Χρήστης');
               } else {
                   setUserName(user.displayName || 'Χρήστης');
               }
               setLoading(false);
           }, (error) => {
               console.log("Dashboard User Error:", error);
               setLoading(false);
           });
           return () => unsubscribeUser();
        } else {
           router.replace('/');
        }
      });
      return () => unsubscribeAuth();
    }, [])
  );

  if (loading) {
      return (
          <SafeAreaView style={[styles.center, {backgroundColor:'#f8fafc'}]}>
              <ActivityIndicator size="large" color="#2563eb" />
          </SafeAreaView>
      );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <View>
            <Text style={styles.appName}>TeamCamera</Text>
            <Text style={styles.greeting}>Γεια σου, {userName}!</Text>
        </View>
        <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/profile')}>
          <Ionicons name="person-circle-outline" size={45} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <Text style={styles.instruction}>Επιλέξτε ενέργεια:</Text>

        {/* 1. ΟΙ ΟΜΑΔΕΣ ΜΟΥ */}
        <TouchableOpacity style={[styles.bigCard, styles.listCard]} onPress={() => router.push('/teams/my-teams')}>
          <View style={[styles.iconCircle, { backgroundColor: '#e0f2fe' }]}>
              <Ionicons name="people" size={32} color="#0284c7" />
          </View>
          <View>
            <Text style={[styles.cardTitle, { color: '#0f172a' }]}>Οι Ομάδες μου</Text>
            <Text style={[styles.cardSubtitle, { color: '#475569' }]}>Δείτε έργα & αναθέσεις.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#cbd5e1" style={{marginLeft: 'auto'}} />
        </TouchableOpacity>

        {/* 2. ΔΗΜΙΟΥΡΓΙΑ ΟΜΑΔΑΣ */}
        <TouchableOpacity style={[styles.bigCard, styles.createCard]} onPress={() => router.push('/onboarding/create-team')}>
          <View style={styles.iconCircle}>
              <Ionicons name="add" size={40} color="#fff" />
          </View>
          <View>
              <Text style={styles.cardTitle}>Δημιουργία Ομάδας</Text>
              <Text style={styles.cardSubtitle}>Για Ιδρυτές / Managers.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.5)" style={{marginLeft: 'auto'}} />
        </TouchableOpacity>

        {/* 3. LINK: ΕΧΩ ΚΩΔΙΚΟ */}
        <View style={styles.linkContainer}>
            <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/join')}>
                <Ionicons name="key-outline" size={18} color="#2563eb" />
                <Text style={styles.linkText}>Έχω κωδικό πρόσκλησης</Text>
            </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  appName: { fontSize: 22, fontWeight: 'bold', color: '#1e3a8a' },
  greeting: { fontSize: 16, color: '#64748b', marginTop: 2 },
  profileButton: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, gap: 15, paddingBottom: 50 },
  instruction: { fontSize: 18, color: '#334155', marginBottom: 10, fontWeight: '600' },
  bigCard: { padding: 20, borderRadius: 20, height: 120, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  listCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1' }, 
  createCard: { backgroundColor: '#2563eb' }, 
  iconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 2 },
  cardSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },
  linkContainer: { marginTop: 20, alignItems: 'center' },
  linkButton: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  linkText: { color: '#2563eb', fontWeight: 'bold', fontSize: 16, marginLeft: 8, textDecorationLine: 'underline' },
});