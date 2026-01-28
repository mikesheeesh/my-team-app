import { initializeApp } from "firebase/app";
// Προσθέσαμε το 'Auth' στα imports για το TypeScript
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Auth,
  browserLocalPersistence,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { Platform } from "react-native";

// Βάλε τα δικά σου στοιχεία εδώ
const firebaseConfig = {
  apiKey: "AIzaSyCASV17VUlZ8zjmkf8yJIb9LqiLDqB6BH4",
  authDomain: "teamcameraapp.firebaseapp.com",
  projectId: "teamcameraapp",
  storageBucket: "teamcameraapp.firebasestorage.app",
  messagingSenderId: "1066934665062",
  appId: "1:1066934665062:web:63a4241fd930aa13f7d2a7",
};

const app = initializeApp(firebaseConfig);

// ΔΙΟΡΘΩΣΗ: Δηλώνουμε τον τύπο της μεταβλητής για να μην χτυπάει το TypeScript
let auth: Auth;

if (Platform.OS === "web") {
  // Web Logic
  auth = getAuth(app);
  auth.setPersistence(browserLocalPersistence);
} else {
  // Mobile Logic (Android/iOS)
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

const db = getFirestore(app);

export { auth, db };

