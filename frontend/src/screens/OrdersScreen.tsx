// Screen 4 — Orders. Stitch design: search/filter bar, filter chips,
// enhanced order cards with priority badges, zones, SLA, bottom scan dock.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressIndicator,
  Screen,
  SLAIndicator,
  StatusBadge,
  theme,
  toneForOrderStatus,
} from "@/components/ui";
import { pickerRepository } from "@/repositories/pickerRepository";
import type { Order } from "@/types";

type Filter = "ALL" | "URGENT" | "IN_PROGRESS" | "PENDING";

export function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await pickerRepository.getOrders();
    if (r.ok) {
      setOrders(r.data);
      setError(null);
    } else setError(r.apiError.message);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Filter + search
  const filtered = orders.filter((o) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!o.externalId.toLowerCase().includes(q)) return false;
    }
    if (filter === "URGENT") {
      const mins = Math.max(0, Math.round((+new Date(o.slaDueAt) - Date.now()) / 60000));
      return mins < 60;
    }
    if (filter === "IN_PROGRESS") return o.status === "IN_PROGRESS";
    if (filter === "PENDING") return o.status === "PENDING" || o.status === "ASSIGNED";
    return true;
  });

  const urgentCount = orders.filter((o) => {
    const mins = Math.max(0, Math.round((+new Date(o.slaDueAt) - Date.now()) / 60000));
    return mins < 60;
  }).length;
  const inProgressCount = orders.filter((o) => o.status === "IN_PROGRESS").length;
  const pendingCount = orders.filter((o) => o.status === "PENDING" || o.status === "ASSIGNED").length;

  const chips: { key: Filter; label: string }[] = [
    { key: "ALL", label: `All (${orders.length})` },
    { key: "URGENT", label: `Urgent SLA (${urgentCount})` },
    { key: "IN_PROGRESS", label: `In Progress (${inProgressCount})` },
    { key: "PENDING", label: `Unassigned (${pendingCount})` },
  ];

  return (
    <Screen>
      {/* Top bar with brand */}
      <View style={os.topBar}>
        <View>
          <Text style={os.brandTitle}>YBM PICKER</Text>
          <Text style={os.brandSub}>ACTIVE ORDERS</Text>
        </View>
        <View style={os.onlineBadge}>
          <View style={os.onlineDot} />
          <Text style={os.onlineText}>ONLINE</Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={os.searchWrap}>
        <Text style={os.searchIcon}>◎</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search Order ID, Tote, or SKU..."
          placeholderTextColor={theme.color.faint}
          style={os.searchInput}
        />
      </View>

      {/* Filter chips */}
      <View style={os.chipRow}>
        {chips.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setFilter(c.key)}
            style={[os.filterChip, filter === c.key && os.filterChipOn]}
          >
            <Text style={[os.filterChipText, filter === c.key && os.filterChipTextOn]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <LoadingState label="Loading orders…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Orders Available"
          body="All assigned pick runs are completed. New work will appear here when released by WMS wave planner."
          actionLabel="Refresh Orders"
          onAction={() => void load()}
        />
      ) : (
        filtered.map((o) => {
          const mins = Math.max(0, Math.round((+new Date(o.slaDueAt) - Date.now()) / 60000));
          const urgent = mins < 30;
          const done = o.lines.filter((l) => ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status)).length;
          const pct = o.totalLines > 0 ? Math.round((done / o.totalLines) * 100) : 0;
          const isActive = o.status === "IN_PROGRESS";

          return (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              onPress={() => router.push(`/order/${o.id}` as never)}
              style={({ pressed }) => (pressed ? os.pressed : null)}
            >
              <View style={[os.orderCard, isActive && os.orderCardActive]}>
                {/* Order header row */}
                <View style={os.orderHeader}>
                  <Text style={os.orderId}>{o.externalId}</Text>
                  <StatusBadge text={o.status} tone={toneForOrderStatus(o.status)} />
                </View>

                {/* Priority + line count */}
                <View style={os.orderMeta}>
                  <View style={[os.priorityBadge, urgent && os.priorityUrgent]}>
                    <Text style={[os.priorityText, urgent && os.priorityTextUrgent]}>
                      {urgent ? `CRITICAL (${mins}m)` : o.priority >= 2 ? `HIGH SLA (${mins}m)` : "NORMAL"}
                    </Text>
                  </View>
                  <Text style={os.lineMeta}>{o.totalLines} Lines</Text>
                </View>

                {/* Progress bar for active orders */}
                {isActive ? (
                  <View style={os.progressRow}>
                    <View style={os.progressTrack}>
                      <View style={[os.progressFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={os.progressLabel}>{done}/{o.totalLines} ({pct}%)</Text>
                  </View>
                ) : null}

                {/* SLA indicator */}
                <SLAIndicator slaDueAt={o.slaDueAt} />

                {/* Action hint */}
                {o.status === "PENDING" ? (
                  <View style={os.claimHint}>
                    <Text style={os.claimText}>CLAIM ORDER →</Text>
                  </View>
                ) : isActive ? (
                  <View style={os.resumeHint}>
                    <Text style={os.resumeText}>RESUME PICK →</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}

      {/* Bottom dock */}
      <View style={os.bottomDock}>
        <Pressable style={os.scanDockBtn}>
          <Text style={os.scanDockText}>◎ SCAN ORDER TOTE</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const os = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.space.xs,
    marginBottom: theme.space.xs,
  },
  brandTitle: {
    ...(theme.type.section as object),
    color: theme.color.primaryContainer,
    letterSpacing: 1,
  },
  brandSub: {
    ...(theme.type.labelSm as object),
    color: theme.color.secondary,
  },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.color.surfaceContainerLow,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radius.pill,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.okInk },
  onlineText: { ...(theme.type.labelSm as object), color: theme.color.ink },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.space.sm,
    marginBottom: theme.space.xs,
    minHeight: theme.touch.min,
  },
  searchIcon: { fontSize: 18, color: theme.color.faint, marginRight: theme.space.xs },
  searchInput: {
    flex: 1,
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
    paddingVertical: theme.space.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.space.xs,
    marginBottom: theme.space.sm,
  },
  filterChip: {
    backgroundColor: theme.color.surfaceContainerHigh,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xxs + 2,
    borderRadius: theme.radius.pill,
  },
  filterChipOn: {
    backgroundColor: theme.color.primaryContainer,
  },
  filterChipText: {
    ...(theme.type.labelMd as object),
    color: theme.color.ink,
  },
  filterChipTextOn: { color: theme.color.onPrimary },
  pressed: { opacity: 0.88 },
  orderCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginBottom: theme.space.xs,
    borderWidth: 1,
    borderColor: theme.color.line,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  orderCardActive: {
    borderColor: theme.color.primaryContainer,
    borderWidth: 2,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  orderId: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
  },
  orderMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    marginTop: theme.space.xxs,
  },
  priorityBadge: {
    backgroundColor: theme.color.surfaceContainerHigh,
    paddingHorizontal: theme.space.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  priorityUrgent: {
    backgroundColor: theme.color.warnBg,
  },
  priorityText: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
  },
  priorityTextUrgent: { color: theme.color.warnInk },
  lineMeta: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
    marginTop: theme.space.xs,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.surfaceContainerHigh,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.primaryContainer,
  },
  progressLabel: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
  },
  claimHint: {
    marginTop: theme.space.xs,
    backgroundColor: theme.color.primaryContainer,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.xs,
    alignItems: "center",
  },
  claimText: {
    ...(theme.type.button as object),
    color: theme.color.onPrimary,
    textTransform: "uppercase",
  },
  resumeHint: {
    marginTop: theme.space.xs,
    backgroundColor: theme.color.surfaceContainerHigh,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.xs,
    alignItems: "center",
  },
  resumeText: {
    ...(theme.type.button as object),
    color: theme.color.primaryContainer,
    textTransform: "uppercase",
  },
  bottomDock: {
    marginTop: theme.space.lg,
    paddingTop: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  scanDockBtn: {
    backgroundColor: theme.color.surfaceContainerHigh,
    borderRadius: theme.radius.lg,
    minHeight: theme.touch.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.color.primaryContainer,
    borderStyle: "dashed",
  },
  scanDockText: {
    ...(theme.type.button as object),
    color: theme.color.primaryContainer,
    textTransform: "uppercase",
  },
});
