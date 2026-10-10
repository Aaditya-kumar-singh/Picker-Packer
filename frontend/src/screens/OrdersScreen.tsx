// Assigned Orders — screenshot-aligned Picker work queue.
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
        hint={visibleOrders.length ? `${visibleOrders.length} order${visibleOrders.length === 1 ? "" : "s"}` : undefined}
      />

      <View style={os.searchWrap}>
        <Ionicons name="search-outline" size={20} color={theme.color.muted} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search Order ID, SKU, product or location"
          placeholderTextColor={theme.color.faint}
          style={os.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={theme.color.faint} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <LoadingState label="Loading assigned orders…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No Matching Orders" : completed ? "No Completed Orders" : "No Assigned Orders"}
          body={
            search
              ? "Try another order, SKU, product or location."
              : completed
                ? "Completed picking orders will appear here."
                : "Assigned picking work will appear here when released."
          }
          actionLabel="Refresh Orders"
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
              <View style={os.header}>
                <View style={os.headerLeft}>
                  <Text style={os.orderId}>{o.externalId}</Text>
                  <View style={os.locationPill}>
                    <Ionicons name="location-outline" size={13} color={theme.colors.location.text} />
                    <Text style={os.locationText}>{firstLocation}</Text>
                  </View>
                </View>
                <StatusBadge text={o.status} tone={toneForOrderStatus(o.status)} />
              </View>

              <View style={os.metaRow}>
                <Text style={os.meta}>{resolved}/{o.totalLines} lines picked</Text>
                <Text style={os.metaPct}>{pct}%</Text>
              </View>

              <View style={os.progressTrack}>
                <View style={[os.progressFill, { width: `${pct}%` }]} />
              </View>

              <View style={os.footer}>
                <View style={os.footerLeft}>
                  <Ionicons name="list" size={14} color={theme.color.muted} />
                  <Text style={os.lineCount}>{o.totalLines} pick lines</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.color.faint} />
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
    paddingHorizontal: theme.space.md,
    marginBottom: theme.space.md,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
    minHeight: 44,
  },
  orderCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.space.sm,
  },
  headerLeft: {
    flex: 1,
  },
  orderId: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
    fontSize: 18,
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.location.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
    alignSelf: "flex-start",
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.colors.location.border,
  },
  locationText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.location.text,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.space.sm,
    alignItems: "center",
  },
  meta: {
    ...(theme.type.secondary as object),
    color: theme.color.inkSecondary,
    fontWeight: "600",
  },
  metaPct: {
    ...(theme.type.labelSm as object),
    color: theme.color.primaryContainer,
    fontWeight: "800",
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.color.surfaceContainerHigh,
    overflow: "hidden",
    marginVertical: 6,
  },
  progressFill: {
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.color.primaryContainer,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lineCount: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
});
