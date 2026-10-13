// Packer Order Processing — Verify each item and prepare for dispatch.
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

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

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
      const packedText = item ? `${item.packedQty}/${item.pickedQty}` : "";
      setSuccess(`Packed: ${item ? item.productName : "Item"}${packedText ? ` (${packedText})` : ""}`);
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
    setTimeout(() => setCopiedBarcode((current) => (current === value ? null : current)), 1400);
  }

  async function assign(rider: client.Rider) {
    if (!order || assigning) return;
    setAssigning(true);
    setError(null);
    try {
      await client.assignRider(order.id, rider.id, rider.name, newIdemKey());
      setOrder((prev) =>
        prev ? { ...prev, status: "RIDER_ASSIGNED", riderId: rider.id, riderName: rider.name } : prev
      );
      setRiderModal(false);
      setSuccess("Rider assigned successfully!");
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
  const isEditable = !busy && order.status !== "PACKED" && order.status !== "RIDER_ASSIGNED";

  return (
    <Screen>
      <AppHeader
        title={order.orderNumber}
        sub={order.customer || "Warehouse Customer"}
        showBack
      />

      {/* Progress & Barcode Action Card */}
      <View style={s.card}>
        <View style={s.statusRow}>
          <Text style={s.progressLabel}>PACKING PROGRESS</Text>
          <Text style={s.progressCount}>
            {packed} of {picked} units ({progress}%)
          </Text>
        </View>

        <View style={s.progress}>
          <View style={[s.fill, { width: `${progress}%` }]} />
        </View>

        {isEditable ? (
          <View style={s.scanRow}>
            <TextInput
              value={barcode}
              onChangeText={setBarcode}
              onSubmitEditing={() => void scan()}
              placeholder="Scan or type item barcode…"
              placeholderTextColor={theme.color.faint}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              style={s.scanInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan with camera"
              style={({ pressed }) => [s.camera, pressed ? { opacity: 0.85 } : null]}
              onPress={() => setScannerVisible(true)}
              disabled={busy}
            >
              <Ionicons name="camera-outline" size={18} color="#ffffff" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Submit barcode"
              style={({ pressed }) => [s.scanButton, busy && s.disabled, pressed ? { opacity: 0.85 } : null]}
              onPress={() => void scan()}
              disabled={busy || !barcode.trim()}
            >
              <Text style={s.scanButtonText}>{busy ? "…" : "Verify"}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ErrorBanner message={error} />
      {success ? (
        <View style={s.packedFeedback} accessibilityRole="alert">
          <View style={s.packedFeedbackIcon}>
            <Ionicons name="checkmark-circle" size={30} color={theme.color.okInk} />
          </View>
          <Text style={s.packedFeedbackText}>{success}</Text>
        </View>
      ) : null}

      {/* Item Checklist Header */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Order Items</Text>
        <Text style={s.sectionHint}>{order.items.length} lines</Text>
      </View>

      {/* Item List */}
      {order.items.map((item) => {
        const done = item.packedQty >= item.pickedQty;
        return (
          <View key={item.id} style={[s.item, done && s.itemDone]}>
            <Ionicons
              name={done ? "checkmark-circle" : "ellipse-outline"}
              size={20}
              color={done ? theme.color.okInk : theme.color.muted}
              style={s.checkIcon}
            />

            <View style={s.itemMain}>
              <Text style={s.name}>{item.productName}</Text>
              {item.productSpecs ? <Text style={s.specs}>{item.productSpecs}</Text> : null}

              <View style={s.barcodeRow}>
                <Ionicons name="barcode-outline" size={13} color={theme.color.muted} />
                <Text selectable style={s.sku}>
                  {item.skuBarcode}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Copy barcode for ${item.productName}`}
                  onPress={() => void copyBarcode(item.skuBarcode)}
                  style={s.copyBarcode}
                  hitSlop={6}
                >
                  <Text style={s.copyBarcodeText}>
                    {copiedBarcode === item.skuBarcode ? "Copied" : "Copy"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={[s.qtyBadge, done && s.qtyBadgeDone]}>
              <Text style={[s.qty, done && { color: theme.color.okInk }]}>
                {item.packedQty}/{item.pickedQty}
              </Text>
            </View>
          </View>
        );
      })}

      {/* Recent Scans */}
      {order.recentScans.length > 0 ? (
        <View style={s.recentSection}>
          <Text style={s.recentSectionTitle}>Recent Scans</Text>
          <View style={s.recentList}>
            {order.recentScans.slice(-4).map((scanItem, index) => {
              const item = order.items.find((i) => i.id === scanItem.itemId);
              return (
                <View key={scanItem.createdAt + scanItem.itemId + index} style={s.recent}>
                  <Ionicons name="checkmark-sharp" size={13} color={theme.color.okInk} />
                  <Text style={s.recentBarcode}>{scanItem.barcode}</Text>
                  <Text style={s.recentName} numberOfLines={1}>
                    {item?.productName || "Item"}
                  </Text>
                  <Text style={s.recentTime}>
                    {new Date(scanItem.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Completion & Rider Assignment */}
      {allPacked ? (
        <View style={s.completionWrap}>
          <View style={s.allPacked}>
            <Ionicons name="checkmark-circle" size={22} color={theme.color.okInk} />
            <View style={{ flex: 1 }}>
              <Text style={s.allPackedTitle}>All items packed & verified</Text>
              <Text style={s.allPackedText}>Ready for dispatch rider assignment.</Text>
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
              <Ionicons name="checkmark-done-circle" size={18} color={theme.color.okInk} />
              <Text style={s.assignedText}>Rider: {order.riderName || "Assigned"}</Text>
            </View>
          )}
        </View>
      ) : null}

      <BarcodeScannerModal
        visible={scannerVisible}
        title="Scan product barcode"
        onScanned={(value) => {
          setScannerVisible(false);
          void scan(value);
        }}
        onClose={() => setScannerVisible(false)}
      />

      {/* Rider Selection Modal */}
      <Modal visible={riderModal} transparent animationType="fade" onRequestClose={() => setRiderModal(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Select Dispatch Rider</Text>
                <Text style={s.modalSub}>Assign available courier for delivery</Text>
              </View>
              <Pressable onPress={() => setRiderModal(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.color.muted} />
              </Pressable>
            </View>

            {riders.map((rider) => (
              <Pressable
                key={rider.id}
                style={({ pressed }) => [s.rider, pressed ? { opacity: 0.85 } : null]}
                onPress={() => void assign(rider)}
                disabled={assigning}
              >
                <View style={s.riderMain}>
                  <Text style={s.riderName}>{rider.name}</Text>
                  <Text style={s.riderPhone}>{rider.phone || "No phone listed"}</Text>
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
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  progressCount: {
    ...(theme.type.labelSm as object),
    color: theme.packer.primaryDark,
    fontWeight: "700",
  },
  progress: {
    height: 6,
    backgroundColor: theme.color.surfaceContainerHigh,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4,
    marginBottom: theme.space.xs,
  },
  fill: {
    height: 6,
    backgroundColor: theme.packer.primary,
    borderRadius: 3,
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  scanInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    color: theme.color.ink,
    backgroundColor: theme.color.surfaceContainerLow,
    fontSize: 13,
  },
  camera: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.packer.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  scanButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  scanButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  disabled: { opacity: 0.4 },
  packedFeedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 88,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: "#DDF8EC",
    borderWidth: 2,
    borderColor: "#42C99A",
    borderRadius: 20,
    shadowColor: "#087F5B",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  packedFeedbackIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#B9F0D8",
    alignItems: "center",
    justifyContent: "center",
  },
  packedFeedbackText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "800",
    color: "#075E46",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.space.md,
    marginBottom: theme.space.xs,
  },
  sectionTitle: {
    ...(theme.type.section as object),
    fontSize: 14,
    color: theme.color.ink,
  },
  sectionHint: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginBottom: 6,
  },
  itemDone: {
    borderColor: theme.color.okBorder,
    backgroundColor: "#fafdfb",
  },
  checkIcon: {
    marginRight: 8,
  },
  itemMain: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.color.ink,
  },
  specs: {
    fontSize: 11,
    color: theme.color.muted,
    marginTop: 1,
  },
  barcodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  sku: {
    ...(theme.type.codeMd as object),
    fontSize: 11,
    color: theme.color.muted,
  },
  copyBarcode: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: theme.color.surfaceContainer,
  },
  copyBarcodeText: {
    fontSize: 9,
    color: theme.color.primary,
    fontWeight: "700",
  },
  qtyBadge: {
    marginLeft: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceContainerLow,
  },
  qtyBadgeDone: {
    backgroundColor: theme.color.okBg,
  },
  qty: {
    ...(theme.type.codeLg as object),
    fontSize: 13,
    color: theme.color.ink,
  },
  recentSection: {
    marginTop: theme.space.sm,
    marginBottom: theme.space.xs,
  },
  recentSectionTitle: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
    marginBottom: 4,
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
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  recentBarcode: {
    ...(theme.type.codeMd as object),
    fontSize: 11,
    color: theme.color.ink,
    minWidth: 80,
  },
  recentName: {
    flex: 1,
    fontSize: 11,
    color: theme.color.muted,
  },
  recentTime: {
    fontSize: 10,
    color: theme.color.muted,
  },
  completionWrap: {
    marginTop: theme.space.sm,
  },
  allPacked: {
    backgroundColor: theme.color.okBg,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginBottom: theme.space.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  allPackedTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.color.okInk,
  },
  allPackedText: {
    fontSize: 11,
    color: theme.color.okInk,
    marginTop: 1,
  },
  assigned: {
    backgroundColor: theme.color.okBg,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
    paddingHorizontal: theme.space.sm,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  assignedText: {
    ...(theme.type.labelMd as object),
    color: theme.color.okInk,
    fontWeight: "700",
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modal: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.space.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.color.ink,
  },
  modalSub: {
    fontSize: 12,
    color: theme.color.muted,
    marginTop: 1,
  },
  rider: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    backgroundColor: theme.color.surface,
  },
  riderMain: { flex: 1 },
  riderName: {
    fontSize: 13,
    color: theme.color.ink,
    fontWeight: "700",
  },
  riderPhone: {
    fontSize: 11,
    color: theme.color.muted,
    marginTop: 1,
  },
  availablePill: {
    backgroundColor: theme.color.okBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.okBorder,
  },
  available: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.color.okInk,
  },
});
