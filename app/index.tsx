import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';

export default function LandingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  // 1. Έλεγχος Deep Link (Αν ανοίξει από Link, το κρατάμε ώστε να δουλεύει στο background)
  const url = Linking.useURL(); 
  useEffect(() => {
    if (url) {
      const regex = /[?&]inviteCode=([^&#]+)/;
      const match = url.match(regex);
      if (match && match[1]) {
        // Αν βρει κωδικό, τον στέλνει στο Join (εκεί θα του ζητηθεί login αν δεν έχει κάνει)
        setTimeout(() => router.push(`/join?code=${match[1]}`), 500);
      }
    }
  }, [url]);

  // 2. Έλεγχος αν είναι ήδη συνδεδεμένος
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/dashboard');
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb"/></View>;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ΛΟΓΟΤΥΠΟ */}
      <View style={styles.logoSection}>
         <View style={styles.iconCircle}>
            <Ionicons name="camera" size={80} color="#2563eb" />
         </View>
         <Text style={styles.appName}>TeamCamera</Text>
         <Text style={styles.tagline}>Οργάνωση έργων & φωτογραφιών</Text>
      </View>

      {/* ΚΟΥΜΠΙ ΕΝΕΡΓΕΙΑΣ (ΜΟΝΟ ΕΝΑ ΠΛΕΟΝ) */}
      <View style={styles.content}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/login')}>
          <Text style={styles.primaryButtonText}>Σύνδεση / Εγγραφή</Text>
          <Ionicons name="arrow-forward" size={24} color="white" style={{marginLeft: 10}}/>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'space-between' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  
  logoSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  iconCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  appName: { fontSize: 36, fontWeight: 'bold', color: '#1e3a8a' },
  tagline: { fontSize: 16, color: '#64748b', marginTop: 10 },
  
  content: { padding: 30, paddingBottom: 60 },
  
  primaryButton: { backgroundColor: '#2563eb', padding: 20, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor:'#2563eb', shadowOpacity: 0.4, shadowOffset: {width:0, height:4} },
  primaryButtonText: { color: 'white', fontWeight: 'bold', fontSize: 20 },
});