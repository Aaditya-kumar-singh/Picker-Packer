import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import BarcodeScannerModal from "@/scanner/BarcodeScannerModal";
import { theme } from "@/components/ui";

type Props = {
  label: string;
  value: string;
  scanTitle: string;
  onScanned: (value: string) => void;
  disabled?: boolean;
};

export default function BarcodeDisplay({ label, value, scanTitle, onScanned, disabled = false }: Props) {
  const [scannerVisible, setScannerVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(true);
  }

  return (
    <>
      <View style={s.card}>
        <Text style={s.label}>{label}</Text>
        <View style={s.row}>
          <Text selectable style={s.value}>{value || "Not available"}</Text>
          <View style={s.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={"Copy " + label.toLowerCase()} onPress={() => void copy()} disabled={!value} style={[s.action, !value && s.disabled]}>
              <Text style={s.actionText}>{copied ? "Copied" : "Copy"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={"Scan " + label.toLowerCase() + " with camera"} onPress={() => setScannerVisible(true)} disabled={disabled} style={[s.camera, disabled && s.disabled]}>
              <Text style={s.cameraText}>Camera</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <BarcodeScannerModal visible={scannerVisible} title={scanTitle} onScanned={onScanned} onClose={() => setScannerVisible(false)} />
    </>
  );
}

const s = StyleSheet.create({
  card: { marginTop: 12, backgroundColor: theme.color.surfaceContainerLow, borderRadius: theme.radius.md, padding: 12 },
  label: { ...theme.type.caption, color: theme.color.primaryContainer },
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 5 },
  value: { ...theme.type.codeLg, color: theme.color.ink, flex: 1 },
  actions: { flexDirection: "row", gap: 7 },
  action: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.color.line, backgroundColor: theme.color.surface, alignItems: "center", justifyContent: "center" },
  camera: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: theme.color.primary, alignItems: "center", justifyContent: "center" },
  actionText: { color: theme.color.ink, fontWeight: "800", fontSize: 12 },
  cameraText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  disabled: { opacity: 0.45 },
});
