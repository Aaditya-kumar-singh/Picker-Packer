import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  timeLabel: string;
  tone: "urgent" | "progress" | "info" | "ok";
  targetRoute: string;
}

interface NotificationCenterModalProps {
  visible: boolean;
  isPacker: boolean;
  topOffset: number;
  notifications: AppNotification[];
  readIds: Record<string, boolean>;
  unreadCount: number;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  onSelectNotification: (item: AppNotification) => void;
  onViewAllOrders: () => void;
}

export function NotificationCenterModal({
  visible,
  isPacker,
  topOffset,
  notifications,
  readIds,
  unreadCount,
  loading,
  onClose,
  onRefresh,
  onMarkAllRead,
  onSelectNotification,
  onViewAllOrders,
}: NotificationCenterModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[s.notifSheet, { marginTop: topOffset }]}
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
                  onPress={onMarkAllRead}
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
                onPress={onRefresh}
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
                onPress={onClose}
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
                  {loading ? "Checking alerts…" : "All caught up!"}
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
                    onPress={() => onSelectNotification(item)}
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
            onPress={onViewAllOrders}
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
}

const s = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    paddingHorizontal: 12,
  },
  notifSheet: {
    width: "100%",
    maxHeight: "76%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  notifHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#F8FAFC",
  },
  notifTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 1,
  },
  notifTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  unreadCountPill: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  unreadCountText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0D6EFD",
  },
  notifHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  markReadBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  markReadText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0D6EFD",
  },
  iconCircleBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  notifList: {
    maxHeight: 380,
  },
  notifListContent: {
    paddingVertical: 4,
  },
  emptyNotifBox: {
    paddingVertical: 34,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyNotifIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyNotifTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptyNotifSub: {
    fontSize: 12.5,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
  },
  notifItem: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },
  notifItemUnread: {
    backgroundColor: "#F8FAFF",
  },
  notifIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: 11,
  },
  notifCopy: {
    flex: 1,
    marginRight: 8,
  },
  notifItemTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  notifItemTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0F172A",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0D6EFD",
    flexShrink: 0,
  },
  notifItemBody: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
    lineHeight: 16,
  },
  notifTimeLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748B",
    marginTop: 4,
  },
  viewAllOrdersFooter: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: "#EFF6FF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  viewAllOrdersFooterText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0D6EFD",
  },
});
