import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
      setSuccess("Item packed successfully: " + (item ? item.productName : "") + (packedText ? " (" + packedText + ")" : ""));
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
        <AppHeader title="Packing Order" showBack />
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
      <AppHeader title={order.orderNumber} sub={order.customer || "Warehouse Customer"} showBack />

      <View style={s.card}>
        <View style={s.statusRow}>
          <Text style={s.progressLabel}>Packing Progress</Text>
          <Text style={s.progressCount}>{packed} of {picked} units packed ({progress}%)</Text>
        </View>
        <View style={s.progress}>
          <View style={[s.fill, { width: `${progress}%` }]} />
        </View>

        <View style={s.scanRow}>
          <TextInput
            value={barcode}
            onChangeText={setBarcode}
            onSubmitEditing={() => void scan()}
            placeholder="Scan or type item barcode…"
            placeholderTextColor={theme.color.faint}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy && order.status !== "PACKED" && order.status !== "RIDER_ASSIGNED"}
            style={s.scanInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan with camera"
            style={({ pressed }) => [s.camera, pressed ? { opacity: 0.85 } : null]}
            onPress={() => setScannerVisible(true)}
            disabled={busy}
          >
            <Ionicons name="camera-outline" size={20} color="#ffffff" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Submit barcode"
            style={({ pressed }) => [s.scanButton, busy && s.disabled, pressed ? { opacity: 0.85 } : null]}
            onPress={() => void scan()}
            disabled={busy}
          >
            <Text style={s.scanButtonText}>{busy ? "…" : "Verify"}</Text>
          </Pressable>
        </View>
      </View>

      <ErrorBanner message={error} />
      <SuccessFeedback message={success} />

      <Text style={s.section}>Order Items</Text>
      {order.items.map(item => {
        const done = item.packedQty >= item.pickedQty;
        return (
          <View key={item.id} style={[s.item, done && s.itemDone]}>
            <Ionicons
              name={done ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={done ? theme.color.okInk : theme.color.muted}
              style={{ marginRight: 10 }}
            />
            <View style={s.itemMain}>
              <Text style={s.name}>{item.productName}</Text>
              {item.productSpecs ? <Text style={s.specs}>{item.productSpecs}</Text> : null}
              <View style={s.barcodeRow}>
                <Ionicons name="barcode-outline" size={13} color={theme.color.muted} />
                <Text selectable style={s.sku}>{item.skuBarcode}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Copy barcode for ${item.productName}`}
                  onPress={() => void copyBarcode(item.skuBarcode)}
                  style={s.copyBarcode}
                  hitSlop={6}
                >
                  <Text style={s.copyBarcodeText}>{copiedBarcode === item.skuBarcode ? "Copied" : "Copy"}</Text>
                </Pressable>
              </View>
            </View>
            <View style={s.qtyBadge}>
              <Text style={[s.qty, done && { color: theme.color.okInk }]}>
                {item.packedQty}/{item.pickedQty}
              </Text>
            </View>
          </View>
        );
      })}

      {order.recentScans.length > 0 ? (
        <>
          <Text style={s.section}>Recent Scans</Text>
          <View style={s.recentList}>
            {order.recentScans.map((scanItem, index) => {
              const item = order.items.find(i => i.id === scanItem.itemId);
              return (
                <View key={scanItem.createdAt + scanItem.itemId + index} style={s.recent}>
                  <Ionicons name="checkmark-sharp" size={14} color={theme.color.okInk} />
                  <Text style={s.recentBarcode}>{scanItem.barcode}</Text>
                  <Text style={s.recentName} numberOfLines={1}>{item?.productName || "Item"}</Text>
                  <Text style={s.recentTime}>{new Date(scanItem.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {allPacked ? (
        <View style={{ marginTop: theme.space.md }}>
          <View style={s.allPacked}>
            <Ionicons name="checkmark-circle" size={24} color={theme.color.okInk} />
            <View style={{ flex: 1 }}>
              <Text style={s.allPackedTitle}>All items packed & verified!</Text>
              <Text style={s.allPackedText}>Order is ready for dispatch rider assignment.</Text>
            </View>
          </View>
          {order.status === "PACKED" ? (
            <PrimaryButton
              label="ASSIGN DISPATCH RIDER"
              icon="bicycle-outline"
              variant="amber"
              onPress={() => setRiderModal(true)}
              disabled={assigning}
            />
          ) : (
            <View style={s.assigned}>
              <Ionicons name="checkmark-done-circle" size={20} color={theme.color.okInk} />
              <Text style={s.assignedText}>Rider assigned: {order.riderName || "Assigned"}</Text>
            </View>
          )}
        </View>
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
              <Text style={s.modalTitle}>Select Dispatch Rider</Text>
              <Pressable onPress={() => setRiderModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.color.muted} />
              </Pressable>
            </View>
            {riders.map(rider => (
              <Pressable
                key={rider.id}
                style={({ pressed }) => [s.rider, pressed ? { opacity: 0.85 } : null]}
                onPress={() => void assign(rider)}
                disabled={assigning}
              >
                <View style={s.riderMain}>
                  <Text style={s.riderName}>{rider.name}</Text>
                  <Text style={s.riderPhone}>{rider.phone || "No phone listed"}</Text>
                  <Text style={s.riderType}>Standard Delivery Bike</Text>
                </View>
                <View style={s.availablePill}>
                  <Text style={s.available}>AVAILABLE</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderWidth: 1.5,
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
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  progressLabel: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
    textTransform: "uppercase",
  },
  progressCount: {
    ...(theme.type.labelSm as object),
    color: theme.packer.primaryDark,
    fontWeight: "700",
  },
  progress: {
    height: 8,
    backgroundColor: theme.color.surfaceContainerHigh,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 6,
    marginBottom: theme.space.sm,
  },
  fill: {
    height: 8,
    backgroundColor: theme.packer.primary,
    borderRadius: 4,
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  scanInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    color: theme.color.ink,
    backgroundColor: theme.color.surfaceContainerLow,
    ...(theme.type.bodyMd as object),
  },
  camera: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.md,
    backgroundColor: theme.packer.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  scanButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  scanButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
  disabled: { opacity: 0.45 },
  section: {
    ...(theme.type.section as object),
    color: theme.color.ink,
    marginTop: theme.space.lg,
    marginBottom: theme.space.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginBottom: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  itemDone: {
    borderColor: theme.color.okBorder,
    backgroundColor: "#fafdfb",
  },
  itemMain: { flex: 1, minWidth: 0 },
  name: {
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
    fontWeight: "700",
  },
  specs: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 1,
  },
  barcodeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    minWidth: 0,
  },
  sku: {
    ...(theme.type.codeMd as object),
    fontSize: 12,
    color: theme.color.muted,
    flexShrink: 1,
    minWidth: 0,
  },
  copyBarcode: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: theme.color.surfaceContainer,
  },
  copyBarcodeText: {
    fontSize: 10,
    color: theme.color.primary,
    fontWeight: "700",
  },
  qtyBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceContainerLow,
  },
  qty: {
    ...(theme.type.codeLg as object),
    fontSize: 15,
    color: theme.color.ink,
  },
  allPacked: {
    backgroundColor: theme.color.okBg,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  allPackedTitle: {
    ...(theme.type.section as object),
    color: theme.color.okInk,
  },
  allPackedText: {
    ...(theme.type.secondary as object),
    color: theme.color.okInk,
    marginTop: 2,
  },
  assigned: {
    backgroundColor: theme.color.okBg,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginTop: theme.space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  assignedText: {
    ...(theme.type.labelMd as object),
    color: theme.color.okInk,
    fontWeight: "700",
  },
  recentList: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingHorizontal: theme.space.sm,
  },
  recent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  recentBarcode: {
    ...(theme.type.codeMd as object),
    fontSize: 12,
    color: theme.color.ink,
    minWidth: 100,
  },
  recentName: {
    flex: 1,
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
  recentTime: {
    ...(theme.type.caption as object),
    color: theme.color.muted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    padding: theme.space.lg,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.space.md,
  },
  modalTitle: {
    ...(theme.type.titleMd as object),
    color: theme.color.ink,
  },
  rider: {
    borderWidth: 1.5,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.space.xs,
    backgroundColor: theme.color.surface,
  },
  riderMain: { flex: 1 },
  riderName: {
    ...(theme.type.body as object),
    color: theme.color.ink,
    fontWeight: "700",
  },
  riderPhone: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  riderType: {
    ...(theme.type.caption as object),
    color: theme.color.primaryContainer,
    marginTop: 2,
    fontWeight: "600",
  },
  availablePill: {
    backgroundColor: theme.color.okBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
  },
  available: {
    ...(theme.type.labelSm as object),
    color: theme.color.okInk,
  },
});
