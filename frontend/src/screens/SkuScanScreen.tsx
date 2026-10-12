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
import { beepError, beepSuccess } from "@/services/scanner";
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
        setActiveLineId(
          active && (active.status === "PENDING" || active.status === "LOCATION_VALIDATED" || active.status === "SKU_VALIDATED")
            ? active.id
            : null,
        );
        setSkuVerified(active?.status === "SKU_VALIDATED");
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const line = order?.lines.find(l => l.id === activeLineId)
    ?? order?.lines.find(l => l.status === "PENDING" || l.status === "LOCATION_VALIDATED" || l.status === "SKU_VALIDATED")
    ?? null;
  const step = order ? resolvePickStep(order) : null;

  useEffect(() => {
    setImageFailed(false);
  }, [line?.skuCode, line?.productImageUrl]);

  useEffect(() => {
    if (!order) return;

    if (step === "complete") {
      router.replace({
        pathname: "/pick/[orderId]/complete",
        params: { orderId: order.id },
      } as never);
      return;
    }

    if (step !== null && step !== "sku" && step !== "quantity") {
      router.replace(`/pick/${order.id}/${step}` as never);
    }
  }, [order, step]);

  async function processItemBarcode(value: string) {
    if (!line || !order || busy) return;
    const barcode = value.trim();
    if (!barcode) {
      setError("Scan or enter the item barcode first");
      return;
    }

    loadGeneration.current += 1;
    setBusy(true);
    setError(null);
    try {
      if (!skuVerified) {
        const verified = await pickerRepository.validateSku(line.id, barcode);
        if (!verified.ok) {
          beepError();
          setError(`${verified.apiError.error}: ${verified.apiError.message}`);
          return;
        }
        setSkuVerified(true);
      } else if (barcode.toUpperCase() !== line.skuBarcode.trim().toUpperCase()) {
        beepError();
        setError("Wrong item barcode. Scan the expected product.");
        return;
      }

      // The picker confirms one physical unit per successful barcode scan.
      const quantity = 1;
      const picked = await pickerRepository.pickQuantity(line.id, quantity, line.uom, newIdemKey());
      if (!picked.ok) {
        beepError();
        setError(`${picked.apiError.error}: ${picked.apiError.message}`);
        return;
      }

      beepSuccess();
      setManual("");
      const pickedQty = picked.data.pickedQty;
      const completed = pickedQty >= line.requiredQty;
      const nextLines = order.lines.map(l => l.id === line.id
        ? { ...l, pickedQty, status: completed ? "PICKED" as const : "SKU_VALIDATED" as const }
        : l);
      const nextOrder = { ...order, lines: nextLines };
      setOrder(nextOrder);
      setActiveLineId(null);
      // Keep the line verified between unit scans; reset only when advancing.
      setSkuVerified(!completed);

      if (completed) {
        const nextStep = resolvePickStep(nextOrder);
        if (nextStep === "complete") {
          router.replace({
            pathname: "/pick/[orderId]/complete",
            params: { orderId: nextOrder.id },
          } as never);
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
        <AppHeader
          title="Pick Item"
          sub={!order ? "Loading…" : loading ? "Refreshing order…" : "Moving to the correct step…"}
        />
        <LoadingState
          label={!order ? "Loading order…" : "Moving to the correct step…"}
        />
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
      <View style={s.compactHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={s.backButton}>
          <Ionicons name="arrow-back" size={22} color={theme.color.primary} />
        </Pressable>
        <View style={s.headerTextWrap}>
          <Text style={s.orderTitle} numberOfLines={1}>{order.externalId}</Text>
          <Text style={s.orderSubtitle} numberOfLines={1}>Line {line.lineNo} · {line.skuName}</Text>
        </View>
      </View>

      <ProgressIndicator done={done} total={order.lines.length} />

      <View style={s.rackLocationCard} accessibilityLabel={`Product rack location ${line.locationCode}`}>
        <View style={s.rackLocationHeading}>
          <Ionicons name="location" size={22} color={theme.colors.location.icon} />
          <Text style={s.rackLocationLabel}>PRODUCT RACK LOCATION</Text>
          <View style={s.locationInfoBadge}>
            <Text style={s.locationInfoBadgeText}>INFO ONLY</Text>
          </View>
        </View>
        <Text style={s.rackLocationValue} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>
          {line.locationCode}
        </Text>
        <Text style={s.rackLocationHint}>Find the rack here, then scan the product barcode.</Text>
      </View>

      <View style={s.productCard}>
        <View style={s.productHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={imageMagnified ? "Close enlarged product photo" : "Enlarge product photo"}
            onPress={() => setImageMagnified(true)}
            style={s.productImagePlaceholder}
          >
            {line.productImageUrl && !imageFailed ? (
              <Image
                source={{ uri: line.productImageUrl }}
                style={s.productImage}
                resizeMode="contain"
                onError={() => setImageFailed(true)}
                accessibilityLabel={`${line.skuName} product photo`}
              />
            ) : (
              <>
                <Ionicons name="cube-outline" size={25} color={theme.color.primary} />
                <Text style={s.imagePlaceholderText}>PHOTO</Text>
              </>
            )}
            {!imageFailed && line.productImageUrl ? (
              <View pointerEvents="none" style={s.imageZoomHint}>
                <Ionicons name="expand-outline" size={13} color="#ffffff" />
              </View>
            ) : null}
          </Pressable>
          <View style={s.productInfo}>
            <Text style={s.productName}>{line.skuName}</Text>
          </View>
        </View>
        {line.productSpecs ? <Text style={s.productSpecs} numberOfLines={2}>{line.productSpecs}</Text> : null}

        <BarcodeDisplay
          label="EXPECTED PRODUCT BARCODE"
          value={line.skuBarcode}
          scanTitle={skuVerified ? "Scan next item" : "Scan item barcode"}
          inputValue={manual}
          onInputChange={setManual}
          onSubmit={() => void processItemBarcode(manual)}
          inputPlaceholder={skuVerified ? "Scan next item barcode" : "Scan item barcode"}
          match={manual.trim() ? manual.trim().toUpperCase() === line.skuBarcode.trim().toUpperCase() : null}
          onScanned={(value) => {
            setManual(value);
            void processItemBarcode(value);
          }}
          disabled={busy || complete}
        />

        {manual.trim() && !complete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next after entering the product barcode"
            onPress={() => void processItemBarcode(manual)}
            disabled={busy}
            style={({ pressed }) => [s.verifyNextButton, busy && s.disabled, pressed ? { opacity: 0.88 } : null]}
          >
            <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
            <Text style={s.verifyNextButtonText}>{busy ? "Checking…" : "CONFIRM SCAN"}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={s.skuCodeCard}>
        <Text style={s.skuCodeLabel}>SKU CODE</Text>
        <Text style={s.skuCodeValue} numberOfLines={2}>{line.skuCode}</Text>
      </View>
      <View style={[s.inlineStatus, !skuVerified && { backgroundColor: theme.colors.location.bg }]}>
        <Ionicons name={skuVerified ? "checkmark-circle" : "information-circle-outline"} size={15} color={skuVerified ? theme.color.okInk : theme.colors.location.icon} />
        <Text style={[s.inlineStatusText, !skuVerified && { color: theme.colors.location.text }]} numberOfLines={1}>{skuVerified ? "Product verified" : "Scan the product barcode to begin picking"}</Text>
      </View>

      <View style={s.quantityCard}>
        <View style={s.quantitySummary}>
          <View>
            <Text style={s.quantityLabel}>PICKED</Text>
            <Text style={s.quantityValue}>{pickedQty}<Text style={s.quantityTotal}> / {requiredQty} {line.uom}</Text></Text>
          </View>
          <View style={s.remainingBadge}>
            <Text style={s.remainingText}>{remaining} remaining</Text>
          </View>
        </View>
        <Text style={s.quantityHint}>Each successful product barcode scan confirms 1 unit.</Text>
      </View>

      <ErrorBanner message={error} />
      {imageMagnified && line.productImageUrl && !imageFailed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close enlarged product photo"
          onPress={() => setImageMagnified(false)}
          style={s.imageOverlay}
        >
          <View pointerEvents="none" style={s.imageOverlayHeader}>
            <Text style={s.imageOverlayTitle} numberOfLines={2}>{line.skuName}</Text>
            <Ionicons name="close-circle" size={30} color="#ffffff" />
          </View>
          <Image
            source={{ uri: line.productImageUrl }}
            style={s.magnifiedProductImage}
            resizeMode="contain"
            accessibilityLabel={`Enlarged ${line.skuName} product photo`}
          />
          <Text pointerEvents="none" style={s.imageOverlayHint}>Tap anywhere to close</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  compactHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  backButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerTextWrap: { flex: 1, minWidth: 0 },
  orderTitle: { fontSize: 22, lineHeight: 26, fontWeight: "900", color: theme.color.ink },
  orderSubtitle: { fontSize: 12, lineHeight: 16, color: theme.color.muted, marginTop: 1 },
  rackLocationCard: {
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 126,
    backgroundColor: theme.colors.location.bg,
    borderWidth: 2,
    borderColor: theme.colors.location.border,
    borderRadius: 16,
    justifyContent: "center",
  },
  rackLocationHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  rackLocationLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: theme.colors.location.text,
  },
  locationInfoBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.colors.location.border,
  },
  locationInfoBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
    color: theme.colors.location.text,
  },
  rackLocationValue: {
    marginTop: 7,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: 0.3,
    color: theme.colors.location.text,
  },
  rackLocationHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: theme.colors.location.text,
    opacity: 0.9,
  },
  productImagePlaceholder: { width: 112, height: 112, borderRadius: 12, backgroundColor: theme.color.surfaceContainerLow, borderWidth: 1, borderColor: theme.color.line, alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" },
  productImage: { width: "100%", height: "100%" },
  imageZoomHint: { position: "absolute", right: 5, bottom: 5, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.62)", alignItems: "center", justifyContent: "center" },
  imagePlaceholderText: { fontSize: 9, fontWeight: "800", color: theme.color.muted, marginTop: 3, letterSpacing: 0.6 },
  imageOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 30, backgroundColor: "rgba(7, 15, 28, 0.94)", alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingVertical: 32 },
  imageOverlayHeader: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 },
  imageOverlayTitle: { flex: 1, color: "#ffffff", fontSize: 18, lineHeight: 24, fontWeight: "800" },
  magnifiedProductImage: { width: "100%", height: "72%", maxWidth: 560 },
  imageOverlayHint: { color: "#ffffff", opacity: 0.8, fontSize: 13, fontWeight: "600", marginTop: 22 },
  productInfo: { flex: 1, minWidth: 0, gap: 8, paddingTop: 2 },
  inlineStatus: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: theme.color.okBg, borderRadius: 8 },
  inlineStatusText: { flex: 1, fontSize: 11, fontWeight: "700", color: theme.color.okInk },
  productCard: {
    backgroundColor: theme.color.surface,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: 12,
    marginTop: 6,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  productHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  productName: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    color: theme.color.ink,
    flex: 1,
  },
  locationTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.location.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.location.border,
  },
  locationText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.location.text,
  },
  productSpecs: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 3,
    marginBottom: 2,
  },
  verifyNextButton: {
    minHeight: 42,
    marginTop: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.okPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  verifyNextButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  disabled: { opacity: 0.5 },
  skuCodeCard: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
  },
  skuCodeLabel: { fontSize: 9, fontWeight: "800", color: theme.color.primaryContainer, letterSpacing: 0.4 },
  skuCodeValue: { fontSize: 14, fontWeight: "800", color: theme.color.ink, marginTop: 2 },
  quantityCard: {
    marginTop: 4,
    padding: 8,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  quantitySummary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quantityLabel: { fontSize: 11, fontWeight: "800", color: theme.color.muted, letterSpacing: 0.5 },
  quantityValue: { fontSize: 22, fontWeight: "900", color: theme.color.ink, marginTop: 1 },
  quantityTotal: { fontSize: 14, fontWeight: "700", color: theme.color.muted },
  remainingBadge: { backgroundColor: theme.color.bg, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  remainingText: { fontSize: 12, fontWeight: "700", color: theme.color.muted },
  quantityHint: { fontSize: 10, color: theme.color.muted, textAlign: "center", marginTop: 4 },
});
