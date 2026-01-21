import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// FIREBASE
import { onAuthStateChanged } from "firebase/auth";
import {
    arrayUnion,
    collection,
    deleteDoc,
    doc,
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

  // 1. ΕΛΕΓΧΟΣ ΣΥΝΔΕΣΗΣ
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        Alert.alert("Προσοχή", "Πρέπει να συνδεθείτε πρώτα.", [
          { text: "OK", onPress: () => router.replace("/") },
        ]);
      } else {
        setCheckingAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. ΑΥΤΟΜΑΤΗ ΣΥΜΠΛΗΡΩΣΗ
  useEffect(() => {
    if (inviteCode) {
      setCode(String(inviteCode).toUpperCase());
    } else if (paramCode) {
      setCode(String(paramCode).toUpperCase());
    }
  }, [inviteCode, paramCode]);

  const handleJoin = async () => {
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

      const inviteDoc = snapshot.docs[0];
      const inviteData = inviteDoc.data();

      // Έλεγχος Λήξης (2 λεπτά)
      const now = new Date();
      const createdAt = inviteData.createdAt?.toDate();

      if (createdAt) {
        const diffInSeconds = (now.getTime() - createdAt.getTime()) / 1000;
        if (diffInSeconds > 120) {
          await deleteDoc(inviteDoc.ref);
          Alert.alert("Έληξε", "Ο κωδικός έληξε. Ζητήστε νέο.");
          setLoading(false);
          return;
        }
      }

      // ΕΓΓΡΑΦΗ
      const teamRef = doc(db, "teams", inviteData.teamId);
      await updateDoc(teamRef, {
        memberIds: arrayUnion(userId),
        [`roles.${userId}`]: inviteData.role,
      });

      await deleteDoc(inviteDoc.ref);

      Alert.alert("Επιτυχία", "Καλωσήρθατε στην ομάδα!");
      router.replace("/dashboard");
    } catch (error: any) {
      Alert.alert("Σφάλμα", error.message);
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
              name="time-outline"
              size={16}
              color="#ef4444"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.helperText}>Ο κωδικός λήγει σε 2 λεπτά</Text>
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
    backgroundColor: "#fef2f2",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  helperText: {
    color: "#ef4444",
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
