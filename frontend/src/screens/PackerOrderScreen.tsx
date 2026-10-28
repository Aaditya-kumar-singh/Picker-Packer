import { Text, TextInput } from "@/components/Typography";
// Packer Order Processing per packer-app-api.md
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ErrorBanner,
  LoadingState,
  PrimaryButton,
  theme,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { beepSuccess } from "@/services/scanner";
import { BarcodeErrorModal, useBarcodeAlert } from "@/components/modals/BarcodeErrorModal";
import BarcodeScannerModal from "@/scanner/BarcodeScannerModal";
import { packerAppApi } from "@/api/packerAppApi";
import { PackageLabelModal } from "@/components/PackageLabelModal";
import type {
  FulfillmentOrderDto,
  FulfillmentOrderItemDto,
  RawSalesOrderItemDto,
  RiderCandidateDto,
} from "@/types";
import { formatOrderDate, getWarehouseDisplay } from "@/utils/warehouse";

export function PackerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numOrderId = parseInt(String(id), 10);
  const { picker } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;

  const [order, setOrder] = useState<FulfillmentOrderDto | null>(null);
  const [rawItems, setRawItems] = useState<RawSalesOrderItemDto[]>([]);
  const [riders, setRiders] = useState<RiderCandidateDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [riderModal, setRiderModal] = useState(false);
  const [packageLabelModal, setPackageLabelModal] = useState(false);
  const [attachedPackageId, setAttachedPackageId] = useState<string | null>(null);
  const [packageLabelBackendError, setPackageLabelBackendError] = useState<string | null>(null);
  const [orderInfoModal, setOrderInfoModal] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const inputRef = useRef<TextInput>(null);
  const { barcodeAlert, showBarcodeAlert, dismissBarcodeAlert } = useBarcodeAlert();

  const wh = getWarehouseDisplay(order?.warehouseId ?? picker?.warehouseId, order?.warehouseName ?? picker?.warehouseName);

  const load = useCallback(async () => {
    try {
      const [detail, riderData] = await Promise.all([
        packerAppApi.getOrderDetail(numOrderId),
        packerAppApi.getAvailableRiders(),
      ]);
      setOrder(detail);
      setRiders(riderData || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load order details");
    }
  }, [numOrderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const loadRawItems = useCallback(async () => {
    try {
      const items = await packerAppApi.getOrderRawItems(numOrderId);
      setRawItems(items || []);
    } catch {}
  }, [numOrderId]);

  const displayItems = useMemo(() => {
    if (!order?.items) return [];
    return [...order.items].sort((a, b) => {
      const aDone = (a.packedQty ?? 0) >= a.orderedQty ? 1 : 0;
      const bDone = (b.packedQty ?? 0) >= b.orderedQty ? 1 : 0;
      return aDone - bDone;
    });
  }, [order?.items]);

  const activeItem = useMemo(() => {
    if (!order?.items) return null;
    if (selectedItemId) {
      const found = order.items.find((i) => i.itemId === selectedItemId);
      if (found && (found.packedQty ?? 0) < found.orderedQty) return found;
    }
    return (
      displayItems.find((i) => (i.packedQty ?? 0) < i.orderedQty) ??
      displayItems[0] ??
      null
    );
  }, [order?.items, displayItems, selectedItemId]);

  const cameraQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    setAttachedPackageId(null);
    setPackageLabelBackendError(null);
    setPackageLabelModal(false);
  }, [numOrderId]);

  async function scan(value?: string): Promise<boolean> {
    if (busy || !order) return false;
    const code = (value ?? barcode).trim();
    if (!code) {
      setBarcode("");
      inputRef.current?.clear();
      const msg = "Please scan or enter a product barcode.";
      setError(msg);
      showBarcodeAlert("", activeItem?.sku, msg);
      setTimeout(() => inputRef.current?.focus(), 80);
      return false;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    setBarcode(code);
    try {
      const res = await packerAppApi.scanOrderItem(order.orderId, code);

      if (res.success) {
        beepSuccess();
        setBarcode("");
        inputRef.current?.clear();

        setOrder((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            items: res.items ?? prev.items,
            orderStatus: (res.orderStatus as any) ?? prev.orderStatus,
            totalItemsScanned: res.totalItemsScanned ?? prev.totalItemsScanned,
          };
        });

        setSuccess(res.message || "Item packed successfully.");

        if (res.orderFullyPacked || res.orderStatus === "PACKED") {
          setSuccess("All items packed! Order is ready for rider assignment.");
          setScannerVisible(false);
          setPackageLabelBackendError(null);
          setPackageLabelModal(true);
          return true;
        }

        setTimeout(() => inputRef.current?.focus(), 80);
        return false;
      } else {
        setBarcode("");
        inputRef.current?.clear();
        setError(res.message);
        showBarcodeAlert(code, activeItem?.sku, res.message);
        setTimeout(() => inputRef.current?.focus(), 80);
        return false;
      }
    } catch (e: any) {
      const msg = e?.message || "Barcode scan failed";
      setBarcode("");
      inputRef.current?.clear();
      setError(`Scan failed: ${msg}`);
      showBarcodeAlert(code, activeItem?.sku, msg);
      setTimeout(() => inputRef.current?.focus(), 80);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function enqueueCameraScan(value: string) {
    cameraQueueRef.current = cameraQueueRef.current.then(async () => {
      const completed = await scan(value);
      if (completed) {
        setScannerVisible(false);
      }
    });
  }

  async function copyBarcode(value: string) {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopiedBarcode(value);
    setTimeout(() => setCopiedBarcode(null), 1400);
  }

  async function assign(rider: RiderCandidateDto) {
    if (!order || assigning) return;
    setAssigning(true);
    setError(null);
    try {
      await packerAppApi.assignRider(order.orderId, { riderId: rider.id });
      setOrder((prev) => (prev ? { ...prev, orderStatus: "RIDER_ASSIGNED" } : prev));
      setRiderModal(false);
      setSuccess("Rider assigned successfully! Order marked as RIDER_ASSIGNED.");
      setTimeout(() => {
        router.replace("/orders" as never);
      }, 1500);
    } catch (e: any) {
      const message = e?.message || "Rider assignment failed.";
      if (/qr|package/i.test(message)) {
        setPackageLabelBackendError(message);
        setRiderModal(false);
        setPackageLabelModal(true);
      }
      setError(message);
    } finally {
      setAssigning(false);
    }
  }

  if (!order) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.topBar}>
          <Pressable onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={23} color="#0F172A" />
          </Pressable>
          <Text style={s.topBarTitle}>Packing Station</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, padding: 16 }}>
          <LoadingState label="Loading packing order…" />
        </View>
      </SafeAreaView>
    );
  }

  const allPacked =
    order.orderStatus === "PACKED" ||
    (order.items &&
      order.items.length > 0 &&
      order.items.every((i) => (i.packedQty ?? 0) >= i.orderedQty));

  const totalLines = order.items?.length || order.totalItems || 0;
  const packedLines =
    order.items?.filter((i) => i.fullyScanned || (i.packedQty ?? 0) >= i.orderedQty).length ||
    order.totalItemsScanned ||
    0;
  const totalUnits = order.items?.reduce((sum, i) => sum + i.orderedQty, 0) || totalLines;
  const packedUnits = order.items?.reduce((sum, i) => sum + (i.packedQty ?? 0), 0) || packedLines;
  const pct = totalUnits > 0 ? Math.round((packedUnits / totalUnits) * 100) : 0;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={23} color="#0F172A" />
        </Pressable>
        <Text style={s.topBarTitle} numberOfLines={1}>
          Packing: {order.orderNumber}
        </Text>
        <Pressable
          onPress={() => {
            void loadRawItems();
            setOrderInfoModal(true);
          }}
          style={s.iconBtn}
        >
          <Ionicons name="information-circle-outline" size={24} color="#D95D00" />
        </Pressable>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: (allPacked ? 160 : 110) + Math.max(insets.bottom, 12) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Order Summary Box */}
        <View style={s.summaryCard}>
          <View style={s.summaryTop}>
            <View style={s.whBadge}>
              <Ionicons name="business" size={13} color="#D95D00" />
              <Text style={s.whBadgeText}>{wh.shortAddress}</Text>
            </View>
            <View style={[s.statusBadge, allPacked && { backgroundColor: "#DCFCE7" }]}>
              <Text style={[s.statusBadgeText, allPacked && { color: "#16A34A" }]}>
                {order.orderStatus}
              </Text>
            </View>
          </View>

          <Text style={s.orderNumberText}>{order.orderNumber}</Text>
          <Text style={s.orderSubText}>
            Total: ₹{order.grandTotal.toFixed(2)} ({order.paymentMethod}), {formatOrderDate(order.orderDate)}
          </Text>

          <View style={s.progressRow}>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={s.progressPct}>{pct}%</Text>
          </View>

          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statVal}>{packedLines}/{totalLines}</Text>
              <Text style={s.statLbl}>Lines Packed</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.statBox}>
              <Text style={s.statVal}>{packedUnits}/{totalUnits}</Text>
              <Text style={s.statLbl}>Units Packed</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.statBox}>
              <Text style={[s.statVal, { color: "#D95D00" }]}>{Math.max(0, totalUnits - packedUnits)}</Text>
              <Text style={s.statLbl}>Remaining</Text>
            </View>
          </View>
        </View>

        <ErrorBanner message={error} />
        {success ? (
          <View style={s.successBox}>
            <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
            <Text style={s.successText}>{success}</Text>
          </View>
        ) : null}

        {/* Packing Input Card */}
        {!allPacked ? (
          <View style={s.scanCard}>
            <View style={s.scanHeader}>
              <Text style={s.scanTargetLabel}>NEXT ITEM TO PACK</Text>
              {activeItem ? (
                <Pressable onPress={() => void copyBarcode(activeItem.sku)} style={s.copyChip}>
                  <Ionicons name="copy-outline" size={12} color="#D95D00" />
                  <Text style={s.copyChipText}>
                    {copiedBarcode === activeItem.sku ? "Copied" : "Copy SKU"}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {activeItem ? (
              <View style={s.activeItemBox}>
                <Text style={s.activeItemName}>{activeItem.productName}</Text>
                {activeItem.variantLabel ? <Text style={s.activeItemVar}>{activeItem.variantLabel}</Text> : null}
                <Text style={s.activeItemSku}>Expected SKU: {activeItem.sku}</Text>
                <Text style={s.activeItemRemaining}>
                  Packed: {activeItem.packedQty ?? 0} of {activeItem.orderedQty} (Picked: {activeItem.pickedQty})
                </Text>
              </View>
            ) : null}

            <View style={s.inputRow}>
              <View style={s.inputWrap}>
                <TextInput
                  ref={inputRef}
                  value={barcode}
                  onChangeText={(t) => {
                    setBarcode(t);
                    if (error) setError(null);
                  }}
                  placeholder="Scan product barcode (EAN / SKU)..."
                  placeholderTextColor="#94A3B8"
                  style={s.textInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={() => void scan()}
                />
                {barcode.length > 0 ? (
                  <Pressable onPress={() => setBarcode("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </Pressable>
                ) : null}
              </View>

              <Pressable onPress={() => setScannerVisible(true)} style={s.cameraBtn}>
                <Ionicons name="camera" size={20} color="#FFFFFF" />
              </Pressable>

              <Pressable
                disabled={busy}
                onPress={() => void scan()}
                style={[s.packBtn, busy && { opacity: 0.6 }]}
              >
                <Ionicons name="cube" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Lines Breakdown */}
        <Text style={s.sectionTitle}>Order Lines ({displayItems.length})</Text>

        {displayItems.map((item) => {
          const isDone = (item.packedQty ?? 0) >= item.orderedQty;
          const isSelected = selectedItemId === item.itemId;

          return (
            <Pressable
              key={item.itemId}
              onPress={() => setSelectedItemId(item.itemId)}
              style={[
                s.lineCard,
                isDone && s.lineCardDone,
                isSelected && s.lineCardSelected,
              ]}
            >
              <View style={[s.lineIconBox, isDone && { backgroundColor: "#DCFCE7" }]}>
                <Ionicons
                  name={isDone ? "checkmark-circle" : "cube-outline"}
                  size={20}
                  color={isDone ? "#16A34A" : "#D95D00"}
                />
              </View>

              <View style={s.lineCopy}>
                <Text style={s.lineName} numberOfLines={1}>
                  {item.productName}
                </Text>
                {item.variantLabel ? <Text style={s.lineVar}>{item.variantLabel}</Text> : null}
                <Text style={s.lineSku}>SKU: {item.sku}</Text>
              </View>

              <View style={s.lineRight}>
                <Text style={s.lineQty}>
                  {item.packedQty ?? 0} / {item.orderedQty}
                </Text>
                <Text style={[s.lineStatusText, isDone && { color: "#16A34A" }]}>
                  {isDone ? "Packed" : "To Pack"}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Floating Bottom Bar: ASSIGN RIDER */}
      <View style={[s.floatingBottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {allPacked ? (
          <View style={s.packedActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPackageLabelBackendError(null);
                setPackageLabelModal(true);
              }}
              style={s.printPackageBtn}
            >
              <Ionicons name="barcode-outline" size={19} color="#FFFFFF" />
              <Text style={s.assignRiderBtnText}>{attachedPackageId ? "Reprint Package Barcode" : "Print Package Barcode"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !attachedPackageId }}
              disabled={!attachedPackageId}
              onPress={() => setRiderModal(true)}
              style={[s.assignRiderBtn, !attachedPackageId && { opacity: 0.55 }]}
            >
              <Ionicons name="bicycle" size={20} color="#FFFFFF" />
              <Text style={s.assignRiderBtnText}>Assign Delivery Rider</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setScannerVisible(true)}
            style={s.scanItemBtn}
          >
            <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
            <Text style={s.scanItemBtnText}>Camera Continuous Scan</Text>
          </Pressable>
        )}
      </View>

      <PackageLabelModal
        visible={packageLabelModal}
        orderId={order.orderId}
        orderNumber={order.orderNumber}
        backendMessage={packageLabelBackendError}
        onClose={() => setPackageLabelModal(false)}
        onLabelAttached={(packageId) => {
          setAttachedPackageId(packageId);
          setPackageLabelBackendError(null);
          setPackageLabelModal(false);
          setRiderModal(true);
        }}
      />

      {/* Assign Rider Modal */}
      <Modal visible={riderModal} transparent animationType="slide" onRequestClose={() => setRiderModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalTop}>
              <Text style={s.modalTitle}>Assign Delivery Rider</Text>
              <Pressable onPress={() => setRiderModal(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </Pressable>
            </View>

            <Text style={s.modalSub}>
              Select an active delivery partner at Warehouse #{order.warehouseId}:
            </Text>

            {riders.length === 0 ? (
              <Text style={s.noRidersText}>No active riders available in this warehouse.</Text>
            ) : (
              <ScrollView style={s.modalListScroll} contentContainerStyle={s.modalScrollContent} keyboardShouldPersistTaps="handled">
                {riders.map((r) => (
                  <Pressable
                    key={r.id}
                    disabled={assigning}
                    onPress={() => void assign(r)}
                    style={s.riderRow}
                  >
                    <View style={s.riderIcon}>
                      <Ionicons name="bicycle" size={20} color="#D95D00" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.riderName}>{r.name}</Text>
                      <Text style={s.riderPhone}>
                        {r.phone}, {r.vehicleType || "BIKE"}
                      </Text>
                    </View>
                    {r.rating ? (
                      <View style={s.riderRatingBox}>
                        <Ionicons name="star" size={12} color="#F59E0B" />
                        <Text style={s.riderRatingText}>{r.rating.toFixed(1)}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Order Info Modal */}
      <Modal visible={orderInfoModal} transparent animationType="fade" onRequestClose={() => setOrderInfoModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalTop}>
              <Text style={s.modalTitle}>Order Raw Details</Text>
              <Pressable onPress={() => setOrderInfoModal(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </Pressable>
            </View>

            <ScrollView style={s.modalInfoScroll} contentContainerStyle={s.modalScrollContent} showsVerticalScrollIndicator>
              <Text style={s.infoSectionTitle}>Header</Text>
              <Text style={s.infoLine}>Order ID: {order.orderId}</Text>
              <Text style={s.infoLine}>Order Ref: {order.orderNumber}</Text>
              <Text style={s.infoLine}>Grand Total: ₹{order.grandTotal.toFixed(2)}</Text>
              <Text style={s.infoLine}>Payment: {order.paymentMethod}</Text>
              <Text style={s.infoLine}>Status: {order.orderStatus}</Text>

              {rawItems.length > 0 ? (
                <>
                  <Text style={[s.infoSectionTitle, { marginTop: 12 }]}>Line Items & Tax</Text>
                  {rawItems.map((ri) => (
                    <View key={ri.id} style={s.rawItemRow}>
                      <Text style={s.rawItemTitle}>{ri.productName} ({ri.sku})</Text>
                      <Text style={s.rawItemDetail}>
                        Ordered: {ri.orderedQty}, Unit: ₹{ri.unitPrice}, Tax: {ri.taxPercentage}% (₹{ri.taxAmount}), Total: ₹{ri.lineTotal}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BarcodeErrorModal alert={barcodeAlert} onDismiss={() => { dismissBarcodeAlert(); setTimeout(() => inputRef.current?.focus(), 120); }} />

      {/* Barcode Camera Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        continuous
        onScanned={enqueueCameraScan}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
  summaryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  whBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF2E6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  whBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#D95D00",
  },
  statusBadge: {
    backgroundColor: "#FFF2E6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#D95D00",
  },
  orderNumberText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  orderSubText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
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
    backgroundColor: "#D95D00",
    borderRadius: 4,
  },
  progressPct: {
    fontSize: 12,
    fontWeight: "800",
    color: "#D95D00",
  },
  statsRow: {
    flexDirection: "row",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statVal: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  statLbl: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 1,
  },
  statDiv: {
    width: 1,
    height: 24,
    backgroundColor: "#E2E8F0",
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#DCFCE7",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  successText: {
    fontSize: 12,
    color: "#16A34A",
    fontWeight: "600",
  },
  scanCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#D95D00",
    marginBottom: 12,
  },
  scanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  scanTargetLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#D95D00",
    letterSpacing: 0.5,
  },
  copyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  copyChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D95D00",
  },
  activeItemBox: {
    backgroundColor: "#FFF8F2",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  activeItemName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  activeItemVar: {
    fontSize: 12,
    color: "#475569",
    marginTop: 1,
  },
  activeItemSku: {
    fontSize: 12,
    fontWeight: "700",
    color: "#D95D00",
    marginTop: 2,
  },
  activeItemRemaining: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 3,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
  },
  cameraBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  packBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#D95D00",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontFamily: "OpenSans",
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },
  lineCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  lineCardDone: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  lineCardSelected: {
    borderColor: "#D95D00",
  },
  lineIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF2E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  lineCopy: {
    flex: 1,
    marginRight: 8,
  },
  lineName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  lineVar: {
    fontSize: 11,
    color: "#64748B",
  },
  lineSku: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 1,
  },
  lineRight: {
    alignItems: "flex-end",
  },
  lineQty: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  lineStatusText: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 1,
  },
  floatingBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  assignRiderBtn: {
    height: 48,
    backgroundColor: "#16A34A",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  packedActions: {
    gap: 8,
  },
  printPackageBtn: {
    height: 44,
    backgroundColor: "#D95D00",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  assignRiderBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  scanItemBtn: {
    height: 48,
    backgroundColor: "#D95D00",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  scanItemBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "85%",
    flexShrink: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,

  },
  modalListScroll: {
    flexShrink: 1,
    maxHeight: 320,
  },
  modalInfoScroll: {
    flexShrink: 1,
    maxHeight: 420,
  },
  modalScrollContent: {
    paddingBottom: 4,
  },
  modalTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: { fontFamily: "OpenSans",
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalSub: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 12,
  },
  noRidersText: {
    fontSize: 13,
    color: "#64748B",
    padding: 12,
    textAlign: "center",
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    marginBottom: 8,
  },
  riderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF2E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  riderName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  riderPhone: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
  riderRatingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  riderRatingText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
  },
  infoSectionTitle: { fontFamily: "OpenSans",
    fontSize: 12,
    fontWeight: "800",
    color: "#D95D00",
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 4,
  },
  infoLine: {
    fontSize: 12,
    color: "#334155",
    paddingVertical: 2,
  },
  rawItemRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  rawItemTitle: { fontFamily: "OpenSans",
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  rawItemDetail: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
});
