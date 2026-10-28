import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text, TextInput } from "@/components/Typography";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "@/components/ui";
import { pickerAppApi } from "@/api/pickerAppApi";
import { packerAppApi } from "@/api/packerAppApi";
import { useAuth } from "@/navigation/AppProvider";
import type { FulfillmentHistoryDto, HistoryPageDto } from "@/types";

const PAGE_SIZE = 20;
const PACKER_HISTORY_FETCH_SIZE = 100;
const HISTORY_PAGE_BATCH_SIZE = 4;

function newestFirst(scans: FulfillmentHistoryDto[]) {
  return [...scans].sort((left, right) => new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime());
}

function groupScansByItem(scans: FulfillmentHistoryDto[]) {
  const items = new Map<number, FulfillmentHistoryDto[]>();
  for (const scan of scans) {
    const events = items.get(scan.itemId) ?? [];
    events.push(scan);
    items.set(scan.itemId, events);
  }
  return Array.from(items.entries());
}

function variantDetails(label: string | null) {
  return label?.split(/[,;]/).map((part) => part.trim().replace(/\s*=\s*/, ": ")).filter(Boolean) ?? [];
}

export function HistoryScreen() {
  const { picker } = useAuth();
  const isPacker = picker?.role === "PACKER";  
  const [packerHistorySection, setPackerHistorySection] = useState<"ALL" | "PACKED" | "RIDER_ASSIGNED">("ALL");
  const [entries, setEntries] = useState<FulfillmentHistoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [historyOrderCount, setHistoryOrderCount] = useState<number | null>(null);

  const fetchPage = useCallback(async (pageNumber: number): Promise<HistoryPageDto> =>
    isPacker ? packerAppApi.getHistory(pageNumber, PAGE_SIZE) : pickerAppApi.getHistory(pageNumber, PAGE_SIZE), [isPacker]);

  const fetchAllPackerHistory = useCallback(async (): Promise<HistoryPageDto> => {
    const firstPage = await packerAppApi.getHistory(0, PACKER_HISTORY_FETCH_SIZE);
    const content = [...firstPage.content];
    for (let start = 1; start < firstPage.totalPages; start += HISTORY_PAGE_BATCH_SIZE) {
      const pageNumbers = Array.from(
        { length: Math.min(HISTORY_PAGE_BATCH_SIZE, firstPage.totalPages - start) },
        (_, index) => start + index,
      );
      const pages = await Promise.all(pageNumbers.map((pageNumber) => packerAppApi.getHistory(pageNumber, PACKER_HISTORY_FETCH_SIZE)));
      for (const page of pages) content.push(...page.content);
    }
    return { ...firstPage, content, totalPages: 1, number: 0, last: true };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, orderCount] = await Promise.all([
        isPacker ? fetchAllPackerHistory() : fetchPage(0),
        (isPacker ? packerAppApi.getHistoryOrderCount() : pickerAppApi.getHistoryOrderCount()).catch(() => null),
      ]);
      setEntries(newestFirst(result.content));
      setPage(0);
      setTotalPages(result.totalPages);
      setHistoryOrderCount(orderCount);
      setExpandedId(null);
    } catch (e: any) {
      setEntries([]);
      setError(e?.message || "Could not load history.");
    } finally {
      setLoading(false);
    }
  }, [fetchAllPackerHistory, fetchPage, isPacker]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const sectionEntries = useMemo(() => {
    if (!isPacker || packerHistorySection === "ALL") return entries;
    if (packerHistorySection === "RIDER_ASSIGNED") {
      return entries.filter((entry) => entry.orderStatus === "RIDER_ASSIGNED");
    }
    return entries.filter((entry) => entry.orderStatus !== "RIDER_ASSIGNED");
  }, [entries, isPacker, packerHistorySection]);

  const filteredEntries = useMemo(() => newestFirst(sectionEntries.filter((entry) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [entry.orderNumber, entry.productName, entry.sku, entry.barcode]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesSearch;
  })), [sectionEntries, search]);

  const groups = useMemo(() => {
    const byOrder = new Map<number, FulfillmentHistoryDto[]>();
    for (const entry of filteredEntries) {
      const current = byOrder.get(entry.orderId) ?? [];
      current.push(entry);
      byOrder.set(entry.orderId, current);
    }
    return Array.from(byOrder.entries());
  }, [filteredEntries]);

  const packedOrderCount = useMemo(() => new Set(
    entries.filter((entry) => entry.orderStatus !== "RIDER_ASSIGNED").map((entry) => entry.orderId),
  ).size, [entries]);
  const riderOrderCount = useMemo(() => new Set(
    entries.filter((entry) => entry.orderStatus === "RIDER_ASSIGNED").map((entry) => entry.orderId),
  ).size, [entries]);
  const totalPackerHistoryCount = useMemo(() => new Set(entries.map((entry) => entry.orderId)).size, [entries]);
  const displayedOrderCount = search.trim()
    ? groups.length
    : isPacker ? totalPackerHistoryCount : historyOrderCount ?? groups.length;

  function selectPackerHistorySection(section: "ALL" | "PACKED" | "RIDER_ASSIGNED") {
    setPackerHistorySection(section);
    setExpandedId(null);
  }

  async function goToPage(nextPage: number) {
    if (pageLoading || loading || nextPage < 0 || nextPage >= totalPages || nextPage === page) return;
    setPageLoading(true);
    setError(null);
    try {
      const result = await fetchPage(nextPage);
      setEntries(newestFirst(result.content));
      setPage(nextPage);
      setTotalPages(result.totalPages);
      setExpandedId(null);
    } catch (e: any) {
      setError(e?.message || "Could not load this history page.");
    } finally {
      setPageLoading(false);
    }
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading && entries.length > 0} onRefresh={() => void refresh()} />}>
        <View style={s.heading}>
          <Text style={s.title}>History</Text>
          <Text style={s.count}>{displayedOrderCount} {isPacker && !search.trim() ? "total orders" : "orders"}</Text>
        </View>
        {isPacker ? (
          <View style={s.sectionTabs}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: packerHistorySection === "ALL" }}
              onPress={() => selectPackerHistorySection("ALL")}
              style={[s.sectionTab, packerHistorySection === "ALL" && s.sectionTabActive]}
            >
              <Ionicons name="time-outline" size={16} color={packerHistorySection === "ALL" ? "#C2410C" : "#64748B"} />
              <Text style={[s.sectionTabText, packerHistorySection === "ALL" && s.sectionTabTextActive]}>All ({totalPackerHistoryCount})</Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: packerHistorySection === "PACKED" }}
              onPress={() => selectPackerHistorySection("PACKED")}
              style={[s.sectionTab, packerHistorySection === "PACKED" && s.sectionTabActive]}
            >
              <Ionicons name="cube-outline" size={16} color={packerHistorySection === "PACKED" ? "#C2410C" : "#64748B"} />
              <Text style={[s.sectionTabText, packerHistorySection === "PACKED" && s.sectionTabTextActive]}>Packed ({packedOrderCount})</Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: packerHistorySection === "RIDER_ASSIGNED" }}
              onPress={() => selectPackerHistorySection("RIDER_ASSIGNED")}
              style={[s.sectionTab, packerHistorySection === "RIDER_ASSIGNED" && s.sectionTabActive]}
            >
              <Ionicons name="bicycle-outline" size={17} color={packerHistorySection === "RIDER_ASSIGNED" ? "#C2410C" : "#64748B"} />
              <Text style={[s.sectionTabText, packerHistorySection === "RIDER_ASSIGNED" && s.sectionTabTextActive]}>Rider ({riderOrderCount})</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={s.subtitleRow}>
          <Text style={s.subtitle}>{isPacker ? packerHistorySection === "ALL" ? "All order history" : packerHistorySection === "PACKED" ? "Packing history not assigned to a rider" : "Orders assigned to riders" : "Your picking scans"} · Newest first</Text>
          {totalPages > 1 ? (
            <View style={s.pageNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous history page"
                disabled={pageLoading || page === 0}
                onPress={() => void goToPage(page - 1)}
                style={[s.pageArrow, (pageLoading || page === 0) && s.pageArrowDisabled]}
              >
                <Ionicons name="chevron-back" size={15} color="#1D4ED8" />
              </Pressable>
              <Text style={s.pageLabel}>{pageLoading ? "…" : `${page + 1}/${totalPages}`}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next history page"
                disabled={pageLoading || page >= totalPages - 1}
                onPress={() => void goToPage(page + 1)}
                style={[s.pageArrow, (pageLoading || page >= totalPages - 1) && s.pageArrowDisabled]}
              >
                <Ionicons name="chevron-forward" size={15} color="#1D4ED8" />
              </Pressable>
            </View>
          ) : null}
        </View>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={19} color="#64748B" style={s.searchIcon} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Order number or item..."
            placeholderTextColor="#94A3B8"
            style={s.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>
        {error && entries.length === 0 ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}
        {loading && entries.length === 0 && !error ? <LoadingState label="Loading history…" /> : null}
        {!loading && !error && entries.length === 0 ? <EmptyState title="No History Yet" body="Your successful scans will appear here." actionLabel="Refresh" onAction={() => void refresh()} /> : null}
        {!loading && !error && entries.length > 0 && groups.length === 0 ? (
          <EmptyState
            title={search ? "No matching history" : packerHistorySection === "RIDER_ASSIGNED" && isPacker ? "No Rider Records on This Page" : packerHistorySection === "PACKED" && isPacker ? "No Packed Records on This Page" : "No History Yet"}
            body={search ? `No records match “${search}” in this section. Try another order or item name.` : packerHistorySection === "ALL" ? "No history records are available." : "Try another history page or refresh the list."}
            actionLabel={search ? "Clear Search" : "Refresh"}
            onAction={() => search ? setSearch("") : void refresh()}
          />
        ) : null}
        {groups.map(([orderId, scans]) => {
          const expanded = expandedId === orderId;
          const latest = scans[0];
          return (
            <View key={orderId} style={s.card}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${latest.orderNumber}, ${scans.length} loaded scans`} onPress={() => setExpandedId(expanded ? null : orderId)} style={s.cardHeader}>
                <View style={s.cardTitleArea}>
                  <Text style={s.orderNumber}>{latest.orderNumber}</Text>
                  <Text style={s.meta}>{latest.orderStatus}, {scans.length} loaded scan{scans.length === 1 ? "" : "s"}</Text>
                  <Text style={s.meta}>Latest: {new Date(latest.scannedAt).toLocaleString()}</Text>
                </View>
                <Text style={s.expand}>{expanded ? "−" : "+"}</Text>
              </Pressable>
              {expanded ? groupScansByItem(scans).map(([itemId, itemScans]) => {
                const item = itemScans[0];
                const details = variantDetails(item.variantLabel);
                return (
                  <View key={itemId} style={s.scan}>
                    <Text style={s.product}>{item.productName}</Text>
                    {details.length > 0 ? (
                      <View style={s.variantList}>
                        {details.map((detail, index) => (
                          <View key={`${itemId}-${index}`} style={s.variantChip}>
                            <Text style={s.variantText}>{detail}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>SKU</Text>
                      <Text style={s.detailValue}>{item.sku}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Barcode</Text>
                      <Text style={s.detailValue}>{item.barcode}</Text>
                    </View>
                    <View style={s.progressRow}>
                      <Text style={s.progressLabel}>{isPacker ? "Packed" : "Picked"}</Text>
                      <Text style={s.progressValue}>{item.scannedQty}/{item.orderedQty}</Text>
                    </View>
                    <View style={s.scanTimeline}>
                      <Text style={s.timelineTitle}>Scan times ({itemScans.length} loaded)</Text>
                      {itemScans.map((event) => (
                        <View key={event.taskId} style={s.timelineRow}>
                          <Text style={s.timelineTime}>{new Date(event.scannedAt).toLocaleString()}</Text>
                          <Text style={s.timelineQty}>{event.scannedQty}/{event.orderedQty}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              }) : null}
            </View>
          );
        })}
        {entries.length > 0 ? <ErrorBanner message={error} /> : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F7FB" },
  content: { padding: 16, paddingBottom: 32 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "800", color: "#0F172A" },
  count: { fontSize: 13, fontWeight: "700", color: "#2563EB" },
  sectionTabs: { flexDirection: "row", gap: 8, padding: 4, marginTop: 12, marginBottom: 8, backgroundColor: "#E9EEF5", borderRadius: 12 },
  sectionTab: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 9 },
  sectionTabActive: { backgroundColor: "#FFFFFF", shadowColor: "#0F172A", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  sectionTabText: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  sectionTabTextActive: { color: "#C2410C" },
  subtitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, minHeight: 26 },
  subtitle: { flex: 1, fontSize: 12, color: "#64748B", marginRight: 6 },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 10 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#0F172A" },
  pageNav: { flexDirection: "row", alignItems: "center", gap: 4 },
  pageArrow: { width: 24, height: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF6FF", borderRadius: 12 },
  pageArrowDisabled: { opacity: 0.4 },
  pageLabel: { minWidth: 28, textAlign: "center", color: "#64748B", fontSize: 10, fontWeight: "700" },
  card: { backgroundColor: "white", borderColor: "#E2E8F0", borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: "hidden" },
  cardHeader: { padding: 14, flexDirection: "row", alignItems: "center" },
  cardTitleArea: { flex: 1 },
  orderNumber: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  meta: { fontSize: 12, color: "#64748B", marginTop: 3 },
  expand: { fontSize: 25, color: "#2563EB", paddingHorizontal: 8 },
  scan: {
    backgroundColor: "#EFF6FF",
    borderLeftColor: "#2563EB",
    borderLeftWidth: 3,
    borderRadius: 10,
    marginHorizontal: 10,
    marginBottom: 6,
    padding: 8,
  },
  product: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  variantList: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, marginBottom: 4 },
  variantChip: { backgroundColor: "#FFFFFF", borderColor: "#BFDBFE", borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, maxWidth: "100%" },
  variantText: { fontSize: 11, color: "#1E40AF", fontWeight: "600" },
  detailRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 1, gap: 8 },
  detailLabel: { width: 54, flexShrink: 0, fontSize: 11, color: "#64748B" },
  detailValue: { flex: 1, fontSize: 11, color: "#334155" },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  progressLabel: { fontSize: 12, color: "#334155", fontWeight: "600" },
  progressValue: { fontSize: 13, color: "#1D4ED8", fontWeight: "800" },
  scanTimeline: { borderTopColor: "#BFDBFE", borderTopWidth: 1, marginTop: 5, paddingTop: 4 },
  timelineTitle: { fontSize: 11, color: "#475569", fontWeight: "700", marginBottom: 1 },
  timelineRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingVertical: 1 },
  timelineTime: { flex: 1, fontSize: 10, color: "#64748B" },
  timelineQty: { fontSize: 10, color: "#334155", fontWeight: "600" },
});
