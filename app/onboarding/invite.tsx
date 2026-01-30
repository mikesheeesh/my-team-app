import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

export default function InviteMembersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { teamId, teamName } = params;

  const [role, setRole] = useState("User");
  const [loading, setLoading] = useState(false);
  const [myRole, setMyRole] = useState("User");

  useEffect(() => {
    const fetchMyRole = async () => {
      const user = auth.currentUser;
      if (user && teamId) {
        try {
          const teamSnap = await getDoc(doc(db, "teams", teamId as string));
          if (teamSnap.exists()) {
            setMyRole(teamSnap.data().roles[user.uid] || "User");
          }
        } catch (e) {
          console.log("Role fetch error");
        }
      }
    };
    fetchMyRole();
  }, [teamId]);

  const handleShareInvite = async () => {
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected) {
      return Alert.alert(
        "Offline",
        "Χρειάζεστε ίντερνετ για να δημιουργήσετε πρόσκληση.",
      );
    }

    if (!teamId) return Alert.alert("Σφάλμα", "Λείπει το Team ID.");
    const user = auth.currentUser;
    if (!user) return Alert.alert("Σφάλμα", "Δεν είστε συνδεδεμένος.");

    setLoading(true);
    try {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let shortCode = "";
      for (let i = 0; i < 6; i++)
        shortCode += chars.charAt(Math.floor(Math.random() * chars.length));

      await addDoc(collection(db, "invites"), {
        code: shortCode,
        teamId: teamId,
        teamName: teamName || "Ομάδα",
        role: role,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        status: "active",
      });

      const isExpoGo = Constants.appOwnership === "expo";
      const scheme = isExpoGo ? "exp" : "ergonwork";

      const deepLink = Linking.createURL("join", {
        scheme: scheme,
        queryParams: { inviteCode: shortCode },
      });

      console.log("Created Link:", deepLink);

      const downloadLink = "https://expo.dev/artifacts/eas/....apk";

      const message = `👋 Πρόσκληση για την ομάδα "${teamName}"

1️⃣ Κατέβασε το App (αν δεν το έχεις):
${downloadLink}

2️⃣ Πάτα για είσοδο:
${deepLink}

🔑 Κωδικός: ${shortCode}
(Λήγει σε 2 λεπτά)`;

      await Share.share({
        message: message,
        title: `TeamCamera: ${teamName}`,
      });
    } catch (error: any) {
      Alert.alert("Σφάλμα", error.message);
    } finally {
      setLoading(false);
    }
  };

  const availableRoles =
    myRole === "Founder" || myRole === "Admin"
      ? ["Admin", "Supervisor", "User"]
      : ["User"];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Πρόσκληση Μέλους</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle"
            size={24}
            color="#2563eb"
            style={{ marginRight: 10 }}
          />
          <Text style={styles.infoText}>
            Ο σύνδεσμος ανοίγει αυτόματα την εφαρμογή.
            {"\n"}• Στείλτε το μέσω Viber/WhatsApp/Messenger.
            {"\n"}• Τα Email συχνά μπλοκάρουν αυτά τα links.
          </Text>
        </View>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>ΟΜΑΔΑ</Text>
          <Text style={styles.summaryTitle}>{teamName}</Text>

          <View style={styles.divider} />

          <View style={styles.timerTag}>
            <Ionicons name="timer-outline" size={16} color="#b45309" />
            <Text style={styles.timerText}>Λήξη κωδικού σε 2 λεπτά</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Επιλέξτε Ρόλο:</Text>
        <View style={styles.rolesContainer}>
          {availableRoles.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.roleBtn, role === r && styles.roleBtnActive]}
              onPress={() => setRole(r)}
              activeOpacity={0.7}
            >
              <Text style={[styles.roleText, role === r && { color: "white" }]}>
                {r}
              </Text>
              {role === r && (
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color="white"
                  style={{ marginLeft: 5 }}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleShareInvite}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="share-social"
                size={24}
                color="white"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.actionButtonText}>
                Δημιουργία & Κοινοποίηση
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 15,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },

  content: { padding: 24 },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start", // Align to top for multiline text
    backgroundColor: "#eff6ff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  infoText: {
    color: "#1e40af",
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },

  summaryBox: {
    backgroundColor: "white",
    padding: 24,
    borderRadius: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 1,
    marginBottom: 5,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 15,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "#f3f4f6",
    marginBottom: 15,
  },
  timerTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffbeb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  timerText: {
    color: "#b45309",
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 6,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    color: "#374151",
  },
  rolesContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 40,
    flexWrap: "wrap", // Wrap if many roles
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    flexDirection: "row",
  },
  roleBtnActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
    // Shadow active
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  roleText: {
    fontWeight: "600",
    color: "#4b5563",
    fontSize: 14,
  },

  actionButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 18,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  actionButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 18,
  },
});
