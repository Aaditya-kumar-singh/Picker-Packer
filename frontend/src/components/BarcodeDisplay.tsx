import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import BarcodeScannerModal from "@/scanner/BarcodeScannerModal";
import { theme } from "@/components/ui";

type Props = {
  label: string;
  value: string;
  scanTitle: string;
  onScanned: (value: string) => void;
  disabled?: boolean;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onSubmit?: () => void;
  inputPlaceholder?: string;
  match?: boolean | null;
};

export default function BarcodeDisplay({
  label,
  value,
  scanTitle,
  onScanned,
  disabled = false,
  inputValue,
  onInputChange,
  onSubmit,
  inputPlaceholder = "Type or scan barcode",
  match = null,
}: Props) {
  const [scannerVisible, setScannerVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const editable = inputValue !== undefined && onInputChange !== undefined;

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

  function scanned(scannedValue: string) {
    onScanned(scannedValue);
    setScannerVisible(false);
  }

  return (
    <>
      <View style={s.card}>
        <View style={s.header}>
          <Text style={s.label}>{label}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy ${label.toLowerCase()}`}
            onPress={() => void copy()}
            disabled={!value || disabled}
            style={[s.copy, (!value || disabled) && s.disabled]}
          >
            <Text style={s.copyText}>{copied ? "Copied" : "Copy"}</Text>
          </Pressable>
        </View>

        <View style={s.expectedRow}>
          <Text selectable style={s.value}>{value || "Not available"}</Text>
        </View>

        {editable ? (
          <>
            <Text style={s.inputLabel}>VERIFY BARCODE</Text>
            <View style={[s.inputRow, match === true && s.inputSuccess, match === false && s.inputError]}>
              <TextInput
                value={inputValue}
                onChangeText={onInputChange}
                onSubmitEditing={onSubmit}
                placeholder={inputPlaceholder}
                placeholderTextColor={theme.color.muted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!disabled}
                returnKeyType="done"
                style={s.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Scan ${label.toLowerCase()} with camera`}
                onPress={() => setScannerVisible(true)}
                disabled={disabled}
                style={[s.scan, disabled && s.disabled]}
              >
                <Text style={s.scanText}>Scan</Text>
              </Pressable>
            </View>
            {match === true ? <Text style={s.successText}>Barcode matches expected product.</Text> : null}
            {match === false ? <Text style={s.errorText}>Barcode does not match expected product.</Text> : null}
          </>
        ) : null}
      </View>

      <BarcodeScannerModal
        visible={scannerVisible}
        title={scanTitle}
        onScanned={scanned}
        onClose={() => setScannerVisible(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 12,
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.md,
    padding: 12,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...theme.type.caption, color: theme.color.primaryContainer },
  copy: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  copyText: { color: theme.color.ink, fontWeight: "800", fontSize: 11 },
  expectedRow: { marginTop: 5 },
  value: { ...theme.type.codeLg, color: theme.color.ink },
  inputLabel: {
    ...theme.type.caption,
    color: theme.color.muted,
    marginTop: 10,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: 10,
    backgroundColor: theme.color.surface,
    overflow: "hidden",
  },
  inputSuccess: { borderColor: theme.color.primary },
  inputError: { borderColor: theme.color.critical },
  input: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 11,
    color: theme.color.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  scan: {
    minHeight: 46,
    paddingHorizontal: 14,
    backgroundColor: theme.color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  scanText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  successText: { color: theme.color.okInk, fontSize: 11, fontWeight: "700", marginTop: 5 },
  errorText: { color: theme.color.critical, fontSize: 11, fontWeight: "700", marginTop: 5 },
  disabled: { opacity: 0.45 },
});
