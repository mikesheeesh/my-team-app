import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// FIREBASE IMPORTS (Για να αποθηκεύσουμε κατευθείαν εδώ)
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

export default function CreateTeamScreen() {
  const router = useRouter();
  
  const [teamName, setTeamName] = useState('');
  const [teamType, setTeamType] = useState('');
  const [teamEmail, setTeamEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateGmail = async () => {
    await WebBrowser.openBrowserAsync('https://accounts.google.com/signup');
  };

  const handleCreateTeam = async () => {
    // 1. Έλεγχοι
    if (teamName.trim().length === 0) return Alert.alert("Προσοχή", "Δώστε ένα όνομα στην ομάδα.");
    if (teamType.trim().length === 0) return Alert.alert("Προσοχή", "Δώστε το αντικείμενο εργασιών.");
    // Το email είναι προαιρετικό, αλλά αν το βάλει πρέπει να είναι σωστό
    if (teamEmail.trim().length > 0 && !teamEmail.includes('@')) return Alert.alert("Προσοχή", "Συνδέστε ένα έγκυρο Team Gmail.");

    const user = auth.currentUser;
    if (!user) return Alert.alert("Σφάλμα", "Δεν βρέθηκε συνδεδεμένος χρήστης.");

    setLoading(true);

    try {
      // 2. Αποθήκευση στο Firebase (Firestore)
      await addDoc(collection(db, "teams"), {
        name: teamName,
        type: teamType,
        contactEmail: teamEmail,
        createdAt: serverTimestamp(),
        
        // Σε βάζουμε κατευθείαν ως Founder
        memberIds: [user.uid],
        roles: {
          [user.uid]: 'Founder' 
        },
        groups: [] // Ξεκινάει χωρίς projects
      });

      // 3. Τέλος! Πάμε Dashboard
      router.replace('/dashboard');

    } catch (error: any) {
      Alert.alert("Σφάλμα", "Η δημιουργία απέτυχε: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        {/* Αφαιρέθηκε το "Βήμα 1/2" */}
        <Text style={styles.headerTitle}>Νέα Ομάδα</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* TEAM NAME */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Όνομα Ομάδας</Text>
          <TextInput
            style={styles.input}
            placeholder="π.χ. Omega Constructions"
            value={teamName}
            onChangeText={setTeamName}
            autoFocus
          />
        </View>

        {/* TEAM TYPE */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Αντικείμενο Εργασιών</Text>
          <TextInput
            style={styles.input}
            placeholder="π.χ. Κατασκευαστική, Αρχιτεκτονικό Γραφείο"
            value={teamType}
            onChangeText={setTeamType}
          />
        </View>

        <View style={styles.separator} />

        <Text style={styles.label}>Λογαριασμός Gmail Ομάδας (Προαιρετικό)</Text>
        <Text style={styles.helperText}>
          Χρήσιμο για τη διαχείριση αρχείων της ομάδας.
        </Text>

        <View style={styles.gmailOptions}>
          <TouchableOpacity style={styles.optionButton} onPress={handleCreateGmail}>
            <Ionicons name="logo-google" size={20} color="#db4437" />
            <Text style={styles.optionText}>Δημιουργία Gmail</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, {marginTop: 20}]}>Σύνδεση Λογαριασμού</Text>
        <TextInput
          style={styles.input}
          placeholder="omega.constructions@gmail.com"
          value={teamEmail}
          onChangeText={setTeamEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        
        {/* ΚΟΥΜΠΙ ΔΗΜΙΟΥΡΓΙΑΣ */}
        <TouchableOpacity style={styles.createButton} onPress={handleCreateTeam} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
                <Text style={styles.createButtonText}>Δημιουργία Ομάδας</Text>
                <Ionicons name="checkmark-circle" size={24} color="white" style={{marginLeft: 10}} />
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
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  content: { padding: 20 },
  formGroup: { marginBottom: 20 },
  label: { fontWeight: 'bold', color: '#374151', marginBottom: 8, fontSize: 16 },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 15, fontSize: 16, color: '#111827' },
  separator: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 20 },
  helperText: { color: '#6b7280', marginBottom: 15, fontSize: 14 },
  gmailOptions: { flexDirection: 'row', gap: 10 },
  optionButton: { flex: 1, backgroundColor: 'white', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  optionText: { color: '#374151', fontWeight: 'bold' },
  createButton: { backgroundColor: '#2563eb', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 40, elevation: 5 },
  createButtonText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
});