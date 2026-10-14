import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NotificationCenterModal,
  type AppNotification,
} from "@/components/modals/NotificationCenterModal";
import { useAuth } from "@/navigation/AppProvider";
import { pickerRepository } from "@/repositories/pickerRepository";
import * as client from "@/api/client";
import { useSyncStatus } from "@/sync/SyncContext";
import { theme } from "@/components/ui";
import { formatPickByTime } from "@/utils/warehouse";

export function BrandHeader() {
  const { picker } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const { status, syncNow } = useSyncStatus();
  const isPacker = picker?.role === "PACKER";

  const [notifVisible, setNotifVisible] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Record<string, boolean>>({});
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const isOnline =
    status.connectivity === "ONLINE" || status.connectivity === "CHECKING";
  const syncLabel =
    status.connectivity === "ONLINE"
      ? "Live"
      : status.connectivity === "CHECKING"
        ? "Live"
        : status.connectivity === "SERVER_UNREACHABLE"
          ? "Server Err"
          : "Offline";

  const syncDotColor = isOnline ? "#16A34A" : "#DC2626";
  const syncPillBg = isOnline ? "#E6F8EE" : "#FEE2E2";
  const syncTextColor = isOnline ? "#15803D" : "#B91C1C";

  const loadNotifications = useCallback(async () => {
    if (!picker) return;
    setLoadingNotifs(true);
    try {
      const items: AppNotification[] = [];

      if (status.conflicts.length > 0) {
        items.push({
          id: `conflict-${status.conflicts.length}`,
          title: `Sync Conflict (${status.conflicts.length})`,
          body:
            status.conflicts[0]?.message ??
            "One or more offline scans require supervisor review.",
          timeLabel: "Just now",
          tone: "urgent",
          targetRoute: isPacker ? "/packer-dashboard" : "/dashboard",
        });
      }

      if (status.pending > 0) {
        items.push({
          id: `pending-sync-${status.pending}`,
          title: `${status.pending} Offline Event(s) Queued`,
          body: "Tap to sync queued warehouse scans with the server.",
          timeLabel: "Pending sync",
          tone: "progress",
          targetRoute: isPacker ? "/packer-dashboard" : "/dashboard",
        });
      }

      if (isPacker) {
        const res = await client.packerOrders();
        const active = res.orders.filter((o) => o.status !== "RIDER_ASSIGNED");
        for (const o of active.slice(0, 8)) {
          const itemCount = o.items?.length || o.itemCount || 0;
          const isPacked = o.status === "PACKED";
          items.push({
            id: `packer-order-${o.id}-${o.status}`,
            title: isPacked
              ? `${o.orderNumber} • Ready for Dispatch`
              : `${o.orderNumber} • Ready to Pack`,
            body: isPacked
              ? `${o.customer || "Warehouse Customer"} • Assign a delivery rider to dispatch.`
              : `${o.customer || "Warehouse Customer"} • ${itemCount} item line(s) waiting at packing station.`,
            timeLabel: isPacked ? "Packed" : "In Queue",
            tone: isPacked ? "ok" : "progress",
            targetRoute: `/pack/order/${o.id}`,
          });
        }
      } else {
        const res = await pickerRepository.getOrders();
        if (res.ok) {
          const active = res.data.filter((o) => o.status !== "COMPLETED");
          const sorted = [...active].sort((a, b) => {
            if (a.status === "IN_PROGRESS" && b.status !== "IN_PROGRESS") return -1;
            if (b.status === "IN_PROGRESS" && a.status !== "IN_PROGRESS") return 1;
            return b.priority - a.priority;
          });

          for (const o of sorted.slice(0, 8)) {
            const pickedLines = o.lines.filter(
              (l) => l.status === "PICKED" || l.pickedQty >= l.requiredQty,
            ).length;
            const totalLines = o.lines.length || o.totalLines || 0;
            const isUrgent = o.priority >= 2;
            const isInProgress = o.status === "IN_PROGRESS";

            items.push({
              id: `picker-order-${o.id}-${o.status}-${pickedLines}`,
              title: isInProgress
                ? `Active Pick Run: ${o.externalId}`
                : isUrgent
                  ? `High Priority Order: ${o.externalId}`
                  : `Assigned Order: ${o.externalId}`,
              body: `${pickedLines}/${totalLines} items picked • Pick by ${formatPickByTime(
                o.slaDueAt,
              )}`,
              timeLabel: isInProgress
                ? "In Progress"
                : isUrgent
                  ? "Urgent"
                  : `Pick by ${formatPickByTime(o.slaDueAt)}`,
              tone: isUrgent ? "urgent" : isInProgress ? "progress" : "info",
              targetRoute: `/order/${o.id}`,
            });
          }
        }
      }

      setNotifications(items);
    } catch {
      // Keep existing notifications if offline/transient error
    } finally {
      setLoadingNotifs(false);
    }
  }, [picker, isPacker, status.conflicts, status.pending]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds[n.id]).length,
    [notifications, readIds],
  );

  function openNotifications() {
    setNotifVisible(true);
    void loadNotifications();
  }

  function handleSelectNotification(item: AppNotification) {
    setReadIds((prev) => ({ ...prev, [item.id]: true }));
    setNotifVisible(false);
    router.push(item.targetRoute as never);
  }

  function markAllRead() {
    const next: Record<string, boolean> = { ...readIds };
    for (const n of notifications) next[n.id] = true;
    setReadIds(next);
  }

  const notificationModal = (
    <NotificationCenterModal
      visible={notifVisible}
      isPacker={Boolean(isPacker)}
      topOffset={Math.max(insets.top, 12) + 56}
      notifications={notifications}
      readIds={readIds}
      unreadCount={unreadCount}
      loading={loadingNotifs}
      onClose={() => setNotifVisible(false)}
      onRefresh={() => void loadNotifications()}
      onMarkAllRead={markAllRead}
      onSelectNotification={handleSelectNotification}
      onViewAllOrders={() => {
        setNotifVisible(false);
        router.push("/orders" as never);
      }}
    />
  );

  if (!isPacker) {
    return (
      <>
        <StatusBar style="light" />
        <View
          style={[
            s.pickerHeaderWrap,
            { paddingTop: Math.max(insets.top, 0) + 8 },
          ]}
        >
          <View style={s.pickerTopRow}>
            <View style={s.pickerLeft}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open navigation menu"
                hitSlop={8}
                style={({ pressed }) => [
                  s.menuBtn,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={() => router.push("/orders" as never)}
              >
                <Ionicons name="menu-outline" size={28} color="#FFFFFF" />
              </Pressable>

              <View style={s.pickerBrandCopy}>
                <View style={s.pickerTitleRow}>
                  <Text
                    style={[s.pickerBrandName, compact && { fontSize: 19 }]}
                    maxFontSizeMultiplier={1.1}
                  >
                    YBM
                  </Text>
                  <View style={s.pickerRolePill}>
                    <Text
                      style={s.pickerRolePillText}
                      maxFontSizeMultiplier={1.1}
                    >
                      PICKER
                    </Text>
                  </View>
                </View>
                <Text
                  style={s.pickerSubtitle}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.1}
                >
                  Warehouse Operations
                </Text>
              </View>
            </View>

            <View style={s.pickerRight}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Connection status: ${syncLabel}`}
                onPress={() => void syncNow()}
                style={({ pressed }) => [
                  s.livePill,
                  { backgroundColor: syncPillBg },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View
                  style={[s.liveDot, { backgroundColor: syncDotColor }]}
                />
                <Text
                  style={[s.liveText, { color: syncTextColor }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {syncLabel}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                style={({ pressed }) => [
                  s.pickerProfileBtn,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => router.push("/profile" as never)}
              >
                <Ionicons name="person" size={18} color="#0B2D6B" />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Notifications, ${unreadCount} unread`}
                hitSlop={8}
                style={({ pressed }) => [
                  s.bellBtn,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={openNotifications}
              >
                <Ionicons
                  name="notifications-outline"
                  size={23}
                  color="#FFFFFF"
                />
                {unreadCount > 0 ? (
                  <View style={s.bellBadge}>
                    <Text
                      style={s.bellBadgeText}
                      maxFontSizeMultiplier={1.0}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
        </View>
        {notificationModal}
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 0) + 6 }]}>
        <View style={s.topRow}>
          <View style={s.brand}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open packing orders"
              hitSlop={8}
              style={({ pressed }) => [
                s.menuBtn,
                pressed && { opacity: 0.75 },
              ]}
              onPress={() => router.push("/orders" as never)}
            >
              <Ionicons name="menu-outline" size={27} color="#FFFFFF" />
            </Pressable>

            <View style={[s.logo, compact && s.logoCompact]}>
              <Text style={[s.logoText, compact && s.logoTextCompact]}>Y</Text>
            </View>

            <View style={s.brandCopy}>
              <View style={s.nameRow}>
                <Text style={s.name} maxFontSizeMultiplier={1.1}>
                  YBM
                </Text>
                <View style={s.badgeWms}>
                  <Text style={s.badgeWmsText} maxFontSizeMultiplier={1.1}>
                    WMS
                  </Text>
                </View>
              </View>
              <Text
                style={s.tagline}
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
              >
                Warehouse Operations
              </Text>
              <Text
                style={s.subTagline}
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
              >
                Pick • Pack • Dispatch
              </Text>
            </View>
          </View>

          <View style={s.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Connection status: ${syncLabel}`}
              onPress={() => void syncNow()}
              style={({ pressed }) => [
                s.livePill,
                { backgroundColor: syncPillBg },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={[s.liveDot, { backgroundColor: syncDotColor }]} />
              <Text
                style={[s.liveText, { color: syncTextColor }]}
                maxFontSizeMultiplier={1.1}
              >
                {syncLabel}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              style={({ pressed }) => [
                s.profileButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => router.push("/profile" as never)}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={theme.color.ink}
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Notifications, ${unreadCount} unread`}
              hitSlop={8}
              style={({ pressed }) => [
                s.bellBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={openNotifications}
            >
              <Ionicons
                name="notifications-outline"
                size={23}
                color="#FFFFFF"
              />
              {unreadCount > 0 ? (
                <View style={s.bellBadge}>
                  <Text style={s.bellBadgeText} maxFontSizeMultiplier={1.0}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </View>
      {notificationModal}
    </>
  );
}

const s = StyleSheet.create({
  pickerHeaderWrap: {
    width: "100%",
    backgroundColor: "#0B2D6B",
    paddingHorizontal: 14,
    paddingBottom: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  pickerTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: 8,
  },
  pickerBrandCopy: {
    flex: 1,
  },
  pickerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerBrandName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  pickerRolePill: {
    backgroundColor: "#2563EB",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pickerRolePillText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  pickerSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  pickerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveText: {
    fontSize: 12,
    fontWeight: "800",
  },
  pickerProfileBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  bellBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bellBadge: {
    position: "absolute",
    top: 1,
    right: 1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#0B2D6B",
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  header: {
    width: "100%",
    backgroundColor: "#091E3A",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  topRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#1565C0",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: 9,
  },
  logoCompact: {
    width: 34,
    height: 34,
    borderRadius: 9,
  },
  logoText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
  },
  logoTextCompact: {
    fontSize: 18,
  },
  brandCopy: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  badgeWms: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgeWmsText: {
    color: "#091E3A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  tagline: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "600",
  },
  subTagline: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 0,
  },
  profileButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
