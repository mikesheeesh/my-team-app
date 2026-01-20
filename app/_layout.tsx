import { Stack } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { SyncProvider } from "./context/SyncContext"; // <--- IMPORT

export default function Layout() {
  useEffect(() => {
    LogBox.ignoreLogs(["..."]);
  }, []);

  return (
    // ΤΥΛΙΓΟΥΜΕ ΤΑ ΠΑΝΤΑ ΜΕ ΤΟΝ SYNC PROVIDER
    <SyncProvider>
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
    </SyncProvider>
  );
}
