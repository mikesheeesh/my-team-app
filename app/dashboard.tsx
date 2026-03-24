import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { useUser } from "./context/UserContext";

export default function DashboardScreen() {
  const router = useRouter();
  const { user: userData } = useUser();
  const [loading, setLoading] = useState(true);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [firstAdminTeamId, setFirstAdminTeamId] = useState<string | null>(null);

  const [isNavigating, setIsNavigating] = useState(false);

  const safeNavigate = (path: any) => {
    if (isNavigating) return;
    setIsNavigating(true);
    router.push(path);
    setTimeout(() => setIsNavigating(false), 500);
  };

  // 1. BACK BUTTON LOCK
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web") return;
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

  // 2. AUTH CHECK
  useFocusEffect(
    useCallback(() => {
      const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
          setLoading(false);
        } else {
          router.replace("/");
        }
      });
      return () => unsubscribeAuth();
    }, []),
  );

  // 3. BELL — pending join requests for teams where user is Founder/Admin
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    let unsubRequests: (() => void) | null = null;

    // Get teams where user is Founder or Admin
    const unsubTeams = onSnapshot(
      query(collection(db, "teams"), where("memberIds", "array-contains", user.uid)),
      (teamsSnap) => {
        const adminTeamIds: string[] = [];
        teamsSnap.forEach((d) => {
          const role = d.data().roles?.[user.uid];
          if (role === "Founder" || role === "Admin") {
            adminTeamIds.push(d.id);
          }
        });

        if (unsubRequests) unsubRequests();

        if (adminTeamIds.length === 0) {
          setPendingRequestsCount(0);
          setFirstAdminTeamId(null);
          return;
        }

        setFirstAdminTeamId(adminTeamIds[0]);

        // Firestore 'in' supports up to 30 items
        const batchIds = adminTeamIds.slice(0, 30);
        unsubRequests = onSnapshot(
          query(
            collection(db, "joinRequests"),
            where("teamId", "in", batchIds),
            where("status", "==", "pending"),
          ),
          (snap) => setPendingRequestsCount(snap.size),
        );
      },
    );

    return () => {
      unsubTeams();
      if (unsubRequests) unsubRequests();
    };
  }, []);

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
          <Text style={styles.greeting}>
            Γεια σου, {userData?.fullname || "Χρήστης"}!
          </Text>
        </View>
        <View style={styles.headerActions}>
          {/* BELL */}
          <TouchableOpacity
            style={styles.bellButton}
            onPress={() => {
              if (firstAdminTeamId) {
                safeNavigate(`/team/${firstAdminTeamId}?openRequests=true`);
              }
            }}
          >
            <Ionicons name="notifications-outline" size={26} color="#374151" />
            {pendingRequestsCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {pendingRequestsCount > 9 ? "9+" : pendingRequestsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* PROFILE */}
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => safeNavigate("/profile")}
          >
            <Ionicons name="person-circle-outline" size={48} color="#2563eb" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>Ενέργειες</Text>

        {/* ΟΙ ΟΜΑΔΕΣ ΜΟΥ */}
        <TouchableOpacity
          style={[styles.card, styles.cardWhite]}
          onPress={() => safeNavigate("/teams/my-teams")}
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

        {/* VERSION */}
        <Text style={styles.versionText}>v2.5.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

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
    color: "#1e3a8a",
    letterSpacing: -0.5,
  },
  greeting: {
    fontSize: 15,
    color: "#64748b",
    marginTop: 4,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  bellBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  profileButton: { padding: 4 },

  content: { padding: 24, paddingBottom: 50 },
  sectionHeader: {
    fontSize: 18,
    color: "#334155",
    marginBottom: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  card: {
    padding: 20,
    borderRadius: 20,
    height: 110,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#64748b",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  cardWhite: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  cardTextContainer: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  cardSubtitle: { fontSize: 13, fontWeight: "500" },

  versionText: {
    textAlign: "center",
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 24,
    marginBottom: 8,
  },
});
