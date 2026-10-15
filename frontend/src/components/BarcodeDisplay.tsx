import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";
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
  const inputRef = useRef<TextInputInstance>(null);
  const prevInputRef = useRef<string | undefined>(inputValue);
  const editable = inputValue !== undefined && onInputChange !== undefined;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  // Whenever inputValue is cleared to "" (e.g. after a wrong barcode alert or completed scan),
  // ensure the native TextInput buffer is emptied and ready for the next scan.
  useEffect(() => {
    if (
      editable &&
      prevInputRef.current &&
      prevInputRef.current.length > 0 &&
      inputValue === ""
    ) {
      inputRef.current?.clear();
      if (!disabled && !scannerVisible) {
        const timer = setTimeout(() => inputRef.current?.focus(), 60);
        prevInputRef.current = inputValue;
        return () => clearTimeout(timer);
      }
    }
    prevInputRef.current = inputValue;
  }, [editable, inputValue, disabled, scannerVisible]);

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
            <Ionicons name="barcode-outline" size={15} color={theme.color.primaryContainer} />
            <Text style={s.label}>{label}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy ${label.toLowerCase()}`}
            onPress={() => void copy()}
            disabled={!value || disabled}
            style={({ pressed }) => [s.copy, (!value || disabled) && s.disabled, pressed && !disabled ? { opacity: 0.8 } : null]}
          >
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={13} color={copied ? theme.color.okInk : theme.color.primary} />
            <Text style={[s.copyText, copied && { color: theme.color.okInk }]}>{copied ? "Copied" : "Copy"}</Text>
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
                ref={inputRef}
                value={inputValue}
                onChangeText={onInputChange}
                onSubmitEditing={onSubmit}
                placeholder={inputPlaceholder}
                placeholderTextColor={theme.color.muted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!disabled}
                returnKeyType="done"
                blurOnSubmit={false}
                style={s.input}
              />
              {inputValue && inputValue.length > 0 && !disabled ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear barcode text"
                  onPress={() => {
                    inputRef.current?.clear();
                    onInputChange?.("");
                    inputRef.current?.focus();
                  }}
                  hitSlop={8}
                  style={s.clearBtn}
                >
                  <Ionicons name="close-circle" size={17} color={theme.color.muted} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Confirm barcode"
                onPress={onSubmit}
                disabled={disabled}
                style={({ pressed }) => [s.confirmInline, disabled && s.disabled, pressed ? { opacity: 0.85 } : null]}
              >
                <Ionicons name="checkmark-circle" size={15} color="#ffffff" />
                <Text style={s.confirmInlineText}>Confirm</Text>
              </Pressable>
            </View>
            {match === true ? (
              <View style={s.matchSuccessRow}>
                <Ionicons name="checkmark-circle" size={13} color={theme.color.okInk} />
                <Text style={s.successText}>Barcode matches expected product.</Text>
              </View>
            ) : null}
            {match === false ? (
              <View style={s.matchErrorRow}>
                <Ionicons name="close-circle" size={13} color={theme.color.badInk} />
                <Text style={s.errorText}>Wrong barcode. Submit or scan the matching SKU.</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      {editable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Scan ${label.toLowerCase()} with camera`}
          onPress={() => setScannerVisible(true)}
          disabled={disabled}
          style={({ pressed }) => [s.scanBottom, disabled && s.disabled, pressed ? { opacity: 0.85 } : null]}
        >
          <Ionicons name="camera-outline" size={17} color="#ffffff" />
          <Text style={s.scanBottomText}>Scan barcode</Text>
        </Pressable>
      ) : null}

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
    borderRadius: theme.radius.md,
    padding: theme.space.xs,
    marginTop: 2,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  labelWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
  label: { ...(theme.type.labelSm as object), color: theme.color.muted, fontSize: 10, textTransform: "uppercase" },
  copy: { minHeight: 28, paddingHorizontal: 8, borderRadius: theme.radius.sm, backgroundColor: theme.color.surfaceContainer, flexDirection: "row", alignItems: "center", gap: 4 },
  copyText: { fontSize: 11, fontWeight: "700", color: theme.color.primary },
  disabled: { opacity: 0.45 },
  expectedRow: { backgroundColor: theme.color.surfaceContainerLow, borderRadius: theme.radius.sm, paddingVertical: 5, paddingHorizontal: 8, marginTop: 4, borderWidth: 1, borderColor: theme.color.line },
  value: { fontSize: 16, lineHeight: 20, fontWeight: "800", color: theme.color.ink, letterSpacing: 0.8 },
  inputLabel: { ...(theme.type.labelSm as object), color: theme.color.muted, fontSize: 10, marginTop: 4, marginBottom: 2 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: theme.color.line, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, overflow: "hidden", minHeight: 38 },
  inputSuccess: { borderColor: theme.color.okPrimary, borderWidth: 1.5 },
  inputError: { borderColor: theme.color.badPrimary, borderWidth: 1.5 },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, color: theme.color.ink },
  clearBtn: { paddingHorizontal: 6, paddingVertical: 4, alignItems: "center", justifyContent: "center" },
  confirmInline: { minHeight: 38, alignSelf: "stretch", paddingHorizontal: 10, backgroundColor: theme.color.okPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  confirmInlineText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  scanBottom: { minHeight: 40, marginTop: 6, borderRadius: theme.radius.md, backgroundColor: theme.color.primaryContainer, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  scanBottomText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  matchSuccessRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  successText: { fontSize: 10, fontWeight: "600", color: theme.color.okInk },
  matchErrorRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  errorText: { fontSize: 10, fontWeight: "600", color: theme.color.badInk },
});
