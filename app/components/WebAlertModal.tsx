import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

export type AlertConfig = {
  title: string;
  message?: string;
  buttons: AlertButton[];
};

interface Props {
  visible: boolean;
  config: AlertConfig | null;
  onClose: () => void;
}

export default function WebAlertModal({ visible, config, onClose }: Props) {
  if (!config) return null;

  const handlePress = (btn: AlertButton) => {
    onClose();
    btn.onPress?.();
  };

  const cancelBtns = config.buttons.filter((b) => b.style === "cancel");
  const otherBtns = config.buttons.filter((b) => b.style !== "cancel");

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{config.title}</Text>
          {config.message ? (
            <Text style={styles.message}>{config.message}</Text>
          ) : null}
          <View style={styles.btnRow}>
            {cancelBtns.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.btn, styles.btnCancel]}
                onPress={() => handlePress(btn)}
              >
                <Text style={styles.btnCancelText}>{btn.text}</Text>
              </TouchableOpacity>
            ))}
            {otherBtns.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.btn,
                  btn.style === "destructive" ? styles.btnDestructive : styles.btnPrimary,
                ]}
                onPress={() => handlePress(btn)}
              >
                <Text style={styles.btnPrimaryText}>{btn.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "85%",
    maxWidth: 380,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 4,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minWidth: 80,
    alignItems: "center",
  },
  btnCancel: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  btnPrimary: {
    backgroundColor: "#2563eb",
  },
  btnDestructive: {
    backgroundColor: "#ef4444",
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
});
