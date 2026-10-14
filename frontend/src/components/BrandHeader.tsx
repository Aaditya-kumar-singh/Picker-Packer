import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/navigation/AppProvider";
import { pickerRepository } from "@/repositories/pickerRepository";
import * as client from "@/api/client";
import { useSyncStatus } from "@/sync/SyncContext";
import { theme } from "@/components/ui";
import { formatPickByTime } from "@/utils/warehouse";

interface AppNotification {
  id: string;
  title: string;
  body: string;
  timeLabel: string;
  tone: "urgent" | "progress" | "info" | "ok";
  targetRoute: string;
}

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
    <Modal
      visible={notifVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setNotifVisible(false)}
    >
      <Pressable
        style={s.modalBackdrop}
        onPress={() => setNotifVisible(false)}
      >
        <Pressable
          style={[
            s.notifSheet,
            { marginTop: Math.max(insets.top, 12) + 56 },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={s.notifHeaderRow}>
            <View style={s.notifTitleRow}>
              <Ionicons
                name="notifications"
                size={19}
                color={isPacker ? "#D95D00" : "#0D6EFD"}
              />
              <Text style={s.notifTitle}>Notifications</Text>
              {unreadCount > 0 ? (
                <View
                  style={[
                    s.unreadCountPill,
                    isPacker && { backgroundColor: "#FFF1E6" },
                  ]}
                >
                  <Text
                    style={[
                      s.unreadCountText,
                      isPacker && { color: "#D95D00" },
                    ]}
                  >
                    {unreadCount} new
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={s.notifHeaderActions}>
              {unreadCount > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mark all notifications as read"
                  onPress={markAllRead}
                  style={({ pressed }) => [
                    s.markReadBtn,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text
                    style={[
                      s.markReadText,
                      isPacker && { color: "#D95D00" },
                    ]}
                  >
                    Mark all read
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh notifications"
                onPress={() => void loadNotifications()}
                style={({ pressed }) => [
                  s.iconCircleBtn,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Ionicons name="refresh" size={16} color="#334155" />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close notifications"
                onPress={() => setNotifVisible(false)}
                style={({ pressed }) => [
                  s.iconCircleBtn,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Ionicons name="close" size={18} color="#334155" />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={s.notifList}
            contentContainerStyle={s.notifListContent}
            showsVerticalScrollIndicator={false}
          >
            {notifications.length === 0 ? (
              <View style={s.emptyNotifBox}>
                <View style={s.emptyNotifIcon}>
                  <Ionicons
                    name="checkmark-done-circle-outline"
                    size={32}
                    color="#16A34A"
                  />
                </View>
                <Text style={s.emptyNotifTitle}>
                  {loadingNotifs ? "Checking alerts…" : "All caught up!"}
                </Text>
                <Text style={s.emptyNotifSub}>
                  New order assignments and station alerts will appear here.
                </Text>
              </View>
            ) : (
              notifications.map((item) => {
                const isUnread = !readIds[item.id];
                const iconBg =
                  item.tone === "urgent"
                    ? "#FEE2E2"
                    : item.tone === "progress"
                      ? "#FFEDD5"
                      : item.tone === "ok"
                        ? "#DCFCE7"
                        : "#E0F2FE";
                const iconColor =
                  item.tone === "urgent"
                    ? "#DC2626"
                    : item.tone === "progress"
                      ? "#EA580C"
                      : item.tone === "ok"
                        ? "#16A34A"
                        : "#0284C7";
                const iconName =
                  item.tone === "urgent"
                    ? "flame"
                    : item.tone === "progress"
                      ? "time"
                      : item.tone === "ok"
                        ? "checkmark-circle"
                        : "cube";

                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    onPress={() => handleSelectNotification(item)}
                    style={({ pressed }) => [
                      s.notifItem,
                      isUnread && s.notifItemUnread,
                      pressed && { opacity: 0.88 },
                    ]}
                  >
                    <View
                      style={[s.notifIconCircle, { backgroundColor: iconBg }]}
                    >
                      <Ionicons name={iconName} size={18} color={iconColor} />
                    </View>

                    <View style={s.notifCopy}>
                      <View style={s.notifItemTopRow}>
                        <Text
                          style={[
                            s.notifItemTitle,
                            isUnread && { fontWeight: "900" },
                          ]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        {isUnread ? (
                          <View
                            style={[
                              s.unreadDot,
                              isPacker && { backgroundColor: "#EA580C" },
                            ]}
                          />
                        ) : null}
                      </View>

                      <Text style={s.notifItemBody} numberOfLines={2}>
                        {item.body}
                      </Text>

                      <Text style={s.notifTimeLabel}>{item.timeLabel}</Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#94A3B8"
                    />
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setNotifVisible(false);
              router.push("/orders" as never);
            }}
            style={({ pressed }) => [
              s.viewAllOrdersFooter,
              isPacker && { backgroundColor: "#FFF5E5" },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={[
                s.viewAllOrdersFooterText,
                isPacker && { color: "#D95D00" },
              ]}
            >
              View All Assigned Orders
            </Text>
            <Ionicons
              name="arrow-forward"
              size={15}
              color={isPacker ? "#D95D00" : "#0D6EFD"}
            />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
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

  // Packer Header — matches reference Packer screenshots + working notification bell
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
              accessibilityLabel={`Notifications, ${unreadCount} unread`}
              hitSlop={8}
              style={({ pressed }) => [s.bellBtn, pressed && { opacity: 0.8 }]}
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

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              style={({ pressed }) => [
                s.profileButton,
                pressed ? { opacity: 0.85 } : null,
              ]}
              onPress={() => router.push("/profile" as never)}
            >
              <Ionicons name="person" size={18} color="#091E3A" />
            </Pressable>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Packer Workspace Profile"
          style={({ pressed }) => [s.workspace, pressed && { opacity: 0.9 }]}
          onPress={() => router.push("/profile" as never)}
        >
          <Ionicons name="cube" size={20} color="#EA580C" />
          <Text style={s.workspaceRole} maxFontSizeMultiplier={1.1}>
            Packer Workspace
          </Text>
          <View style={s.workspaceDivider} />
          <Text
            style={s.workspaceUser}
            numberOfLines={1}
            maxFontSizeMultiplier={1.1}
          >
            {picker?.name ?? "Test Packer"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#D97706" />
        </Pressable>
      </View>
      {notificationModal}
    </>
  );
}

const s = StyleSheet.create({
  pickerHeaderWrap: { backgroundColor: "#0B2E6B", paddingHorizontal: 16, paddingBottom: 14, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, shadowColor: "#071A3E", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  pickerTopRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  pickerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  menuBtn: { width: 32, height: 34, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  pickerBrandCopy: { flex: 1 },
  pickerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pickerBrandName: { color: "#FFFFFF", fontSize: 21, fontWeight: "900", letterSpacing: 0.3 },
  pickerRolePill: { backgroundColor: "#1D76DB", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7 },
  pickerRolePillText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  pickerSubtitle: { color: "#CBD5E1", fontSize: 12, fontWeight: "500", marginTop: 1 },
  pickerRight: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 },
  livePill: { minHeight: 30, paddingHorizontal: 12, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 12, fontWeight: "800" },
  pickerProfileBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  bellBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", position: "relative" },
  bellBadge: { position: "absolute", top: 1, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#EF4444", borderWidth: 1.5, borderColor: "#0B2E6B", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  bellBadgeText: { color: "#FFFFFF", fontSize: 9.5, fontWeight: "900" },
  header: { backgroundColor: "#091E3A", paddingHorizontal: 14, paddingTop: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#1E3A5F" },
  topRow: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  brand: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 44, height: 44, borderRadius: 11, backgroundColor: theme.color.primary, borderWidth: 1.5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  logoText: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", fontStyle: "italic" },
  logoCompact: { width: 40, height: 40 },
  logoTextCompact: { fontSize: 22 },
  brandCopy: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", letterSpacing: -0.2 },
  badgeWms: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  badgeWmsText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  tagline: { color: "#CBD5E1", fontSize: 11, fontWeight: "600" },
  subTagline: { color: "#60A5FA", fontSize: 10, fontWeight: "500", marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  profileButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  workspace: { marginTop: 10, minHeight: 42, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1.5, borderColor: "#F59E0B", backgroundColor: "#FFF5E5", flexDirection: "row", alignItems: "center", gap: 8 },
  workspaceRole: { fontSize: 13, fontWeight: "800", color: "#D95D00" },
  workspaceDivider: { width: 1.5, height: 15, backgroundColor: "#FCD34D", marginHorizontal: 2 },
  workspaceUser: { flex: 1, fontSize: 13, fontWeight: "700", color: "#0F172A" },

  // ── Notification Center Modal Styles ──
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)", paddingHorizontal: 12 },
  notifSheet: { width: "100%", maxHeight: "76%", backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden", shadowColor: "#0F172A", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  notifHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#F8FAFC" },
  notifTitleRow: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  notifTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  unreadCountPill: { backgroundColor: "#E0F2FE", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  unreadCountText: { fontSize: 11, fontWeight: "800", color: "#0284C7" },
  notifHeaderActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  markReadBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  markReadText: { fontSize: 12, fontWeight: "800", color: "#0D6EFD" },
  iconCircleBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
  notifList: { maxHeight: 380 },
  notifListContent: { padding: 10, gap: 8 },
  notifItem: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0" },
  notifItemUnread: { backgroundColor: "#F8FAFF", borderColor: "#BFDBFE" },
  notifIconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  notifCopy: { flex: 1 },
  notifItemTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  notifItemTitle: { flex: 1, fontSize: 13.5, fontWeight: "700", color: "#0F172A" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#0D6EFD", flexShrink: 0 },
  notifItemBody: { fontSize: 12, color: "#475569", marginTop: 2 },
  notifTimeLabel: { fontSize: 10.5, fontWeight: "700", color: "#64748B", marginTop: 4 },
  emptyNotifBox: { paddingVertical: 32, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  emptyNotifIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyNotifTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  emptyNotifSub: { fontSize: 12, color: "#64748B", textAlign: "center", marginTop: 4 },
  viewAllOrdersFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, backgroundColor: "#F0F7FF", borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  viewAllOrdersFooterText: { fontSize: 13, fontWeight: "800", color: "#0D6EFD" },
});
