import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/navigation/AppProvider";
import BarcodeScannerModal from "@/scanner/BarcodeScannerModal";
import * as api from "@/api/warehouseApi";

export function WarehouseOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const { picker } = useAuth();
  const role = picker?.role === "PACKER" ? "PACKER" : "PICKER";
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<api.WarehouseOrder | null>(() => api.cachedAssignedOrder(role, orderId));
  const [barcode, setBarcode] = useState("");
  const [scanner, setScanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastScan, setLastScan] = useState<api.ScanResult | null>(null);
  const [failedBarcode, setFailedBarcode] = useState("");
  const [candidates, setCandidates] = useState<api.Candidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [rawItems, setRawItems] = useState<api.RawWarehouseItem[] | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState("");

  const loadItems = useCallback(async (base: api.WarehouseOrder) => {
    setLoadingItems(true); setItemsError("");
    try {
      const items = role === "PACKER"
        ? (await api.packerItems(orderId)).map(item => ({
          itemId: item.id, sku: item.sku, productName: item.productName,
          variantLabel: null, barcode: item.barcode, productBarcode: item.productBarcode,
          orderedQty: item.orderedQty, pickedQty: item.pickedQty, packedQty: item.packedQty,
        }))
        : await api.pickerItems(orderId);
      if (items.length === 0 && base.totalItems > 0) throw new Error("The API returned no item details for this order.");
      setOrder(current => current?.orderId === base.orderId ? { ...current, items } : current);
    } catch (e) {
      setItemsError(e instanceof Error ? e.message : "Could not load item details");
    } finally { setLoadingItems(false); }
  }, [role, orderId]);

  const load = useCallback(async () => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      setError("Invalid order ID");
      return;
    }
    try {
      let data: api.WarehouseOrder;
      if (role === "PACKER") {
        // Both endpoints include the same order items. Use whichever responds
        // first so a slow endpoint cannot keep the loading screen open.
        data = await Promise.any([
          api.order(role, orderId),
          api.assignedOrders(role).then(list => {
            const assigned = list.find(item => item.orderId === orderId);
            if (!assigned) throw new Error("Order is no longer assigned to you");
            return assigned;
          }),
        ]);
        data = { ...data, items: Array.isArray(data.items) ? data.items : [] };
      } else {
        const list = await api.assignedOrders(role);
        const found = list.find(item => item.orderId === orderId);
        if (!found) throw new Error("Order is no longer assigned to you");
        // Assigned picker orders already embed their items. Fetch them separately
        // only if the list omitted them.
        data = { ...found, items: Array.isArray(found.items) ? found.items : [] };
      }
      setOrder(data); setError("");
      setItemsError("");
      if (data.items.length === 0 && data.totalItems > 0) void loadItems(data);
    } catch (e) {
      const cause = e instanceof AggregateError ? e.errors.find((item: unknown) => item instanceof Error) : e;
      setOrder(current => current?.orderId === orderId ? current : null);
      setError(cause instanceof Error ? cause.message : "Could not refresh order");
    }
  }, [role, orderId, loadItems]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function submitScan(value: string) {
    const code = value.trim();
    if (!code || busy || !order) return;
    setBarcode(code);
    setBusy(true); setError(""); setMessage(""); setFailedBarcode("");
    try {
      const result = await api.scan(role, orderId, code);
      const scannedItems = Array.isArray(result.items) ? result.items : null;
      setOrder(current => current ? {
        ...current,
        items: scannedItems || current.items,
        orderStatus: result.orderStatus || current.orderStatus,
        totalItemsScanned: result.totalItemsPicked ?? result.totalItemsScanned ??
          (scannedItems || current.items).filter(item => role === "PICKER"
            ? item.pickedQty >= item.orderedQty : item.packedQty >= item.orderedQty).length,
      } : current);
      setLastScan(result);
      setMessage(result.message || "Scan saved"); setBarcode("");
      if (!scannedItems) void load();
    } catch (e) { setFailedBarcode(code); setError(e instanceof Error ? e.message : "Barcode scan failed"); }
    finally { setBusy(false); }
  }

  const allDone = !!order?.items.length && !itemsError && order.items.every(item => role === "PICKER" ? item.pickedQty >= item.orderedQty : item.packedQty >= item.orderedQty);
  async function showAssignment() {
    setBusy(true); setError("");
    try { setCandidates(role === "PICKER" ? await api.packers() : await api.riders()); setShowCandidates(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load staff"); }
    finally { setBusy(false); }
  }
  async function assign(candidate: api.Candidate) {
    setBusy(true); setError("");
    try {
      if (role === "PICKER") await api.assignPacker(orderId, candidate.id);
      else await api.assignRider(orderId, candidate.id);
      setShowCandidates(false); router.replace("/orders" as never);
    } catch (e) { setError(e instanceof Error ? e.message : "Assignment failed"); }
    finally { setBusy(false); }
  }
  async function loadRawItems() {
    setBusy(true); setError("");
    try { setRawItems(await api.packerItems(orderId)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load item details"); }
    finally { setBusy(false); }
  }

  const completed = order?.items.filter(item => role === "PICKER" ? item.pickedQty >= item.orderedQty : item.packedQty >= item.orderedQty).length || 0;
  const total = order?.items.length || 0;
  const progressPercent = total ? Math.round(completed / total * 100) : 0;
  const verb = role === "PICKER" ? "Pick" : "Pack";
  const nextPerson = role === "PICKER" ? "packer" : "rider";
  const scanStage = <>
    <View style={s.stepCard}><View style={s.stepNumber}><Text style={s.stepNumberText}>{role === "PACKER" ? "1" : "2"}</Text></View><View style={{ flex: 1 }}><Text style={s.stepTitle}>{allDone ? "Scanning complete" : role === "PACKER" ? "Scan to pack" : "Scan each product"}</Text><Text style={s.stepDesc}>{allDone ? "Every line has reached the required quantity." : role === "PACKER" ? "Scan every physical unit once before sealing the box." : "Use the camera or enter the printed barcode."}</Text></View><Ionicons name={allDone ? "checkmark-circle" : "scan-outline"} size={21} color={allDone ? "#16A34A" : "#0D6EFD"} /></View>
    {busy && barcode ? <Text style={s.checking}>Checking barcode: {barcode}…</Text> : null}
    {error ? <View style={s.error} accessibilityLiveRegion="polite"><Text style={s.errorHeading}>{failedBarcode ? `Scan failed · ${failedBarcode}` : "Request failed"}</Text><Text style={s.errorBody}>{error}</Text></View> : null}
    {lastScan && message ? <View style={s.scanResult} accessibilityLiveRegion="polite"><Ionicons name="checkmark-circle" size={21} color="#15803D" /><View style={{ flex: 1 }}><Text style={s.scanResultTitle}>{message}</Text><Text style={s.scanResultName}>{lastScan.scannedItemName || "Product scanned"}</Text><Text style={s.scanResultDetail}>Barcode: {lastScan.barcode || "—"}{lastScan.scannedQty != null && lastScan.orderedQty != null ? ` · ${lastScan.scannedQty} / ${lastScan.orderedQty}` : ""}</Text></View></View> : null}
    {!allDone ? <View style={s.scanPanel}><Pressable accessibilityRole="button" disabled={busy} style={[s.scanButton, busy && s.disabled]} onPress={() => setScanner(true)}><Ionicons name="scan-outline" size={23} color="white" /><Text style={s.scanButtonText}>{role === "PACKER" ? "SCAN ITEM TO PACK" : "OPEN CAMERA TO SCAN"}</Text></Pressable><Text style={s.or}>or type barcode manually</Text><View style={s.scanRow}><TextInput style={s.input} value={barcode} onChangeText={setBarcode} placeholder="Product barcode" autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => void submitScan(barcode)} editable={!busy} /><Pressable accessibilityRole="button" disabled={busy || !barcode.trim()} style={[s.confirmButton, (busy || !barcode.trim()) && s.disabled]} onPress={() => void submitScan(barcode)}><Text style={s.confirmText}>{busy ? "Saving…" : "Confirm"}</Text></Pressable></View></View> : null}
  </>;
  const handoffStage = <>
    <View style={[s.stepCard, !allDone && s.stepPending]}><View style={[s.stepNumber, !allDone && s.pendingNumber]}><Text style={s.stepNumberText}>3</Text></View><View style={{ flex: 1 }}><Text style={s.stepTitle}>Hand over to {nextPerson}</Text><Text style={s.stepDesc}>{allDone ? `Choose an available ${nextPerson} to complete your work.` : `Available after all ${total} lines are complete.`}</Text></View></View>
    {allDone && !showCandidates ? <Pressable accessibilityRole="button" disabled={busy} style={[s.handoffButton, busy && s.disabled]} onPress={() => void showAssignment()}><Text style={s.handoffText}>{busy ? "Loading people…" : `CHOOSE ${nextPerson.toUpperCase()}`}</Text><Ionicons name="arrow-forward" size={18} color="white" /></Pressable> : null}
    {showCandidates ? <View style={s.candidatePanel}><Text style={s.candidateTitle}>Select an available {nextPerson}</Text><Text style={s.muted}>Tap a name to assign this order.</Text>{candidates.length === 0 ? <Text style={s.noCandidates}>No available {nextPerson}s right now. Try again later.</Text> : null}{candidates.map(candidate => <Pressable accessibilityRole="button" key={candidate.id} style={s.candidate} disabled={busy} onPress={() => void assign(candidate)}><View style={s.candidateAvatar}><Ionicons name="person-outline" size={18} color="#0D6EFD" /></View><View style={{ flex: 1 }}><Text style={s.name}>{candidate.name}</Text><Text style={s.muted}>{candidate.phone}</Text></View><Ionicons name="chevron-forward" size={18} color="#64748B" /></Pressable>)}</View> : null}
  </>;

  return <ScrollView style={s.page} contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, 16) + 8 }]} keyboardShouldPersistTaps="handled">
    <View style={s.topRow}><Pressable accessibilityRole="button" accessibilityLabel="Back to orders" onPress={() => router.replace("/orders" as never)} style={s.backButton}><Ionicons name="arrow-back" size={20} color="#0E2E69" /><Text style={s.back}>Orders</Text></Pressable><Text style={s.topRole}>{role}</Text></View>
    <Text style={s.title}>{verb} order</Text><Text style={s.orderNo}>{order?.orderNumber || id}</Text>
    {!order && error ? <View style={s.error}><Text style={s.errorHeading}>Could not load this order</Text><Text style={s.errorBody}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={s.retry}>Try again</Text></Pressable></View> : null}
    {!order && !error ? <View style={s.loading}><ActivityIndicator color="#0D6EFD" /><Text style={s.muted}>Loading order details…</Text></View> : null}
    {order ? <>
      <View style={s.summary}><View style={s.summaryTop}><View><Text style={s.summaryLabel}>ORDER PROGRESS</Text><Text style={s.summaryValue}>{completed} of {total} lines complete</Text></View><Text style={s.percent}>{progressPercent}%</Text></View><View style={s.track}><View style={[s.fill, { width: `${progressPercent}%` }]} /></View><Text style={s.summaryHint}>{allDone ? `All items ready. Assign a ${nextPerson} to continue.` : role === "PACKER" ? "Scan each physical unit once. The counts below update after every successful scan." : "Scan each product barcode to pick the required quantity."}</Text></View>

      {role === "PACKER" && order.items.length > 0 ? scanStage : null}
      {role === "PACKER" && allDone ? handoffStage : null}
      <View style={s.stepCard}><View style={s.stepNumber}><Text style={s.stepNumberText}>{role === "PACKER" ? "2" : "1"}</Text></View><View style={{ flex: 1 }}><Text style={s.stepTitle}>{role === "PACKER" ? "Check packed quantities" : "Check products"}</Text><Text style={s.stepDesc}>{role === "PACKER" ? "Confirm every picked unit is packed." : "Match the name, SKU and quantity below."}</Text></View><Ionicons name={allDone ? "checkmark-circle" : "list-outline"} size={21} color={allDone ? "#16A34A" : "#0D6EFD"} /></View>
      {loadingItems ? <View style={s.empty}><ActivityIndicator color="#0D6EFD" /><Text style={s.muted}>Loading product lines…</Text></View> : null}
      {itemsError ? <View style={s.error}><Text style={s.errorHeading}>Product lines could not load</Text><Text style={s.errorBody}>{itemsError}</Text><Pressable accessibilityRole="button" onPress={() => void loadItems(order)}><Text style={s.retry}>Retry product lines</Text></Pressable></View> : null}
      {!loadingItems && !itemsError && order.items.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>No items in this order</Text><Text style={s.muted}>Pull back to orders and refresh if this looks wrong.</Text></View> : null}
      {order.items.map(item => {
        const qty = role === "PICKER" ? item.pickedQty : item.packedQty;
        const done = qty >= item.orderedQty;
        const itemBarcode = item.barcode || item.productBarcode;
        return <View key={item.itemId} style={s.card}><View style={s.itemTop}><View style={[s.itemIcon, done && s.itemIconDone]}><Ionicons name={done ? "checkmark" : "cube-outline"} size={19} color={done ? "#15803D" : "#0D6EFD"} /></View><View style={{ flex: 1 }}><Text style={s.name}>{item.productName}</Text>{item.variantLabel ? <Text style={s.muted}>{item.variantLabel}</Text> : null}</View><Text style={[s.itemState, done && s.itemStateDone]}>{done ? "DONE" : "TO DO"}</Text></View>
          <Text style={s.sku}>SKU  {item.sku}</Text><Text style={itemBarcode ? s.barcode : s.barcodeMissing}>{itemBarcode ? `BARCODE  ${itemBarcode}` : "Scan the barcode printed on the product label"}</Text>{role === "PICKER" && item.locationCode ? <View style={s.location}><Ionicons name="location-outline" size={16} color="#0369A1" /><Text style={s.locationText}>Find at {item.locationCode}</Text></View> : null}
          {role === "PACKER" ? <View style={s.packerCounts}><View style={s.packerCount}><Text style={s.qtyLabel}>ORDERED</Text><Text style={s.countNumber}>{item.orderedQty}</Text></View><View style={s.packerCount}><Text style={s.qtyLabel}>PICKED</Text><Text style={s.countNumber}>{item.pickedQty}</Text></View><View style={s.packerCount}><Text style={s.qtyLabel}>PACKED</Text><Text style={s.countNumber}>{item.packedQty}</Text></View><View style={s.packerCount}><Text style={s.qtyLabel}>LEFT</Text><Text style={[s.countNumber, { color: done ? "#15803D" : "#D95D00" }]}>{Math.max(0, item.orderedQty - item.packedQty)}</Text></View></View> : <View style={s.qtyRow}><Text style={s.qtyLabel}>Picked</Text><Text style={s.qty}>{qty} / {item.orderedQty}</Text></View>}<View style={s.smallTrack}><View style={[s.smallFill, { width: `${item.orderedQty > 0 ? Math.min(100, Math.round(qty / item.orderedQty * 100)) : 0}%` }]} /></View></View>;
      })}
      {role === "PACKER" ? <Pressable accessibilityRole="button" style={s.detailsToggle} onPress={() => rawItems ? setRawItems(null) : void loadRawItems()}><Ionicons name="receipt-outline" size={17} color="#0D6EFD" /><Text style={s.detailsText}>{rawItems ? "Hide pricing details" : "View pricing details"}</Text><Ionicons name={rawItems ? "chevron-up" : "chevron-down"} size={17} color="#0D6EFD" /></Pressable> : null}
      {rawItems?.map(item => <View key={item.id} style={s.rawCard}><Text style={s.name}>{item.productName}</Text><Text style={s.muted}>SKU: {item.sku} · Ordered: {item.orderedQty}</Text>{typeof item.lineTotal === "number" ? <Text style={s.rawTotal}>Line total ₹{item.lineTotal}</Text> : null}</View>)}

      {role === "PICKER" && order.items.length > 0 ? scanStage : null}
      {order.items.length > 0 && (role === "PICKER" || !allDone) ? handoffStage : null}
    </> : null}
    <BarcodeScannerModal visible={scanner} title="Scan product barcode" onScanned={value => void submitScan(value)} onClose={() => setScanner(false)} />
  </ScrollView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F5F8FC" }, content: { padding: 16, paddingBottom: 42 }, topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }, backButton: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 42, paddingHorizontal: 10, borderRadius: 11, backgroundColor: "white", borderWidth: 1, borderColor: "#DFE7F0" }, back: { color: "#0E2E69", fontWeight: "800" }, topRole: { color: "#0D6EFD", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: "800", color: "#14213D" }, orderNo: { color: "#64748B", marginTop: 2, marginBottom: 16 },
  summary: { backgroundColor: "#0E2E69", padding: 18, borderRadius: 17, marginBottom: 17 }, summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, summaryLabel: { color: "#C4D8FC", fontSize: 10, fontWeight: "800", letterSpacing: 1 }, summaryValue: { color: "white", fontSize: 18, fontWeight: "800", marginTop: 4 }, percent: { color: "white", fontSize: 22, fontWeight: "800" }, track: { height: 8, borderRadius: 4, backgroundColor: "#31538D", overflow: "hidden", marginTop: 15 }, fill: { height: 8, backgroundColor: "#4ADE80", borderRadius: 4 }, summaryHint: { color: "#DCE8FF", fontSize: 12, lineHeight: 17, marginTop: 11 },
  stepCard: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 12, marginBottom: 10 }, stepNumber: { width: 31, height: 31, borderRadius: 16, backgroundColor: "#0D6EFD", alignItems: "center", justifyContent: "center" }, stepNumberText: { color: "white", fontWeight: "800" }, stepTitle: { color: "#14213D", fontSize: 16, fontWeight: "800" }, stepDesc: { color: "#64748B", fontSize: 12, marginTop: 2, lineHeight: 16 }, stepPending: { opacity: 0.65, marginTop: 24 }, pendingNumber: { backgroundColor: "#94A3B8" },
  card: { backgroundColor: "white", borderColor: "#DFE7F0", borderWidth: 1, borderRadius: 15, padding: 14, marginBottom: 9 }, itemTop: { flexDirection: "row", alignItems: "center", gap: 9 }, itemIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#EAF3FF", alignItems: "center", justifyContent: "center" }, itemIconDone: { backgroundColor: "#DCFCE7" }, itemState: { color: "#0369A1", backgroundColor: "#E0F2FE", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, overflow: "hidden", fontSize: 10, fontWeight: "800" }, itemStateDone: { color: "#15803D", backgroundColor: "#DCFCE7" },
  name: { fontWeight: "800", color: "#14213D", fontSize: 14 }, muted: { color: "#64748B", marginTop: 2, fontSize: 12 }, sku: { color: "#64748B", marginTop: 10, fontSize: 11 }, location: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EAF6FC", padding: 8, borderRadius: 8, marginTop: 10 }, locationText: { color: "#0369A1", fontSize: 12, fontWeight: "800" }, qtyRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 }, qtyLabel: { color: "#64748B", fontSize: 11 }, qty: { color: "#14213D", fontWeight: "800", fontSize: 12 }, smallTrack: { height: 5, backgroundColor: "#E6EEF7", borderRadius: 3, overflow: "hidden", marginTop: 6 }, smallFill: { height: 5, backgroundColor: "#20A66A", borderRadius: 3 },
  packerCounts: { flexDirection: "row", backgroundColor: "#F5F8FC", borderRadius: 10, paddingVertical: 9, marginTop: 12 }, packerCount: { flex: 1, alignItems: "center", borderRightWidth: StyleSheet.hairlineWidth, borderColor: "#D9E2EC" }, countNumber: { color: "#14213D", fontSize: 16, fontWeight: "800", marginTop: 2 },
  barcode: { color: "#0E2E69", backgroundColor: "#EAF3FF", borderRadius: 7, overflow: "hidden", padding: 7, marginTop: 8, fontSize: 12, fontWeight: "800" }, barcodeMissing: { color: "#92400E", backgroundColor: "#FFF7ED", borderRadius: 7, overflow: "hidden", padding: 7, marginTop: 8, fontSize: 11 },
  detailsToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 11, marginBottom: 8 }, detailsText: { color: "#0D6EFD", fontWeight: "800", fontSize: 12 }, rawCard: { backgroundColor: "white", borderWidth: 1, borderColor: "#DFE7F0", padding: 12, borderRadius: 11, marginBottom: 8 }, rawTotal: { color: "#14213D", fontWeight: "700", marginTop: 4, fontSize: 12 },
  scanPanel: { backgroundColor: "white", borderWidth: 1, borderColor: "#DFE7F0", borderRadius: 15, padding: 13 }, scanButton: { minHeight: 51, backgroundColor: "#0D6EFD", borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, scanButtonText: { color: "white", fontWeight: "800", fontSize: 13 }, or: { color: "#64748B", fontSize: 11, textAlign: "center", marginVertical: 10 }, scanRow: { flexDirection: "row", gap: 8 }, input: { flex: 1, minWidth: 0, minHeight: 45, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "white", borderRadius: 9, paddingHorizontal: 10 }, confirmButton: { backgroundColor: "#0E2E69", borderRadius: 9, paddingHorizontal: 13, justifyContent: "center" }, confirmText: { color: "white", fontWeight: "800", fontSize: 12 }, disabled: { opacity: 0.5 }, checking: { color: "#0369A1", fontWeight: "700", marginBottom: 8 },
  error: { backgroundColor: "#FEECEC", padding: 13, borderRadius: 11, marginBottom: 12 }, errorHeading: { color: "#991B1B", fontWeight: "800" }, errorBody: { color: "#B91C1C", marginTop: 3, fontSize: 12 }, retry: { color: "#0D6EFD", fontWeight: "800", marginTop: 8 }, scanResult: { backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#86EFAC", padding: 12, borderRadius: 11, marginBottom: 12, flexDirection: "row", gap: 8 }, scanResultTitle: { color: "#15803D", fontWeight: "800" }, scanResultName: { color: "#14532D", fontWeight: "700", marginTop: 4, fontSize: 12 }, scanResultDetail: { color: "#166534", marginTop: 3, fontSize: 11 }, loading: { alignItems: "center", padding: 32, gap: 10 }, empty: { backgroundColor: "white", padding: 18, borderRadius: 12, marginBottom: 10 }, emptyTitle: { color: "#14213D", fontWeight: "800" },
  handoffButton: { backgroundColor: "#0E2E69", minHeight: 51, borderRadius: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 }, handoffText: { color: "white", fontWeight: "800" }, candidatePanel: { backgroundColor: "white", borderWidth: 1, borderColor: "#DFE7F0", padding: 14, borderRadius: 14 }, candidateTitle: { color: "#14213D", fontSize: 15, fontWeight: "800" }, candidate: { borderTopWidth: 1, borderColor: "#E2E8F0", paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }, candidateAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#EAF3FF", alignItems: "center", justifyContent: "center" }, noCandidates: { color: "#B45309", backgroundColor: "#FFF7ED", padding: 10, borderRadius: 8, marginTop: 10, fontSize: 12 },
});
