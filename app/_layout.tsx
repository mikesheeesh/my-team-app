import { Stack } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";

export default function Layout() {
  // Αγνοούμε προειδοποιήσεις που δεν επηρεάζουν τη λειτουργία
  useEffect(() => {
    LogBox.ignoreLogs(["..."]);
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="onboarding/invite" />
      <Stack.Screen
        name="dashboard/index"
        options={{
          gestureEnabled: false,
          headerLeft: () => null,
        }}
      />
    </Stack>
  );
}
