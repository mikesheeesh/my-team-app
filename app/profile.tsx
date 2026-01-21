import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

import InputModal from "./components/InputModal";

const PROFILE_CACHE_KEY = "user_profile_data_cache";

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [isOffline, setIsOffline] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editField, setEditField] = useState<"fullname" | "phone">("fullname");

  useEffect(() => {
    const initLoad = async () => {
      try {
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
              setUserData(fullData);
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

  const handleLogout = async () => {
    Alert.alert("Αποσύνδεση", "Είστε σίγουροι;", [
      { text: "Άκυρο", style: "cancel" },
      {
        text: "Ναι, Αποσύνδεση",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
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

    const updatedData = { ...userData, [editField]: editValue };
    setUserData(updatedData);
    setModalVisible(false);

    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(updatedData));

    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { [editField]: editValue });
    } catch (error: any) {
      Alert.alert("Σφάλμα", "Η αποθήκευση στο cloud απέτυχε.");
    }
  };

  if (loading && !userData)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Το Προφίλ μου</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
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
            {isOffline && (
              <View style={styles.offlineBadge}>
                <Ionicons name="cloud-offline" size={14} color="#fff" />
              </View>
            )}
          </View>
          <Text style={styles.nameText}>{userData?.fullname || "Χρήστης"}</Text>
          <Text style={styles.emailText}>{userData?.email}</Text>
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => openEdit("fullname", userData?.fullname)}
            disabled={isOffline}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: "#eff6ff" }]}>
              <Ionicons name="person" size={18} color="#2563eb" />
            </View>
            <View style={styles.rowData}>
              <Text style={styles.label}>Ονοματεπώνυμο</Text>
              <Text style={styles.value}>{userData?.fullname || "-"}</Text>
            </View>
            {!isOffline && (
              <View style={styles.editBtn}>
                <Ionicons name="pencil" size={14} color="#2563eb" />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => openEdit("phone", userData?.phone)}
            disabled={isOffline}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: "#f0fdf4" }]}>
              <Ionicons name="call" size={18} color="#16a34a" />
            </View>
            <View style={styles.rowData}>
              <Text style={styles.label}>Τηλέφωνο</Text>
              <Text
                style={[
                  styles.value,
                  !userData?.phone && { color: "#94a3b8", fontStyle: "italic" },
                ]}
              >
                {userData?.phone ? userData.phone : "Προσθήκη τηλεφώνου"}
              </Text>
            </View>
            {!isOffline && (
              <View style={styles.editBtn}>
                <Ionicons name="pencil" size={14} color="#2563eb" />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={[styles.iconCircle, { backgroundColor: "#f1f5f9" }]}>
              <Ionicons name="mail" size={18} color="#64748b" />
            </View>
            <View style={styles.rowData}>
              <Text style={styles.label}>Email</Text>
              <Text style={[styles.value, { color: "#64748b" }]}>
                {userData?.email}
              </Text>
            </View>
            <Ionicons name="lock-closed" size={16} color="#cbd5e1" />
          </View>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutText}>Αποσύνδεση</Text>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
  },

  content: { padding: 20 },

  avatarSection: { alignItems: "center", marginBottom: 30 },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 4,
    borderColor: "#ffffff",
  },
  avatarText: { fontSize: 40, color: "white", fontWeight: "bold" },
  offlineBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#64748b",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  nameText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  emailText: { fontSize: 14, color: "#64748b" },

  card: {
    backgroundColor: "white",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    shadowColor: "#64748b",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 30,
  },
  divider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginLeft: 56,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  rowData: { flex: 1 },
  label: { fontSize: 12, color: "#64748b", fontWeight: "600", marginBottom: 2 },
  value: { fontSize: 16, color: "#0f172a", fontWeight: "500" },
  editBtn: {
    padding: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "#fef2f2",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
  logoutText: {
    color: "#ef4444",
    fontWeight: "700",
    fontSize: 16,
    marginRight: 8,
  },
});
