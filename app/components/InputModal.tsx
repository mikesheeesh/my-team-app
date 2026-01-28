import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface InputModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  onClear?: () => void;
  title: string;
  description?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad";
  isMultiline?: boolean;
}

export default function InputModal({
  visible,
  onClose,
  onSave,
  onClear,
  title,
  description,
  value,
  onChangeText,
  placeholder = "Πληκτρολογήστε...",
  keyboardType = "default",
  isMultiline = false,
}: InputModalProps) {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.centeredView}
      >
        <View style={styles.modalView}>
          <View style={styles.headerRow}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {description ? (
            <View style={styles.descriptionBox}>
              <Text style={styles.descriptionLabel}>ΠΕΡΙΓΡΑΦΗ:</Text>
              <ScrollView style={{ maxHeight: 80 }}>
                <Text style={styles.descriptionText}>{description}</Text>
              </ScrollView>
            </View>
          ) : null}

          <TextInput
            style={[
              styles.input,
              isMultiline && { height: 100, textAlignVertical: "top" },
            ]}
            placeholder={placeholder}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            autoFocus={true}
            multiline={isMultiline}
            numberOfLines={isMultiline ? 4 : 1}
          />

          <View style={styles.buttonRow}>
            {/* ΚΑΔΑΚΙ: Εμφανίζεται ΜΟΝΟ αν υπάρχει κείμενο */}
            {onClear && value && value.trim().length > 0 && (
              <TouchableOpacity style={styles.trashBtn} onPress={onClear}>
                <Ionicons name="trash-outline" size={24} color="#ef4444" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.button, styles.buttonSave]}
              onPress={onSave}
            >
              <Text style={styles.textStyle}>Αποθήκευση</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalView: {
    width: "85%",
    backgroundColor: "white",
    borderRadius: 20,
    padding: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
  },
  descriptionBox: {
    backgroundColor: "#f3f4f6",
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: "#2563eb",
  },
  descriptionLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#6b7280",
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: "#f9fafb",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end", // Τα σπρώχνει δεξιά
    alignItems: "center",
    gap: 15, // Απόσταση μεταξύ καδάκι και κουμπιού
  },
  button: {
    borderRadius: 10,
    padding: 12,
    elevation: 2,
    minWidth: 100,
    alignItems: "center",
  },
  buttonSave: {
    backgroundColor: "#2563eb",
  },
  textStyle: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
  },

  // Στυλ για το καδάκι
  trashBtn: {
    padding: 10,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
});
