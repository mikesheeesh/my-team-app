import { Stack } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { DriveSyncProvider } from "./context/DriveSyncContext";
import { SyncProvider } from "./context/SyncContext";
import { UserProvider } from "./context/UserContext";
import { AlertProvider } from "./context/AlertContext";

export default function Layout() {
  useFonts(Ionicons.font); // Load fonts async — don't block rendering

  useEffect(() => {
    LogBox.ignoreLogs(["..."]);
  }, []);

  return (
    <AlertProvider>
      <UserProvider>
        <SyncProvider>
          <DriveSyncProvider>
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
          </DriveSyncProvider>
        </SyncProvider>
      </UserProvider>
    </AlertProvider>
  );
}
