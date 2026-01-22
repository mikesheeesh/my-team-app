import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// FIREBASE
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

export default function DashboardScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState("Φόρτωση...");
  const [loading, setLoading] = useState(true);

  // 1. ΔΙΑΧΕΙΡΙΣΗ ΚΟΥΜΠΙΟΥ "ΠΙΣΩ" (Λογική Άθικτη)
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        BackHandler.exitApp();
        return true;
      };
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => subscription.remove();
    }, []),
  );

  // 2. AUTH & DATA LISTENER (Λογική Άθικτη)
  useFocusEffect(
    useCallback(() => {
      const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
          const userRef = doc(db, "users", user.uid);
          const unsubscribeUser = onSnapshot(
            userRef,
            (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data();
                setUserName(data.fullname || user.displayName || "Χρήστης");
              } else {
                setUserName(user.displayName || "Χρήστης");
              }
              setLoading(false);
            },
            (error) => {
              console.log("Dashboard User Error:", error);
              setLoading(false);
            },
          );
          return () => unsubscribeUser();
        } else {
          router.replace("/");
        }
      });
      return () => unsubscribeAuth();
    }, []),
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: "#f8fafc" }]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>Ergon Work Management</Text>
          <Text style={styles.greeting}>Γεια σου, {userName}!</Text>
        </View>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push("/profile")}
        >
          <Ionicons name="person-circle-outline" size={48} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>Ενέργειες</Text>

        {/* 1. ΟΙ ΟΜΑΔΕΣ ΜΟΥ (Λευκή Κάρτα) */}
        <TouchableOpacity
          style={[styles.card, styles.cardWhite]}
          onPress={() => router.push("/teams/my-teams")}
          activeOpacity={0.8}
        >
          <View style={[styles.iconCircle, { backgroundColor: "#e0f2fe" }]}>
            <Ionicons name="people" size={28} color="#0284c7" />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: "#0f172a" }]}>
              Οι Ομάδες μου
            </Text>
            <Text style={[styles.cardSubtitle, { color: "#64748b" }]}>
              Δείτε έργα & αναθέσεις
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#cbd5e1" />
        </TouchableOpacity>

        {/* 2. ΔΗΜΙΟΥΡΓΙΑ ΟΜΑΔΑΣ (Μπλε Κάρτα - Primary) */}
        <TouchableOpacity
          style={[styles.card, styles.cardBlue]}
          onPress={() => router.push("/onboarding/create-team")}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: "rgba(255,255,255,0.2)" },
            ]}
          >
            <Ionicons name="add" size={32} color="#ffffff" />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={[styles.cardTitle, { color: "#ffffff" }]}>
              Δημιουργία Ομάδας
            </Text>
            <Text
              style={[styles.cardSubtitle, { color: "rgba(255,255,255,0.9)" }]}
            >
              Για Ιδρυτές / Managers
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={24}
            color="rgba(255,255,255,0.6)"
          />
        </TouchableOpacity>

        {/* 3. JOIN WITH CODE */}
        <View style={styles.linkContainer}>
          <Text style={styles.linkHint}>Έλαβες πρόσκληση;</Text>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push("/join")}
          >
            <Ionicons name="key-outline" size={20} color="#2563eb" />
            <Text style={styles.linkText}>Εισαγωγή Κωδικού</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // HEADER STYLES
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
  },
  appName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1e3a8a", // Dark Blue
    letterSpacing: -0.5,
  },
  greeting: {
    fontSize: 15,
    color: "#64748b", // Slate 500
    marginTop: 4,
    fontWeight: "500",
  },
  profileButton: {
    // Touch target optimization
    padding: 4,
  },

  // CONTENT STYLES
  content: {
    padding: 24,
    paddingBottom: 50,
  },
  sectionHeader: {
    fontSize: 18,
    color: "#334155", // Slate 700
    marginBottom: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  // CARD BASE STYLE
  card: {
    padding: 20,
    borderRadius: 20,
    height: 110,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,

    // Shadows
    shadowColor: "#64748b",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },

  // CARD VARIANTS
  cardWhite: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardBlue: {
    backgroundColor: "#2563eb", // Brand Blue
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
  },

  // CARD ELEMENTS
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: "500",
  },

  // LINK SECTION
  linkContainer: {
    marginTop: 24,
    alignItems: "center",
    paddingVertical: 20,
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  linkHint: {
    fontSize: 14,
    color: "#94a3b8",
    marginBottom: 8,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#eff6ff",
    borderRadius: 30,
  },
  linkText: {
    color: "#2563eb",
    fontWeight: "700",
    fontSize: 16,
    marginLeft: 8,
  },
});
