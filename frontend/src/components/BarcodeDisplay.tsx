import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
          <View style={s.labelWrap}>
            <Ionicons name="barcode-outline" size={16} color={theme.color.primaryContainer} />
            <Text style={s.label}>{label}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy ${label.toLowerCase()}`}
            onPress={() => void copy()}
            disabled={!value || disabled}
            style={({ pressed }) => [
              s.copy,
              (!value || disabled) && s.disabled,
              pressed && !disabled ? { opacity: 0.8 } : null,
            ]}
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={14}
              color={copied ? theme.color.okInk : theme.color.primary}
            />
            <Text style={[s.copyText, copied && { color: theme.color.okInk }]}>
              {copied ? "Copied" : "Copy"}
            </Text>
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
                style={({ pressed }) => [s.scan, disabled && s.disabled, pressed ? { opacity: 0.85 } : null]}
              >
                <Ionicons name="camera-outline" size={16} color="#ffffff" />
                <Text style={s.scanText}>Scan</Text>
              </Pressable>
            </View>
            {match === true ? (
              <View style={s.matchSuccessRow}>
                <Ionicons name="checkmark-circle" size={14} color={theme.color.okInk} />
                <Text style={s.successText}>Barcode matches expected product.</Text>
              </View>
            ) : null}
            {match === false ? (
              <View style={s.matchErrorRow}>
                <Ionicons name="close-circle" size={14} color={theme.color.badInk} />
                <Text style={s.errorText}>Wrong barcode. Rescan the correct product.</Text>
              </View>
            ) : null}
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
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginTop: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  labelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
    textTransform: "uppercase",
  },
  copy: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceContainer,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  copyText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.color.primary,
  },
  disabled: {
    opacity: 0.45,
  },
  expectedRow: {
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  value: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
    letterSpacing: 1,
  },
  inputLabel: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
    marginTop: theme.space.sm,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    overflow: "hidden",
    minHeight: theme.touch.min,
  },
  inputSuccess: {
    borderColor: theme.color.okPrimary,
  },
  inputError: {
    borderColor: theme.color.critical,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
  },
  scan: {
    backgroundColor: theme.color.primaryContainer,
    paddingHorizontal: 14,
    minHeight: theme.touch.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  scanText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  matchSuccessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  successText: {
    ...(theme.type.labelSm as object),
    color: theme.color.okInk,
  },
  matchErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  errorText: {
    ...(theme.type.labelSm as object),
    color: theme.color.badInk,
  },
});
