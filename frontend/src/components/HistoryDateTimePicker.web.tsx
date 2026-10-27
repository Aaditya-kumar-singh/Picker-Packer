import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/components/Typography";

type Props = {
  visible: boolean;
  value: Date;
  mode: "date" | "time";
  title: string;
  onChange: (value: Date) => void;
  onClose: () => void;
};

function inputValue(value: Date, mode: Props["mode"]) {
  if (mode === "date") {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

export function HistoryDateTimePicker({ visible, value, mode, title, onChange, onClose }: Props) {
  const [input, setInput] = useState(inputValue(value, mode));
  useEffect(() => { if (visible) setInput(inputValue(value, mode)); }, [visible, value, mode]);
  const acceptInput = (input: string) => {
    const next = new Date(value);
    if (mode === "date" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const [year, month, day] = input.split("-").map(Number);
      next.setFullYear(year, month - 1, day);
      onChange(next);
    } else if (mode === "time" && /^\d{2}:\d{2}$/.test(input)) {
      const [hours, minutes] = input.split(":").map(Number);
      if (hours < 24 && minutes < 60) {
        next.setHours(hours, minutes, 0, 0);
        onChange(next);
      }
    }
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{mode === "date" ? "Enter date as YYYY-MM-DD" : "Enter time as HH:MM (24-hour)"}</Text>
          <TextInput
            autoFocus
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => acceptInput(input)}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable onPress={() => acceptInput(input)} style={styles.apply}><Text style={styles.applyText}>Use this</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(15,23,42,0.42)" },
  card: { backgroundColor: "white", borderRadius: 18, padding: 20 },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  hint: { marginTop: 6, marginBottom: 12, fontSize: 13, color: "#64748B" },
  input: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#0F172A" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  cancel: { paddingHorizontal: 14, paddingVertical: 10 },
  cancelText: { color: "#475569", fontWeight: "700" },
  apply: { backgroundColor: "#1D4ED8", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  applyText: { color: "white", fontWeight: "700" },
});
