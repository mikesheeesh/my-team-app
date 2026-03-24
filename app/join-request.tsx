import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";
import { showAlert } from "./context/AlertContext";

interface Team {
  id: string;
  name: string;
  type: string;
  membersCount: number;
}

interface JoinRequest {
  id: string;
  teamId: string;
  status: string;
}

export default function JoinRequestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [teams, setTeams] = useState<Team[]>([]);
  const [myRequests, setMyRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const unsubTeamsRef = useRef<(() => void) | null>(null);
  const unsubRequestsRef = useRef<(() => void) | null>(null);

  const user = auth.currentUser;

  useEffect(() => {
    // Load all teams
    const loadTeams = async () => {
      try {
        const snap = await getDocs(collection(db, "teams"));
        const list: Team[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            name: data.name,
            type: data.type || "Γενικό",
            membersCount: data.memberIds?.length || 0,
          });
        });
        setTeams(list);
      } catch (e) {
        console.log("Teams load error:", e);
      } finally {
        setLoading(false);
      }
    };
    loadTeams();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Watch user's join requests in real-time
    const q = query(
      collection(db, "joinRequests"),
      where("userId", "==", user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const requests: JoinRequest[] = [];
      snap.forEach((d) => {
        requests.push({ id: d.id, teamId: d.data().teamId, status: d.data().status });
      });
      setMyRequests(requests);
    });
    unsubRequestsRef.current = unsub;
    return () => unsub();
  }, [user?.uid]);

  // Watch user's teams — if approved, navigate to dashboard
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "teams"),
      where("memberIds", "array-contains", user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        router.replace("/dashboard");
      }
    });
    unsubTeamsRef.current = unsub;
    return () => unsub();
  }, [user?.uid]);

  const getRequestForTeam = (teamId: string) =>
    myRequests.find((r) => r.teamId === teamId);

  const handleRequest = async (team: Team) => {
    if (!user) return;
    const existing = getRequestForTeam(team.id);
    if (existing) return;

    setSubmitting(team.id);
    try {
      await addDoc(collection(db, "joinRequests"), {
        userId: user.uid,
        teamId: team.id,
        userName: user.displayName || "",
        userEmail: user.email || "",
        userPhotoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
        status: "pending",
      });
    } catch (e: any) {
      showAlert("Σφάλμα", "Η αίτηση απέτυχε. Δοκιμάστε ξανά.");
    } finally {
      setSubmitting(null);
    }
  };

  const renderTeam = ({ item }: { item: Team }) => {
    const req = getRequestForTeam(item.id);
    const isPending = req?.status === "pending";
    const isRejected = req?.status === "rejected";
    const isSubmitting = submitting === item.id;

    return (
      <View style={styles.teamCard}>
        <View style={styles.teamIconBox}>
          <Ionicons name="business" size={28} color="#2563eb" />
        </View>
        <View style={styles.teamInfo}>
          <Text style={styles.teamName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.teamMeta}>
            {item.type} • {item.membersCount} μέλη
          </Text>
        </View>
        {isPending ? (
          <View style={styles.pendingBadge}>
            <Ionicons name="time-outline" size={14} color="#b45309" />
            <Text style={styles.pendingText}>Αναμονή</Text>
          </View>
        ) : isRejected ? (
          <TouchableOpacity
            style={styles.rejectedBtn}
            onPress={() => handleRequest(item)}
            disabled={isSubmitting}
          >
            <Text style={styles.rejectedBtnText}>Ξανά</Text>
          </TouchableOpacity>
        ) : isSubmitting ? (
          <ActivityIndicator size="small" color="#2563eb" />
        ) : (
          <TouchableOpacity
            style={styles.requestBtn}
            onPress={() => handleRequest(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.requestBtnText}>Αίτηση</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Επιλέξτε Ομάδα</Text>
          <Text style={styles.headerSubtitle}>Στείλτε αίτηση σύνδεσης</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/profile")}
          style={styles.profileBtn}
        >
          <Ionicons name="person-circle-outline" size={40} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={teams}
        keyExtractor={(t) => t.id}
        renderItem={renderTeam}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={56} color="#cbd5e1" />
            <Text style={styles.emptyText}>Δεν βρέθηκαν ομάδες.</Text>
          </View>
        }
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

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  profileBtn: { padding: 2 },

  list: { padding: 16, paddingBottom: 40 },

  teamCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#64748b",
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  teamIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  teamInfo: { flex: 1 },
  teamName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 3,
  },
  teamMeta: { fontSize: 13, color: "#64748b" },

  requestBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  requestBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  pendingText: {
    color: "#b45309",
    fontWeight: "700",
    fontSize: 12,
  },

  rejectedBtn: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  rejectedBtnText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 13,
  },

  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: "#94a3b8", fontSize: 16 },
});
