import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

const PROFILE_CACHE_KEY = "user_profile_data_cache";

export default function LoginScreen() {
  const router = useRouter();
  const [isRegistering, setIsRegistering] = useState(false);

  const [fullname, setFullname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const getFriendlyError = (errorMsg: string) => {
    if (errorMsg.includes("invalid-email")) return "Το email δεν είναι έγκυρο.";
    if (errorMsg.includes("user-not-found"))
      return "Δεν βρέθηκε χρήστης με αυτό το email.";
    if (errorMsg.includes("wrong-password")) return "Λάθος κωδικός πρόσβασης.";
    if (errorMsg.includes("email-already-in-use"))
      return "Το email χρησιμοποιείται ήδη.";
    if (errorMsg.includes("weak-password"))
      return "Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.";
    if (errorMsg.includes("network-request-failed"))
      return "Πρόβλημα σύνδεσης στο ίντερνετ.";
    return errorMsg;
  };

  const handleAuth = async () => {
    if (!email || !password)
      return Alert.alert("Προσοχή", "Συμπληρώστε Email και Κωδικό.");
    if (isRegistering && !fullname.trim())
      return Alert.alert("Προσοχή", "Το Όνομα είναι απαραίτητο.");

    setLoading(true);
    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const user = userCredential.user;

        await updateProfile(user, { displayName: fullname });

        const userData = {
          fullname: fullname,
          email: email.toLowerCase(),
          createdAt: new Date().toISOString(),
          phone: "",
          avatar: null,
        };

        await setDoc(doc(db, "users", user.uid), userData);
        await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(userData));

        router.replace("/dashboard");
      } else {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const user = userCredential.user;

        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
          }
        } catch (e) {
          console.log("Offline login (cache update skipped)");
        }

        router.replace("/dashboard");
      }
    } catch (error: any) {
      Alert.alert("Σφάλμα", getFriendlyError(error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>
              {isRegistering ? "Δημιουργία Λογαριασμού" : "Καλωσήρθατε"}
            </Text>
            <Text style={styles.subtitle}>
              {isRegistering
                ? "Συμπληρώστε τα στοιχεία σας για να ξεκινήσετε."
                : "Συνδεθείτε για να συνεχίσετε."}
            </Text>
          </View>

          <View style={styles.form}>
            {isRegistering && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Ονοματεπώνυμο</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color="#64748b"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={fullname}
                    onChangeText={setFullname}
                    placeholder="Π.χ. Γιάννης Παπαδόπουλος"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color="#64748b"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="name@example.com"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Κωδικός</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#64748b"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="******"
                  placeholderTextColor="#94a3b8"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={handleAuth}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.btnText}>
                  {isRegistering ? "Εγγραφή" : "Είσοδος"}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.toggleContainer}>
              <Text style={{ color: "#64748b" }}>
                {isRegistering
                  ? "Έχετε ήδη λογαριασμό;"
                  : "Δεν έχετε λογαριασμό;"}
              </Text>
              <TouchableOpacity
                onPress={() => setIsRegistering(!isRegistering)}
              >
                <Text style={styles.toggleText}>
                  {isRegistering ? " Σύνδεση" : " Εγγραφή"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
  },
  backBtn: {
    marginBottom: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    justifyContent: "center", // Κάθετο κεντράρισμα
    alignItems: "center", // Οριζόντιο κεντράρισμα (Αυτό έλειπε)
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#64748b",
    lineHeight: 22,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    height: 56,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#0f172a",
    height: "100%",
  },
  eyeIcon: {
    padding: 8,
  },
  btnPrimary: {
    backgroundColor: "#2563eb",
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
  },
  toggleText: {
    color: "#2563eb",
    fontWeight: "bold",
    marginLeft: 5,
  },
});
