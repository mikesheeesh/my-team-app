import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

export default function CreateTeamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [teamName, setTeamName] = useState("");
  const [teamType, setTeamType] = useState("");
  const [teamEmail, setTeamEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateGmail = async () => {
    await WebBrowser.openBrowserAsync("https://accounts.google.com/signup");
  };

  const handleCreateTeam = async () => {
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected) {
      Alert.alert(
        "Δεν υπάρχει σύνδεση",
        "Για να δημιουργήσετε νέα ομάδα πρέπει να είστε συνδεδεμένοι στο ίντερνετ.",
      );
      return;
    }

    if (teamName.trim().length === 0)
      return Alert.alert("Προσοχή", "Δώστε ένα όνομα στην ομάδα.");
    if (teamType.trim().length === 0)
      return Alert.alert("Προσοχή", "Δώστε το αντικείμενο εργασιών.");

    // Έλεγχος email
    if (teamEmail.trim().length === 0)
      return Alert.alert("Προσοχή", "Το email ομάδας είναι υποχρεωτικό.");
    if (!teamEmail.includes("@"))
      return Alert.alert("Προσοχή", "Εισάγετε ένα έγκυρο email.");

    const user = auth.currentUser;
    if (!user)
      return Alert.alert("Σφάλμα", "Δεν βρέθηκε συνδεδεμένος χρήστης.");

    setLoading(true);

    try {
      await addDoc(collection(db, "teams"), {
        name: teamName,
        type: teamType,
        contactEmail: teamEmail,
        createdAt: serverTimestamp(),
        memberIds: [user.uid],
        roles: {
          [user.uid]: "Founder",
        },
        groups: [],
      });

      router.replace("/dashboard");
    } catch (error: any) {
      Alert.alert("Σφάλμα", "Η δημιουργία απέτυχε: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Νέα Ομάδα</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Όνομα Ομάδας</Text>
            <TextInput
              style={styles.input}
              placeholder="π.χ. Omega Constructions"
              placeholderTextColor="#9ca3af"
              value={teamName}
              onChangeText={setTeamName}
              autoFocus
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Αντικείμενο Εργασιών</Text>
            <TextInput
              style={styles.input}
              placeholder="π.χ. Κατασκευαστική, Αρχιτεκτονικό Γραφείο"
              placeholderTextColor="#9ca3af"
              value={teamType}
              onChangeText={setTeamType}
            />
          </View>

          <View style={styles.spacer} />

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="mail" size={20} color="#2563eb" />
              <Text style={styles.cardTitle}>Email Ομάδας (Υποχρεωτικό)</Text>
            </View>
            <Text style={styles.helperText}>
              Εισάγετε ένα email επικοινωνίας για την ομάδα σας.
            </Text>

            <TextInput
              style={[styles.input, { marginBottom: 12 }]}
              placeholder="π.χ. info@company.com"
              placeholderTextColor="#9ca3af"
              value={teamEmail}
              onChangeText={setTeamEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={styles.outlineButton}
              onPress={handleCreateGmail}
            >
              <Ionicons name="logo-google" size={16} color="#374151" />
              <Text style={styles.outlineButtonText}>
                Δημιουργία νέου Gmail
              </Text>
              <Ionicons name="open-outline" size={16} color="#374151" />
            </TouchableOpacity>

            {teamEmail.length > 0 && teamEmail.includes("@") && (
              <>
                <Text style={[styles.label, { marginTop: 15 }]}>
                  Επιλεγμένο Email
                </Text>
                <View style={styles.selectedEmailBox}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.selectedEmailText}>{teamEmail}</Text>
                </View>
              </>
            )}
          </View>

          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateTeam}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.createButtonText}>Δημιουργία Ομάδας</Text>
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color="white"
                  style={{ marginLeft: 8 }}
                />
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 15,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },

  content: { padding: 24, paddingBottom: 50 },

  formGroup: { marginBottom: 20 },
  label: { fontWeight: "600", color: "#374151", marginBottom: 8, fontSize: 14 },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#111827",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  spacer: { height: 20 },

  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
  },
  helperText: {
    color: "#6b7280",
    marginBottom: 20,
    fontSize: 13,
    lineHeight: 20,
  },
  outlineButton: {
    backgroundColor: "white",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  outlineButtonText: {
    color: "#374151",
    fontWeight: "600",
    fontSize: 14,
  },
  selectedEmailBox: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#86efac",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectedEmailText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#166534",
    flex: 1,
  },

  createButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 18,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  createButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 18,
  },
});
