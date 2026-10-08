// Picker Dashboard — screenshot-aligned compact warehouse dashboard.
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PrimaryButton,
  Screen,
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
  const { width } = useWindowDimensions();
  const compact = width < 340;
  const metricGap = compact ? 6 : 10;

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
          <View style={ds.dashboardTitle}>
            <View style={ds.dashboardIcon}>
              <Ionicons name="grid" size={compact ? 22 : 26} color={theme.color.primaryContainer} />
            </View>
            <View style={ds.dashboardTitleCopy}>
              <Text style={ds.dashboardTitleText}>Picker Dashboard</Text>
              <Text style={ds.dashboardSubtitle}>Track your work and stay productive</Text>
            </View>
          </View>

          <View style={[ds.grid, { gap: metricGap }]}>
            <View style={ds.cell}>
              <MetricCard value={String(data.pendingCount)} label="Assigned" tone={data.pendingCount > 0 ? "info" : "ok"} />
              <Text style={ds.metricHint}>Pick & Pack items</Text>
            </View>
            <View style={ds.cell}>
              <MetricCard value={String(data.metrics.ordersPicked)} label="Completed" tone="ok" />
              <Text style={ds.metricHint}>Great job!</Text>
            </View>
            <View style={ds.cell}>
              <MetricCard value={String(data.metrics.totalPickedQty)} label="Items Picked Today" tone={data.metrics.totalPickedQty > 0 ? "info" : undefined} />
              <Text style={ds.metricHint}>Keep it up!</Text>
            </View>
          </View>

          {data.activeOrder ? (
            <View style={ds.activeCard}>
              <View style={ds.activeBanner}>
                <View style={ds.activeBannerTitle}>
                  <Ionicons name="cube" size={compact ? 20 : 24} color="#ffffff" />
                  <Text style={ds.activeBannerText}>ACTIVE ORDER</Text>
                </View>
                <View style={ds.activeStatus}>
                  <Ionicons name="time-outline" size={compact ? 16 : 18} color={theme.color.warnInk} />
                  <Text style={ds.activeStatusText}>IN PROGRESS</Text>
                </View>
              </View>
              <View style={ds.activeBody}>
                <Text style={[ds.orderId, compact && ds.orderIdCompact]}>{data.activeOrder.externalId}</Text>
                <View style={ds.activeMetaRow}>
                  <Ionicons name="list" size={18} color={theme.color.faint} />
                  <Text style={ds.activeMeta}>{data.activeOrder.lines.length} pick lines</Text>
                  <View style={ds.metaDivider} />
                  <Ionicons name="star" size={18} color={theme.color.faint} />
                  <Text style={ds.activeMeta}>{data.activeOrder.priority >= 2 ? "High priority" : "Standard priority"}</Text>
                </View>
                <PrimaryButton
                  label="RESUME PICKING"
                  onPress={() => router.push(`/order/${data.activeOrder!.id}` as never)}
                />
              </View>
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
  dashboardTitle: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.space.lg,
    marginBottom: theme.space.md,
    paddingHorizontal: 2,
  },
  dashboardIcon: {
    width: 34,
    alignItems: "center",
  },
  dashboardTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  dashboardTitleText: {
    ...(theme.type.titleMd as object),
    color: theme.color.ink,
    textTransform: "capitalize",
  },
  dashboardSubtitle: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    marginTop: 2,
  },
  grid: {
    flexDirection: "row",
    marginBottom: 2,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    position: "relative",
  },
  metricHint: {
    position: "absolute",
    left: 12,
    right: 10,
    bottom: 10,
    fontSize: 10,
    lineHeight: 14,
    color: theme.color.muted,
  },
  activeCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.color.primaryFixedDim,
    marginTop: theme.space.lg,
    shadowColor: theme.color.primaryDark,
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  activeBanner: {
    minHeight: 74,
    backgroundColor: theme.color.primaryContainer,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.space.sm,
  },
  activeBannerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  activeBannerText: {
    ...(theme.type.titleMd as object),
    color: "#ffffff",
    fontSize: 20,
    letterSpacing: 0.6,
  },
  activeStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.color.warnBg,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxWidth: "48%",
  },
  activeStatusText: {
    ...(theme.type.labelMd as object),
    color: theme.color.warnInk,
    fontWeight: "800",
  },
  activeBody: {
    padding: theme.space.lg,
  },
  orderId: {
    ...(theme.type.codeDisplay as object),
    fontSize: 34,
    color: theme.color.ink,
    letterSpacing: 1,
  },
  orderIdCompact: {
    fontSize: 28,
    letterSpacing: 0.5,
  },
  activeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.space.sm,
    minWidth: 0,
    gap: 8,
  },
  activeMeta: {
    ...(theme.type.bodyMd as object),
    color: theme.color.secondary,
    flexShrink: 1,
    marginVertical: 0,
  },
  metaDivider: {
    width: 1,
    height: 22,
    backgroundColor: theme.color.line,
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
