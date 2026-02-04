import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// FIREBASE
import { onAuthStateChanged } from "firebase/auth";

// Key for storing pending invite code
const PENDING_INVITE_KEY = "@pending_invite_code";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

export default function JoinTeamScreen() {
  const router = useRouter();
  const { inviteCode, code: paramCode } = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Ref για να αποφύγουμε επαναλαμβανόμενα redirects
  const hasRedirected = useRef(false);

  // 1. ΕΛΕΓΧΟΣ ΑΝ ΕΙΝΑΙ ΣΥΝΔΕΔΕΜΕΝΟΣ
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Αποφυγή loop: redirect μόνο μία φορά
        if (!hasRedirected.current) {
          hasRedirected.current = true;

          // Αποθήκευση του invite code για μετά το login
          const pendingCode = inviteCode || paramCode;
          if (pendingCode) {
            await AsyncStorage.setItem(PENDING_INVITE_KEY, String(pendingCode).toUpperCase());
            console.log("📝 Saved pending invite code:", pendingCode);
          }

          // Redirect στο sign-in χωρίς alert (για αποφυγή loop)
          Alert.alert("Προσοχή", "Πρέπει να συνδεθείτε πρώτα για να μπείτε στην ομάδα.", [
            { text: "OK", onPress: () => router.replace("/") },
          ]);
        }
      } else {
        // Ο χρήστης είναι συνδεδεμένος
        hasRedirected.current = false;
        setCheckingAuth(false);
      }
    });
    return () => unsubscribe();
  }, [inviteCode, paramCode]);

  // 2. ΑΥΤΟΜΑΤΗ ΣΥΜΠΛΗΡΩΣΗ ΚΑΙ AUTO-JOIN ΑΠΟ LINK
  useEffect(() => {
    if (inviteCode) {
      const codeStr = String(inviteCode).toUpperCase();
      setCode(codeStr);
      // Auto-join when code comes from URL
      if (!checkingAuth && codeStr.length === 6) {
        setTimeout(() => handleJoin(), 500);
      }
    } else if (paramCode) {
      const codeStr = String(paramCode).toUpperCase();
      setCode(codeStr);
      // Auto-join when code comes from URL
      if (!checkingAuth && codeStr.length === 6) {
        setTimeout(() => handleJoin(), 500);
      }
    }
  }, [inviteCode, paramCode, checkingAuth]);

  const handleJoin = async () => {
    Keyboard.dismiss();
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return Alert.alert(
        "Offline",
        "Απαιτείται σύνδεση στο ίντερνετ για να μπείτε σε ομάδα.",
      );
    }

    if (!code || code.length < 6)
      return Alert.alert("Προσοχή", "Εισάγετε έγκυρο κωδικό.");

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    setLoading(true);
    try {
      // 1. ΨΑΧΝΟΥΜΕ ΤΟΝ ΚΩΔΙΚΟ (QUERY)
      // Επειδή στο invite.tsx χρησιμοποιείς addDoc, ο κωδικός είναι πεδίο 'code'
      const q = query(
        collection(db, "invites"),
        where("code", "==", code.trim().toUpperCase()),
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        Alert.alert("Λάθος", "Ο κωδικός δεν υπάρχει ή έχει λήξει.");
        setLoading(false);
        return;
      }

      // Πήραμε το invite
      const inviteDoc = snapshot.docs[0];
      const inviteData = inviteDoc.data();

      // 2. ΕΛΕΓΧΟΣ ΛΗΞΗΣ ΧΡΟΝΟΥ (2 ΛΕΠΤΑ)
      // Αν θες να το βγάλεις, σβήσε αυτό το if block
      const now = new Date();
      const createdAt = inviteData.createdAt?.toDate();
      if (createdAt) {
        const diffInSeconds = (now.getTime() - createdAt.getTime()) / 1000;
        if (diffInSeconds > 120) {
          // 120 δευτερόλεπτα = 2 λεπτά
          await deleteDoc(inviteDoc.ref); // Σβήνουμε το ληγμένο
          Alert.alert("Έληξε", "Ο κωδικός έχει λήξει.");
          setLoading(false);
          return;
        }
      }

      const teamId = inviteData.teamId;

      // 3. ΕΛΕΓΧΟΣ ΑΝ ΕΙΝΑΙ ΗΔΗ ΜΕΛΟΣ
      const teamRef = doc(db, "teams", teamId);
      const teamSnap = await getDoc(teamRef);

      if (teamSnap.exists() && teamSnap.data().memberIds?.includes(userId)) {
        Alert.alert("Είστε ήδη μέλος", "Ανήκετε ήδη σε αυτή την ομάδα.");
        // Σβήνουμε το invite για να μην μείνει "σκουπίδι"
        await deleteDoc(inviteDoc.ref);
        router.replace("/dashboard");
        return;
      }

      // 4. ΕΓΓΡΑΦΗ ΜΕ ΤΟΝ ΣΩΣΤΟ ΡΟΛΟ
      // Εδώ διαβάζουμε το role που έφτιαξες στο invite.tsx
      const assignedRole = inviteData.role || "User";

      await updateDoc(teamRef, {
        memberIds: arrayUnion(userId),
        [`roles.${userId}`]: assignedRole, // <--- ΕΔΩ ΜΠΑΙΝΕΙ Ο ΡΟΛΟΣ
      });

      // 5. ΔΙΑΓΡΑΦΗ ΤΟΥ ΚΩΔΙΚΟΥ (ΜΙΑΣ ΧΡΗΣΗΣ)
      await deleteDoc(inviteDoc.ref);

      Alert.alert(
        "Επιτυχία",
        `Καλωσήρθατε στην ομάδα "${inviteData.teamName}" ως ${assignedRole}!`,
      );
      router.replace("/dashboard");
    } catch (error: any) {
      console.log("Join Error:", error);
      Alert.alert("Σφάλμα", "Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Είσοδος με Κωδικό</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.content}>
            <View style={styles.iconBox}>
              <Ionicons name="enter" size={48} color="#2563eb" />
            </View>

            <Text style={styles.label}>Εισάγετε τον 6ψήφιο κωδικό:</Text>

            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="XXXXXX"
              placeholderTextColor="#cbd5e1"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus={!inviteCode}
            />

            <View style={styles.helperContainer}>
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color="#64748b"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.helperText}>
                Ο κωδικός ισχύει για μία χρήση
              </Text>
            </View>

            <TouchableOpacity
              style={styles.btn}
              onPress={handleJoin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.btnText}>Είσοδος στην Ομάδα</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },

  header: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },

  content: {
    flex: 1,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
  },

  iconBox: {
    width: 80,
    height: 80,
    backgroundColor: "#eff6ff",
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "#dbeafe",
  },

  label: {
    fontWeight: "600",
    marginBottom: 16,
    color: "#334155",
    fontSize: 16,
  },

  input: {
    borderWidth: 2,
    borderColor: "#2563eb",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 32,
    textAlign: "center",
    letterSpacing: 8,
    fontWeight: "800",
    color: "#0f172a",
    width: "100%",
    marginBottom: 16,
    backgroundColor: "#ffffff",
    shadowColor: "#2563eb",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },

  helperContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
    backgroundColor: "#f8fafc",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  helperText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
  },

  btn: {
    backgroundColor: "#2563eb",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 18,
  },
});
