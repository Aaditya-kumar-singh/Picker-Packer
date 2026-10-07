// Assigned Orders — screenshot-aligned Picker work queue.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionHeader,
  SLAIndicator,
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

  const completedOrders = orders.filter(o => o.status === "COMPLETED");
  const visibleOrders = completed ? completedOrders : orders.filter(o => o.status !== "COMPLETED");
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
        <Text style={os.searchIcon}>⌕</Text>
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
      </View>

      {loading ? (
        <LoadingState label="Loading assigned orders…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No Matching Orders" : completed ? "No Completed Orders" : "No Assigned Orders"}
          body={search ? "Try another order, SKU, product or location." : completed ? "Completed picking orders will appear here." : "Assigned picking work will appear here when released."}
          actionLabel="Refresh Orders"
          onAction={() => void load()}
        />
      ) : (
        filtered.map((o) => {
          const resolved = o.lines.filter((l) => ["PICKED", "EXCEPTION", "SKIPPED"].includes(l.status)).length;
          const pct = o.totalLines > 0 ? Math.round((resolved / o.totalLines) * 100) : 0;
          const firstLocation = o.lines.find((l) => l.status !== "PICKED" && l.status !== "EXCEPTION" && l.status !== "SKIPPED")?.locationCode
            ?? o.lines[0]?.locationCode
            ?? "—";

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
                  <Text style={os.location}>Location {firstLocation}</Text>
                </View>
                <StatusBadge text={o.status} tone={toneForOrderStatus(o.status)} />
              </View>

              <View style={os.metaRow}>
                <Text style={os.meta}>{resolved}/{o.totalLines} items</Text>
                <Text style={os.meta}>{pct}% picked</Text>
              </View>

              <View style={os.progressTrack}>
                <View style={[os.progressFill, { width: `${pct}%` }]} />
              </View>

              <View style={os.footer}>
                <Text style={os.lineCount}>{o.totalLines} pick lines</Text>
                <SLAIndicator slaDueAt={o.slaDueAt} />
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
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.space.sm,
    marginBottom: theme.space.sm,
    minHeight: theme.touch.min,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  searchIcon: {
    fontSize: 20,
    color: theme.color.muted,
    marginRight: theme.space.xs,
  },
  searchInput: {
    flex: 1,
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
    minHeight: theme.touch.min,
  },
  orderCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
  },
  pressed: {
    opacity: 0.82,
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
  },
  location: {
    ...(theme.type.secondary as object),
    color: theme.color.secondary,
    marginTop: 3,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.space.sm,
  },
  meta: {
    ...(theme.type.secondary as object),
    color: theme.color.ink,
    fontWeight: "600",
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.color.surfaceContainerHigh,
    overflow: "hidden",
    marginTop: theme.space.xs,
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
    marginTop: theme.space.sm,
    gap: theme.space.sm,
  },
  lineCount: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
  },
});
