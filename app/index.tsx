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
  
  // 1. ΕΛΕΓΧΟΣ DEEP LINK (Για να ανοίγει η πρόσκληση)
  const url = Linking.useURL(); 
  
  useEffect(() => {
    if (url) {
      // Ψάχνουμε για inviteCode ή code μέσα στο Link
      // Καλύπτει και το teamcamera://... και το exp://...
      const regex = /[?&](inviteCode|code)=([^&#]+)/;
      const match = url.match(regex);
      
      if (match && match[2]) {
        // Αν βρει κωδικό, περιμένουμε λίγο να φορτώσει η εφαρμογή και πάμε στο Join
        // Στέλνουμε inviteCode για να ταιριάζει με το join.tsx
        setTimeout(() => {
            router.push(`/join?inviteCode=${match[2]}`);
        }, 500);
      }
    }
  }, [url]);

  // 2. ΕΛΕΓΧΟΣ ΑΝ ΕΙΝΑΙ ΗΔΗ ΣΥΝΔΕΔΕΜΕΝΟΣ
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Αν βρούμε χρήστη, κάνουμε REPLACE για να μην μπορεί να πατήσει Back και να γυρίσει εδώ
        router.replace('/dashboard');
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
      return (
        <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563eb"/>
            <Text style={{marginTop: 10, color: '#666'}}>Φόρτωση...</Text>
        </View>
      );
  }

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

      {/* ΚΟΥΜΠΙ ΕΝΕΡΓΕΙΑΣ */}
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