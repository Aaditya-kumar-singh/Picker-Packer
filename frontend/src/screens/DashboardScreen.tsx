// Picker Dashboard — clean, compact warehouse dashboard.
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
          {/* Title */}
          <Text style={ds.title}>Picker Dashboard</Text>

          {/* Metrics row */}
          <View style={ds.grid}>
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

          {/* Active order card */}
          {data.activeOrder ? (
            <View style={ds.activeCard}>
              <View style={ds.activeBanner}>
                <Ionicons name="cube" size={20} color="#ffffff" />
                <Text style={ds.activeBannerText}>ACTIVE ORDER</Text>
                <View style={ds.activeStatus}>
                  <View style={ds.activeStatusDot} />
                  <Text style={ds.activeStatusText}>IN PROGRESS</Text>
                </View>
              </View>
              <View style={ds.activeBody}>
                <Text style={ds.orderId}>{data.activeOrder.externalId}</Text>
                <Text style={ds.activeMeta}>
                  {data.activeOrder.lines.length} pick lines • {data.activeOrder.priority >= 2 ? "High" : "Standard"} priority
                </Text>
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
                {sync.connectivity === "CHECKING" ? "Checking connection…" : "Offline — changes sync when connected"}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const ds = StyleSheet.create({
  title: {
    ...(theme.type.title as object),
    color: theme.color.ink,
    marginTop: 4,
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
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
    marginTop: 6,
    shadowColor: theme.color.primaryDark,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  activeBanner: {
    backgroundColor: theme.color.primaryContainer,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activeBannerText: {
    ...(theme.type.labelMd as object),
    color: "#ffffff",
    letterSpacing: 0.5,
    flex: 1,
    fontWeight: "800",
  },
  activeStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.color.warnBg,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: theme.color.warnBorder,
  },
  activeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.warnInk,
  },
  activeStatusText: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.color.warnInk,
  },
  activeBody: {
    padding: 14,
  },
  orderId: {
    ...(theme.type.codeDisplay as object),
    fontSize: 24,
    color: theme.color.ink,
    letterSpacing: 1,
  },
  activeMeta: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    marginTop: 4,
  },
  stale: {
    marginTop: 8,
    color: theme.color.secondary,
    ...(theme.type.secondary as object),
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.md,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.critical,
  },
  offlineText: {
    ...(theme.type.secondary as object),
    color: theme.color.muted,
    flex: 1,
  },
});
