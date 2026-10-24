import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/Typography";
import { beepError } from "@/services/scanner";

export interface BarcodeErrorDetails {
  scannedValue: string;
  expectedValue?: string | null;
  reason?: string | null;
}

type BarcodeAlertData = BarcodeErrorDetails;

export function useBarcodeAlert() {
  const [alert, setAlert] = useState<BarcodeAlertData | null>(null);
  const showBarcodeAlert = useCallback((scannedValue: string, expectedValue?: string | null, reason?: string | null) => {
    beepError();
    setAlert({ scannedValue, expectedValue, reason });
  }, []);
  const dismissBarcodeAlert = useCallback(() => setAlert(null), []);
  return { barcodeAlert: alert, showBarcodeAlert, dismissBarcodeAlert };
}

interface Props extends BarcodeErrorDetails {
  visible: boolean;
  onRetry: () => void;
}

function BarcodeErrorModalView({ visible, scannedValue, expectedValue, reason, onRetry }: Props) {
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.94);
    opacity.setValue(0);
    const animation = Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [visible, opacity, scale]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onRetry}>
      <View style={s.overlay}>
        <Animated.View style={[s.card, { width: Math.min(width - 36, 420), maxHeight: Math.max(240, height - 48), opacity, transform: [{ scale }] }]}>
          <View style={s.iconWrap}><Ionicons name="close-circle" size={34} color="#DC2626" /></View>
          <Text style={s.title}>Wrong Barcode!</Text>
          <Text style={s.subtitle}>This barcode doesn't match the expected item.</Text>
          <View style={s.divider} />
          <View style={s.details}>
            <Text style={s.label}>SCANNED BARCODE</Text>
            <Text selectable style={s.value}>{scannedValue.trim() || "No barcode entered"}</Text>
            {expectedValue?.trim() ? <>
              <Text style={s.label}>EXPECTED SKU / BARCODE</Text>
              <Text selectable style={s.expected}>{expectedValue.trim()}</Text>
            </> : null}
            <Text style={s.label}>REASON</Text>
            <Text style={s.reason}>{reason?.trim() || "The barcode could not be matched. Please verify the product and try again."}</Text>
          </View>
          <View style={s.notice}>
            <Ionicons name="information-circle-outline" size={18} color="#991B1B" />
            <Text style={s.noticeText}>No quantity was added. Your current item is unchanged.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Scan barcode again" onPress={onRetry} style={({ pressed }) => [s.button, pressed && s.buttonPressed]}>
            <Ionicons name="scan-outline" size={20} color="#FFFFFF" />
            <Text style={s.buttonText}>Scan Again</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function BarcodeErrorModal({ alert, onDismiss }: { alert: BarcodeAlertData | null; onDismiss: () => void }) {
  return (
    <BarcodeErrorModalView
      visible={Boolean(alert)}
      scannedValue={alert?.scannedValue ?? ""}
      expectedValue={alert?.expectedValue}
      reason={alert?.reason}
      onRetry={onDismiss}
    />
  );
}

export default function LegacyBarcodeErrorModal(props: Props) {
  return <BarcodeErrorModalView {...props} />;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.58)", alignItems: "center", justifyContent: "center", padding: 18 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 24, borderWidth: 1, borderColor: "#FECACA", padding: 22, alignItems: "stretch", shadowColor: "#0F172A", shadowOpacity: 0.22, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 16 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { color: "#111827", fontSize: 21, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#64748B", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 7 },
  divider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 18 },
  details: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, padding: 14, gap: 6, backgroundColor: "#F9FAFB" },
  label: { color: "#64748B", fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  value: { color: "#111827", fontSize: 14, fontWeight: "700", lineHeight: 20 },
  expected: { color: "#166534", fontSize: 14, fontWeight: "800", lineHeight: 20 },
  reason: { color: "#374151", fontSize: 13, lineHeight: 19 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FFF1F2", borderWidth: 1, borderColor: "#FECDD3", borderRadius: 12, padding: 11, marginTop: 14 },
  noticeText: { flex: 1, color: "#9F1239", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  button: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#B91C1C", backgroundColor: "#DC2626", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 18, paddingHorizontal: 16 },
  buttonPressed: { backgroundColor: "#B91C1C", transform: [{ scale: 0.99 }] },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
