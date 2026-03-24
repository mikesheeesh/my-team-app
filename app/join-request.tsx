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
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  status: string;
}

export default function JoinRequestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [team, setTeam] = useState<Team | null>(null);
  const [myRequest, setMyRequest] = useState<JoinRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const user = auth.currentUser;

  // Load the (single) team
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, "teams"));
        if (!snap.empty) {
          const d = snap.docs[0];
          const data = d.data();
          setTeam({
            id: d.id,
            name: data.name,
            type: data.type || "Γενικό",
            membersCount: data.memberIds?.length || 0,
          });
        }
      } catch (e) {
        console.log("Team load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Watch user's join requests in real-time
  useEffect(() => {
    if (!user || !team) return;
    const q = query(
      collection(db, "joinRequests"),
      where("userId", "==", user.uid),
      where("teamId", "==", team.id),
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setMyRequest({ id: d.id, status: d.data().status });
      } else {
        setMyRequest(null);
      }
    });
    return () => unsub();
  }, [user?.uid, team?.id]);

  // Watch user's team membership — navigate to my-teams when approved
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "teams"),
      where("memberIds", "array-contains", user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        router.replace("/teams/my-teams");
      }
    });
    return () => unsub();
  }, [user?.uid]);

  const handleRequest = async () => {
    if (!user || !team) return;
    setSubmitting(true);
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
    } catch (e) {
      showAlert("Σφάλμα", "Η αίτηση απέτυχε. Δοκιμάστε ξανά.");
    } finally {
      setSubmitting(false);
    }
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

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.appName}>Ergon Work Management</Text>
        <TouchableOpacity
          onPress={() => router.push("/profile")}
          style={styles.profileBtn}
        >
          <Ionicons name="person-circle-outline" size={40} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.iconBox}>
          <Ionicons name="business" size={52} color="#2563eb" />
        </View>

        {team ? (
          <>
            <Text style={styles.teamName}>{team.name}</Text>
            <Text style={styles.teamMeta}>{team.type} • {team.membersCount} μέλη</Text>

            <Text style={styles.infoText}>
              Στείλτε αίτηση για να ενταχθείτε στην ομάδα.{"\n"}
              Ο διαχειριστής θα σας εγκρίνει σύντομα.
            </Text>

            {myRequest?.status === "pending" ? (
              <View style={styles.pendingBox}>
                <Ionicons name="time-outline" size={22} color="#b45309" />
                <Text style={styles.pendingText}>Αναμονή έγκρισης...</Text>
              </View>
            ) : myRequest?.status === "rejected" ? (
              <View style={{ gap: 12, width: "100%" }}>
                <View style={styles.rejectedBox}>
                  <Ionicons name="close-circle-outline" size={22} color="#dc2626" />
                  <Text style={styles.rejectedText}>Η αίτησή σας απορρίφθηκε.</Text>
                </View>
                <TouchableOpacity
                  style={styles.requestBtn}
                  onPress={handleRequest}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.requestBtnText}>Νέα Αίτηση</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.requestBtn}
                onPress={handleRequest}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.requestBtnText}>Αίτηση Σύνδεσης</Text>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : (
          <Text style={styles.noTeamText}>Δεν βρέθηκε ομάδα.</Text>
        )}
      </View>
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
  appName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e3a8a",
    flex: 1,
  },
  profileBtn: { padding: 2 },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },

  iconBox: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#dbeafe",
  },

  teamName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  teamMeta: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
  },
  infoText: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
    marginVertical: 8,
  },

  requestBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 5,
  },
  requestBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  pendingBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
    width: "100%",
    justifyContent: "center",
  },
  pendingText: {
    color: "#b45309",
    fontWeight: "700",
    fontSize: 15,
  },

  rejectedBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
    width: "100%",
    justifyContent: "center",
  },
  rejectedText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 15,
  },

  noTeamText: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
  },
});
