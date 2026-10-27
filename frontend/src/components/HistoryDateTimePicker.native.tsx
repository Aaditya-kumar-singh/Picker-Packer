import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Text } from "@/components/Typography";

type Props = {
  visible: boolean;
  value: Date;
  mode: "date" | "time";
  title: string;
  onChange: (value: Date) => void;
  onClose: () => void;
};

export function HistoryDateTimePicker({ visible, value, mode, title, onChange, onClose }: Props) {
  const [iosValue, setIosValue] = useState(value);
  const onChangeRef = useRef(onChange);
  const onCloseRef = useRef(onClose);
  onChangeRef.current = onChange;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    DateTimePickerAndroid.open({
      value,
      mode,
      title,
      design: "material",
      onValueChange: (_event, selectedDate) => onChangeRef.current(selectedDate),
      onDismiss: () => onCloseRef.current(),
    });
  }, [visible, value, mode, title]);

  useEffect(() => {
    if (visible) setIosValue(value);
  }, [visible, value]);

  if (Platform.OS === "android" || !visible) return null;

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10}><Text style={styles.action}>Cancel</Text></Pressable>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={() => { onChange(iosValue); onClose(); }} hitSlop={10}><Text style={styles.action}>Done</Text></Pressable>
          </View>
          <DateTimePicker value={iosValue} mode={mode} display="spinner" onValueChange={(_event, date) => setIosValue(date)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.35)" },
  sheet: { backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  header: { minHeight: 54, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  title: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  action: { color: "#1D4ED8", fontSize: 15, fontWeight: "700" },
});
