import { Stack } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { DriveSyncProvider } from "./context/DriveSyncContext";
import { SyncProvider } from "./context/SyncContext";
import { UserProvider } from "./context/UserContext";

export default function Layout() {
  useEffect(() => {
    LogBox.ignoreLogs(["..."]);
  }, []);

  return (
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
  );
}
