import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Text } from "@/components/Typography";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "@/components/ui";
import { pickerAppApi } from "@/api/pickerAppApi";
import { packerAppApi } from "@/api/packerAppApi";
import { useAuth } from "@/navigation/AppProvider";
import type { FulfillmentHistoryDto, HistoryPageDto } from "@/types";

const PAGE_SIZE = 20;

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
  const [entries, setEntries] = useState<FulfillmentHistoryDto[]>([]);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchPage = useCallback(async (pageNumber: number): Promise<HistoryPageDto> =>
    isPacker ? packerAppApi.getHistory(pageNumber, PAGE_SIZE) : pickerAppApi.getHistory(pageNumber, PAGE_SIZE), [isPacker]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, count] = await Promise.all([
        fetchPage(0),
        (isPacker ? packerAppApi.getHistoryOrderCount() : pickerAppApi.getHistoryOrderCount()).catch(() => null),
      ]);
      setEntries(result.content);
      setOrderCount(count);
      setPage(0);
      setHasMore(!result.last);
      setExpandedId(null);
    } catch (e: any) {
      setEntries([]);
      setError(e?.message || "Could not load history.");
    } finally {
      setLoading(false);
    }
  }, [fetchPage, isPacker]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const loadMore = async () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextPage = page + 1;
      const result = await fetchPage(nextPage);
      setEntries((previous) => {
        const seen = new Set(previous.map((entry) => entry.taskId));
        return [...previous, ...result.content.filter((entry) => !seen.has(entry.taskId))];
      });
      setPage(nextPage);
      setHasMore(!result.last);
    } catch (e: any) {
      setError(e?.message || "Could not load more history.");
    } finally {
      setLoadingMore(false);
    }
  };

  const groups = useMemo(() => {
    const byOrder = new Map<number, FulfillmentHistoryDto[]>();
    for (const entry of entries) {
      const current = byOrder.get(entry.orderId) ?? [];
      current.push(entry);
      byOrder.set(entry.orderId, current);
    }
    return Array.from(byOrder.entries());
  }, [entries]);

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading && entries.length > 0} onRefresh={() => void refresh()} />}>
        <View style={s.heading}>
          <Text style={s.title}>History</Text>
          <Text style={s.count}>{orderCount ?? "–"} orders</Text>
        </View>
        <Text style={s.subtitle}>{isPacker ? "Your packing scans" : "Your picking scans"}</Text>
        {error && entries.length === 0 ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}
        {loading && entries.length === 0 && !error ? <LoadingState label="Loading history…" /> : null}
        {!loading && !error && entries.length === 0 ? <EmptyState title="No History Yet" body="Your successful scans will appear here." actionLabel="Refresh" onAction={() => void refresh()} /> : null}
        {groups.map(([orderId, scans]) => {
          const expanded = expandedId === orderId;
          const latest = scans[0];
          return (
            <View key={orderId} style={s.card}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${latest.orderNumber}, ${scans.length} loaded scans`} onPress={() => setExpandedId(expanded ? null : orderId)} style={s.cardHeader}>
                <View style={s.cardTitleArea}>
                  <Text style={s.orderNumber}>{latest.orderNumber}</Text>
                  <Text style={s.meta}>{latest.orderStatus} · {scans.length} loaded scan{scans.length === 1 ? "" : "s"}</Text>
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
        {hasMore && entries.length > 0 ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void loadMore()} style={s.more}><Text style={s.moreText}>{loadingMore ? "Loading…" : "Load more scans"}</Text></Pressable> : null}
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
  subtitle: { fontSize: 13, color: "#64748B", marginBottom: 16 },
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
  more: { backgroundColor: "#0D6EFD", alignItems: "center", padding: 14, borderRadius: 12, marginTop: 8 },
  moreText: { color: "white", fontWeight: "800" },
});
