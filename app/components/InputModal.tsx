import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { KeyboardTypeOptions, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface InputModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  title: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  isMultiline?: boolean;
  keyboardType?: KeyboardTypeOptions; // <--- ΤΟ ΝΕΟ ΠΕΔΙΟ
}

export default function InputModal({ 
  visible, 
  onClose, 
  onSave, 
  title, 
  value, 
  onChangeText, 
  placeholder, 
  isMultiline,
  keyboardType = 'default' // <--- Default τιμή αν δεν οριστεί
}: InputModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalView}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          
          <TextInput
            style={[styles.input, isMultiline && { height: 100, textAlignVertical: 'top' }]}
            placeholder={placeholder}
            value={value}
            onChangeText={onChangeText}
            multiline={isMultiline}
            autoFocus
            keyboardType={keyboardType} // <--- ΤΟ ΣΥΝΔΕΣΑΜΕ ΕΔΩ
          />

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onClose}>
              <Text style={styles.btnTextCancel}>Ακύρωση</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={onSave}>
              <Text style={styles.btnTextSave}>Αποθήκευση</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalView: { backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 400, padding: 20, elevation: 5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#f9fafb', marginBottom: 20 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  btnCancel: { backgroundColor: '#f3f4f6' },
  btnSave: { backgroundColor: '#2563eb' },
  btnTextCancel: { color: '#4b5563', fontWeight: '600' },
  btnTextSave: { color: 'white', fontWeight: '600' },
});