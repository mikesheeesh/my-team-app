import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";

// Εισάγουμε τα απαραίτητα
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from "firebase/firestore";

// ΤΑ ΔΙΚΑ ΣΟΥ ΚΛΕΙΔΙΑ
const firebaseConfig = {
  apiKey: "AIzaSyCASV17VUlZ8zjmkf8yJIb9LqiLDqB6BH4",
  authDomain: "teamcameraapp.firebaseapp.com",
  projectId: "teamcameraapp",
  storageBucket: "teamcameraapp.firebasestorage.app",
  messagingSenderId: "1066934665062",
  appId: "1:1066934665062:web:63a4241fd930aa13f7d2a7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// --- SETUP ΓΙΑ ΝΑ ΚΡΑΤΑΕΙ ΤΟΝ ΧΡΗΣΤΗ (PERSISTENCE) ---
// Χρησιμοποιούμε // @ts-ignore για να παρακάμψουμε το λάθος του TypeScript
// καθώς η συνάρτηση υπάρχει κανονικά στη βιβλιοθήκη για το React Native.

const auth = initializeAuth(app, {
  // @ts-ignore
  persistence: getReactNativePersistence(AsyncStorage)
});

const db = getFirestore(app);

export { auth, db };

