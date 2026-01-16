import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { LogBox } from 'react-native';

export default function Layout() {
  
  // Αγνοούμε κάποια warnings που δεν επηρεάζουν τη λειτουργία
  useEffect(() => {
    LogBox.ignoreLogs(['...']); 
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Η Αρχική οθόνη */}
      <Stack.Screen name="index" />
      
      {/* Η οθόνη Login */}
      <Stack.Screen name="login" />
      
      {/* Η οθόνη Onboarding Invite (αν την έχεις σε φάκελο) */}
      <Stack.Screen name="onboarding/invite" />

      {/* ΤΟ DASHBOARD: Κλειδώνουμε το πίσω */}
      <Stack.Screen 
        name="dashboard/index" 
        options={{ 
          gestureEnabled: false, // Απαγορεύει το σύρσιμο πίσω (iOS)
          headerLeft: () => null, // Κρύβει το βελάκι πίσω (αν υπήρχε)
        }} 
      />
    </Stack>
  );
}