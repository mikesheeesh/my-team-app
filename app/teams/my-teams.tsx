import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { useFocusEffect, useRouter } from "expo-router";
import React, { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// FIREBASE
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

// CONTEXT
import { useSync } from "../context/SyncContext";
import { useUser } from "../context/UserContext";

type Role = "Founder" | "Admin" | "Supervisor" | "User";

interface Team {
  id: string;
  name: string;
  role: Role;
  type: string;
  membersCount: number;
}

const TEAMS_CACHE_KEY = "cached_my_teams";
const USER_NAME_CACHE_KEY = "cached_user_name";
const OFFLINE_QUEUE_PREFIX = "offline_tasks_queue_";

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
        bg: "#f8fafc",
        border: "#94a3b8",
        text: "#475569",
        label: "ΜΕΛΟΣ",
      };
  }
};

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
          <View style={styles.cardTitleContainer}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {team.name}
            </Text>
            <Text style={styles.cardType}>{team.type}</Text>
          </View>
          <View
            style={[
              styles.roleBadge,
              {
                backgroundColor: styleProps.bg,
                borderColor: styleProps.border,
              },
            ]}
          >
            <Text style={[styles.roleText, { color: styleProps.text }]}>
              {styleProps.label}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.memberTag}>
            <Ionicons
              name="people"
              size={14}
              color="#64748b"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.cardSubtitle}>{team.membersCount} μέλη</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </View>
      </TouchableOpacity>
    );
  },
);

export default function MyTeamsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isSyncing, syncNow } = useSync();

  const { user: contextUser } = useUser();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // --- NAVIGATION LOCK (500ms) ---
  const [isNavigating, setIsNavigating] = useState(false);
  // -------------------------------

  const checkPendingUploads = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const queueKeys = keys.filter((k) => k.startsWith(OFFLINE_QUEUE_PREFIX));

      let total = 0;
      for (const k of queueKeys) {
        const val = await AsyncStorage.getItem(k);
        if (val) {
          const arr = JSON.parse(val);
          if (Array.isArray(arr)) total += arr.length;
        }
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

  useEffect(() => {
    const initLoad = async () => {
      try {
        // Load cached teams
        const cached = await AsyncStorage.getItem(TEAMS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTeams(parsed);
          }
        }
      } catch (e) {
        console.log("Cache load error:", e);
      }
      setLoading(false);
    };
    initLoad();
  }, []);

  useEffect(() => {
    let unsubscribeTeams: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
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

            if (fetchedTeams.length > 0) {
              setTeams(fetchedTeams);
              AsyncStorage.setItem(
                TEAMS_CACHE_KEY,
                JSON.stringify(fetchedTeams),
              );
            } else if (!snapshot.metadata.fromCache) {
              setTeams([]);
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
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeTeams) {
        unsubscribeTeams();
      }
    };
  }, []);

  const handleSyncPress = async () => {
    if (pendingCount === 0) {
      return Alert.alert("Ενημέρωση", "Όλα τα δεδομένα είναι συγχρονισμένα!");
    }
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) return Alert.alert("Offline", "Δεν έχετε ίντερνετ.");
    await syncNow();
  };

  // --- SAFE NAVIGATION HANDLER ---
  const handleTeamPress = (team: Team) => {
    if (isNavigating) return; // Αν τρέχει ήδη πλοήγηση, σταματάμε

    setIsNavigating(true);

    router.push({
      pathname: `/team/${team.id}`,
      params: { role: team.role, teamName: team.name },
    });

    // Ξεμπλοκάρουμε μετά από 0.5 δευτερόλεπτο
    setTimeout(() => setIsNavigating(false), 500);
  };
  // -------------------------------

  const ListHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Λίστα Ομάδων</Text>
          <Text style={styles.userName}>{contextUser?.fullname || "Χρήστης"}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/profile")}
          style={styles.profileButton}
        >
          <Ionicons name="person-circle-outline" size={40} color="#2563eb" />
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
        activeOpacity={0.9}
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
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.syncText}>
            {isSyncing
              ? "Συγχρονισμός..."
              : pendingCount > 0
                ? `Εκκρεμούν Uploads (${pendingCount})`
                : "Όλα Εντάξει"}
          </Text>
          <Text style={styles.syncSubText}>
            {pendingCount > 0
              ? "Πατήστε για ανέβασμα."
              : "Τα δεδομένα είναι ενημερωμένα."}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color="rgba(255,255,255,0.5)"
          style={{ marginLeft: "auto" }}
        />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Οι Ομάδες μου ({teams.length})</Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={64} color="#cbd5e1" />
      <Text style={{ color: "#94a3b8", marginTop: 10, fontSize: 16 }}>
        Δεν βρέθηκαν ομάδες.
      </Text>
      <Text
        style={{
          color: "#94a3b8",
          fontSize: 12,
          textAlign: "center",
          marginTop: 5,
        }}
      >
        Αν είστε offline, βεβαιωθείτε ότι έχετε συνδεθεί μία φορά online.
      </Text>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: Team }) => (
      <TeamCard team={item} onPress={handleTeamPress} />
    ),
    [isNavigating], // Προστέθηκε το isNavigating στα dependencies
  );

  if (loading && teams.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <FlatList
        data={teams}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.scrollContent}
        initialNumToRender={6}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  scrollContent: { padding: 20, paddingBottom: 50 },

  headerContainer: { marginBottom: 10 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  welcomeText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  userName: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  profileButton: { padding: 2 },

  syncCard: {
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  syncText: { color: "white", fontWeight: "700", fontSize: 16 },
  syncSubText: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 16,
  },

  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    // Soft shadow
    shadowColor: "#64748b",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardTitleContainer: { flex: 1, marginRight: 10 },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 2,
  },
  cardType: { fontSize: 13, color: "#64748b", fontWeight: "500" },

  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleText: { fontWeight: "700", fontSize: 10 },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  memberTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cardSubtitle: { color: "#64748b", fontSize: 12, fontWeight: "600" },

  emptyState: { alignItems: "center", marginTop: 60 },
});
