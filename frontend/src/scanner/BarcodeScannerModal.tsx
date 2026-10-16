import { Text } from "@/components/Typography";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { theme } from "@/components/ui";

type Props = {
  visible: boolean;
  title?: string;
  onScanned: (value: string) => void;
  onClose: () => void;
  continuous?: boolean;
};

export default function BarcodeScannerModal({ visible, title = "Scan Barcode", onScanned, onClose, continuous = false }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [blocked, setBlocked] = useState(false);
  const scanLock = useRef(false);
  const lastContinuousValue = useRef<string | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      scanLock.current = false;
      lastContinuousValue.current = null;
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
      setBlocked(false);
      return;
    }
    if (!permission?.granted) {
      void requestPermission().then(result => setBlocked(!result.granted));
    }
  }, [visible, permission?.granted, requestPermission]);

  const handleScan = (data: string) => {
    const value = data.trim();
    if (!value) return;

    if (!continuous) {
      if (scanLock.current) return;
      scanLock.current = true;
      onScanned(value);
      onClose();
      return;
    }

    // While a barcode stays in frame, repeated camera callbacks refresh this lock.
    // A new barcode can be accepted immediately; the same one is accepted again
    // only after it has been absent from camera callbacks for 750 ms.
    if (lastContinuousValue.current === value) {
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = setTimeout(() => {
        lastContinuousValue.current = null;
        releaseTimer.current = null;
      }, 750);
      return;
    }

    lastContinuousValue.current = value;
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => {
      lastContinuousValue.current = null;
      releaseTimer.current = null;
    }, 750);
    onScanned(value);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={s.container}>
        {blocked ? (
          <View style={s.permission}>
            <Text style={s.permissionTitle}>Camera permission required</Text>
            <Text style={s.permissionText}>Allow camera access in your phone settings to scan barcodes.</Text>
            <Pressable style={s.primaryButton} onPress={() => void requestPermission().then(r => setBlocked(!r.granted))}>
              <Text style={s.primaryText}>ALLOW CAMERA</Text>
            </Pressable>
            <Pressable style={s.secondaryButton} onPress={onClose}>
              <Text style={s.secondaryText}>CLOSE</Text>
            </Pressable>
          </View>
        ) : permission?.granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["code128", "code39", "ean13", "ean8", "upc_a", "upc_e", "itf14", "qr"],
              }}
              onBarcodeScanned={({ data }) => handleScan(data)}
            />
            <View style={s.overlay} pointerEvents="box-none">
              <View style={s.topBar}>
                <Text style={s.title}>{title}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close barcode scanner" style={s.close} onPress={onClose}>
                  <Text style={s.closeText}>Close</Text>
                </Pressable>
              </View>
              <View style={s.target} />
              <Text style={s.hint}>
                {continuous
                  ? "Scan each unit. Keep camera open and move each barcode away before scanning the next."
                  : "Align the barcode inside the frame"}
              </Text>
            </View>
          </>
        ) : (
          <View style={s.loading}><Text style={s.loadingText}>Opening camera…</Text></View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: "space-between", alignItems: "center", padding: 20 },
  topBar: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(0,0,0,0.58)", borderRadius: 14, padding: 12, marginTop: 8 },
  title: { fontFamily: "OpenSans", color: "#fff", fontSize: 17, fontWeight: "800" },
  close: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: "#fff", justifyContent: "center" },
  closeText: { color: theme.color.ink, fontWeight: "800" },
  target: { width: "82%", height: 150, borderWidth: 3, borderColor: "#fff", borderRadius: 18 },
  hint: { color: "#fff", backgroundColor: "rgba(0,0,0,0.62)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, fontWeight: "700", marginBottom: 32 },
  permission: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: theme.color.bg },
  permissionTitle: { ...theme.type.title, color: theme.color.ink, marginBottom: 8 },
  permissionText: { ...theme.type.bodyMd, color: theme.color.muted, marginBottom: 20 },
  primaryButton: { minHeight: 52, borderRadius: 12, backgroundColor: theme.color.primary, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  primaryText: { color: "#fff", fontWeight: "800" },
  secondaryButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.color.line, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: theme.color.ink, fontWeight: "800" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#fff", fontWeight: "700" },
});
