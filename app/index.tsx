import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

// Κρατάμε το Splash Screen μέχρι να φορτώσουμε
SplashScreen.preventAutoHideAsync();

export default function LandingScreen() {
  const router = useRouter();
  const [appIsReady, setAppIsReady] = useState(false);

  // 1. DEEP LINK CHECK
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

  // 2. AUTH CHECK & SPLASH SCREEN HIDE
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Αν είναι ήδη συνδεδεμένος, πάμε Dashboard
        router.replace("/dashboard");
      } else {
        // Αν όχι, δείχνουμε αυτή τη σελίδα
        setAppIsReady(true);
      }

      // Κρύβουμε το Splash Screen
      await new Promise((resolve) => setTimeout(resolve, 500));
      await SplashScreen.hideAsync();
    });

    return () => unsubscribe();
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      <View style={styles.content}>
        {/* LOGO IMAGE */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/logo2.png")}
            style={styles.customLogo}
            resizeMode="contain"
          />
        </View>

        {/* TITLE */}
        <View style={styles.textContainer}>
          <Text style={styles.titleMain}>ERGON</Text>
          <Text style={styles.titleSub}>WORK MANAGEMENT</Text>
        </View>

        {/* BUTTON */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push("/login")}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Σύνδεση / Εγγραφή</Text>
          <Ionicons
            name="arrow-forward"
            size={20}
            color="white"
            style={{ marginLeft: 10 }}
          />
        </TouchableOpacity>
      </View>

      {/* VERSION FOOTER */}
      <Text style={styles.version}>v1.0.0</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },

  // Logo Styles
  logoContainer: {
    marginBottom: 20,
    alignItems: "center",
    // Αφαιρέσαμε τα shadows του container για να μην φαίνονται άσχημα γύρω από διαφανές PNG
  },
  customLogo: {
    width: 160, // Προσαρμογή μεγέθους
    height: 160,
  },

  // Text Styles
  textContainer: {
    alignItems: "center",
    marginBottom: 60,
  },
  titleMain: {
    fontSize: 36,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 2,
  },
  titleSub: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 3,
    marginTop: 5,
  },

  // Button Styles
  primaryButton: {
    width: "100%",
    height: 56,
    backgroundColor: "#2563eb",
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  version: {
    textAlign: "center",
    color: "#cbd5e1",
    fontSize: 12,
    marginBottom: 20,
  },
});
