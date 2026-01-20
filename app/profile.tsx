import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context"; // <--- Χρήση του Insets

// FIREBASE
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

import InputModal from "./components/InputModal";

const PROFILE_CACHE_KEY = "user_profile_data_cache";

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // <--- Για σωστό περιθώριο πάνω

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [isOffline, setIsOffline] = useState(false);

  // Edit States
  const [modalVisible, setModalVisible] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editField, setEditField] = useState<"fullname" | "phone">("fullname");

  // 1. INITIAL LOAD (CACHE FIRST)
  useEffect(() => {
    const initLoad = async () => {
      try {
        // Φόρτωση από Cache για άμεση εμφάνιση
        const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
        if (cached) {
          setUserData(JSON.parse(cached));
        }

        const net = await Network.getNetworkStateAsync();
        if (!net.isConnected || !net.isInternetReachable) {
          setIsOffline(true);
        }
      } catch (e) {
        console.log(e);
      }
      setLoading(false);
    };
    initLoad();
  }, []);

  // 2. LISTENER ΓΙΑ REALTIME ΑΛΛΑΓΕΣ
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const unsubscribeSnapshot = onSnapshot(
          userRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const fullData = { ...data, email: user.email };

              // Ενημέρωση State
              setUserData(fullData);

              // Ενημέρωση Cache (ΠΑΝΤΑ)
              AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(fullData));
            }
            setLoading(false);
          },
          (error) => {
            console.log("Offline mode, keeping cached data.");
            setIsOffline(true);
            setLoading(false);
          },
        );
        return () => unsubscribeSnapshot();
      } else {
        router.replace("/");
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // --- ACTIONS ---

  const handleLogout = async () => {
    Alert.alert("Αποσύνδεση", "Είστε σίγουροι;", [
      { text: "Άκυρο", style: "cancel" },
      {
        text: "Ναι, Αποσύνδεση",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);

            // ⚠️ SECURITY FIX: Καθαρίζουμε ΤΑ ΠΑΝΤΑ (Projects, Teams, Profile, Queues)
            // Για να μην δει ο επόμενος χρήστης τα δεδομένα του προηγούμενου.
            await AsyncStorage.clear();

            router.replace("/");
          } catch (error: any) {
            Alert.alert("Σφάλμα", error.message);
          }
        },
      },
    ]);
  };

  const openEdit = async (
    field: "fullname" | "phone",
    currentValue: string,
  ) => {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) {
      Alert.alert("Offline", "Δεν μπορείτε να κάνετε αλλαγές χωρίς ίντερνετ.");
      return;
    }
    setEditField(field);
    setEditValue(currentValue || "");
    setModalVisible(true);
  };

  const saveEdit = async () => {
    if (!auth.currentUser || !userData) return;

    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) return Alert.alert("Σφάλμα", "Χάθηκε η σύνδεση.");

    // 1. Ενημέρωση UI ΑΜΕΣΩΣ (Optimistic Update)
    const updatedData = { ...userData, [editField]: editValue };
    setUserData(updatedData);
    setModalVisible(false);

    // 2. Ενημέρωση Cache ΑΜΕΣΩΣ
    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(updatedData));

    // 3. Ενημέρωση Firebase (Στο παρασκήνιο)
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { [editField]: editValue });
    } catch (error: any) {
      Alert.alert(
        "Σφάλμα",
        "Η αποθήκευση στο cloud απέτυχε, αλλά κρατήθηκε τοπικά.",
      );
    }
  };

  if (loading && !userData)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Το Προφίλ μου</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* AVATAR */}
        <View style={styles.avatarSection}>
          <View
            style={[
              styles.avatarContainer,
              isOffline && { backgroundColor: "#94a3b8" },
            ]}
          >
            <Text style={styles.avatarText}>
              {userData?.fullname
                ? userData.fullname.charAt(0).toUpperCase()
                : "U"}
            </Text>
          </View>
          <Text style={styles.nameText}>{userData?.fullname || "Χρήστης"}</Text>
          <Text style={styles.emailText}>{userData?.email}</Text>

          {isOffline && (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline" size={12} color="white" />
              <Text style={styles.offlineText}>Offline Mode</Text>
            </View>
          )}
        </View>

        {/* INFO FORM */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Στοιχεία</Text>

          {/* ΟΝΟΜΑ */}
          <TouchableOpacity
            style={styles.row}
            onPress={() => openEdit("fullname", userData?.fullname)}
            disabled={isOffline}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="person-outline" size={20} color="#64748b" />
            </View>
            <View style={styles.rowData}>
              <Text style={styles.label}>Ονοματεπώνυμο</Text>
              <Text style={styles.value}>{userData?.fullname || "-"}</Text>
            </View>
            {!isOffline && <Ionicons name="pencil" size={18} color="#2563eb" />}
          </TouchableOpacity>

          {/* ΤΗΛΕΦΩΝΟ */}
          <TouchableOpacity
            style={styles.row}
            onPress={() => openEdit("phone", userData?.phone)}
            disabled={isOffline}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="call-outline" size={20} color="#64748b" />
            </View>
            <View style={styles.rowData}>
              <Text style={styles.label}>Τηλέφωνο</Text>
              <Text
                style={[
                  styles.value,
                  !userData?.phone && { color: "#94a3b8", fontStyle: "italic" },
                ]}
              >
                {userData?.phone ? userData.phone : "Πατήστε για προσθήκη"}
              </Text>
            </View>
            {!isOffline && <Ionicons name="pencil" size={18} color="#2563eb" />}
          </TouchableOpacity>

          {/* EMAIL (Read Only) */}
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="mail-outline" size={20} color="#64748b" />
            </View>
            <View style={styles.rowData}>
              <Text style={styles.label}>Email</Text>
              <Text style={[styles.value, { color: "#94a3b8" }]}>
                {userData?.email}
              </Text>
            </View>
            <Ionicons name="lock-closed-outline" size={18} color="#cbd5e1" />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#ef4444" />
          <Text style={styles.logoutText}>Αποσύνδεση</Text>
        </TouchableOpacity>
      </ScrollView>

      <InputModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={saveEdit}
        title={
          editField === "fullname" ? "Αλλαγή Ονόματος" : "Αλλαγή Τηλεφώνου"
        }
        value={editValue}
        onChangeText={setEditValue}
        placeholder={editField === "phone" ? "69..." : "Ονοματεπώνυμο"}
        keyboardType={editField === "phone" ? "phone-pad" : "default"}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#0f172a" },
  content: { padding: 20 },
  avatarSection: { alignItems: "center", marginBottom: 25 },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    elevation: 5,
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  avatarText: { fontSize: 36, color: "white", fontWeight: "bold" },
  nameText: { fontSize: 20, fontWeight: "bold", color: "#1e293b" },
  emailText: { fontSize: 14, color: "#64748b" },
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#64748b",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  offlineText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
    marginLeft: 4,
  },
  section: {
    backgroundColor: "white",
    borderRadius: 16,
    paddingVertical: 10,
    elevation: 2,
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#94a3b8",
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowIcon: { width: 30, alignItems: "center", marginRight: 10 },
  rowData: { flex: 1 },
  label: { fontSize: 12, color: "#64748b", marginBottom: 2 },
  value: { fontSize: 16, color: "#1e293b", fontWeight: "500" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    marginTop: 10,
  },
  logoutText: {
    color: "#ef4444",
    fontWeight: "bold",
    fontSize: 16,
    marginLeft: 10,
  },
});
