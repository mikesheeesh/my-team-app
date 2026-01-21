import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

export default function LandingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // 1. ΕΛΕΓΧΟΣ DEEP LINK (Logic Unchanged)
  const url = Linking.useURL();

  useEffect(() => {
    if (url) {
      const regex = /[?&](inviteCode|code)=([^&#]+)/;
      const match = url.match(regex);

      if (match && match[2]) {
        setTimeout(() => {
          router.push(`/join?inviteCode=${match[2]}`);
        }, 500);
      }
    }
  }, [url]);

  // 2. ΕΛΕΓΧΟΣ ΑΝ ΕΙΝΑΙ ΗΔΗ ΣΥΝΔΕΔΕΜΕΝΟΣ (Logic Unchanged)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/dashboard");
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Φόρτωση...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* SECTION 1: LOGO & BRANDING */}
      <View style={styles.logoSection}>
        <View style={styles.iconCircle}>
          <Ionicons name="camera" size={64} color="#2563eb" />
        </View>
        <Text style={styles.appName}>TeamCamera</Text>
        <Text style={styles.tagline}>Οργάνωση έργων & φωτογραφιών</Text>
      </View>

      {/* SECTION 2: ACTIONS */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push("/login")}
          activeOpacity={0.8} // Καλύτερο touch feedback
        >
          <Text style={styles.primaryButtonText}>Σύνδεση / Εγγραφή</Text>
          <Ionicons
            name="arrow-forward"
            size={20}
            color="white"
            style={styles.btnIcon}
          />
        </TouchableOpacity>

        <Text style={styles.versionText}>v1.0.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  loadingText: {
    marginTop: 16,
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "500",
  },

  // LOGO SECTION (Flex 2 to take up more upper space)
  logoSection: {
    flex: 2,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    // Soft Shadow
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  appName: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0f172a", // Slate 900 for sharper text
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: "#64748b", // Slate 500
    textAlign: "center",
    lineHeight: 24,
  },

  // ACTION SECTION (Flex 1 to push content to bottom)
  actionSection: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  primaryButton: {
    backgroundColor: "#2563eb",
    height: 56, // Standard touch target
    borderRadius: 28, // Pill shape
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",

    // Modern Shadow
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 18,
  },
  btnIcon: {
    marginLeft: 12,
  },
  versionText: {
    marginTop: 20,
    textAlign: "center",
    color: "#cbd5e1",
    fontSize: 12,
  },
});
