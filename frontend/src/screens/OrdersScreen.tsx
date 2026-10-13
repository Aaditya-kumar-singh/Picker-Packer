// Assigned Orders — clean Picker work queue.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionHeader,
  StatusBadge,
  theme,
  toneForOrderStatus,
} from "@/components/ui";
import { pickerRepository } from "@/repositories/pickerRepository";
import type { Order } from "@/types";

export function OrdersScreen({ completed = false }: { completed?: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await pickerRepository.getOrders();
    if (r.ok) {
      setOrders(r.data);
      setError(null);
    } else {
      setError(r.apiError.message);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const completedOrders = orders.filter((o) => o.status === "COMPLETED");
  const visibleOrders = completed ? completedOrders : orders.filter((o) => o.status !== "COMPLETED");
  const q = search.trim().toLowerCase();
  const filtered = q
    ? visibleOrders.filter((o) =>
        [
          o.externalId,
          ...o.lines.flatMap((l) => [l.skuCode, l.skuName, l.locationCode]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
    : visibleOrders;

  return (
    <Screen>
      <SectionHeader
        title={completed ? "Completed Orders" : "Assigned Orders"}
        hint={visibleOrders.length ? `${visibleOrders.length}` : undefined}
      />

      {/* Search bar */}
      <View style={os.searchWrap}>
        <Ionicons name="search-outline" size={18} color={theme.color.muted} style={{ marginRight: 6 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search order, SKU or location…"
          placeholderTextColor={theme.color.faint}
          style={os.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={16} color={theme.color.faint} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <LoadingState label="Loading orders…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No Matching Orders" : completed ? "No Completed Orders" : "No Assigned Orders"}
          body={
            search
              ? "Try a different search term."
              : completed
                ? "Completed orders will appear here."
                : "Assigned work will appear when released."
          }
          actionLabel="Refresh"
          onAction={() => void load()}
        />
      ) : (
        filtered.map((o) => {
          const resolved = o.lines.filter((l) => ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status)).length;
          const pct = o.totalLines > 0 ? Math.round((resolved / o.totalLines) * 100) : 0;
          const firstLocation =
            o.lines.find((l) => l.status !== "PICKED" && l.status !== "EXCEPTION" && l.status !== "SKIPPED")?.locationCode ??
            o.lines[0]?.locationCode ??
            "—";

          return (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              onPress={() => router.push(`/order/${o.id}` as never)}
              style={({ pressed }) => [os.orderCard, pressed && os.pressed]}
            >
              {/* Top row: order ID + status */}
              <View style={os.header}>
                <Text style={os.orderId}>{o.externalId}</Text>
                <StatusBadge text={o.status} tone={toneForOrderStatus(o.status)} />
              </View>

              {/* Location + lines */}
              <View style={os.infoRow}>
                <View style={os.locationPill}>
                  <Ionicons name="location-outline" size={12} color={theme.colors.location.text} />
                  <Text style={os.locationText}>{firstLocation}</Text>
                </View>
                <Text style={os.lineCount}>{o.totalLines} lines</Text>
              </View>

              {/* Progress */}
              <View style={os.progressRow}>
                <View style={os.progressTrack}>
                  <View style={[os.progressFill, { width: `${pct}%` }]} />
                </View>
                <Text style={os.metaPct}>{pct}%</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const os = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    marginBottom: 10,
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: theme.color.line,
  },
  searchInput: {
    flex: 1,
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
    minHeight: 40,
  },
  orderCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: 14,
    marginBottom: 8,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  orderId: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
    fontSize: 17,
    flex: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: theme.colors.location.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.location.border,
  },
  locationText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.location.text,
  },
  lineCount: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.color.surfaceContainerHigh,
    overflow: "hidden",
  },
  progressFill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.color.primaryContainer,
  },
  metaPct: {
    ...(theme.type.labelSm as object),
    color: theme.color.primaryContainer,
    fontWeight: "800",
    minWidth: 32,
    textAlign: "right",
  },
});
