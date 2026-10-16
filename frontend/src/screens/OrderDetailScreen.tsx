import { Text, TextInput } from "@/components/Typography";
// Picking Order Screen — cross-device responsive Picker order & item scanning screen (Android, iOS & Web).
import { useCallback, useMemo, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ErrorBanner,
  ErrorState,
  LoadingState,
  SuccessFeedback,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { pickerAppApi } from "@/api/pickerAppApi";
import {
  formatItemLocation,
  isOrderFullyPicked,
  nextPendingLine,
} from "@/domain/order";
import { beepError, beepSuccess } from "@/services/scanner";
import BarcodeErrorModal, { type BarcodeErrorDetails } from "@/components/modals/BarcodeErrorModal";
import BarcodeScannerModal from "@/scanner/BarcodeScannerModal";
import type { FulfillmentOrderDto, FulfillmentOrderItemDto } from "@/types";
import { getOrderProgress, getWarehouseDisplay } from "@/utils/warehouse";

export function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numOrderId = parseInt(String(id), 10);
  const { picker } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;

  const [order, setOrder] = useState<FulfillmentOrderDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locationSorted, setLocationSorted] = useState(true);

  // Scan sheet & camera state
  const [activeScanLine, setActiveScanLine] = useState<FulfillmentOrderItemDto | null>(null);
  const [scanSheetVisible, setScanSheetVisible] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [barcodeError, setBarcodeError] = useState<BarcodeErrorDetails | null>(null);
  const [batchesVisible, setBatchesVisible] = useState(false);
  const scanInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!Number.isSafeInteger(numOrderId) || numOrderId <= 0) {
        setOrder(null);
        setError("Invalid order ID. Return to the order list and select a valid order.");
        return;
      }
      const assigned = await pickerAppApi.getAssignedOrders();
      const validOrder = assigned.find((candidate) => candidate.orderId === numOrderId);
      if (!validOrder) {
        setOrder(null);
        setError("This order is not in your assigned picking queue. Refresh the order list or contact your supervisor.");
        return;
      }
      const items = await pickerAppApi.getOrderItems(numOrderId);
      setOrder({ ...validOrder, items });
    } catch (err: any) {
      setOrder(null);
      setError(err?.message || "Failed to load order items.");
    } finally {
      setLoading(false);
    }
  }, [numOrderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const wh = getWarehouseDisplay(order?.warehouseId ?? picker?.warehouseId, order?.warehouseName ?? picker?.warehouseName);

  const displayLines = useMemo(() => {
    if (!order?.items) return [];
    const copy = [...order.items];
    if (locationSorted) {
      return copy.sort((a, b) => (formatItemLocation(a) || "").localeCompare(formatItemLocation(b) || ""));
    }
    return copy;
  }, [order?.items, locationSorted]);

  const batchesMap = useMemo(() => {
    const groups = new Map<string, FulfillmentOrderItemDto[]>();
    for (const line of displayLines) {
      const loc = formatItemLocation(line);
      const parts = loc.split("-");
      const zoneKey = parts.length >= 2 ? parts.slice(0, 2).join("-") : loc;
      const list = groups.get(zoneKey) ?? [];
      list.push(line);
      groups.set(zoneKey, list);
    }
    return Array.from(groups.entries());
  }, [displayLines]);

  function openScanForLine(targetLine?: FulfillmentOrderItemDto | null) {
    if (!order) return;
    const lineToScan = targetLine ?? nextPendingLine(order) ?? order.items[0] ?? null;
    if (!lineToScan) return;
    setActiveScanLine(lineToScan);
    setManualBarcode("");
    scanInputRef.current?.clear();
    setError(null);
    setFeedback(null);
    setScanSheetVisible(true);
    setTimeout(() => scanInputRef.current?.focus(), 120);
  }

  async function handleScanSubmit(barcodeInput?: string) {
    if (!order || busy) return;
    const target = activeScanLine ?? nextPendingLine(order);
    if (!target) return;

    const code = (barcodeInput ?? manualBarcode).trim();
    if (!code) {
      setManualBarcode("");
      scanInputRef.current?.clear();
      const msg = "Scan or enter the product barcode.";
      setError(msg);
      beepError();
      setBarcodeError({ scannedValue: "", expectedValue: target.sku, reason: msg });
      setTimeout(() => scanInputRef.current?.focus(), 80);
      return;
    }

    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await pickerAppApi.scanOrderItem(order.orderId, code);

      if (res.success) {
        beepSuccess();
        setManualBarcode("");
        scanInputRef.current?.clear();

        if (res.items) {
          setOrder((prev) => (prev ? { ...prev, items: res.items!, totalItemsScanned: res.totalItemsPicked ?? prev.totalItemsScanned } : null));
        }

        setFeedback(res.message || "Item scanned successfully.");

        if (res.orderFullyPicked) {
          setScanSheetVisible(false);
          setCameraVisible(false);
          router.push(`/pick/${order.orderId}/complete` as never);
          return;
        }

        // Advance to next pending line if the current item is now fully picked
        const updatedTarget = res.items?.find((i) => i.itemId === target.itemId);
        if (updatedTarget && (updatedTarget.fullyScanned || (updatedTarget.pickedQty >= updatedTarget.orderedQty))) {
          // Close the camera when this product's required quantity is confirmed.
          // Keep the scan sheet open on the next pending product.
          setCameraVisible(false);
          const nextLine = (res.items || []).find((i) => !i.fullyScanned && i.pickedQty < i.orderedQty) ?? null;
          setActiveScanLine(nextLine);
          if (!nextLine) {
            setScanSheetVisible(false);
          } else {
            setTimeout(() => scanInputRef.current?.focus(), 80);
          }
        } else {
          setActiveScanLine(updatedTarget ?? target);
          setTimeout(() => scanInputRef.current?.focus(), 80);
        }
      } else {
        // Soft failure returned from server
        setManualBarcode("");
        scanInputRef.current?.clear();
        setError(res.message);
        beepError();
        setBarcodeError({ scannedValue: code, expectedValue: target.sku, reason: res.message });
        setTimeout(() => scanInputRef.current?.focus(), 80);
      }
    } catch (err: any) {
      setManualBarcode("");
      scanInputRef.current?.clear();
      const msg = err?.message || "Scan error";
      setError(msg);
      beepError();
      setBarcodeError({ scannedValue: code, expectedValue: target.sku, reason: msg });
      setTimeout(() => scanInputRef.current?.focus(), 80);
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <SafeAreaView style={od.safe}>
        <View style={od.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={od.iconBtn}
          >
            <Ionicons name="arrow-back" size={23} color="#0F172A" />
          </Pressable>
          <Text style={od.topBarTitle}>Picking Order</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={{ flex: 1, padding: 16 }}>
          {loading ? (
            <LoadingState label="Loading order…" />
          ) : (
            <ErrorState message={error ?? "Order not found"} onRetry={() => void load()} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const prog = getOrderProgress(order);
  const fullyPicked = isOrderFullyPicked(order);
  const nextLine = nextPendingLine(order);
  const progressBarPct = prog.pct;

  return (
    <SafeAreaView style={od.safe} edges={["top"]}>
      {/* Top Header */}
      <View style={od.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [od.iconBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="arrow-back" size={23} color="#0F172A" />
        </Pressable>

        <Text style={od.topBarTitle} numberOfLines={1} maxFontSizeMultiplier={1.15}>
          {order.orderNumber}
        </Text>

        <View style={od.topBarRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan barcode"
            onPress={() => {
              openScanForLine(nextLine);
              setCameraVisible(true);
            }}
            style={({ pressed }) => [od.topScanBtn, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="barcode-outline" size={20} color="#0F172A" />
            <Text style={od.topScanLabel} maxFontSizeMultiplier={1.1}>
              Scan
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={od.scroll}
        contentContainerStyle={[
          od.scrollContent,
          { paddingBottom: 110 + Math.max(insets.bottom, 12) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void load()}
            tintColor="#0B65C6"
            colors={["#0B65C6"]}
          />
        }
      >
        {/* Order Summary Card */}
        <View style={od.summaryCard}>
          <View style={od.summaryHeaderBox}>
            <View style={od.orangeCubeCircle}>
              <Ionicons name="cube" size={24} color="#EA580C" />
            </View>

            <View style={od.summaryOrderCopy}>
              <Text
                style={[od.summaryOrderId, compact && { fontSize: 16 }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {order.orderNumber}
              </Text>
              <Text style={od.summaryWhName} numberOfLines={1}>
                {wh.name} • {order.paymentMethod}
              </Text>
              <Text style={od.summaryWhAddr} numberOfLines={1}>
                Total: ₹{order.grandTotal.toFixed(2)}
              </Text>
            </View>

            <View style={od.itemsPickedBadge}>
              <Text style={od.itemsPickedRatio}>
                {prog.pickedLines} / {prog.totalLines}
              </Text>
              <Text style={od.itemsPickedLabel}>Lines Picked</Text>
            </View>
          </View>

          {/* Progress Bar + Percentage */}
          <View style={od.progressRow}>
            <View style={od.progressTrack}>
              <View style={[od.progressFill, { width: `${progressBarPct}%` }]} />
            </View>
            <Text style={od.progressPctText}>{progressBarPct}%</Text>
          </View>

          {/* 4-Column Stat Strip */}
          <View style={od.statsStrip}>
            <View style={od.statCol}>
              <Text style={od.statValue}>{prog.totalLines}</Text>
              <Text style={od.statLabel}>Lines</Text>
            </View>
            <View style={od.statDivider} />
            <View style={od.statCol}>
              <Text style={od.statValue}>{prog.totalUnits}</Text>
              <Text style={od.statLabel}>Total Qty</Text>
            </View>
            <View style={od.statDivider} />
            <View style={od.statCol}>
              <Text style={[od.statValue, { color: "#16A34A" }]}>{prog.pickedUnits}</Text>
              <Text style={od.statLabel}>Picked Qty</Text>
            </View>
            <View style={od.statDivider} />
            <View style={od.statCol}>
              <Text style={[od.statValue, { color: "#EA580C" }]}>{prog.remainingUnits}</Text>
              <Text style={od.statLabel}>Remaining</Text>
            </View>
          </View>
        </View>

        {/* Feedback / Error notifications */}
        {feedback ? (
          <View style={od.feedbackBanner}>
            <SuccessFeedback message={feedback} />
          </View>
        ) : null}
        <ErrorBanner message={error} />

        {/* Pick Items Header */}
        <View style={od.pickItemsHeaderRow}>
          <Text style={od.pickItemsTitle}>Pick Items ({order.items.length})</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setLocationSorted((v) => !v)}
            style={[od.locationOrderPill, locationSorted && od.locationOrderPillActive]}
          >
            <Ionicons name="list-outline" size={15} color={locationSorted ? "#0B65C6" : "#334155"} />
            <Text style={[od.locationOrderText, locationSorted && { color: "#0B65C6" }]}>
              Location Order
            </Text>
          </Pressable>
        </View>

        {/* Pick Items List */}
        {displayLines.map((item, idx) => {
          const isDone = item.fullyScanned || item.pickedQty >= item.orderedQty;
          const loc = formatItemLocation(item);

          return (
            <Pressable
              key={item.itemId}
              accessibilityRole="button"
              onPress={() => openScanForLine(item)}
              style={({ pressed }) => [
                od.itemCard,
                isDone && od.itemCardPicked,
                pressed && { opacity: 0.92 },
              ]}
            >
              <View style={od.stepNumPill}>
                <Text style={od.stepNumText}>{idx + 1}</Text>
              </View>

              <View style={od.thumbBox}>
                <Ionicons name="cube-outline" size={24} color={isDone ? "#16A34A" : "#0D6EFD"} />
              </View>

              <View style={od.itemCenter}>
                <Text style={od.itemName} numberOfLines={1}>
                  {item.productName}
                </Text>
                {item.variantLabel ? (
                  <Text style={od.itemVariant} numberOfLines={1}>
                    {item.variantLabel}
                  </Text>
                ) : null}
                <Text style={od.itemSku} numberOfLines={1}>
                  SKU: {item.sku}
                </Text>

                <View style={od.locPill}>
                  <Ionicons name="location-sharp" size={12} color="#D97706" />
                  <Text style={od.locPillText} numberOfLines={1}>
                    {loc}
                  </Text>
                </View>
              </View>

              <View style={od.itemRight}>
                <View style={od.qtyTextCol}>
                  <Text style={od.qtyRatioText}>
                    <Text style={od.qtyNumerator}>{item.pickedQty}</Text> / {item.orderedQty}
                  </Text>
                  <Text style={[od.qtyStatusLabel, isDone && { color: "#16A34A" }]}>
                    {isDone ? "Picked" : "To Pick"}
                  </Text>
                </View>

                {isDone ? (
                  <View style={od.checkCircleDone}>
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                ) : (
                  <View style={od.checkCircleEmpty} />
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Floating Bottom Bar: SCAN NEXT ITEM or ASSIGN PACKER */}
      <View style={[od.floatingBottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {fullyPicked ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Assign Packer"
            onPress={() => router.push(`/pick/${order.orderId}/complete` as never)}
            style={({ pressed }) => [od.assignPackerBtn, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
            <Text style={od.assignPackerBtnText}>Assign Packer & Hand Off</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan Next Item"
            disabled={busy}
            onPress={() => openScanForLine(nextLine)}
            style={({ pressed }) => [
              od.scanNextBtn,
              busy && { opacity: 0.6 },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Ionicons name="qr-code-outline" size={20} color="#FFFFFF" />
            <Text style={od.scanNextBtnText}>Scan Next Item</Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Batches"
          onPress={() => setBatchesVisible(true)}
          style={({ pressed }) => [od.viewBatchesBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="list-outline" size={20} color="#0F172A" />
          <Text style={od.viewBatchesText}>Zones</Text>
        </Pressable>
      </View>

      {/* Scan Modal Sheet */}
      {scanSheetVisible && activeScanLine ? (
        <Modal
          visible={scanSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setScanSheetVisible(false)}
        >
          <View style={od.modalBackdrop}>
            <View style={od.scanModalCard}>
              <View style={od.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={od.modalTitle}>{activeScanLine.productName}</Text>
                  <Text style={od.modalSub}>
                    Location: {formatItemLocation(activeScanLine)} • Picked: {activeScanLine.pickedQty}/{activeScanLine.orderedQty}
                  </Text>
                </View>
                <Pressable onPress={() => setScanSheetVisible(false)} hitSlop={10} style={od.closeCircle}>
                  <Ionicons name="close" size={20} color="#334155" />
                </Pressable>
              </View>

              <View style={od.scanInputRow}>
                <View style={od.scanInputWrap}>
                  <TextInput
                    ref={scanInputRef}
                    value={manualBarcode}
                    onChangeText={(txt) => {
                      setManualBarcode(txt);
                      if (error) setError(null);
                    }}
                    placeholder="Scan product barcode (or type EAN/SKU)..."
                    placeholderTextColor="#94A3B8"
                    style={od.scanTextInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={() => void handleScanSubmit()}
                  />
                  {manualBarcode.length > 0 ? (
                    <Pressable onPress={() => setManualBarcode("")} hitSlop={8} style={od.clearInputBtn}>
                      <Ionicons name="close-circle" size={18} color="#94A3B8" />
                    </Pressable>
                  ) : null}
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setCameraVisible(true)}
                  style={({ pressed }) => [od.cameraLaunchBtn, pressed && { opacity: 0.85 }]}
                >
                  <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void handleScanSubmit()}
                  style={({ pressed }) => [od.pickUnitBtn, busy && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
                >
                  <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                </Pressable>
              </View>

              {error ? (
                <View style={od.modalErrorBanner}>
                  <Ionicons name="alert-circle" size={16} color="#DC2626" />
                  <Text style={od.modalErrorText}>{error}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Modal>
      ) : null}

      {/* Batches / Zones Modal */}
      <Modal visible={batchesVisible} transparent animationType="fade" onRequestClose={() => setBatchesVisible(false)}>
        <View style={od.modalBackdrop}>
          <View style={od.batchesModalCard}>
            <View style={od.modalHeader}>
              <Text style={od.modalTitle}>Warehouse Zones</Text>
              <Pressable onPress={() => setBatchesVisible(false)} hitSlop={10} style={od.closeCircle}>
                <Ionicons name="close" size={20} color="#334155" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {batchesMap.map(([zone, items]) => (
                <View key={zone} style={od.zoneRow}>
                  <Text style={od.zoneName}>{zone}</Text>
                  <Text style={od.zoneCount}>{items.length} items</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Continuous Camera Scanner Modal */}
      <BarcodeErrorModal
        visible={!!barcodeError}
        scannedValue={barcodeError?.scannedValue ?? ""}
        expectedValue={barcodeError?.expectedValue}
        reason={barcodeError?.reason}
        onRetry={() => { setBarcodeError(null); setTimeout(() => scanInputRef.current?.focus(), 80); }}
      />
      <BarcodeScannerModal
        visible={cameraVisible}
        onClose={() => setCameraVisible(false)}
        continuous
        onScanned={(code) => {
          setManualBarcode(code);
          void handleScanSubmit(code);
        }}
      />
    </SafeAreaView>
  );
}

const od = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },
  topBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: { fontFamily: "OpenSans",
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  topScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  topScanLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
  summaryHeaderBox: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  orangeCubeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  summaryOrderCopy: {
    flex: 1,
  },
  summaryOrderId: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  summaryWhName: {
    fontSize: 12,
    color: "#475569",
    marginTop: 1,
  },
  summaryWhAddr: {
    fontSize: 11,
    color: "#64748B",
  },
  itemsPickedBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: "center",
  },
  itemsPickedRatio: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1D4ED8",
  },
  itemsPickedLabel: {
    fontSize: 9,
    color: "#3B82F6",
    fontWeight: "700",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#0D6EFD",
    borderRadius: 4,
  },
  progressPctText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0D6EFD",
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  statCol: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  statLabel: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E2E8F0",
  },
  feedbackBanner: {
    marginBottom: 10,
  },
  pickItemsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  pickItemsTitle: { fontFamily: "OpenSans",
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  locationOrderPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  locationOrderPillActive: {
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  locationOrderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  itemCardPicked: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  stepNumPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  stepNumText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
  },
  thumbBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  itemCenter: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  itemVariant: {
    fontSize: 11,
    color: "#475569",
    marginTop: 1,
  },
  itemSku: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
  locPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  locPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B45309",
  },
  itemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyTextCol: {
    alignItems: "flex-end",
  },
  qtyRatioText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  qtyNumerator: {
    color: "#0F172A",
    fontWeight: "800",
  },
  qtyStatusLabel: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 1,
  },
  checkCircleDone: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
  },
  floatingBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  scanNextBtn: {
    flex: 1,
    height: 48,
    backgroundColor: "#0D6EFD",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  scanNextBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  assignPackerBtn: {
    flex: 1,
    height: 48,
    backgroundColor: "#16A34A",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  assignPackerBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  viewBatchesBtn: {
    width: 80,
    height: 48,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  viewBatchesText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  scanModalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  batchesModalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    margin: 20,
    padding: 20,
    maxHeight: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  modalTitle: { fontFamily: "OpenSans",
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  closeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  scanInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  scanInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  scanTextInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
  },
  clearInputBtn: {
    marginLeft: 4,
  },
  cameraLaunchBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  pickUnitBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  modalErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  modalErrorText: {
    flex: 1,
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "600",
  },
  zoneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  zoneName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  zoneCount: {
    fontSize: 13,
    color: "#64748B",
  },
});
