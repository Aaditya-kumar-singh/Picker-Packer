import { useEffect, useState } from "react";
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
import NetInfo from "@react-native-community/netinfo";
import {
  NotificationCenterModal,
  type AppNotification,
} from "@/components/modals/NotificationCenterModal";
import { useAuth } from "@/navigation/AppProvider";
import { useNotifications } from "@/context/NotificationContext";
import { theme } from "@/components/ui";

export function BrandHeader() {
  const { picker } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const isPacker = picker?.role === "PACKER";

  const {
    notifications,
    readIds,
    unreadCount,
    loading: loadingNotifs,
    loadNotifications,
    markAsRead,
    markAllRead,
  } = useNotifications();

  const [notifVisible, setNotifVisible] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsub();
  }, []);

  const syncLabel = isOnline ? "Live" : "Offline";
  const syncDotColor = isOnline ? "#16A34A" : "#DC2626";
  const syncPillBg = isOnline ? "#E6F8EE" : "#FEE2E2";
  const syncTextColor = isOnline ? "#15803D" : "#B91C1C";

  function openNotifications() {
    setNotifVisible(true);
    void loadNotifications();
  }

  function handleSelectNotification(item: AppNotification) {
    markAsRead(item.id);
    setNotifVisible(false);
    router.push(item.targetRoute as never);
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
                onPress={() => void loadNotifications()}
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
              onPress={() => void loadNotifications()}
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
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
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
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
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
