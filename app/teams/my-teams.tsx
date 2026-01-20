import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { useFocusEffect, useRouter } from "expo-router";
import React, { memo, useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// FIREBASE
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

// CONTEXT
import { useSync } from "../context/SyncContext";

// --- TYPES ---
type Role = "Founder" | "Admin" | "Supervisor" | "User";

interface Team {
  id: string;
  name: string;
  role: Role;
  type: string;
  membersCount: number;
}

const TEAMS_CACHE_KEY = "cached_my_teams";
const OFFLINE_QUEUE_PREFIX = "offline_tasks_queue_";

// --- HELPER FUNCTION ---
const getRoleStyle = (role: Role) => {
  switch (role) {
    case "Founder":
      return {
        bg: "#fff7ed",
        border: "#f97316",
        text: "#c2410c",
        label: "ΙΔΡΥΤΗΣ",
      };
    case "Admin":
      return {
        bg: "#eff6ff",
        border: "#3b82f6",
        text: "#1d4ed8",
        label: "ADMIN",
      };
    case "Supervisor":
      return {
        bg: "#f0fdf4",
        border: "#22c55e",
        text: "#15803d",
        label: "SUPERVISOR",
      };
    default:
      return {
        bg: "white",
        border: "#e5e7eb",
        text: "#6b7280",
        label: "ΜΕΛΟΣ",
      };
  }
};

// --- TEAM CARD COMPONENT (MEMOIZED) ---
const TeamCard = memo(
  ({ team, onPress }: { team: Team; onPress: (t: Team) => void }) => {
    const styleProps = getRoleStyle(team.role);

    return (
      <TouchableOpacity
        style={[
          styles.card,
          { borderColor: styleProps.border, borderWidth: 1 },
        ]}
        onPress={() => onPress(team)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{team.name}</Text>
          <View
            style={[styles.roleBadge, { backgroundColor: styleProps.border }]}
          >
            <Text style={styles.roleText}>{styleProps.label}</Text>
          </View>
        </View>
        <Text style={styles.cardSubtitle}>
          {team.type} • {team.membersCount} μέλη
        </Text>
      </TouchableOpacity>
    );
  },
);

// --- MAIN SCREEN ---
export default function MyTeamsScreen() {
  const router = useRouter();
  const { isSyncing, syncNow } = useSync();

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Χρήστης");
  const [pendingCount, setPendingCount] = useState(0);

  // 1. ΕΛΕΓΧΟΣ ΕΚΚΡΕΜΟΤΗΤΩΝ (OFFLINE TASKS)
  const checkPendingUploads = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const queueKeys = keys.filter((k) => k.startsWith(OFFLINE_QUEUE_PREFIX));

      let total = 0;
      if (queueKeys.length > 0) {
        const values = await AsyncStorage.multiGet(queueKeys);
        values.forEach(([, val]) => {
          if (val) {
            const arr = JSON.parse(val);
            if (Array.isArray(arr)) total += arr.length;
          }
        });
      }
      setPendingCount(total);
    } catch (e) {
      console.log("Check pending error:", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkPendingUploads();
    }, [checkPendingUploads]),
  );

  useEffect(() => {
    if (!isSyncing) {
      checkPendingUploads();
    }
  }, [isSyncing, checkPendingUploads]);

  // 2. INITIAL CACHE LOAD
  useEffect(() => {
    const initLoad = async () => {
      try {
        const cached = await AsyncStorage.getItem(TEAMS_CACHE_KEY);
        if (cached) setTeams(JSON.parse(cached));
      } catch (e) {
        console.log("Cache load error:", e);
      }
      setLoading(false);
    };
    initLoad();
  }, []);

  // 3. FIREBASE LISTENER
  useEffect(() => {
    let unsubscribeTeams: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Fetch Username
        onSnapshot(doc(db, "users", user.uid), (snap) => {
          if (snap.exists()) setUserName(snap.data().fullname || "Χρήστης");
        });

        // Fetch Teams
        const q = query(
          collection(db, "teams"),
          where("memberIds", "array-contains", user.uid),
        );

        unsubscribeTeams = onSnapshot(
          q,
          (snapshot) => {
            const fetchedTeams: Team[] = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              fetchedTeams.push({
                id: docSnap.id,
                name: data.name,
                type: data.type || "Γενικό",
                role: (data.roles?.[user.uid] as Role) || "User",
                membersCount: data.memberIds ? data.memberIds.length : 1,
              });
            });

            setTeams(fetchedTeams);

            if (!snapshot.metadata.fromCache) {
              AsyncStorage.setItem(
                TEAMS_CACHE_KEY,
                JSON.stringify(fetchedTeams),
              ).catch((e) => console.log("Cache save err", e));
            }
            setLoading(false);
          },
          (error) => {
            console.log("Teams fetch error:", error);
            setLoading(false);
          },
        );
      } else {
        setLoading(false);
        setTeams([]);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeTeams) {
        unsubscribeTeams();
      }
    };
  }, []);

  // 4. HANDLERS
  const handleSyncPress = async () => {
    if (pendingCount === 0) {
      return Alert.alert("Ενημέρωση", "Όλα τα δεδομένα είναι συγχρονισμένα!");
    }
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) {
      return Alert.alert("Offline", "Δεν έχετε ίντερνετ.");
    }
    await syncNow();
  };

  const handleTeamPress = useCallback(
    (team: Team) => {
      router.push({
        pathname: `/team/${team.id}`,
        params: { role: team.role, teamName: team.name },
      });
    },
    [router],
  );

  // 5. RENDER HELPERS
  // Χρησιμοποιούμε μια απλή συνάρτηση για το Header
  const ListHeader = () => (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Λίστα Ομάδων</Text>
          <Text style={styles.userName}>{userName}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/profile")}
          style={styles.profileButton}
        >
          <Ionicons name="person-circle-outline" size={30} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[
          styles.syncCard,
          pendingCount > 0
            ? { backgroundColor: "#ea580c" }
            : { backgroundColor: "#16a34a" },
        ]}
        onPress={handleSyncPress}
        disabled={isSyncing}
      >
        {isSyncing ? (
          <ActivityIndicator color="white" />
        ) : (
          <Ionicons
            name={pendingCount > 0 ? "cloud-upload" : "checkmark-circle"}
            size={24}
            color="white"
          />
        )}
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.syncText}>
            {isSyncing
              ? "Συγχρονισμός..."
              : pendingCount > 0
                ? `Εκκρεμούν Uploads (${pendingCount})`
                : "Όλα Εντάξει"}
          </Text>
          <Text style={styles.syncSubText}>
            {pendingCount > 0
              ? `Πατήστε για ανέβασμα.`
              : "Τα δεδομένα σας είναι ενημερωμένα."}
          </Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Οι Ομάδες μου ({teams.length})</Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={64} color="#ccc" />
      <Text style={{ color: "#999", marginTop: 10 }}>Δεν βρέθηκαν ομάδες.</Text>
      <Text style={{ color: "#999", fontSize: 12 }}>
        Αν είστε offline, ίσως δεν έχουν κατέβει ακόμα.
      </Text>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: Team }) => (
      <TeamCard team={item} onPress={handleTeamPress} />
    ),
    [handleTeamPress],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={teams}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.scrollContent}
        initialNumToRender={6}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", paddingTop: 30 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: 20, paddingBottom: 50 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  welcomeText: { color: "#64748b", fontSize: 14 },
  userName: { fontSize: 22, fontWeight: "bold", color: "#0f172a" },
  profileButton: { padding: 5 },
  syncCard: {
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    elevation: 4,
  },
  syncText: { color: "white", fontWeight: "bold", fontSize: 16 },
  syncSubText: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#334155",
    marginBottom: 15,
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    marginBottom: 15,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  cardTitle: { fontSize: 18, fontWeight: "bold", color: "#1e293b" },
  cardSubtitle: { color: "#64748b", fontSize: 12 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  roleText: { color: "white", fontWeight: "bold", fontSize: 10 },
  emptyState: { alignItems: "center", marginTop: 50 },
});
