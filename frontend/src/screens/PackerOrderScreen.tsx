// Packer Order Processing — matches reference Packing Order UI/UX (image_4c0947).
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
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
import { newIdemKey } from "@/repositories/pickerRepository";
import { alertWrongBarcode, beepSuccess } from "@/services/scanner";
import BarcodeScannerModal from "@/scanner/BarcodeScannerModal";
import * as client from "@/api/client";
import { getWarehouseDisplay } from "@/utils/warehouse";

export function PackerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { picker } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;

  const [order, setOrder] = useState<client.OrderDetail | null>(null);
  const [riders, setRiders] = useState<client.Rider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [riderModal, setRiderModal] = useState(false);
  const [orderInfoModal, setOrderInfoModal] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);
  const [packInOrderSorted, setPackInOrderSorted] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const inputRef = useRef<TextInput>(null);

  const wh = getWarehouseDisplay(picker?.warehouseId);

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
    }, [load]),
  );

  const displayItems = useMemo(() => {
    if (!order) return [];
    const copy = [...order.items];
    if (packInOrderSorted) {
      return copy.sort((a, b) => {
        const aDone = a.packedQty >= a.pickedQty ? 1 : 0;
        const bDone = b.packedQty >= b.pickedQty ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return (a.location || "").localeCompare(b.location || "");
      });
    }
    return copy;
  }, [order, packInOrderSorted]);

  const activeItem = useMemo(() => {
    if (!order) return null;
    if (selectedItemId) {
      const found = order.items.find((i) => i.id === selectedItemId);
      if (found && found.packedQty < found.pickedQty) return found;
    }
    return (
      displayItems.find((i) => i.packedQty < i.pickedQty) ??
      displayItems[0] ??
      null
    );
  }, [order, displayItems, selectedItemId]);

  const activeRemaining = activeItem
    ? Math.max(0, activeItem.pickedQty - activeItem.packedQty)
    : 0;

  const cameraQueueRef = useRef<Promise<void>>(Promise.resolve());

  async function scan(value?: string): Promise<boolean> {
    if (busy || !order) return false;
    const code = (value ?? barcode).trim();
    if (!code) {
      setBarcode("");
      inputRef.current?.clear();
      const msg = "Please scan or enter a product barcode.";
      setError(msg);
      alertWrongBarcode("", activeItem?.skuBarcode || activeItem?.sku, msg);
      setTimeout(() => inputRef.current?.focus(), 80);
      return false;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    setBarcode(code);
    try {
      const result = await client.packerScanBarcode(
        String(id),
        code,
        newIdemKey(),
        1,
      );
      beepSuccess();
      setOrder(result.order);
      setBarcode("");
      inputRef.current?.clear();
      const item = result.item;
      const packedText = item ? `${item.packedQty}/${item.pickedQty}` : "";
      setSuccess(
        `Packed: ${item ? item.productName : "Item"}${
          packedText ? ` (${packedText})` : ""
        }`,
      );
      if (result.allPacked) {
        setSuccess("All items packed! Order is ready for rider assignment.");
        setScannerVisible(false);
      } else {
        setTimeout(() => inputRef.current?.focus(), 80);
      }
      return Boolean(result.allPacked);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Barcode scan failed";
      setBarcode("");
      inputRef.current?.clear();
      setError(`Wrong barcode "${code}" — ${msg}`);
      alertWrongBarcode(code, activeItem?.skuBarcode || activeItem?.sku, msg);
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
    setTimeout(
      () => setCopiedBarcode((current) => (current === value ? null : current)),
      1400,
    );
  }

  async function assign(rider: client.Rider) {
    if (!order || assigning) return;
    setAssigning(true);
    setError(null);
    try {
      await client.assignRider(order.id, rider.id, rider.name, newIdemKey());
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: "RIDER_ASSIGNED",
              riderId: rider.id,
              riderName: rider.name,
            }
          : prev,
      );
      setRiderModal(false);
      setSuccess("Rider assigned successfully!");
      setTimeout(() => {
        router.replace({
          pathname: "/packer-dashboard",
          params: { message: "Rider assigned successfully!" },
        } as never);
      }, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rider assignment failed");
    } finally {
      setAssigning(false);
    }
  }

  if (!order) {
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <View style={s.navyHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={s.backBtn}
          >
            <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
          </Pressable>
          <View style={s.headerTitleCol}>
            <Text style={s.headerTitle}>Packing Order</Text>
            <Text style={s.headerSub}>Pick verified items and pack them</Text>
          </View>
        </View>
        <View style={{ flex: 1, padding: 16, backgroundColor: "#F5F7FB" }}>
          <ErrorBanner message={error} />
          <LoadingState label="Loading order…" />
        </View>
      </SafeAreaView>
    );
  }

  const packed = order.items.reduce((sum, item) => sum + item.packedQty, 0);
  const picked = order.items.reduce((sum, item) => sum + item.pickedQty, 0);
  const remainingTotal = Math.max(0, picked - packed);
  const allPacked =
    order.status === "PACKED" ||
    order.status === "RIDER_ASSIGNED" ||
    (picked > 0 && packed >= picked);
  const progress =
    picked > 0 ? Math.min(100, Math.round((packed / picked) * 100)) : 0;
  const isEditable =
    !busy && order.status !== "PACKED" && order.status !== "RIDER_ASSIGNED";

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* Custom Dark-Navy Header: ← Packing Order / Pick verified items and pack them   [📦 Order Info] */}
      <View style={s.navyHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </Pressable>

        <View style={s.headerTitleCol}>
          <Text
            style={[s.headerTitle, compact && { fontSize: 17 }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.15}
          >
            Packing Order
          </Text>
          <Text
            style={s.headerSub}
            numberOfLines={1}
            maxFontSizeMultiplier={1.1}
          >
            Pick verified items and pack them
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Order Info"
          onPress={() => setOrderInfoModal(true)}
          style={({ pressed }) => [s.orderInfoBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="cube-outline" size={16} color="#FFFFFF" />
          <Text style={s.orderInfoBtnText} maxFontSizeMultiplier={1.1}>
            Order Info
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          { paddingBottom: 24 + Math.max(insets.bottom, 12) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Order Summary Card */}
        <View style={s.summaryCard}>
          <View style={s.summaryTopRow}>
            <View style={s.orangeCubeBox}>
              <Ionicons name="cube" size={26} color="#EA580C" />
            </View>

            <View style={s.summaryInfoCol}>
              <Text
                style={s.summaryOrderId}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {order.orderNumber}
              </Text>
              <Text
                style={s.summaryCustomer}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {order.customer || "Warehouse Customer"}
              </Text>

              <View style={[s.iconRow, { marginTop: 5 }]}>
                <Ionicons
                  name="location-sharp"
                  size={13}
                  color="#334155"
                  style={s.rowIcon}
                />
                <Text
                  style={s.summaryWhName}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.15}
                >
                  {wh.name}
                </Text>
              </View>
              <Text
                style={s.summaryWhAddr}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {wh.address}
              </Text>

              <View style={[s.iconRow, { marginTop: 5 }]}>
                <Ionicons
                  name="cube-outline"
                  size={13}
                  color="#475569"
                  style={s.rowIcon}
                />
                <Text
                  style={s.summaryItemsUnits}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.15}
                >
                  {order.items.length}{" "}
                  {order.items.length === 1 ? "item" : "items"}  •  {picked}{" "}
                  {picked === 1 ? "unit" : "units"}
                </Text>
              </View>
            </View>

            <View style={[s.readyStatusPill, allPacked && s.packedStatusPill]}>
              <Ionicons
                name={allPacked ? "checkmark-circle" : "time"}
                size={13}
                color={allPacked ? "#15803D" : "#B45309"}
              />
              <Text
                style={[s.readyStatusText, allPacked && { color: "#15803D" }]}
                maxFontSizeMultiplier={1.1}
              >
                {order.status === "RIDER_ASSIGNED"
                  ? "DISPATCHED"
                  : allPacked
                    ? "PACKED"
                    : "READY"}
              </Text>
            </View>
          </View>

          {/* Packing Progress Header + Bar */}
          <View style={s.progressSection}>
            <View style={s.progressLabelRow}>
              <Text style={s.progressTitle} maxFontSizeMultiplier={1.1}>
                Packing Progress
              </Text>
              <Text style={s.progressUnitsLabel} maxFontSizeMultiplier={1.1}>
                {packed} / {picked} units packed ({progress}%)
              </Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress}%` }]} />
            </View>
          </View>

          {/* 4-Column Stat Strip: Items | Total Units | Packed | Remaining */}
          <View style={s.statsStrip}>
            <View style={s.statCol}>
              <Text style={s.statVal} maxFontSizeMultiplier={1.1}>
                {order.items.length}
              </Text>
              <Text
                style={s.statLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
              >
                Items
              </Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCol}>
              <Text style={s.statVal} maxFontSizeMultiplier={1.1}>
                {picked}
              </Text>
              <Text
                style={s.statLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
              >
                Total Units
              </Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCol}>
              <Text
                style={[s.statVal, { color: "#D95D00" }]}
                maxFontSizeMultiplier={1.1}
              >
                {packed}
              </Text>
              <Text
                style={s.statLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
              >
                Packed
              </Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCol}>
              <Text style={s.statVal} maxFontSizeMultiplier={1.1}>
                {remainingTotal}
              </Text>
              <Text
                style={s.statLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
              >
                Remaining
              </Text>
            </View>
          </View>
        </View>

        {/* Scan-only workflow: every accepted barcode scan packs exactly one unit. */}
        {isEditable ? (
          <View style={s.scanCard}>
            <View style={s.scanOnlyHeader}>
              <Ionicons name="scan-outline" size={18} color="#D95D00" />
              <Text style={s.scanOnlyHeaderText}>Scan each product separately</Text>
            </View>
            <View style={s.scanInputRow}>
              <View style={s.scanInputWrap}>
                <Ionicons
                  name="barcode-outline"
                  size={18}
                  color="#64748B"
                  style={{ marginRight: 7 }}
                />
                <TextInput
                  ref={inputRef}
                  value={barcode}
                  onChangeText={(txt) => {
                    setBarcode(txt);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={() => void scan()}
                  placeholder="Scan or enter item barcode..."
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  blurOnSubmit={false}
                  editable={!busy}
                  style={s.scanInput}
                />
                {barcode.length > 0 && !busy ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear barcode"
                    onPress={() => {
                      inputRef.current?.clear();
                      setBarcode("");
                      inputRef.current?.focus();
                    }}
                    hitSlop={8}
                    style={s.clearInputBtn}
                  >
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </Pressable>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Scan with camera"
                style={({ pressed }) => [s.cameraBtn, pressed && { opacity: 0.85 }]}
                onPress={() => setScannerVisible(true)}
                disabled={busy}
              >
                <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Submit barcode"
                style={({ pressed }) => [
                  s.verifyBtn,
                  barcode.trim().length > 0 && s.verifyBtnActive,
                  busy && s.disabled,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => void scan()}
                disabled={busy || !barcode.trim()}
              >
                <Text
                  style={[
                    s.verifyBtnText,
                    barcode.trim().length > 0 && s.verifyBtnTextActive,
                  ]}
                  maxFontSizeMultiplier={1.1}
                >
                  {busy ? "…" : "Verify"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <ErrorBanner message={error} />
        {success ? (
          <View style={s.packedFeedback} accessibilityRole="alert">
            <Ionicons name="checkmark-circle" size={22} color="#15803D" />
            <Text style={s.packedFeedbackText}>{success}</Text>
          </View>
        ) : null}

        {/* Order Items Header + Pack in Order Pill */}
        <View style={s.itemsHeaderRow}>
          <Text style={s.itemsHeaderTitle} maxFontSizeMultiplier={1.15}>
            Order Items ({order.items.length})
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle pack in order sorting"
            onPress={() => setPackInOrderSorted((v) => !v)}
            style={({ pressed }) => [s.packOrderPill, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="swap-vertical-outline" size={14} color="#D95D00" />
            <Text style={s.packOrderPillText} maxFontSizeMultiplier={1.1}>
              Pack in Order
            </Text>
          </Pressable>
        </View>

        {/* Order Items Cards List */}
        {displayItems.map((item, idx) => {
          const done = item.packedQty >= item.pickedQty;
          const isSelected = activeItem?.id === item.id && !done;
          const imgFailed = failedImages[item.id] === true;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.productName}, packed ${item.packedQty} of ${item.pickedQty}`}
              onPress={() => {
                setSelectedItemId(item.id);
                setBarcode("");
                inputRef.current?.clear();
                setError(null);
              }}
              style={({ pressed }) => [
                s.itemCard,
                done && s.itemCardDone,
                isSelected && s.itemCardSelected,
                pressed && { opacity: 0.92 },
              ]}
            >
              <View
                style={[
                  s.stepBadgeCircle,
                  done ? s.stepBadgeDone : s.stepBadgePending,
                ]}
              >
                <Text
                  style={[
                    s.stepBadgeText,
                    done ? { color: "#15803D" } : { color: "#C2410C" },
                  ]}
                  maxFontSizeMultiplier={1.1}
                >
                  {idx + 1}
                </Text>
              </View>

              <View style={s.itemThumbBox}>
                {item.productImageUrl && !imgFailed ? (
                  <Image
                    source={{ uri: item.productImageUrl }}
                    style={s.itemThumbImg}
                    resizeMode="contain"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [item.id]: true }))
                    }
                  />
                ) : (
                  <Ionicons name="cube-outline" size={26} color="#D95D00" />
                )}
              </View>

              <View style={s.itemMain}>
                <Text
                  style={s.itemName}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.15}
                >
                  {item.productName}
                </Text>

                <Pressable
                  onPress={() => void copyBarcode(item.skuBarcode)}
                  style={s.skuCopyRow}
                >
                  <Text
                    style={s.itemSkuText}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.1}
                  >
                    SKU: {item.skuBarcode || item.sku}
                  </Text>
                  {copiedBarcode === item.skuBarcode ? (
                    <Text style={s.copiedTag}>Copied</Text>
                  ) : null}
                </Pressable>

                <View style={s.locationBadgePill}>
                  <Ionicons name="location-sharp" size={12} color="#D97706" />
                  <Text
                    style={s.locationBadgeText}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.1}
                  >
                    {item.location || "WH-A-C-02-018"}
                  </Text>
                </View>
              </View>

              <View style={s.itemRightCol}>
                {done ? (
                  <View style={s.doneCheckCircle}>
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                ) : null}

                <View style={s.qtyStatusCol}>
                  <Text
                    style={[s.qtyFractionText, done && { color: "#15803D" }]}
                    maxFontSizeMultiplier={1.1}
                  >
                    {item.packedQty} / {item.pickedQty}
                  </Text>
                  <Text
                    style={[
                      s.qtySubLabel,
                      done && { color: "#15803D", fontWeight: "700" },
                    ]}
                    maxFontSizeMultiplier={1.1}
                  >
                    {done ? "Packed" : "To Pack"}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={16} color="#475569" />
              </View>
            </Pressable>
          );
        })}

        {/* Unit-by-unit packing: every accepted barcode scan confirms exactly one item. */}
        {activeItem && isEditable && activeRemaining > 0 ? (
          <View style={s.packQtyCard}>
            <View style={s.packQtyTopRow}>
              <View style={s.itemThumbBox}>
                {activeItem.productImageUrl && !failedImages[activeItem.id] ? (
                  <Image
                    source={{ uri: activeItem.productImageUrl }}
                    style={s.itemThumbImg}
                    resizeMode="contain"
                  />
                ) : (
                  <Ionicons name="cube-outline" size={26} color="#D95D00" />
                )}
              </View>
              <View style={s.packQtyInfoCol}>
                <Text style={s.itemName} numberOfLines={2} maxFontSizeMultiplier={1.15}>
                  {activeItem.productName}
                </Text>
                <Text style={s.itemSkuText} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                  Barcode: {activeItem.skuBarcode || activeItem.sku}
                </Text>
                <Text style={s.packQtyLocLine} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                  Location: <Text style={s.packQtyLocHighlight}>{activeItem.location || "—"}</Text>
                </Text>
              </View>
              <View style={s.requiredQtyBox}>
                <Text style={s.requiredQtyLabel} maxFontSizeMultiplier={1.1}>Units left</Text>
                <Text style={s.requiredQtyVal} maxFontSizeMultiplier={1.1}>{activeRemaining}</Text>
              </View>
            </View>
            <View style={s.scanEachHint}>
              <Ionicons name="scan-outline" size={18} color="#D95D00" />
              <Text style={s.scanEachHintText}>
                Scan each physical product separately. Every successful scan packs 1 unit.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Bottom Complete Packing Order / Assign Dispatch Rider Button */}
        <View style={s.completeBottomWrap}>
          {order.status === "RIDER_ASSIGNED" ? (
            <View style={s.assignedBanner}>
              <Ionicons name="checkmark-done-circle" size={20} color="#15803D" />
              <Text style={s.assignedBannerText}>
                Rider Assigned: {order.riderName || "Assigned"}
              </Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                allPacked ? "Assign Dispatch Rider" : "Complete Packing Order"
              }
              disabled={!allPacked || assigning}
              onPress={() => setRiderModal(true)}
              style={({ pressed }) => [
                s.completeOrderBtn,
                allPacked && s.completeOrderBtnActive,
                pressed && allPacked && { opacity: 0.9 },
              ]}
            >
              <Ionicons
                name={allPacked ? "bicycle-outline" : "cube-outline"}
                size={20}
                color="#FFFFFF"
              />
              <Text style={s.completeOrderBtnText} maxFontSizeMultiplier={1.1}>
                {allPacked
                  ? "Complete Packing Order • Assign Rider"
                  : "Complete Packing Order"}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <BarcodeScannerModal
        visible={scannerVisible}
        title="Scan product barcode"
        continuous
        onScanned={enqueueCameraScan}
        onClose={() => setScannerVisible(false)}
      />

      {/* Order Info Modal */}
      <Modal
        visible={orderInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setOrderInfoModal(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Order Information</Text>
                <Text style={s.modalSub}>
                  {order.orderNumber} • {order.customer || "Warehouse Customer"}
                </Text>
              </View>
              <Pressable onPress={() => setOrderInfoModal(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.color.muted} />
              </Pressable>
            </View>

            <View style={s.infoRow}>
              <Text style={s.infoKey}>Status</Text>
              <Text style={s.infoVal}>{order.status}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoKey}>Warehouse</Text>
              <Text style={s.infoVal}>{wh.name}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoKey}>Packed Units</Text>
              <Text style={s.infoVal}>
                {packed} / {picked} ({progress}%)
              </Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoKey}>Packages Created</Text>
              <Text style={s.infoVal}>{order.packages.length}</Text>
            </View>

            {order.recentScans.length > 0 ? (
              <View style={s.recentSection}>
                <Text style={s.recentSectionTitle}>RECENT SCANS</Text>
                {order.recentScans.slice(-4).map((scanItem, index) => {
                  const item = order.items.find((i) => i.id === scanItem.itemId);
                  return (
                    <View
                      key={scanItem.createdAt + scanItem.itemId + index}
                      style={s.recentRow}
                    >
                      <Ionicons name="checkmark-sharp" size={13} color="#15803D" />
                      <Text style={s.recentBarcode}>{scanItem.barcode}</Text>
                      <Text style={s.recentName} numberOfLines={1}>
                        {item?.productName || "Item"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={{ marginTop: 12 }}>
              <PrimaryButton
                label="Close"
                variant="amber"
                onPress={() => setOrderInfoModal(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Rider Selection Modal */}
      <Modal
        visible={riderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRiderModal(false)}
      >
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#091E3A" },
  navyHeader: { width: "100%", backgroundColor: "#091E3A", paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  headerTitleCol: { flex: 1 },
  headerTitle: { fontSize: 19, fontWeight: "900", color: "#FFFFFF" },
  headerSub: { fontSize: 11.5, color: "#CBD5E1", marginTop: 1 },
  orderInfoBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.08)", flexShrink: 0 },
  orderInfoBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  scroll: { flex: 1, backgroundColor: "#F5F7FB" },
  scrollContent: { paddingHorizontal: 14, paddingTop: 12 },
  summaryCard: { width: "100%", backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, marginBottom: 12, shadowColor: "#0F172A", shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  summaryTopRow: { width: "100%", flexDirection: "row", alignItems: "flex-start" },
  orangeCubeBox: { width: 50, height: 50, borderRadius: 14, backgroundColor: "#FFF1E6", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  summaryInfoCol: { flex: 1, marginHorizontal: 11 },
  summaryOrderId: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  summaryCustomer: { fontSize: 13, color: "#475569", fontWeight: "500", marginTop: 2 },
  iconRow: { flexDirection: "row", alignItems: "center" },
  rowIcon: { marginRight: 5 },
  summaryWhName: { flex: 1, fontSize: 12, fontWeight: "700", color: "#1E293B" },
  summaryWhAddr: { fontSize: 11, color: "#64748B", marginTop: 1, paddingLeft: 18 },
  summaryItemsUnits: { flex: 1, fontSize: 12, color: "#475569", fontWeight: "500" },
  readyStatusPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexShrink: 0 },
  packedStatusPill: { backgroundColor: "#DCFCE7", borderColor: "#BBF7D0" },
  readyStatusText: { fontSize: 10.5, fontWeight: "800", color: "#92400E", letterSpacing: 0.4 },
  progressSection: { width: "100%", marginTop: 12, marginBottom: 12 },
  progressLabelRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  progressTitle: { fontSize: 12.5, fontWeight: "800", color: "#0F172A" },
  progressUnitsLabel: { fontSize: 12, fontWeight: "800", color: "#C2410C" },
  progressTrack: { width: "100%", height: 7, backgroundColor: "#E2E8F0", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 7, backgroundColor: "#EA580C", borderRadius: 4 },
  statsStrip: { width: "100%", flexDirection: "row", alignItems: "center", paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  statCol: { flex: 1, alignItems: "center", paddingHorizontal: 2 },
  statVal: { fontSize: 17, fontWeight: "900", color: "#0F172A" },
  statLabel: { fontSize: 11, color: "#64748B", fontWeight: "500", marginTop: 2, textAlign: "center" },
  statDivider: { width: 1, height: 28, backgroundColor: "#E2E8F0" },
  scanCard: { width: "100%", backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 14, overflow: "hidden" },
  scanOnlyHeader: { width: "100%", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  scanOnlyHeaderText: { color: "#0F172A", fontSize: 13, fontWeight: "800" },
  scanTabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  scanTabBtnActive: { borderBottomColor: "#D95D00" },
  scanTabText: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  scanTabTextActive: { color: "#D95D00", fontWeight: "800" },
  scanInputRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  scanInputWrap: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 11, paddingHorizontal: 10, backgroundColor: "#F8FAFC" },
  scanInput: { flex: 1, color: "#0F172A", fontSize: 13.5, minHeight: 40 },
  clearInputBtn: { padding: 4, alignItems: "center", justifyContent: "center" },
  cameraBtn: { width: 44, height: 44, borderRadius: 11, backgroundColor: "#D95D00", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  verifyBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 11, backgroundColor: "#FDEBD0", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  verifyBtnActive: { backgroundColor: "#D95D00" },
  verifyBtnText: { color: "#9A3412", fontWeight: "800", fontSize: 13.5 },
  verifyBtnTextActive: { color: "#FFFFFF" },
  disabled: { opacity: 0.45 },
  packedFeedback: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12, backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#86EFAC", borderRadius: 12 },
  packedFeedbackText: { flex: 1, fontSize: 13.5, fontWeight: "800", color: "#15803D" },
  itemsHeaderRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  itemsHeaderTitle: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  packOrderPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFFDF6", borderWidth: 1, borderColor: "#FCD34D", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 6, flexShrink: 0 },
  packOrderPillText: { fontSize: 12, fontWeight: "800", color: "#B45309" },
  itemCard: { width: "100%", flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 16, padding: 10, marginBottom: 10, shadowColor: "#0F172A", shadowOpacity: 0.02, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  itemCardDone: { borderColor: "#BBF7D0", backgroundColor: "#F2FBF5", borderWidth: 1.5 },
  itemCardSelected: { borderColor: "#FDBA74", borderWidth: 1.5 },
  stepBadgeCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 8 },
  stepBadgeDone: { backgroundColor: "#DCFCE7" },
  stepBadgePending: { backgroundColor: "#FFEDD5" },
  stepBadgeText: { fontSize: 13, fontWeight: "800" },
  itemThumbBox: { width: 56, height: 56, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  itemThumbImg: { width: "88%", height: "88%" },
  itemMain: { flex: 1, marginHorizontal: 9 },
  itemName: { fontSize: 14.5, fontWeight: "800", color: "#0F172A" },
  skuCopyRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  itemSkuText: { fontSize: 12, color: "#64748B" },
  copiedTag: { fontSize: 10, fontWeight: "800", color: "#15803D" },
  locationBadgePill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", maxWidth: "100%", gap: 4, backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  locationBadgeText: { fontSize: 11, fontWeight: "800", color: "#92400E", flexShrink: 1 },
  itemRightCol: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  doneCheckCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#15803D", alignItems: "center", justifyContent: "center" },
  qtyStatusCol: { alignItems: "flex-end" },
  qtyFractionText: { fontSize: 15, fontWeight: "900", color: "#0F172A" },
  qtySubLabel: { fontSize: 11, color: "#64748B", marginTop: 1 },
  packQtyCard: { width: "100%", backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", padding: 13, marginTop: 4, marginBottom: 12, shadowColor: "#0F172A", shadowOpacity: 0.03, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  packQtyTopRow: { width: "100%", flexDirection: "row", alignItems: "center" },
  packQtyInfoCol: { flex: 1, marginHorizontal: 10 },
  packQtyLocLine: { fontSize: 12, color: "#64748B", marginTop: 3 },
  packQtyLocHighlight: { fontWeight: "800", color: "#D95D00" },
  requiredQtyBox: { backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  requiredQtyLabel: { fontSize: 10.5, color: "#64748B", fontWeight: "600" },
  requiredQtyVal: { fontSize: 18, fontWeight: "900", color: "#0F172A", marginTop: 2 },
  scanEachHint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA" },
  scanEachHintText: { flex: 1, fontSize: 12, lineHeight: 17, color: "#9A3412", fontWeight: "600" },
  completeBottomWrap: { width: "100%", marginTop: 2 },
  completeOrderBtn: { width: "100%", minHeight: 52, borderRadius: 14, backgroundColor: "#CBD5E1", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  completeOrderBtnActive: { backgroundColor: "#D95D00" },
  completeOrderBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  assignedBanner: { width: "100%", backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#86EFAC", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  assignedBannerText: { fontSize: 14, fontWeight: "800", color: "#15803D" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.48)", justifyContent: "center", padding: 16 },
  modal: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  modalSub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  infoKey: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  infoVal: { fontSize: 13, color: "#0F172A", fontWeight: "800" },
  recentSection: { marginTop: 12 },
  recentSectionTitle: { fontSize: 10.5, fontWeight: "800", color: "#64748B", marginBottom: 6 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5 },
  recentBarcode: { fontSize: 11.5, fontWeight: "700", color: "#0F172A" },
  recentName: { flex: 1, fontSize: 11.5, color: "#64748B" },
  rider: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 12, marginBottom: 8, backgroundColor: "#F8FAFC" },
  riderMain: { flex: 1 },
  riderName: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  riderPhone: { fontSize: 12, color: "#64748B", marginTop: 2 },
  availablePill: { backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  available: { fontSize: 10, fontWeight: "800", color: "#15803D" },
});
