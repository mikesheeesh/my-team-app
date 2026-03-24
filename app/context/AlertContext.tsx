import React, { useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import WebAlertModal, { AlertButton, AlertConfig } from "../components/WebAlertModal";

// Module-level singleton so showAlert() can be called from anywhere
let _showAlert: ((config: AlertConfig) => void) | null = null;

function registerAlertHandler(fn: (config: AlertConfig) => void) {
  _showAlert = fn;
}

/**
 * Platform-aware alert helper.
 * On native: delegates to React Native's Alert.alert()
 * On web:    renders a proper React modal (no browser blocking)
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
) {
  const btns: AlertButton[] = buttons ?? [{ text: "OK" }];
  if (Platform.OS !== "web") {
    Alert.alert(title, message ?? "", btns);
  } else if (_showAlert) {
    _showAlert({ title, message, buttons: btns });
  }
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AlertConfig | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      registerAlertHandler(setConfig);
      return () => { _showAlert = null; };
    }
  }, []);

  return (
    <>
      {children}
      {Platform.OS === "web" && (
        <WebAlertModal
          visible={config !== null}
          config={config}
          onClose={() => setConfig(null)}
        />
      )}
    </>
  );
}
