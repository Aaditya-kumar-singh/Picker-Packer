import { Text } from "@/components/Typography";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
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
  const narrowHeader = width < 400;
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

  const syncLabel = isOnline ? "Online" : "Offline";
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
            <View style={[s.pickerLeft, narrowHeader && s.pickerLeftNarrow]}>
              <Image
                source={require("../../assets/images/ybm-app-mark.png")}
                style={[s.logoImage, narrowHeader && s.logoImageNarrow]}
                resizeMode="contain"
                accessibilityLabel="YourBuildMart WMS"
              />

              <View style={s.pickerBrandCopy}>
                <View style={s.pickerTitleRow}>
                  <Text
                    style={[s.pickerBrandName, narrowHeader && s.pickerBrandNameNarrow]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.1}
                  >
                    YourBuildMart
                  </Text>
                  <View style={[s.pickerRolePill, narrowHeader && s.pickerRolePillNarrow]}>
                    <Text
                      style={[s.pickerRolePillText, narrowHeader && s.pickerRolePillTextNarrow]}
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

            <View style={[s.pickerRight, narrowHeader && s.actionsNarrow]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Connection status: ${syncLabel}`}
                onPress={() => void loadNotifications()}
                style={({ pressed }) => [
                  s.livePill,
                  narrowHeader && s.livePillNarrow,
                  { backgroundColor: syncPillBg },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View
                  style={[s.liveDot, narrowHeader && s.liveDotNarrow, { backgroundColor: syncDotColor }]}
                />
                <Text
                  style={[s.liveText, narrowHeader && s.liveTextNarrow, { color: syncTextColor }]}
                  maxFontSizeMultiplier={1.1}
                >
                  {syncLabel}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                hitSlop={8}
                style={({ pressed }) => [
                  s.pickerProfileBtn,
                  narrowHeader && s.actionButtonNarrow,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => router.navigate("/profile" as never)}
              >
                <Ionicons name="person" size={18} color="#0B2D6B" />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Notifications, ${unreadCount} unread`}
                hitSlop={8}
                style={({ pressed }) => [
                  s.bellBtn,
                  narrowHeader && s.actionButtonNarrow,
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
          <View style={[s.brand, narrowHeader && s.brandNarrow]}>
            <Image
              source={require("../../assets/images/ybm-app-mark.png")}
              style={[s.logoImage, narrowHeader && s.logoImageNarrow]}
              resizeMode="contain"
              accessibilityLabel="YourBuildMart WMS"
            />

            <View style={s.brandCopy}>
              <View style={s.nameRow}>
                <Text style={[s.name, narrowHeader && s.nameNarrow]} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                  YourBuildMart
                </Text>
                <View style={[s.badgeWms, narrowHeader && s.badgeWmsNarrow]}>
                  <Text style={[s.badgeWmsText, narrowHeader && s.badgeWmsTextNarrow]} maxFontSizeMultiplier={1.1}>
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

          <View style={[s.actions, narrowHeader && s.actionsNarrow]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Connection status: ${syncLabel}`}
              onPress={() => void loadNotifications()}
              style={({ pressed }) => [
                s.livePill,
                narrowHeader && s.livePillNarrow,
                { backgroundColor: syncPillBg },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={[s.liveDot, narrowHeader && s.liveDotNarrow, { backgroundColor: syncDotColor }]} />
              <Text
                style={[s.liveText, narrowHeader && s.liveTextNarrow, { color: syncTextColor }]}
                maxFontSizeMultiplier={1.1}
              >
                {syncLabel}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              hitSlop={8}
              style={({ pressed }) => [
                s.profileButton,
                narrowHeader && s.actionButtonNarrow,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => router.navigate("/profile" as never)}
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
                narrowHeader && s.actionButtonNarrow,
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
    minWidth: 0,
  },
  pickerLeftNarrow: {
    marginRight: 4,
  },
  pickerBrandCopy: {
    flex: 1,
    minWidth: 0,
  },
  pickerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  pickerBrandName: {
    fontFamily: "OpenSans",
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  pickerBrandNameNarrow: {
    fontSize: 11,
    letterSpacing: 0,
  },
  pickerRolePill: {
    backgroundColor: "#2563EB",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 0,
  },
  pickerRolePillNarrow: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  pickerRolePillText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  pickerRolePillTextNarrow: {
    fontSize: 8,
    letterSpacing: 0,
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
  brandNarrow: {
    marginRight: 4,
  },
  logoImage: {
    width: 38,
    height: 38,
    borderRadius: 8,
    marginRight: 9,
    flexShrink: 0,
  },
  logoImageNarrow: {
    width: 26,
    height: 26,
    marginRight: 4,
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  nameNarrow: {
    fontSize: 11,
    letterSpacing: 0,
  },
  badgeWms: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    flexShrink: 0,
  },
  badgeWmsNarrow: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeWmsText: {
    color: "#091E3A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  badgeWmsTextNarrow: {
    fontSize: 7,
    letterSpacing: 0,
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
  actionsNarrow: {
    gap: 4,
  },
  livePillNarrow: {
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  liveDotNarrow: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveTextNarrow: {
    fontSize: 10,
  },
  actionButtonNarrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
