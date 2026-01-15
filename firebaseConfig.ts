import { getApp, getApps, initializeApp } from "firebase/app";

// 1. Εισάγουμε τα πάντα ως 'Auth' για να αποφύγουμε το error
import * as Auth from "firebase/auth";

// 2. Εισάγουμε τις εντολές για την Offline Cache της βάσης
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyCASV17VUlZ8zjmkf8yJIb9LqiLDqB6BH4",
  authDomain: "teamcameraapp.firebaseapp.com",
  projectId: "teamcameraapp",
  storageBucket: "teamcameraapp.firebasestorage.app",
  messagingSenderId: "1066934665062",
  appId: "1:1066934665062:web:63a4241fd930aa13f7d2a7"
};

// Singleton App Check
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// 3. Auth με "Casting" (as any) για να μην χτυπάει το TypeScript
// Αυτό λύνει το error που σου έβγαλε
const auth = Auth.initializeAuth(app, {
  persistence: (Auth as any).getReactNativePersistence(ReactNativeAsyncStorage)
});

// 4. Database με Offline Persistence (Cache)
// Αυτό είναι που θα σου επιτρέψει να βλέπεις τα δεδομένα στο "Υπόγειο"
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export { auth, db };

