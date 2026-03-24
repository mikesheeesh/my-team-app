import { useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
} from "react-native";
import { auth, db } from "../firebaseConfig";

// Keep splash screen until we're ready
SplashScreen.preventAutoHideAsync();

export default function LandingScreen() {
  const router = useRouter();
  const [showLoading, setShowLoading] = useState(true);
  const pendingNavRef = useRef<(() => void) | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // 1. AUTH CHECK — decide where to navigate
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const teamsSnap = await getDocs(
            query(
              collection(db, "teams"),
              where("memberIds", "array-contains", user.uid),
            ),
          );
          if (teamsSnap.empty) {
            pendingNavRef.current = () => router.replace("/join-request");
          } else {
            pendingNavRef.current = () => router.replace("/dashboard");
          }
        } catch (e) {
          // Offline fallback — go to dashboard, it will handle auth
          pendingNavRef.current = () => router.replace("/dashboard");
        }
      } else {
        pendingNavRef.current = () => router.replace("/login");
      }

      await SplashScreen.hideAsync();
    });

    return () => unsubscribe();
  }, []);

  // 2. OTA UPDATE CHECK
  useEffect(() => {
    if (Platform.OS === "web") return;
    const checkForUpdate = async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        console.log("Update check failed:", e);
      }
    };
    checkForUpdate();
  }, []);

  // 3. LOADING SCREEN — 2s then fade and navigate
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setShowLoading(false);
        if (pendingNavRef.current) {
          pendingNavRef.current();
        }
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <Image
        source={require("../assets/logo2.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.version}>v2.5.0</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 250,
    height: 250,
  },
  version: {
    position: "absolute",
    bottom: 60,
    color: "#0f172a",
    fontSize: 12,
  },
});
