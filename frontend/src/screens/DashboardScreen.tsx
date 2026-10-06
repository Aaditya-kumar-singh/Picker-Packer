// Screen 3 — Dashboard. Stitch design: picker profile header, active pick run
// hero card with progress, 4-metric grid, sync status banner, quick actions.
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
  theme,
} from "@/components/ui";
import { OfflineBanner, ConflictList, SyncBadge } from "@/components/SyncBadge";
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
    } else setError(r.apiError.message);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const resume = data?.activeOrder
    ? () => router.push(`/order/${data.activeOrder!.id}` as never)
    : null;

  return (
    <Screen>
      {/* Picker profile header */}
      <View style={ds.profileRow}>
        <View style={ds.profileLeft}>
          <View style={ds.avatar}>
            <Text style={ds.avatarText}>
              {(data?.pickerName ?? picker?.name ?? "P").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={ds.profileName} numberOfLines={1} ellipsizeMode="tail">{data?.pickerName ?? picker?.name ?? ""}</Text>
            <Text style={ds.profileMeta} numberOfLines={1} ellipsizeMode="tail">
              {data?.pickerCode ?? ""} • {data?.warehouseName ?? ""}
            </Text>
          </View>
        </View>
      </View>
      <View style={ds.syncRow}>
        <SyncBadge />
      </View>

      <OfflineBanner />

      {loading && !data ? (
        <LoadingState label="Loading dashboard…" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data ? (
        <EmptyState title="No dashboard data" body="Pull back in with a connection to load your shift." actionLabel="Retry" onAction={() => void load()} />
      ) : (
        <>
          {/* Active pick run hero card */}
          {data.activeOrder ? (
            <View style={ds.heroCard}>
              <View style={ds.heroHeader}>
                <Text style={ds.heroLabel}>ACTIVE PICK RUN</Text>
                <StatusBadge text="IN PROGRESS" tone="warn" />
              </View>
              <Text style={ds.heroOrderId}>{data.activeOrder.externalId}</Text>
              <View style={ds.heroProgressRow}>
                <View style={ds.heroProgressTrack}>
                  <View style={[ds.heroProgressFill, { width: "33%" }]} />
                </View>
                <Text style={ds.heroProgressText}>Active</Text>
              </View>
              <PrimaryButton
                label={`RESUME PICKING`}
                onPress={() => router.push(`/order/${data.activeOrder!.id}` as never)}
              />
            </View>
          ) : null}

          {/* Metrics grid */}
          <SectionHeader title="Shift Performance" hint={sync.lastSyncAt ? `Last sync ${new Date(sync.lastSyncAt).toLocaleTimeString()}` : "Never synced"} />
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
                value={String(sync.pending)}
                label="Queued Sync"
                tone={sync.pending > 0 ? "warn" : "ok"}
              />
            </View>
            <View style={ds.cell}>
              <MetricCard
                value={data.activeOrder ? "1" : "0"}
                label="In Progress"
                tone={data.activeOrder ? "warn" : undefined}
              />
            </View>
          </View>

          {/* Sync status banner */}
          <View style={ds.syncBanner}>
            <View style={[ds.syncDot, sync.connectivity === "ONLINE" ? ds.syncDotOk : ds.syncDotBad]} />
            <Text style={ds.syncText}>
              {sync.connectivity === "ONLINE"
                ? `Online • ${sync.pending === 0 ? "All scans synced with WMS" : `${sync.pending} events queued`}`
                : "Offline — changes queued locally"}
            </Text>
          </View>

          {error ? <Text style={ds.stale}>Showing last loaded data — {error}</Text> : null}
          <ConflictList />

          {/* Quick actions */}
          <SectionHeader title="Quick Actions" />
          {!resume ? (
            <PrimaryButton label="View Orders" onPress={() => router.push("/orders" as never)} />
          ) : (
            <>
              <SecondaryButton label="View Orders" onPress={() => router.push("/orders" as never)} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const ds = StyleSheet.create({
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.space.sm,
  },
  profileLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    flex: 1,
    minWidth: 0,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  syncRow: {
    alignItems: "flex-start",
    marginBottom: theme.space.xs,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.color.primaryContainer,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.color.onPrimary,
  },
  profileName: {
    ...(theme.type.section as object),
    color: theme.color.ink,
  },
  profileMeta: {
    ...(theme.type.secondary as object),
    color: theme.color.secondary,
    letterSpacing: 0.4,
  },
  heroCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginTop: theme.space.sm,
    borderWidth: 2,
    borderColor: theme.color.primaryContainer,
    shadowColor: theme.color.ink,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.space.xs,
  },
  heroLabel: {
    ...(theme.type.labelMd as object),
    color: theme.color.primaryContainer,
  },
  heroOrderId: {
    ...(theme.type.codeLg as object),
    color: theme.color.ink,
    marginBottom: theme.space.xs,
  },
  heroProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
  },
  heroProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.surfaceContainerHigh,
    overflow: "hidden",
  },
  heroProgressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.primaryContainer,
  },
  heroProgressText: {
    ...(theme.type.labelSm as object),
    color: theme.color.muted,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginTop: 2 },
  cell: { width: "50%", paddingHorizontal: 4 },
  syncBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginTop: theme.space.sm,
  },
  syncDot: { width: 10, height: 10, borderRadius: 5 },
  syncDotOk: { backgroundColor: theme.color.okInk },
  syncDotBad: { backgroundColor: theme.color.critical },
  syncText: { ...(theme.type.secondary as object), color: theme.color.ink, flex: 1 },
  stale: { marginTop: theme.space.xs, color: theme.color.secondary, ...(theme.type.secondary as object) },
});
