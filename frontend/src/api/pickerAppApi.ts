import { apiRequest } from "./http";
import type {
  FulfillmentOrderDto,
  FulfillmentOrderItemDto,
  PickerScanResponseDto,
  PickerStatsDto,
  PackerCandidateDto,
  FulfillmentStaffProfileDto,
} from "@/types";

// In-memory cache for assigned orders and session-completed orders
let cachedAssignedOrders: FulfillmentOrderDto[] = [];
let sessionCompletedOrders: FulfillmentOrderDto[] = [];

export const pickerAppApi = {
  /** 2.1 GET /api/picker-app/orders/assigned */
  async getAssignedOrders(): Promise<FulfillmentOrderDto[]> {
    const orders = await apiRequest<FulfillmentOrderDto[]>("/api/picker-app/orders/assigned");
    cachedAssignedOrders = orders || [];
    return cachedAssignedOrders;
  },

  /** Retrieves cached order by ID or queries list */
  getCachedOrder(orderId: number): FulfillmentOrderDto | undefined {
    return cachedAssignedOrders.find((o) => o.orderId === orderId);
  },

  /** 2.2 POST /api/picker-app/orders/{id}/scan */
  async scanOrderItem(orderId: number, barcode: string): Promise<PickerScanResponseDto> {
    const res = await apiRequest<PickerScanResponseDto>(`/api/picker-app/orders/${orderId}/scan`, {
      method: "POST",
      body: JSON.stringify({ barcode: barcode.trim() }),
    });

    // If scan was successful and returns updated items, update local cached order
    if (res && res.success && res.items) {
      const order = cachedAssignedOrders.find((o) => o.orderId === orderId);
      if (order) {
        order.items = res.items;
        if (res.totalItemsPicked !== undefined && res.totalItemsPicked !== null) {
          order.totalItemsScanned = res.totalItemsPicked;
        }
      }
    }

    return res;
  },

  /** 2.3 POST /api/picker-app/orders/{id}/assign-packer */
  async assignPacker(orderId: number, packerId: number): Promise<string> {
    const res = await apiRequest<string>(`/api/picker-app/orders/${orderId}/assign-packer`, {
      method: "POST",
      body: JSON.stringify({ packerId }),
    });

    // Order has moved to PACKING. Remove from assigned cache and add to session completed.
    const idx = cachedAssignedOrders.findIndex((o) => o.orderId === orderId);
    if (idx !== -1) {
      const [order] = cachedAssignedOrders.splice(idx, 1);
      if (order) {
        order.orderStatus = "PACKING";
        order.packerId = packerId;
        order.packerAssignedAt = new Date().toISOString();
        sessionCompletedOrders.unshift(order);
      }
    }

    return typeof res === "string" ? res : "Packer assigned";
  },

  /** 2.4 GET /api/picker-app/orders/{id}/items */
  async getOrderItems(orderId: number): Promise<FulfillmentOrderItemDto[]> {
    const items = await apiRequest<FulfillmentOrderItemDto[]>(`/api/picker-app/orders/${orderId}/items`);
    // update cached order items if present
    const order = cachedAssignedOrders.find((o) => o.orderId === orderId);
    if (order && items) {
      order.items = items;
    }
    return items || [];
  },

  /** 2.5 GET /api/picker-app/stats */
  async getStats(): Promise<PickerStatsDto> {
    return apiRequest<PickerStatsDto>("/api/picker-app/stats");
  },

  /** 2.6 GET /api/picker-app/available-packers */
  async getAvailablePackers(): Promise<PackerCandidateDto[]> {
    return apiRequest<PackerCandidateDto[]>("/api/picker-app/available-packers");
  },

  /** 2.7 GET /api/picker-app/profile */
  async getProfile(): Promise<FulfillmentStaffProfileDto> {
    return apiRequest<FulfillmentStaffProfileDto>("/api/picker-app/profile");
  },

  /** 2.8 PUT /api/picker-app/profile */
  async updateProfile(patch: Partial<FulfillmentStaffProfileDto>): Promise<FulfillmentStaffProfileDto> {
    return apiRequest<FulfillmentStaffProfileDto>("/api/picker-app/profile", {
      method: "PUT",
      body: JSON.stringify(patch),
    });
  },

  /** 2.9 POST /api/picker-app/change-password */
  async changePassword(payload: { currentPassword: string; newPassword: string }): Promise<string> {
    const res = await apiRequest<string>("/api/picker-app/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return typeof res === "string" ? res : "Password updated";
  },

  /** Returns orders completed in the current shift */
  getSessionCompletedOrders(): FulfillmentOrderDto[] {
    return sessionCompletedOrders;
  },

  /** Clears session state on logout */
  clearSession(): void {
    cachedAssignedOrders = [];
    sessionCompletedOrders = [];
  },
};
