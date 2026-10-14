// Compact picker item step: verify the SKU and count each physical item barcode scan as 1 EA.
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  LoadingState,
  ProgressIndicator,
  Screen,
  theme,
} from "@/components/ui";
import { nextPendingLine, resolvePickStep } from "@/domain/order";
import { newIdemKey, pickerRepository } from "@/repositories/pickerRepository";
import { alertWrongBarcode, beepSuccess } from "@/services/scanner";
import BarcodeDisplay from "@/components/BarcodeDisplay";
import type { Order } from "@/types";

export function SkuScanScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [skuVerified, setSkuVerified] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageMagnified, setImageMagnified] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
      const r = await pickerRepository.getOrder(String(orderId));
      if (generation !== loadGeneration.current) return;
      if (r.ok) {
        setOrder(r.data);
        const active = nextPendingLine(r.data);
        setActiveLineId(active && (active.status === "PENDING" || active.status === "LOCATION_VALIDATED" || active.status === "SKU_VALIDATED") ? active.id : null);
        setSkuVerified(active?.status === "SKU_VALIDATED");
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const line = order?.lines.find(l => l.id === activeLineId)
    ?? order?.lines.find(l => l.status === "PENDING" || l.status === "LOCATION_VALIDATED" || l.status === "SKU_VALIDATED")
    ?? null;
  const step = order ? resolvePickStep(order) : null;

  useEffect(() => { setImageFailed(false); }, [line?.skuCode, line?.productImageUrl]);

  useEffect(() => {
    if (!order) return;
    if (step === "complete") {
      router.replace({ pathname: "/pick/[orderId]/complete", params: { orderId: order.id } } as never);
      return;
    }
    if (step !== null && step !== "sku" && step !== "quantity") router.replace(`/pick/${order.id}/${step}` as never);
  }, [order, step]);

  async function processItemBarcode(value: string) {
    if (!line || !order || busy) return;
    const barcode = value.trim();
    if (!barcode) {
      setManual("");
      const msg = "Barcode is required. Scan the product or enter its barcode before confirming.";
      setError(msg);
      alertWrongBarcode("", line.skuBarcode, msg);
      return;
    }

    loadGeneration.current += 1;
    setBusy(true);
    setError(null);
    try {
      // Validate and record every physical unit scan on the server, not just the first scan.
      const verified = await pickerRepository.validateSku(line.id, barcode);
      if (!verified.ok) {
        setManual("");
        setError(`Wrong barcode "${barcode}" — ${verified.apiError.error}: ${verified.apiError.message}`);
        alertWrongBarcode(barcode, line.skuBarcode, verified.apiError.message);
        return;
      }
      setSkuVerified(true);

      const picked = await pickerRepository.pickQuantity(line.id, 1, line.uom, newIdemKey());
      if (!picked.ok) {
        setManual("");
        setError(`${picked.apiError.error}: ${picked.apiError.message}`);
        alertWrongBarcode(barcode, line.skuBarcode, picked.apiError.message);
        return;
      }

      beepSuccess();
      setManual("");
      const pickedQty = picked.data.pickedQty;
      const completed = pickedQty >= line.requiredQty;
      const nextLines = order.lines.map(l => l.id === line.id ? { ...l, pickedQty, status: completed ? "PICKED" as const : "SKU_VALIDATED" as const } : l);
      const nextOrder = { ...order, lines: nextLines };
      setOrder(nextOrder);
      setActiveLineId(null);
      setSkuVerified(!completed);

      if (completed) {
        const nextStep = resolvePickStep(nextOrder);
        if (nextStep === "complete") {
          router.replace({ pathname: "/pick/[orderId]/complete", params: { orderId: nextOrder.id } } as never);
        } else {
          router.replace(`/pick/${nextOrder.id}/${nextStep}` as never);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!order || !line || (step !== "sku" && step !== "quantity")) {
    return (
      <Screen>
        <AppHeader title="Pick Item" sub={!order ? "Loading…" : loading ? "Refreshing…" : "Redirecting…"} />
        <LoadingState label={!order ? "Loading order…" : "Moving to correct step…"} />
      </Screen>
    );
  }

  const done = order.lines.filter(l => ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status)).length;
  const pickedQty = line.pickedQty;
  const requiredQty = line.requiredQty;
  const remaining = Math.max(requiredQty - pickedQty, 0);
  const complete = pickedQty >= requiredQty;

  return (
    <Screen>
      <View style={sk.compactHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.replace(`/order/${order.id}` as never)} style={sk.backButton}>
          <Ionicons name="arrow-back" size={20} color={theme.color.primary} />
        </Pressable>
        <View style={sk.headerTextWrap}>
          <Text style={sk.orderTitle} numberOfLines={1}>{order.externalId}</Text>
          <Text style={sk.orderSubtitle} numberOfLines={1}>Line {line.lineNo} · {line.skuName}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report exception"
          onPress={() => router.replace({ pathname: "/pick/[orderId]/exception", params: { orderId: order.id, lineId: line.id } } as never)}
          style={sk.exceptionChip}
        >
          <Ionicons name="warning-outline" size={14} color={theme.color.badInk} />
          <Text style={sk.exceptionChipText}>Exception</Text>
        </Pressable>
      </View>

      <ProgressIndicator done={done} total={order.lines.length} />

      <View style={sk.rackLocationCard} accessibilityLabel={`Product location ${line.locationCode}`}>
        <View style={sk.rackLocationRow}>
          <Ionicons name="location" size={18} color={theme.colors.location.icon} />
          <Text style={sk.rackLocationValue} numberOfLines={1}>{line.locationCode}</Text>
          <Text style={sk.rackLocationHint}>Go to this location</Text>
        </View>
      </View>

      <View style={sk.productCard}>
        <View style={sk.productHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel={imageMagnified ? "Close enlarged photo" : "Enlarge photo"} onPress={() => setImageMagnified(true)} style={sk.productImageWrap}>
            {line.productImageUrl && !imageFailed ? (
              <Image source={{ uri: line.productImageUrl }} style={sk.productImage} resizeMode="contain" onError={() => setImageFailed(true)} accessibilityLabel={`${line.skuName} photo`} />
            ) : <Ionicons name="cube-outline" size={22} color={theme.color.primary} />}
          </Pressable>
          <View style={sk.productInfo}>
            <Text style={sk.productName} numberOfLines={2}>{line.skuName}</Text>
            <Text style={sk.skuCodeInline}>{line.skuCode}</Text>
          </View>
        </View>

        <BarcodeDisplay
          label="EXPECTED BARCODE"
          value={line.skuBarcode}
          scanTitle={skuVerified ? "Scan next item" : "Scan item barcode"}
          inputValue={manual}
          onInputChange={(value) => { setManual(value); if (error) setError(null); }}
          onSubmit={() => void processItemBarcode(manual)}
          inputPlaceholder={skuVerified ? "Scan next item" : "Scan item barcode"}
          match={manual.trim() ? manual.trim().toUpperCase() === line.skuBarcode.trim().toUpperCase() : null}
          onScanned={(value) => { setManual(value); void processItemBarcode(value); }}
          disabled={busy || complete}
        />
      </View>

      <View style={sk.statusQtyRow}>
        <View style={[sk.statusChip, skuVerified ? sk.statusChipOk : sk.statusChipInfo]}>
          <Ionicons name={skuVerified ? "checkmark-circle" : "information-circle-outline"} size={14} color={skuVerified ? theme.color.okInk : theme.colors.location.icon} />
          <Text style={[sk.statusChipText, !skuVerified && { color: theme.colors.location.text }]}>{skuVerified ? "Verified" : "Scan to begin"}</Text>
        </View>
        <View style={sk.qtyChip}>
          <Text style={sk.qtyValue}>{pickedQty}/{requiredQty}</Text>
          <Text style={sk.qtyLabel}>{remaining} left</Text>
        </View>
      </View>

      <ErrorBanner message={error} />

      {imageMagnified && line.productImageUrl && !imageFailed ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Close enlarged photo" onPress={() => setImageMagnified(false)} style={sk.imageOverlay}>
          <View pointerEvents="none" style={sk.imageOverlayHeader}>
            <Text style={sk.imageOverlayTitle} numberOfLines={2}>{line.skuName}</Text>
            <Ionicons name="close-circle" size={28} color="#ffffff" />
          </View>
          <Image source={{ uri: line.productImageUrl }} style={sk.magnifiedImage} resizeMode="contain" accessibilityLabel={`Enlarged ${line.skuName} photo`} />
          <Text pointerEvents="none" style={sk.imageOverlayHint}>Tap anywhere to close</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const sk = StyleSheet.create({
  compactHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  backButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTextWrap: { flex: 1, minWidth: 0 },
  orderTitle: { fontSize: 20, lineHeight: 24, fontWeight: "900", color: theme.color.ink },
  orderSubtitle: { fontSize: 11, lineHeight: 14, color: theme.color.muted, marginTop: 1 },
  exceptionChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.color.badBg, borderWidth: 1, borderColor: theme.color.badBorder, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  exceptionChipText: { fontSize: 11, fontWeight: "800", color: theme.color.badInk },
  rackLocationCard: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.location.bg, borderWidth: 1.5, borderColor: theme.colors.location.border, borderRadius: 12 },
  rackLocationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rackLocationValue: { fontSize: 20, fontWeight: "900", color: theme.colors.location.text, flex: 1 },
  rackLocationHint: { fontSize: 10, fontWeight: "600", color: theme.colors.location.text, opacity: 0.8 },
  productCard: { backgroundColor: theme.color.surface, borderWidth: 1.5, borderColor: theme.color.line, borderRadius: theme.radius.lg, padding: 10, marginTop: 6, shadowColor: theme.color.ink, shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  productHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 4 },
  productImageWrap: { width: 72, height: 72, borderRadius: 10, backgroundColor: theme.color.surfaceContainerLow, borderWidth: 1, borderColor: theme.color.line, alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" },
  productImage: { width: "100%", height: "100%" },
  productInfo: { flex: 1, minWidth: 0, paddingTop: 2 },
  productName: { fontSize: 15, lineHeight: 19, fontWeight: "800", color: theme.color.ink },
  skuCodeInline: { fontSize: 11, fontWeight: "700", color: theme.color.primaryContainer, marginTop: 3 },
  statusQtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 8 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flex: 1 },
  statusChipOk: { backgroundColor: theme.color.okBg },
  statusChipInfo: { backgroundColor: theme.colors.location.bg },
  statusChipText: { fontSize: 11, fontWeight: "700", color: theme.color.okInk },
  qtyChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  qtyValue: { fontSize: 18, fontWeight: "900", color: theme.color.ink },
  qtyLabel: { fontSize: 11, fontWeight: "600", color: theme.color.muted },
  imageOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: "rgba(10, 18, 30, 0.96)", borderRadius: theme.radius.lg, padding: 16, alignItems: "center", justifyContent: "center" },
  imageOverlayHeader: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  imageOverlayTitle: { flex: 1, color: "#ffffff", fontSize: 16, fontWeight: "800" },
  magnifiedImage: { width: "100%", flex: 1, marginVertical: 12 },
  imageOverlayHint: { color: "#ffffff", fontSize: 12, opacity: 0.7 },
});
