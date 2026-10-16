import { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/Typography";
import { theme } from "@/components/ui";

export interface BarcodeErrorDetails {
  scannedValue: string;
  expectedValue?: string | null;
  reason?: string | null;
}

interface Props extends BarcodeErrorDetails {
  visible: boolean;
  onRetry: () => void;
}

export default function BarcodeErrorModal({ visible, scannedValue, expectedValue, reason, onRetry }: Props) {
  const { width } = useWindowDimensions();
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      scale.setValue(0.94);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, opacity, scale]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onRetry}>
      <View style={s.overlay}>
        <Animated.View style={[s.card, { width: Math.min(width - 36, 420), opacity, transform: [{ scale }] }]}>
          <View style={s.iconWrap}><Ionicons name="close-circle" size={34} color="#DC2626" /></View>
          <Text style={s.title}>Barcode Not Accepted</Text>
          <Text style={s.subtitle}>This scan could not be accepted for the current item.</Text>
          <View style={s.divider} />
          <View style={s.details}>
            <Text style={s.label}>SCANNED CODE</Text>
            <Text selectable style={s.value}>{scannedValue.trim() || "No barcode entered"}</Text>
            {expectedValue?.trim() ? <><Text style={s.label}>CURRENT ITEM / SKU</Text><Text selectable style={s.value}>{expectedValue.trim()}</Text></> : null}
            <Text style={s.label}>REASON</Text>
            <Text style={s.reason}>{reason?.trim() || "The barcode could not be matched. Please verify the product and try again."}</Text>
          </View>
          <View style={s.notice}><Ionicons name="information-circle-outline" size={18} color="#991B1B" /><Text style={s.noticeText}>No quantity was added. Your current item is unchanged.</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Scan barcode again" onPress={onRetry} style={({ pressed }) => [s.button, pressed && s.buttonPressed]}>
            <Ionicons name="scan-outline" size={20} color="#FFFFFF" /><Text style={s.buttonText}>Scan Again</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
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
  reason: { color: "#374151", fontSize: 13, lineHeight: 19 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FFF1F2", borderWidth: 1, borderColor: "#FECDD3", borderRadius: 12, padding: 11, marginTop: 14 },
  noticeText: { flex: 1, color: "#9F1239", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  button: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#B91C1C", backgroundColor: "#DC2626", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 18, paddingHorizontal: 16 },
  buttonPressed: { backgroundColor: "#B91C1C", transform: [{ scale: 0.99 }] },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
