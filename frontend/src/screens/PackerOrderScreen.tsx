import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  LoadingState,
  PrimaryButton,
  Screen,
  StatusBadge,
  SuccessFeedback,
  theme,
} from "@/components/ui";
import { newIdemKey } from "@/repositories/pickerRepository";
import BarcodeScannerModal from "@/scanner/BarcodeScannerModal";
import * as client from "@/api/client";

export function PackerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<client.OrderDetail | null>(null);
  const [riders, setRiders] = useState<client.Rider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [riderModal, setRiderModal] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, riderData] = await Promise.all([
        client.packerOrder(String(id)),
        client.packerRiders(),
      ]);
      setOrder(detail.order);
      setRiders(riderData.riders);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load order");
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function scan(value?: string) {
    const code = (value ?? barcode).trim();
    if (!code || busy || !order) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setBarcode(code);
    try {
      const result = await client.packerScanBarcode(String(id), code, newIdemKey());
      setOrder(result.order);
      setBarcode("");
      const item = result.item;
      const packedText = item ? item.packedQty + "/" + item.pickedQty : "";
      setSuccess("Item packed successfully. " + (item ? item.productName : "") + (packedText ? " (" + packedText + ")" : ""));
      if (result.allPacked) {
        setSuccess("All items packed! Order is ready for rider assignment.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Barcode scan failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyBarcode(value: string) {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopiedBarcode(value);
    setTimeout(() => setCopiedBarcode(current => current === value ? null : current), 1400);
  }

  async function assign(rider: client.Rider) {
    if (!order || assigning) return;
    setAssigning(true);
    setError(null);
    try {
      const result = await client.assignRider(order.id, rider.id, rider.name, newIdemKey());
      setOrder(prev => prev ? { ...prev, status: "RIDER_ASSIGNED", riderId: rider.id, riderName: rider.name } : prev);
      setRiderModal(false);
      setSuccess("Rider assigned successfully!");
      void result;
      setTimeout(() => {
        router.replace({ pathname: "/packer-dashboard", params: { message: "Rider assigned successfully!" } } as never);
      }, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rider assignment failed");
    } finally {
      setAssigning(false);
    }
  }

  if (!order) {
    return (
      <Screen>
        <AppHeader title="Packing order" />
        <ErrorBanner message={error} />
        <LoadingState label="Loading order…" />
      </Screen>
    );
  }

  const packed = order.items.reduce((sum, item) => sum + item.packedQty, 0);
  const picked = order.items.reduce((sum, item) => sum + item.pickedQty, 0);
  const allPacked = order.status === "PACKED" || order.status === "RIDER_ASSIGNED" || (picked > 0 && packed >= picked);
  const progress = picked > 0 ? Math.min(100, Math.round((packed / picked) * 100)) : 0;

  return (
    <Screen>
      <AppHeader title={order.orderNumber} sub={order.customer || "Unknown Customer"} />
      <Pressable onPress={() => router.back()} style={s.back}>
        <Text style={s.backText}>← Back to orders</Text>
      </Pressable>

      <View style={s.statusRow}>
        <Text style={s.progressLabel}>Pack Progress</Text>
        <Text style={s.progressCount}>{packed}/{picked} items</Text>
      </View>
      <View style={s.progress}><View style={[s.fill, { width: (progress + "%") as `${number}%` }]} /></View>

      <View style={s.scanRow}>
        <TextInput
          value={barcode}
          onChangeText={setBarcode}
          onSubmitEditing={() => void scan()}
          placeholder="Scan barcode..."
          placeholderTextColor={theme.color.faint}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy && order.status !== "PACKED" && order.status !== "RIDER_ASSIGNED"}
          style={s.scanInput}
        />
        <Pressable style={s.camera} onPress={() => setScannerVisible(true)} disabled={busy}>
          <Text style={s.cameraText}>▣</Text>
        </Pressable>
        <Pressable style={[s.scanButton, busy && s.disabled]} onPress={() => void scan()} disabled={busy}>
          <Text style={s.scanButtonText}>{busy ? "..." : "Scan"}</Text>
        </Pressable>
      </View>

      <ErrorBanner message={error} />
      <SuccessFeedback message={success} />

      <Text style={s.section}>Items</Text>
      {order.items.map(item => {
        const done = item.packedQty >= item.pickedQty;
        return (
          <View key={item.id} style={[s.item, done && s.itemDone]}>
            <Text style={s.check}>{done ? "☑" : "☐"}</Text>
            <View style={s.itemMain}>
              <Text style={s.name}>{item.productName}</Text>
              <Text style={s.specs}>{item.productSpecs || ""}</Text>
              <View style={s.barcodeRow}>
                <Text selectable style={s.sku}>{item.skuBarcode}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Copy barcode for ${item.productName}`}
                  onPress={() => void copyBarcode(item.skuBarcode)}
                  style={s.copyBarcode}
                >
                  <Text style={s.copyBarcodeText}>{copiedBarcode === item.skuBarcode ? "Copied" : "Copy barcode"}</Text>
                </Pressable>
              </View>
            </View>
            <Text style={s.qty}>{item.packedQty}/{item.pickedQty}</Text>
          </View>
        );
      })}

      {order.recentScans.length > 0 ? (
        <>
          <Text style={s.section}>Recent Scans</Text>
          {order.recentScans.map((scanItem, index) => {
            const item = order.items.find(i => i.id === scanItem.itemId);
            return (
              <View key={scanItem.createdAt + scanItem.itemId + index} style={s.recent}>
                <Text style={s.recentCheck}>✓</Text>
                <Text style={s.recentBarcode}>{scanItem.barcode}</Text>
                <Text style={s.recentName} numberOfLines={1}>{item?.productName || "Item"}</Text>
                <Text style={s.recentTime}>{new Date(scanItem.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
            );
          })}
        </>
      ) : null}

      {allPacked ? (
        <>
          <View style={s.allPacked}>
            <Text style={s.allPackedTitle}>✓ All items packed!</Text>
            <Text style={s.allPackedText}>Order is ready for rider assignment.</Text>
          </View>
          {order.status === "PACKED" ? (
            <PrimaryButton label="Assign Rider" onPress={() => setRiderModal(true)} disabled={assigning} />
          ) : (
            <View style={s.assigned}><Text style={s.assignedText}>Rider assigned successfully!</Text></View>
          )}
        </>
      ) : null}

      <BarcodeScannerModal
        visible={scannerVisible}
        title="Scan product barcode"
        onScanned={value => { setScannerVisible(false); void scan(value); }}
        onClose={() => setScannerVisible(false)}
      />

      <Modal visible={riderModal} transparent animationType="fade" onRequestClose={() => setRiderModal(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Rider</Text>
              <Pressable onPress={() => setRiderModal(false)}><Text style={s.close}>×</Text></Pressable>
            </View>
            {riders.map(rider => (
              <Pressable key={rider.id} style={s.rider} onPress={() => void assign(rider)} disabled={assigning}>
                <View style={s.riderMain}>
                  <Text style={s.riderName}>{rider.name}</Text>
                  <Text style={s.riderPhone}>{rider.phone || ""}</Text>
                  <Text style={s.riderType}>BIKE</Text>
                </View>
                <Text style={s.available}>AVAILABLE</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  back: { marginBottom: theme.space.sm },
  backText: { ...(theme.type.bodyMd as object), color: theme.color.tertiary },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: theme.space.sm },
  progressLabel: { ...(theme.type.labelMd as object), color: theme.color.ink },
  progressCount: { ...(theme.type.secondary as object), color: theme.color.muted },
  progress: { height: 8, backgroundColor: theme.color.surfaceContainerHigh, borderRadius: 5, overflow: "hidden", marginTop: theme.space.xs, marginBottom: theme.space.sm },
  fill: { height: 8, backgroundColor: theme.color.tertiary, borderRadius: 5 },
  scanRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  scanInput: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: theme.color.line, borderRadius: 10, paddingHorizontal: 12, color: theme.color.ink, backgroundColor: theme.color.surface },
  camera: { width: 46, height: 46, borderRadius: 10, backgroundColor: "#6750d8", alignItems: "center", justifyContent: "center" },
  cameraText: { color: "#fff", fontSize: 18 },
  scanButton: { minHeight: 46, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#61d7c7", alignItems: "center", justifyContent: "center" },
  scanButtonText: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.45 },
  section: { ...(theme.type.labelLg as object), color: theme.color.ink, marginTop: theme.space.md, marginBottom: theme.space.xs },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.line, borderRadius: theme.radius.md, padding: theme.space.sm, marginBottom: theme.space.xs },
  itemDone: { borderColor: theme.color.primary, backgroundColor: theme.color.okBg },
  check: { fontSize: 18, color: theme.color.primary, width: 26 },
  itemMain: { flex: 1 },
  name: { ...(theme.type.bodyMd as object), color: theme.color.ink, fontWeight: "700" },
  specs: { ...(theme.type.secondary as object), color: theme.color.muted, marginTop: 2 },
  barcodeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  sku: { ...(theme.type.caption as object), color: theme.color.muted, flex: 1 },
  copyBarcode: { borderWidth: 1, borderColor: theme.color.line, borderRadius: theme.radius.sm, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: theme.color.surfaceContainerLow },
  copyBarcodeText: { ...(theme.type.caption as object), color: theme.color.primary, fontWeight: "800" },
  qty: { ...(theme.type.labelLg as object), color: theme.color.ink },
  allPacked: { backgroundColor: theme.color.okBg, borderWidth: 1, borderColor: theme.color.primary, borderRadius: theme.radius.md, padding: theme.space.sm, marginTop: theme.space.sm },
  allPackedTitle: { ...(theme.type.labelLg as object), color: theme.color.okInk },
  allPackedText: { ...(theme.type.secondary as object), color: theme.color.okInk, marginTop: 2 },
  assigned: { backgroundColor: theme.color.okBg, borderRadius: theme.radius.md, padding: theme.space.sm, marginTop: theme.space.sm },
  assignedText: { ...(theme.type.labelLg as object), color: theme.color.okInk, textAlign: "center" },
  recent: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.color.line },
  recentCheck: { color: theme.color.okInk, fontWeight: "800" },
  recentBarcode: { ...(theme.type.caption as object), color: theme.color.ink, minWidth: 100 },
  recentName: { flex: 1, ...(theme.type.caption as object), color: theme.color.muted },
  recentTime: { ...(theme.type.caption as object), color: theme.color.muted },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modal: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: theme.space.md },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.space.sm },
  modalTitle: { ...(theme.type.titleMd as object), color: theme.color.ink },
  close: { fontSize: 28, color: theme.color.muted },
  rider: { borderWidth: 1, borderColor: theme.color.line, borderRadius: theme.radius.md, padding: theme.space.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: theme.space.xs },
  riderMain: { flex: 1 },
  riderName: { ...(theme.type.body as object), color: theme.color.ink, fontWeight: "700" },
  riderPhone: { ...(theme.type.secondary as object), color: theme.color.muted },
  riderType: { ...(theme.type.caption as object), color: theme.color.muted, marginTop: 2 },
  available: { ...(theme.type.caption as object), color: theme.color.okInk, backgroundColor: theme.color.okBg, paddingHorizontal: 7, paddingVertical: 4, borderRadius: theme.radius.pill },
});
