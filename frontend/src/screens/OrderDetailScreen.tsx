// Picking Order Screen — cross-device responsive Picker order & item scanning screen (Android, iOS & Web).
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
  ErrorState,
  LoadingState,
  SuccessFeedback,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { getDeviceId, newIdemKey, pickerRepository } from "@/repositories/pickerRepository";
import { nextPendingLine, pickStepPath, resolvePickStep } from "@/domain/order";
import { alertWrongBarcode, beepSuccess } from "@/services/scanner";
import BarcodeScannerModal from "@/scanner/BarcodeScannerModal";
import type { Order, OrderLine } from "@/types";
import { getOrderProgress, getWarehouseDisplay } from "@/utils/warehouse";

export function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { picker } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locationSorted, setLocationSorted] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Unified Scan & Pick sheet state (reduces multi-screen navigation)
  const [activeScanLine, setActiveScanLine] = useState<OrderLine | null>(null);
  const [scanSheetVisible, setScanSheetVisible] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [copiedBarcode, setCopiedBarcode] = useState(false);
  const [batchesVisible, setBatchesVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const scanInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await pickerRepository.getOrder(String(id));
    if (r.ok) {
      setOrder(r.data);
      setError(null);
    } else {
      setError(r.apiError.message);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const wh = getWarehouseDisplay(picker?.warehouseId);

  const displayLines = useMemo(() => {
    if (!order) return [];
    const copy = [...order.lines];
    if (locationSorted) {
      return copy.sort((a, b) => (a.locationCode || "").localeCompare(b.locationCode || ""));
    }
    return copy.sort((a, b) => a.lineNo - b.lineNo);
  }, [order, locationSorted]);

  const batchesMap = useMemo(() => {
    const groups = new Map<string, OrderLine[]>();
    for (const line of displayLines) {
      const parts = (line.locationCode || "ZONE-A").split("-");
      const zoneKey = parts.length >= 3 ? parts.slice(0, 3).join("-") : line.locationCode || "ZONE-A";
      const list = groups.get(zoneKey) ?? [];
      list.push(line);
      groups.set(zoneKey, list);
    }
    return Array.from(groups.entries());
  }, [displayLines]);

  async function ensureOrderStarted(currentOrder: Order): Promise<Order | null> {
    if (currentOrder.status !== "ASSIGNED") return currentOrder;
    const r = await pickerRepository.beginPicking(
      String(currentOrder.id),
      getDeviceId(),
      newIdemKey(),
      currentOrder.version,
    );
    if (!r.ok) {
      setError(r.apiError.message);
      return null;
    }
    setOrder(r.data);
    return r.data;
  }

  function openScanForLine(targetLine?: OrderLine | null) {
    if (!order) return;
    const lineToScan = targetLine ?? nextPendingLine(order) ?? order.lines[0] ?? null;
    if (!lineToScan) return;
    setActiveScanLine(lineToScan);
    setManualBarcode("");
    scanInputRef.current?.clear();
    setError(null);
    setFeedback(null);
    setScanSheetVisible(true);
    setTimeout(() => scanInputRef.current?.focus(), 120);
  }

  async function handleCopyExpected(code: string) {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopiedBarcode(true);
    setTimeout(() => setCopiedBarcode(false), 1400);
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
      alertWrongBarcode("", target.skuBarcode, msg);
      setTimeout(() => scanInputRef.current?.focus(), 80);
      return;
    }

    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const activeOrder = await ensureOrderStarted(order);
      if (!activeOrder) return;

      const currentLine =
        activeOrder.lines.find((l) => l.id === target.id) ?? target;

      const verified = await pickerRepository.validateSku(currentLine.id, code);
      if (!verified.ok || code.toUpperCase() !== currentLine.skuBarcode.trim().toUpperCase()) {
        setManualBarcode("");
        scanInputRef.current?.clear();
        const reason = !verified.ok
          ? `${verified.apiError.error}: ${verified.apiError.message}`
          : "Wrong item barcode. Scan the expected product.";
        setError(`Wrong barcode "${code}" — ${reason}`);
        alertWrongBarcode(
          code,
          currentLine.skuBarcode,
          !verified.ok ? verified.apiError.message : reason,
        );
        setTimeout(() => scanInputRef.current?.focus(), 80);
        return;
      }

      const picked = await pickerRepository.pickQuantity(
        currentLine.id,
        1,
        currentLine.uom,
        newIdemKey(),
      );
      if (!picked.ok) {
        setManualBarcode("");
        scanInputRef.current?.clear();
        setError(`${picked.apiError.error}: ${picked.apiError.message}`);
        alertWrongBarcode(code, currentLine.skuBarcode, picked.apiError.message);
        setTimeout(() => scanInputRef.current?.focus(), 80);
        return;
      }

      beepSuccess();
      setManualBarcode("");
      scanInputRef.current?.clear();

      // Update the completed line from the mutation response instead of making
      // another GET request. This avoids extra network latency and stale-line reads.
      const updatedOrder: Order = {
        ...activeOrder,
        lines: activeOrder.lines.map((l) =>
          l.id === picked.data.id ? picked.data : l,
        ),
      };
      setOrder(updatedOrder);

      const updatedLine =
        updatedOrder.lines.find((l) => l.id === currentLine.id) ?? picked.data;
      setFeedback(
        `Picked ${updatedLine.skuName} (${updatedLine.pickedQty}/${updatedLine.requiredQty})`,
      );

      if (updatedLine.pickedQty >= updatedLine.requiredQty) {
        const nextLine = nextPendingLine(updatedOrder);
        setActiveScanLine(nextLine);
        setManualBarcode("");
        if (!nextLine) {
          setScanSheetVisible(false);
        } else {
          setTimeout(() => scanInputRef.current?.focus(), 80);
        }
      } else {
        setActiveScanLine(updatedLine);
        setManualBarcode("");
        setTimeout(() => scanInputRef.current?.focus(), 80);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteOrder() {
    if (!order || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await pickerRepository.completeOrder(
        String(order.id),
        newIdemKey(),
        order.version,
      );
      if (!r.ok) {
        setError(`${r.apiError.error}: ${r.apiError.message}`);
        return;
      }
      setOrder(r.data);
      setFeedback("Order picking completed and moved to Ready for Packing!");
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
  const doneLines = order.lines.filter((l) =>
    ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status),
  ).length;
  const pickedPartialOrFullLines = order.lines.filter(
    (l) => l.pickedQty > 0 || l.status === "PICKED",
  ).length;
  const currentStep = resolvePickStep(order);
  const allLinesResolved = order.lines.length > 0 && doneLines === order.lines.length;
  const nextLine = nextPendingLine(order);
  const progressBarPct =
    prog.totalUnits > 0
      ? Math.min(100, Math.round((prog.pickedUnits / prog.totalUnits) * 100))
      : prog.pct;

  return (
    <SafeAreaView style={od.safe} edges={["top"]}>
      {/* Custom Top Header: ← Picking Order   [||] Scan   ⋮ */}
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
          Picking Order
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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Order options"
            onPress={() => setMenuVisible(true)}
            style={({ pressed }) => [od.iconBtn, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#0F172A" />
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
                {order.externalId}
              </Text>
              <Text
                style={od.summaryWhName}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {wh.name}
              </Text>
              <Text
                style={od.summaryWhAddr}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {wh.shortAddress}
              </Text>
            </View>

            <View style={od.itemsPickedBadge}>
              <Text style={od.itemsPickedRatio} maxFontSizeMultiplier={1.1}>
                {pickedPartialOrFullLines} / {prog.totalLines}
              </Text>
              <Text style={od.itemsPickedLabel} maxFontSizeMultiplier={1.1}>
                Items Picked
              </Text>
            </View>
          </View>

          {/* Progress Bar + Percentage */}
          <View style={od.progressRow}>
            <View style={od.progressTrack}>
              <View style={[od.progressFill, { width: `${progressBarPct}%` }]} />
            </View>
            <Text style={od.progressPctText} maxFontSizeMultiplier={1.1}>
              {progressBarPct}%
            </Text>
          </View>

          {/* 4-Column Stat Strip */}
          <View style={od.statsStrip}>
            <View style={od.statCol}>
              <Text style={od.statValue} maxFontSizeMultiplier={1.1}>
                {prog.totalLines}
              </Text>
              <Text
                style={od.statLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
              >
                Total Items
              </Text>
            </View>
            <View style={od.statDivider} />
            <View style={od.statCol}>
              <Text style={od.statValue} maxFontSizeMultiplier={1.1}>
                {prog.totalUnits}
              </Text>
              <Text
                style={od.statLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
              >
                Total Qty
              </Text>
            </View>
            <View style={od.statDivider} />
            <View style={od.statCol}>
              <Text
                style={[od.statValue, { color: "#16A34A" }]}
                maxFontSizeMultiplier={1.1}
              >
                {pickedPartialOrFullLines}
              </Text>
              <Text
                style={od.statLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
              >
                Picked Items
              </Text>
            </View>
            <View style={od.statDivider} />
            <View style={od.statCol}>
              <Text style={od.statValue} maxFontSizeMultiplier={1.1}>
                {prog.remainingUnits}
              </Text>
              <Text
                style={od.statLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.1}
              >
                Remaining Qty
              </Text>
            </View>
          </View>
        </View>

        <ErrorBanner message={error} />
        <SuccessFeedback message={feedback} />

        {/* Pick Items Header Row */}
        <View style={od.pickItemsHeaderRow}>
          <Text style={od.pickItemsTitle} maxFontSizeMultiplier={1.15}>
            Pick Items ({order.lines.length})
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle pick in location order"
            onPress={() => setLocationSorted((v) => !v)}
            style={({ pressed }) => [
              od.locationOrderPill,
              locationSorted && od.locationOrderPillActive,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons
              name="list-outline"
              size={15}
              color={locationSorted ? "#0B65C6" : "#334155"}
            />
            <Text
              style={[
                od.locationOrderText,
                locationSorted && { color: "#0B65C6" },
              ]}
              maxFontSizeMultiplier={1.1}
            >
              Pick in Location Order
            </Text>
          </Pressable>
        </View>

        {/* Pick Items List */}
        {displayLines.map((l, idx) => {
          const isPickedOrPartial = l.pickedQty > 0 || l.status === "PICKED";
          const isException = l.status === "EXCEPTION";
          const imgFailed = failedImages[l.id] === true;

          return (
            <Pressable
              key={l.id}
              accessibilityRole="button"
              accessibilityLabel={`Line ${idx + 1}, ${l.skuName}, ${l.pickedQty} of ${l.requiredQty}`}
              onPress={() => openScanForLine(l)}
              style={({ pressed }) => [
                od.itemCard,
                isPickedOrPartial && od.itemCardPicked,
                isException && od.itemCardException,
                pressed && { opacity: 0.92 },
              ]}
            >
              {/* Step Number Pill */}
              <View style={od.stepNumPill}>
                <Text style={od.stepNumText} maxFontSizeMultiplier={1.1}>
                  {idx + 1}
                </Text>
              </View>

              {/* Product Image Thumbnail */}
              <View style={od.thumbBox}>
                {l.productImageUrl && !imgFailed ? (
                  <Image
                    source={{ uri: l.productImageUrl }}
                    style={od.thumbImage}
                    resizeMode="contain"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [l.id]: true }))
                    }
                  />
                ) : (
                  <Ionicons name="cube-outline" size={26} color="#0284C7" />
                )}
              </View>

              {/* Product Name, SKU & Location Pill */}
              <View style={od.itemCenter}>
                <Text
                  style={od.itemName}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.15}
                >
                  {l.skuName}
                </Text>
                <Text
                  style={od.itemSku}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.15}
                >
                  SKU: {l.skuCode}
                </Text>

                <View style={od.locPill}>
                  <Ionicons name="location-sharp" size={12} color="#D97706" />
                  <Text
                    style={od.locPillText}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.1}
                  >
                    {l.locationCode}
                  </Text>
                </View>
              </View>

              {/* Right Quantity + Picked/To Pick + Check Icon + Chevron */}
              <View style={od.itemRight}>
                <View style={od.qtyTextCol}>
                  <Text style={od.qtyRatioText} maxFontSizeMultiplier={1.1}>
                    <Text style={od.qtyNumerator}>{l.pickedQty}</Text> / {l.requiredQty}
                  </Text>
                  <Text
                    style={[
                      od.qtyStatusLabel,
                      isPickedOrPartial && { color: "#15803D", fontWeight: "600" },
                    ]}
                    maxFontSizeMultiplier={1.1}
                  >
                    {isException ? "Exception" : isPickedOrPartial ? "Picked" : "To Pick"}
                  </Text>
                </View>

                {isPickedOrPartial ? (
                  <View style={od.checkCircleDone}>
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                ) : isException ? (
                  <View style={[od.checkCircleDone, { backgroundColor: "#D97706" }]}>
                    <Ionicons name="alert" size={13} color="#FFFFFF" />
                  </View>
                ) : (
                  <View style={od.checkCircleEmpty} />
                )}

                <Ionicons name="chevron-forward" size={16} color="#475569" />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Sticky Bottom Action Bar: [ Scan Next Item ]  [ View Batches ] */}
      <View
        style={[
          od.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        {order.status === "COMPLETED" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/orders" as never)}
            style={({ pressed }) => [
              od.scanNextBtn,
              { backgroundColor: "#16A34A" },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Ionicons name="checkmark-done-circle" size={22} color="#FFFFFF" />
            <Text style={od.scanNextBtnText} maxFontSizeMultiplier={1.1}>
              Back to Orders
            </Text>
          </Pressable>
        ) : allLinesResolved || currentStep === "complete" ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void handleCompleteOrder()}
            style={({ pressed }) => [
              od.scanNextBtn,
              { backgroundColor: "#16A34A" },
              busy && { opacity: 0.6 },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
            <Text style={od.scanNextBtnText} maxFontSizeMultiplier={1.1}>
              {busy ? "Completing…" : "Complete Picking"}
            </Text>
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
            <Text style={od.scanNextBtnText} maxFontSizeMultiplier={1.1}>
              Scan Next Item
            </Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Batches"
          onPress={() => setBatchesVisible(true)}
          style={({ pressed }) => [od.viewBatchesBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="list-outline" size={20} color="#0F172A" />
          <Text style={od.viewBatchesText} maxFontSizeMultiplier={1.1}>
            View Batches
          </Text>
        </Pressable>
      </View>

      {/* Mount the scan sheet only while there is a pending product to pick. */}
      {scanSheetVisible && nextLine ? (
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
                <Text style={od.modalTitle}>
                  {activeScanLine ? activeScanLine.skuName : "Scan Product"}
                </Text>
                <Text style={od.modalSub}>
                  {activeScanLine
                    ? `Location: ${activeScanLine.locationCode}  •  Picked: ${activeScanLine.pickedQty}/${activeScanLine.requiredQty}`
                    : "Scan item barcode to pick 1 unit"}
                </Text>
              </View>
              <Pressable
                onPress={() => setScanSheetVisible(false)}
                hitSlop={10}
                style={od.closeCircle}
              >
                <Ionicons name="close" size={20} color="#334155" />
              </Pressable>
            </View>

            {activeScanLine ? (
              <>
                <View style={od.expectedBarcodeBox}>
                  <View style={od.expectedHeaderRow}>
                    <Text style={od.expectedLabel}>EXPECTED PRODUCT BARCODE</Text>
                    <Pressable
                      onPress={() => void handleCopyExpected(activeScanLine.skuBarcode)}
                      style={od.copyChip}
                    >
                      <Ionicons
                        name={copiedBarcode ? "checkmark" : "copy-outline"}
                        size={13}
                        color={copiedBarcode ? "#15803D" : "#0B65C6"}
                      />
                      <Text
                        style={[
                          od.copyChipText,
                          copiedBarcode && { color: "#15803D" },
                        ]}
                      >
                        {copiedBarcode ? "Copied" : "Copy"}
                      </Text>
                    </Pressable>
                  </View>
                  <Text selectable style={od.expectedBarcodeValue}>
                    {activeScanLine.skuBarcode}
                  </Text>
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
                      placeholder="Scan or type product barcode…"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      blurOnSubmit={false}
                      style={od.scanInput}
                      returnKeyType="done"
                      onSubmitEditing={() => void handleScanSubmit()}
                    />
                    {manualBarcode.length > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Clear barcode"
                        onPress={() => {
                          scanInputRef.current?.clear();
                          setManualBarcode("");
                          scanInputRef.current?.focus();
                        }}
                        hitSlop={8}
                        style={od.clearInputBtn}
                      >
                        <Ionicons name="close-circle" size={18} color="#94A3B8" />
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open camera scanner"
                    onPress={() => setCameraVisible(true)}
                    style={od.cameraSquareBtn}
                  >
                    <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
                  </Pressable>
                </View>

                <ErrorBanner message={error} />
                <SuccessFeedback message={feedback} />

                <View style={od.modalActionRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void handleScanSubmit()}
                    style={({ pressed }) => [
                      od.confirmPickBtn,
                      busy && { opacity: 0.6 },
                      pressed && { opacity: 0.88 },
                    ]}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={od.confirmPickBtnText}>
                      {busy
                        ? "Verifying & Picking…"
                        : `Verify & Pick 1 Unit (${activeScanLine.pickedQty}/${activeScanLine.requiredQty})`}
                    </Text>
                  </Pressable>

                  <View style={od.secondaryActionsRow}>
                    <Pressable
                      onPress={() => {
                        setScanSheetVisible(false);
                        router.push({
                          pathname: "/pick/[orderId]/exception",
                          params: { orderId: order.id, lineId: activeScanLine.id },
                        } as never);
                      }}
                      style={od.exceptionLinkBtn}
                    >
                      <Ionicons name="warning-outline" size={15} color="#DC2626" />
                      <Text style={od.exceptionLinkText}>Report Exception</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setScanSheetVisible(false);
                        router.replace(pickStepPath(order.id, order) as never);
                      }}
                      style={od.fullScreenLinkBtn}
                    >
                      <Ionicons name="expand-outline" size={15} color="#0B65C6" />
                      <Text style={od.fullScreenLinkText}>Full Item View</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
      ) : null}

      {/* View Batches Modal */}
      <Modal
        visible={batchesVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBatchesVisible(false)}
      >
        <View style={od.modalBackdrop}>
          <View style={od.scanModalCard}>
            <View style={od.modalHeader}>
              <View>
                <Text style={od.modalTitle}>Order Batches & Zones</Text>
                <Text style={od.modalSub}>
                  {batchesMap.length} zone batch(es) across {order.lines.length} items
                </Text>
              </View>
              <Pressable
                onPress={() => setBatchesVisible(false)}
                style={od.closeCircle}
              >
                <Ionicons name="close" size={20} color="#334155" />
              </Pressable>
            </View>

            {batchesMap.map(([zone, lines], bIdx) => {
              const pickedInBatch = lines.filter(
                (l) => l.pickedQty >= l.requiredQty || l.status === "PICKED",
              ).length;
              return (
                <View key={zone} style={od.batchRow}>
                  <View style={od.batchBadge}>
                    <Text style={od.batchBadgeText}>B{bIdx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={od.batchZoneTitle}>Zone {zone}</Text>
                    <Text style={od.batchZoneSub}>
                      {lines.map((l) => l.skuName).join(", ")}
                    </Text>
                  </View>
                  <Text style={od.batchProgressText}>
                    {pickedInBatch}/{lines.length} picked
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* Options Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={od.modalBackdrop}
          onPress={() => setMenuVisible(false)}
        >
          <View style={od.scanModalCard}>
            <Text style={od.modalTitle}>Order Actions</Text>
            <Pressable
              style={od.menuActionRow}
              onPress={() => {
                setMenuVisible(false);
                void load();
              }}
            >
              <Ionicons name="refresh-outline" size={20} color="#0F172A" />
              <Text style={od.menuActionText}>Refresh Order State</Text>
            </Pressable>
            {nextLine ? (
              <Pressable
                style={od.menuActionRow}
                onPress={() => {
                  setMenuVisible(false);
                  router.push({
                    pathname: "/pick/[orderId]/exception",
                    params: { orderId: order.id, lineId: nextLine.id },
                  } as never);
                }}
              >
                <Ionicons name="warning-outline" size={20} color="#DC2626" />
                <Text style={[od.menuActionText, { color: "#DC2626" }]}>
                  Report Exception on Current Line
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <BarcodeScannerModal
        visible={cameraVisible}
        title="Scan product barcode"
        onScanned={(value) => {
          setCameraVisible(false);
          setManualBarcode(value);
          void handleScanSubmit(value);
        }}
        onClose={() => setCameraVisible(false)}
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
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F5F7FB",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginLeft: 6,
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  topScanBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  topScanLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  summaryCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryHeaderBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F8FF",
    borderRadius: 14,
    padding: 12,
  },
  orangeCubeCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  summaryOrderCopy: {
    flex: 1,
    marginHorizontal: 10,
  },
  summaryOrderId: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  summaryWhName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
    marginTop: 2,
  },
  summaryWhAddr: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
  itemsPickedBadge: {
    backgroundColor: "#DFEEFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  itemsPickedRatio: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
  },
  itemsPickedLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    marginTop: 2,
  },
  progressRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1D76DB",
  },
  progressPctText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1D76DB",
    minWidth: 34,
    textAlign: "right",
  },
  statsStrip: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
  },
  statLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#E2E8F0",
  },
  pickItemsHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 2,
  },
  pickItemsTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  locationOrderPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexShrink: 0,
  },
  locationOrderPillActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#F8FAFC",
  },
  locationOrderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
  },
  itemCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    marginBottom: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  itemCardPicked: {
    backgroundColor: "#F3FBF6",
    borderColor: "#86EFAC",
    borderWidth: 1.5,
  },
  itemCardException: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
    borderWidth: 1.5,
  },
  stepNumPill: {
    width: 26,
    minHeight: 60,
    borderRadius: 8,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: 8,
  },
  stepNumText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0369A1",
  },
  thumbBox: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  thumbImage: {
    width: "90%",
    height: "90%",
  },
  itemCenter: {
    flex: 1,
    marginHorizontal: 9,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  itemSku: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  locPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: 4,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  locPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#92400E",
    flexShrink: 1,
  },
  itemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  qtyTextCol: {
    alignItems: "flex-end",
  },
  qtyRatioText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748B",
  },
  qtyNumerator: {
    fontWeight: "900",
    color: "#0F172A",
  },
  qtyStatusLabel: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
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
    backgroundColor: "#FFFFFF",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 6,
  },
  scanNextBtn: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: "#0B65C6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  scanNextBtnText: {
    flexShrink: 1,
    minWidth: 0,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    includeFontPadding: false,
  },
  viewBatchesBtn: {
    minHeight: 54,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    flexShrink: 0,
  },
  viewBatchesText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    justifyContent: "flex-end",
  },
  scanModalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  modalTitle: {
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  expectedBarcodeBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
  },
  expectedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  expectedLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  copyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0B65C6",
  },
  expectedBarcodeValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 1,
    marginTop: 4,
  },
  scanInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scanInputWrap: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 8,
    backgroundColor: "#FFFFFF",
  },
  scanInput: {
    flex: 1,
    minHeight: 44,
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  clearInputBtn: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraSquareBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#0B65C6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionRow: {
    gap: 10,
    marginTop: 4,
  },
  confirmPickBtn: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmPickBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  exceptionLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
  },
  exceptionLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#DC2626",
  },
  fullScreenLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
  },
  fullScreenLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B65C6",
  },
  batchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  batchBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  batchBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0369A1",
  },
  batchZoneTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  batchZoneSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  batchProgressText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1565C0",
  },
  menuActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuActionText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
});
