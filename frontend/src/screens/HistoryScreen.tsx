import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text, TextInput } from "@/components/Typography";
import { HistoryDateTimePicker } from "@/components/HistoryDateTimePicker";
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from "@/components/ui";
import { pickerAppApi } from "@/api/pickerAppApi";
import { packerAppApi } from "@/api/packerAppApi";
import { useAuth } from "@/navigation/AppProvider";
import type { FulfillmentHistoryDto, HistoryPageDto } from "@/types";

const PAGE_SIZE = 100;
type Preset = "today" | "yesterday" | "last7" | "last30" | "custom";
type TimeFilter = "allDay" | "range";
type HistoryRange = { start: Date; end: Date; label: string };

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function dateLabel(date: Date) {
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function timeLabel(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function presetDates(preset: Preset, now = new Date()) {
  const today = startOfDay(now);
  if (preset === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: yesterday, end: endOfDay(yesterday) };
  }
  if (preset === "last7" || preset === "last30") {
    const start = new Date(today);
    start.setDate(start.getDate() - (preset === "last7" ? 6 : 29));
    return { start, end: endOfDay(now) };
  }
  return { start: today, end: endOfDay(now) };
}

function presetName(preset: Preset) {
  return ({ today: "Today", yesterday: "Yesterday", last7: "Last 7 Days", last30: "Last 30 Days", custom: "Custom dates" })[preset];
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
  const [entries, setEntries] = useState<FulfillmentHistoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const initialRange = presetDates("today");
  const [filterOpen, setFilterOpen] = useState(false);
  const [appliedRange, setAppliedRange] = useState<HistoryRange>({ ...initialRange, label: "Today" });
  const [draftPreset, setDraftPreset] = useState<Preset>("today");
  const [draftStart, setDraftStart] = useState(initialRange.start);
  const [draftEnd, setDraftEnd] = useState(initialRange.end);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("allDay");
  const [startTime, setStartTime] = useState(new Date(2000, 0, 1, 6, 0));
  const [endTime, setEndTime] = useState(new Date(2000, 0, 1, 18, 0));
  const [datePickerState, setDatePickerState] = useState<{ target: "startDate" | "endDate" | "startTime" | "endTime"; value: Date } | null>(null);
  const [search, setSearch] = useState("");

  const fetchPage = useCallback(async (pageNumber: number): Promise<HistoryPageDto> =>
    isPacker ? packerAppApi.getHistory(pageNumber, PAGE_SIZE) : pickerAppApi.getHistory(pageNumber, PAGE_SIZE), [isPacker]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const firstPage = await fetchPage(0);
      const allEntries = [...firstPage.content];
      for (let pageNumber = 1; pageNumber < firstPage.totalPages; pageNumber += 1) {
        const result = await fetchPage(pageNumber);
        allEntries.push(...result.content);
        if (result.last) break;
      }
      setEntries(allEntries);
      setExpandedId(null);
    } catch (e: any) {
      setEntries([]);
      setError(e?.message || "Could not load history.");
    } finally {
      setLoading(false);
    }
  }, [fetchPage, isPacker]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const filteredEntries = useMemo(() => entries.filter((entry) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [entry.orderNumber, entry.productName, entry.sku, entry.barcode]
      .some((value) => value?.toLowerCase().includes(query));
    if (!matchesSearch) return false;
    const scannedAt = new Date(entry.scannedAt);
    return !Number.isNaN(scannedAt.getTime())
      && scannedAt >= appliedRange.start
      && scannedAt <= appliedRange.end;
  }), [entries, appliedRange, search]);

  const groups = useMemo(() => {
    const byOrder = new Map<number, FulfillmentHistoryDto[]>();
    for (const entry of filteredEntries) {
      const current = byOrder.get(entry.orderId) ?? [];
      current.push(entry);
      byOrder.set(entry.orderId, current);
    }
    return Array.from(byOrder.entries());
  }, [filteredEntries]);

  const invalidDateRange = startOfDay(draftStart) > startOfDay(draftEnd);
  const sameCustomDay = startOfDay(draftStart).getTime() === startOfDay(draftEnd).getTime();
  const invalidTimeRange = timeFilter === "range"
    && sameCustomDay
    && startTime.getHours() * 60 + startTime.getMinutes() > endTime.getHours() * 60 + endTime.getMinutes();

  function openFilter() {
    setDraftPreset("custom");
    setDraftStart(startOfDay(appliedRange.start));
    setDraftEnd(startOfDay(appliedRange.end));
    setTimeFilter("allDay");
    setStartTime(new Date(2000, 0, 1, 6, 0));
    setEndTime(new Date(2000, 0, 1, 18, 0));
    setFilterOpen(true);
  }

  function choosePreset(nextPreset: Preset) {
    setDraftPreset(nextPreset);
    if (nextPreset !== "custom") {
      const range = presetDates(nextPreset);
      setDraftStart(range.start);
      setDraftEnd(range.end);
    }
  }

  function applyFilter() {
    const start = startOfDay(draftStart);
    const end = endOfDay(draftEnd);
    if (timeFilter === "range") {
      start.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
      end.setHours(endTime.getHours(), endTime.getMinutes(), 59, 999);
    }
    if (start > end) return;
    const label = draftPreset === "custom"
      ? `${dateLabel(draftStart)} – ${dateLabel(draftEnd)}`
      : presetName(draftPreset);
    setAppliedRange({ start, end, label: timeFilter === "range" ? `${label}, ${timeLabel(start)}–${timeLabel(end)}` : label });
    setExpandedId(null);
    setFilterOpen(false);
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading && entries.length > 0} onRefresh={() => void refresh()} />}>
        <View style={s.heading}>
          <Text style={s.title}>History</Text>
          <View style={s.headingActions}>
            <Text style={s.count}>{groups.length} orders</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Filter history" onPress={openFilter} style={s.filterButton}>
              <Ionicons name="options-outline" size={19} color="#1D4ED8" />
              <Text style={s.filterButtonText}>Filter</Text>
            </Pressable>
          </View>
        </View>
        <Text style={s.subtitle}>{isPacker ? "Your packing scans" : "Your picking scans"} · {appliedRange.label}</Text>
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
            title={search ? "No matching scans" : "No scans in this period"}
            body={search ? `No scans match “${search}”. Try another order or item name.` : "Choose another date or time range to see more history."}
            actionLabel={search ? "Clear Search" : "Change Filter"}
            onAction={search ? () => setSearch("") : openFilter}
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
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.filterSheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Filter History</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setFilterOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={23} color="#334155" />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.sectionLabel}>Choose dates</Text>
              <View style={s.presetGrid}>
                {([
                  ["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7 Days"], ["last30", "Last 30 Days"],
                ] as [Preset, string][]).map(([value, label]) => (
                  <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: draftPreset === value }} onPress={() => choosePreset(value)} style={[s.preset, draftPreset === value && s.presetActive]}>
                    <Text style={[s.presetText, draftPreset === value && s.presetTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable accessibilityRole="button" accessibilityState={{ selected: draftPreset === "custom" }} onPress={() => setDraftPreset("custom")} style={s.customHeading}>
                <Ionicons name="calendar-outline" size={18} color="#1D4ED8" />
                <Text style={s.customHeadingText}>Custom date range</Text>
                <Ionicons name={draftPreset === "custom" ? "chevron-up" : "chevron-down"} size={18} color="#64748B" />
              </Pressable>
              {draftPreset === "custom" ? (
                <View style={s.dateRow}>
                  <Pressable accessibilityRole="button" onPress={() => setDatePickerState({ target: "startDate", value: draftStart })} style={s.dateField}>
                    <Text style={s.dateFieldLabel}>From</Text>
                    <Text style={s.dateFieldValue}>{dateLabel(draftStart)}</Text>
                  </Pressable>
                  <Ionicons name="arrow-forward" size={17} color="#94A3B8" />
                  <Pressable accessibilityRole="button" onPress={() => setDatePickerState({ target: "endDate", value: draftEnd })} style={s.dateField}>
                    <Text style={s.dateFieldLabel}>To</Text>
                    <Text style={s.dateFieldValue}>{dateLabel(draftEnd)}</Text>
                  </Pressable>
                </View>
              ) : null}

              <Text style={[s.sectionLabel, s.timeSectionLabel]}>Time (optional)</Text>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: timeFilter === "allDay" }} onPress={() => setTimeFilter("allDay")} style={s.radioRow}>
                <Ionicons name={timeFilter === "allDay" ? "radio-button-on" : "radio-button-off"} size={20} color={timeFilter === "allDay" ? "#1D4ED8" : "#94A3B8"} />
                <Text style={s.radioText}>All day</Text>
              </Pressable>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: timeFilter === "range" }} onPress={() => setTimeFilter("range")} style={s.radioRow}>
                <Ionicons name={timeFilter === "range" ? "radio-button-on" : "radio-button-off"} size={20} color={timeFilter === "range" ? "#1D4ED8" : "#94A3B8"} />
                <Text style={s.radioText}>Choose time range</Text>
              </Pressable>
              {timeFilter === "range" ? (
                <View style={s.timeRow}>
                  <Pressable accessibilityRole="button" onPress={() => setDatePickerState({ target: "startTime", value: startTime })} style={s.timeField}>
                    <Text style={s.dateFieldLabel}>Start time</Text>
                    <Text style={s.dateFieldValue}>{timeLabel(startTime)}</Text>
                  </Pressable>
                  <Ionicons name="arrow-forward" size={17} color="#94A3B8" />
                  <Pressable accessibilityRole="button" onPress={() => setDatePickerState({ target: "endTime", value: endTime })} style={s.timeField}>
                    <Text style={s.dateFieldLabel}>End time</Text>
                    <Text style={s.dateFieldValue}>{timeLabel(endTime)}</Text>
                  </Pressable>
                </View>
              ) : null}
              {invalidDateRange ? <Text style={s.validation}>End date should be the same as or after the start date.</Text> : null}
              {invalidTimeRange ? (
                <Text style={s.validation}>For a single day, end time should be after start time.</Text>
              ) : null}
            </ScrollView>
            <Pressable accessibilityRole="button" disabled={invalidDateRange || invalidTimeRange} onPress={applyFilter} style={[s.applyButton, (invalidDateRange || invalidTimeRange) && s.applyButtonDisabled]}>
              <Text style={s.applyButtonText}>Apply Filter</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <HistoryDateTimePicker
        visible={datePickerState !== null}
        value={datePickerState?.value ?? new Date()}
        mode={datePickerState?.target.endsWith("Date") ? "date" : "time"}
        title={datePickerState?.target === "startDate" ? "Start date" : datePickerState?.target === "endDate" ? "End date" : datePickerState?.target === "startTime" ? "Start time" : "End time"}
        onChange={(value) => {
          if (datePickerState?.target === "startDate") setDraftStart(value);
          if (datePickerState?.target === "endDate") setDraftEnd(value);
          if (datePickerState?.target === "startTime") setStartTime(value);
          if (datePickerState?.target === "endTime") setEndTime(value);
          setDatePickerState(null);
        }}
        onClose={() => setDatePickerState(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F7FB" },
  content: { padding: 16, paddingBottom: 32 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headingActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 24, fontWeight: "800", color: "#0F172A" },
  count: { fontSize: 13, fontWeight: "700", color: "#2563EB" },
  subtitle: { fontSize: 13, color: "#64748B", marginBottom: 10 },
  filterButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  filterButtonText: { fontSize: 13, fontWeight: "700", color: "#1D4ED8" },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 10 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#0F172A" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.4)" },
  filterSheet: { maxHeight: "88%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  sectionLabel: { color: "#475569", fontSize: 14, fontWeight: "700", marginBottom: 10 },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  preset: { minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  presetActive: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  presetText: { color: "#475569", fontSize: 13, fontWeight: "600" },
  presetTextActive: { color: "#1D4ED8", fontWeight: "800" },
  customHeading: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: "#E2E8F0", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  customHeadingText: { flex: 1, fontSize: 15, fontWeight: "700", color: "#0F172A" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12 },
  dateField: { flex: 1, minHeight: 57, justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "#CBD5E1", paddingHorizontal: 11, backgroundColor: "#FFFFFF" },
  dateFieldLabel: { color: "#64748B", fontSize: 11, marginBottom: 3 },
  dateFieldValue: { color: "#0F172A", fontSize: 14, fontWeight: "700" },
  timeSectionLabel: { marginTop: 18 },
  radioRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 38 },
  radioText: { color: "#1E293B", fontSize: 14 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, paddingBottom: 10 },
  timeField: { flex: 1, minHeight: 55, justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "#CBD5E1", paddingHorizontal: 11, backgroundColor: "#FFFFFF" },
  validation: { color: "#B91C1C", fontSize: 12, marginTop: 8 },
  applyButton: { minHeight: 48, marginTop: 14, borderRadius: 13, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  applyButtonDisabled: { opacity: 0.45 },
  applyButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
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
