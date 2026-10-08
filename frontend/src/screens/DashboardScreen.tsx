// Picker Dashboard — screenshot-aligned compact warehouse dashboard.
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PrimaryButton,
  Screen,
  SectionHeader,
  StatusBadge,
  theme,
} from "@/components/ui";
import { useAuth } from "@/navigation/AppProvider";
import { pickerRepository } from "@/repositories/pickerRepository";
import { useSyncStatus } from "@/sync/SyncContext";
import type { DashboardData } from "@/services/pickerApi";

export function DashboardScreen() {
  const { picker } = useAuth();
  const { status: sync } = useSyncStatus();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await pickerRepository.getDashboard();
    if (r.ok) {
      setData(r.data);
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

  return (
    <Screen>
      {loading && !data ? (
        <LoadingState label="Loading dashboard…" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data ? (
        <EmptyState
          title="No dashboard data"
          body="Reconnect to load your assigned work."
          actionLabel="Retry"
          onAction={() => void load()}
        />
      ) : (
        <>
          <SectionHeader
            title="Picker Dashboard"
            hint={data.warehouseName || picker?.name || undefined}
          />

          <View style={ds.grid}>
            <View style={ds.cell}>
              <MetricCard
                value={String(data.pendingCount)}
                label="Assigned"
                tone={data.pendingCount > 0 ? "info" : "ok"}
              />
            </View>
            <View style={ds.cell}>
              <MetricCard
                value={String(data.metrics.ordersPicked)}
                label="Completed"
                tone="ok"
              />
            </View>
            <View style={ds.cell}>
              <MetricCard
                value={String(data.metrics.totalPickedQty)}
                label="Items Picked Today"
                tone={data.metrics.totalPickedQty > 0 ? "info" : undefined}
              />
            </View>
          </View>

          {data.activeOrder ? (
            <View style={ds.activeCard}>
              <View style={ds.activeHeader}>
                <View>
                  <Text style={ds.activeLabel}>ACTIVE ORDER</Text>
                  <Text style={ds.orderId}>{data.activeOrder.externalId}</Text>
                </View>
                <StatusBadge text="IN PROGRESS" tone="warn" />
              </View>
              <Text style={ds.activeMeta}>
                {data.activeOrder.lines.length} pick lines · {data.activeOrder.priority >= 2 ? "High priority" : "Standard priority"}
              </Text>
              <PrimaryButton
                label="RESUME PICKING"
                onPress={() => router.push(`/order/${data.activeOrder!.id}` as never)}
              />
            </View>
          ) : null}

          {error ? <Text style={ds.stale}>Showing last loaded data — {error}</Text> : null}

          {sync.connectivity !== "ONLINE" ? (
            <View style={ds.offlineBanner}>
              <View style={ds.offlineDot} />
              <Text style={ds.offlineText}>
                {sync.connectivity === "CHECKING" ? "Checking connection…" : "Offline — changes will sync when connection returns"}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const ds = StyleSheet.create({
  grid: {
    flexDirection: "row",
    gap: theme.space.xs,
    marginTop: theme.space.md,
  },
  cell: {
    flex: 1,
  },
  activeCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.primaryContainer,
    padding: theme.space.lg,
    marginTop: theme.space.lg,
    shadowColor: theme.color.primaryDark,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  activeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.space.sm,
  },
  activeLabel: {
    ...(theme.type.labelSm as object),
    color: theme.color.primaryContainer,
    letterSpacing: 0.8,
  },
  orderId: {
    ...(theme.type.codeDisplay as object),
    fontSize: 28, // slight tweak to fit better
    color: theme.color.ink,
    marginTop: 6,
  },
  activeMeta: {
    ...(theme.type.bodyMd as object),
    color: theme.color.secondary,
    marginVertical: theme.space.md,
  },
  stale: {
    marginTop: theme.space.xs,
    color: theme.color.secondary,
    ...(theme.type.secondary as object),
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginTop: theme.space.md,
  },
  offlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.color.critical,
  },
  offlineText: {
    ...(theme.type.bodyMd as object),
    color: theme.color.ink,
    flex: 1,
  },
});
