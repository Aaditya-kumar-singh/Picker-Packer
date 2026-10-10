// Picker Dashboard — screenshot-aligned compact warehouse dashboard.
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
            <Pressable
              style={({ pressed }) => [ds.cell, pressed && ds.metricPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Assigned orders, ${data.pendingCount}`}
              onPress={() => router.push("/orders" as never)}
            >
              <MetricCard
                value={String(data.pendingCount)}
                label="Assigned"
                tone={data.pendingCount > 0 ? "info" : "ok"}
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [ds.cell, pressed && ds.metricPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Completed orders, ${data.metrics.ordersPicked}`}
              onPress={() => router.push("/completed-orders" as never)}
            >
              <MetricCard
                value={String(data.metrics.ordersPicked)}
                label="Completed"
                tone="ok"
              />
            </Pressable>
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
                  <Ionicons name="list" size={18} color={theme.color.muted} />
                  <Text style={ds.activeMeta}>{data.activeOrder.lines.length} pick lines</Text>
                  <View style={ds.metaDivider} />
                  <Ionicons name="star" size={18} color={theme.color.warnPrimary} />
                  <Text style={ds.activeMeta}>{data.activeOrder.priority >= 2 ? "High priority" : "Standard priority"}</Text>
                </View>
                <PrimaryButton
                  label="RESUME PICKING"
                  icon="arrow-forward-circle"
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
    marginTop: theme.space.sm,
    marginBottom: theme.space.md,
    gap: 8,
  },
  dashboardIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.infoBg,
    alignItems: "center",
    justifyContent: "center",
  },
  dashboardTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  dashboardTitleText: {
    ...(theme.type.titleMd as object),
    color: theme.color.ink,
  },
  dashboardSubtitle: {
    ...(theme.type.bodyMd as object),
    color: theme.color.muted,
    marginTop: 1,
  },
  grid: {
    flexDirection: "row",
    marginBottom: theme.space.sm,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  metricPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  activeCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: theme.color.primary,
    marginTop: theme.space.md,
    shadowColor: theme.color.primaryDark,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  activeBanner: {
    minHeight: 64,
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
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  activeBannerText: {
    ...(theme.type.section as object),
    color: "#ffffff",
    letterSpacing: 0.6,
  },
  activeStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.color.warnBg,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: theme.color.warnBorder,
  },
  activeStatusText: {
    ...(theme.type.labelSm as object),
    color: theme.color.warnInk,
    fontWeight: "800",
  },
  activeBody: {
    padding: theme.space.md,
  },
  orderId: {
    ...(theme.type.codeDisplay as object),
    fontSize: 28,
    color: theme.color.ink,
    letterSpacing: 1,
  },
  orderIdCompact: {
    fontSize: 24,
    letterSpacing: 0.5,
  },
  activeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: theme.space.sm,
    minWidth: 0,
    gap: 8,
  },
  activeMeta: {
    ...(theme.type.secondary as object),
    color: theme.color.secondary,
    flexShrink: 1,
  },
  metaDivider: {
    width: 1,
    height: 16,
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
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginTop: theme.space.md,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  offlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.color.critical,
  },
  offlineText: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    flex: 1,
  },
});
