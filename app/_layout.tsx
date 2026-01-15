import * as Network from 'expo-network';
import { Stack } from "expo-router";
import { collection, disableNetwork, enableNetwork, getDocs, updateDoc } from "firebase/firestore";
import { useEffect, useRef } from "react";
import { AppState, Platform, ToastAndroid } from "react-native";
import { db } from "../firebaseConfig";

export default function RootLayout() {
  
  // ΔΙΟΡΘΩΣΗ: Προσθέσαμε το "| undefined" για να μην παραπονιέται το TypeScript
  const currentNetworkType = useRef<Network.NetworkStateType | undefined>(Network.NetworkStateType.UNKNOWN);

  // Καθαρισμός ετικετών (τρέχει μόνο όταν έχουμε WiFi)
  const runCleanup = async () => {
    try {
        const projectsSnap = await getDocs(collection(db, "projects"));
        let fixedCount = 0;
        for (const projectDoc of projectsSnap.docs) {
            const data = projectDoc.data();
            const tasks = data.tasks || [];
            let needsUpdate = false;
            const updatedTasks = tasks.map((task: any) => {
                if (task.isLocal) {
                    fixedCount++;
                    needsUpdate = true;
                    return { ...task, isLocal: false }; 
                }
                return task;
            });
            if (needsUpdate) await updateDoc(projectDoc.ref, { tasks: updatedTasks });
        }
        if (fixedCount > 0 && Platform.OS === 'android') {
             ToastAndroid.show(`✅ WiFi: Συγχρονίστηκαν ${fixedCount} εργασίες!`, ToastAndroid.LONG);
        }
    } catch (e) {}
  };

  // Ο ΑΥΣΤΗΡΟΣ ΕΛΕΓΚΤΗΣ
  const enforceNetworkPolicy = async (state: Network.NetworkState | null = null) => {
      // Αν δεν δώσουμε state, το διαβάζουμε τώρα
      const netState = state || await Network.getNetworkStateAsync();
      
      const isWifi = netState.type === Network.NetworkStateType.WIFI;
      const isCellular = netState.type === Network.NetworkStateType.CELLULAR;
      
      // Αποθήκευση για να μην τρέχουμε διπλές εντολές
      if (currentNetworkType.current === netState.type) return;
      currentNetworkType.current = netState.type;

      if (isWifi && netState.isInternetReachable) {
          // --- ΜΟΝΟ ΣΕ WIFI ΑΝΟΙΓΟΥΜΕ ---
          console.log("🟢 WiFi Detected: Opening Gates...");
          if (Platform.OS === 'android') ToastAndroid.show("🟢 WiFi Συνδέθηκε - Συγχρονισμός...", ToastAndroid.SHORT);
          
          await enableNetwork(db).catch(console.error);
          runCleanup(); // Τρέξε καθαρισμό

      } else if (isCellular) {
          // --- ΣΕ 4G/5G ΤΟ ΣΚΟΤΩΝΟΥΜΕ ---
          console.log("🔴 Cellular Detected: FORCE CLOSING FIREBASE.");
          if (Platform.OS === 'android') ToastAndroid.show("🔴 4G/5G Εντοπίστηκε - Παύση Sync", ToastAndroid.SHORT);
          
          // ΤΟ ΚΛΕΙΝΟΥΜΕ ΒΙΑΙΑ
          await disableNetwork(db).catch(console.error);

      } else {
          // --- ΣΕ ΟΛΑ ΤΑ ΑΛΛΑ (Κανένα σήμα κλπ) ---
          await disableNetwork(db).catch(console.error);
      }
  };

  useEffect(() => {
    // 1. ΜΕ ΤΟ ΠΟΥ ΑΝΟΙΓΕΙ Η ΕΦΑΡΜΟΓΗ -> ΚΛΕΙΣΤΑ ΟΛΑ
    disableNetwork(db).catch(() => {});

    // 2. Ελέγχουμε τι δίκτυο έχουμε τώρα
    enforceNetworkPolicy();

    // 3. Παρακολούθηση αλλαγών δικτύου (WiFi <-> 4G)
    const netSubscription = Network.addNetworkStateListener((state) => {
        enforceNetworkPolicy(state);
    });

    // 4. Παρακολούθηση αν η εφαρμογή βγαίνει από το background
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
            enforceNetworkPolicy(); 
        }
    });

    return () => {
        netSubscription && netSubscription.remove();
        appStateSubscription.remove();
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="teams/my-teams" />
      <Stack.Screen name="team/[id]" />
      <Stack.Screen name="project/[id]" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}