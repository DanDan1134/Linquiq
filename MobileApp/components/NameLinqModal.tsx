import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

type NameLinqModalProps = {
  visible: boolean;
  initialName?: string;
  onCancel: () => void;
  onSave: (name: string) => void;
};

export function NameLinqModal({
  visible,
  initialName = "",
  onCancel,
  onSave,
}: NameLinqModalProps) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (visible) setName(initialName);
  }, [visible, initialName]);

  const save = () => {
    const next = String(name ?? "").trim().slice(0, 80);
    onSave(next || "Untitled linq");
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Name this linq</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Optional name"
            placeholderTextColor="#9CA3AF"
            autoFocus
            maxLength={80}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <View style={styles.row}>
            <TouchableOpacity
              onPress={onCancel}
              style={styles.btn}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={save}
              style={[styles.btn, styles.saveBtn]}
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>linq</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#111827",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    fontSize: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 14,
    gap: 8,
  },
  btn: {
    minHeight: 48,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  saveBtn: {
    backgroundColor: "#D7827E",
    borderRadius: 8,
  },
  cancelText: {
    color: "#9CA3AF",
    fontWeight: "600",
  },
  saveText: {
    color: "#111827",
    fontWeight: "700",
  },
});
