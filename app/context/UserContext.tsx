import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../../firebaseConfig";

interface UserData {
  uid: string;
  fullname: string;
  email: string;
  phone: string;
}

const UserContext = createContext<{
  user: UserData | null;
  loading: boolean;
}>({ user: null, loading: true });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = null;
      }

      if (firebaseUser) {
        unsubSnapshot = onSnapshot(
          doc(db, "users", firebaseUser.uid),
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              setUser({
                uid: firebaseUser.uid,
                fullname: data.fullname || "Χρήστης",
                email: firebaseUser.email || data.email || "",
                phone: data.phone || "",
              });
            } else {
              setUser({
                uid: firebaseUser.uid,
                fullname: firebaseUser.displayName || "Χρήστης",
                email: firebaseUser.email || "",
                phone: "",
              });
            }
            setLoading(false);
          },
          () => setLoading(false),
        );
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  return (
    <UserContext.Provider value={{ user, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
