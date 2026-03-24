import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useRouter } from "expo-router";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";
import { showAlert } from "./context/AlertContext";

if (Platform.OS !== "web") {
  GoogleSignin.configure({
    webClientId:
      "1066934665062-58dao455r4etr1ublg2tthmrj89c8a1j.apps.googleusercontent.com",
  });
}

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePostSignIn = async (user: any) => {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        fullname: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || null,
        createdAt: new Date().toISOString(),
        phone: "",
      });
    }
    const teamsSnap = await getDocs(
      query(
        collection(db, "teams"),
        where("memberIds", "array-contains", user.uid),
      ),
    );
    if (teamsSnap.empty) {
      router.replace("/join-request");
    } else {
      router.replace("/teams/my-teams");
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      if (Platform.OS === "web") {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        await handlePostSignIn(result.user);
        return;
      }

      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken =
        signInResult.data?.idToken ?? (signInResult as any).idToken;
      if (!idToken) throw new Error("No ID token received from Google.");
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      await handlePostSignIn(result.user);
    } catch (error: any) {
      if (
        error.code !== "SIGN_IN_CANCELLED" &&
        error.code !== "12501"
      ) {
        showAlert("Σφάλμα", `Σφάλμα: ${error.code || error.message}`);
        console.log("Google Sign-In error:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require("../assets/logo2.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>Ergon Work Management</Text>
        <Text style={styles.subtitle}>
          Συνδεθείτε με τον λογαριασμό Google σας για να συνεχίσετε.
        </Text>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <View style={styles.googleIconBox}>
                <Text style={styles.googleG}>G</Text>
              </View>
              <Text style={styles.googleButtonText}>Σύνδεση με Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      <Text style={styles.version}>v2.5.0</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  logo: {
    width: 180,
    height: 180,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1e3a8a",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 48,
    paddingHorizontal: 16,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4285F4",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    justifyContent: "center",
    shadowColor: "#4285F4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
    gap: 12,
  },
  googleIconBox: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  googleG: {
    fontSize: 16,
    fontWeight: "800",
    color: "#4285F4",
  },
  googleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  version: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    fontSize: 12,
    color: "#94a3b8",
  },
});
