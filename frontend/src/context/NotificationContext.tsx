import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/navigation/AppProvider";
import { pickerAppApi } from "@/api/pickerAppApi";
import { packerAppApi } from "@/api/packerAppApi";
import { formatOrderDate } from "@/utils/warehouse";
import type { AppNotification } from "@/components/modals/NotificationCenterModal";

interface NotificationContextValue {
  notifications: AppNotification[];
  readIds: Record<string, boolean>;
  unreadCount: number;
  loading: boolean;
  loadNotifications: () => Promise<void>;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
}

const READ_IDS_STORAGE_KEY = "ybm.notifications.read-ids";

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { picker } = useAuth();
  const isPacker = picker?.role === "PACKER";

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  // Restore persisted read IDs from storage on mount
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(READ_IDS_STORAGE_KEY).then((raw) => {
      if (!mounted || !raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        setReadIds((prev) => ({ ...parsed, ...prev }));
      } catch {
        // ignore parse error
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const saveReadIds = useCallback((next: Record<string, boolean>) => {
    setReadIds(next);
    void AsyncStorage.setItem(READ_IDS_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!picker) return;
    setLoading(true);
    try {
      const items: AppNotification[] = [];

      if (isPacker) {
        const orders = await packerAppApi.getAssignedOrders();
        const active = orders.filter((o) => o.orderStatus !== "RIDER_ASSIGNED");

        for (const o of active.slice(0, 8)) {
          const isPacked = o.orderStatus === "PACKED";
          items.push({
            id: `packer-order-${o.orderId}-${o.orderStatus}`,
            title: isPacked
              ? `${o.orderNumber} • Ready for Rider`
              : `${o.orderNumber} • Packing in Progress`,
            body: isPacked
              ? `All items packed! Assign a delivery rider to dispatch.`
              : `${o.totalItemsScanned}/${o.totalItems} lines completed • Order date: ${formatOrderDate(o.orderDate)}`,
            timeLabel: isPacked ? "Packed" : "In Queue",
            tone: isPacked ? "ok" : "progress",
            targetRoute: `/pack/order/${o.orderId}`,
          });
        }
      } else {
        const orders = await pickerAppApi.getAssignedOrders();
        for (const o of orders.slice(0, 8)) {
          const allPicked = o.totalItems > 0 && o.totalItemsScanned >= o.totalItems;
          items.push({
            id: `picker-order-${o.orderId}-${o.orderStatus}-${o.totalItemsScanned}`,
            title: allPicked
              ? `${o.orderNumber} • Ready for Packer`
              : `${o.orderNumber} • Picking Queue`,
            body: allPicked
              ? `All items scanned. Tap to select and hand off to an available packer.`
              : `${o.totalItemsScanned}/${o.totalItems} lines picked • Total: ₹${o.grandTotal.toFixed(2)} (${o.paymentMethod})`,
            timeLabel: allPicked ? "Ready" : "Picking",
            tone: allPicked ? "ok" : "progress",
            targetRoute: `/order/${o.orderId}`,
          });
        }
      }

      setNotifications(items);
    } catch {
      // Keep existing notifications on transient error
    } finally {
      setLoading(false);
    }
  }, [picker, isPacker]);

  // Refresh order-derived notifications when the app returns to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && picker) void loadNotifications();
    });
    return () => subscription.remove();
  }, [picker?.id, loadNotifications]);

  // Load on user login / role change
  useEffect(() => {
    if (picker) {
      void loadNotifications();
    } else {
      setNotifications([]);
    }
  }, [picker?.id, picker?.role, loadNotifications]);

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = { ...prev, [id]: true };
      void AsyncStorage.setItem(READ_IDS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    const next: Record<string, boolean> = { ...readIds };
    for (const n of notifications) next[n.id] = true;
    saveReadIds(next);
  }, [notifications, readIds, saveReadIds]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds[n.id]).length,
    [notifications, readIds]
  );

  const value = useMemo(
    () => ({
      notifications,
      readIds,
      unreadCount,
      loading,
      loadNotifications,
      markAsRead,
      markAllRead,
    }),
    [
      notifications,
      readIds,
      unreadCount,
      loading,
      loadNotifications,
      markAsRead,
      markAllRead,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
