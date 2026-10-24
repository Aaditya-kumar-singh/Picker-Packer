import { apiRequest } from "./http";
import type {
  FulfillmentOrderDto,
  PackerScanResponseDto,
  PackerStatsDto,
  RiderCandidateDto,
  FulfillmentStaffProfileDto,
  RawSalesOrderItemDto,
  HistoryPageDto,
} from "@/types";

// In-memory cache for currently loaded order details. The server remains authoritative.
let cachedAssignedOrders: FulfillmentOrderDto[] = [];

export const packerAppApi = {
  /** 2.1 GET /api/packer-app/orders/assigned */
  async getAssignedOrders(): Promise<FulfillmentOrderDto[]> {
    const orders = await apiRequest<FulfillmentOrderDto[]>("/api/packer-app/orders/assigned");
    if (!Array.isArray(orders)) throw new Error("The assigned packing orders response is invalid.");
    cachedAssignedOrders = orders;
    return cachedAssignedOrders;
  },

  /** 2.2 GET /api/packer-app/orders/{id} */
  async getOrderDetail(orderId: number): Promise<FulfillmentOrderDto> {
    const order = await apiRequest<FulfillmentOrderDto>(`/api/packer-app/orders/${orderId}`);
    // Sync into local cache
    const idx = cachedAssignedOrders.findIndex((o) => o.orderId === orderId);
    if (idx !== -1) {
      cachedAssignedOrders[idx] = order;
    } else {
      cachedAssignedOrders.push(order);
    }
    return order;
  },

  /** Retrieves cached order by ID */
  getCachedOrder(orderId: number): FulfillmentOrderDto | undefined {
    return cachedAssignedOrders.find((o) => o.orderId === orderId);
  },

  /** 2.3 POST /api/packer-app/orders/{id}/scan */
  async scanOrderItem(orderId: number, barcode: string): Promise<PackerScanResponseDto> {
    const res = await apiRequest<PackerScanResponseDto>(`/api/packer-app/orders/${orderId}/scan`, {
      method: "POST",
      body: JSON.stringify({ barcode: barcode.trim() }),
    });

    // Update cached order if scan was successful
    if (res && res.success) {
      const order = cachedAssignedOrders.find((o) => o.orderId === orderId);
      if (order) {
        if (res.items) order.items = res.items;
        if (res.orderStatus) order.orderStatus = res.orderStatus as any;
        if (res.totalItemsScanned !== undefined && res.totalItemsScanned !== null) {
          order.totalItemsScanned = res.totalItemsScanned;
        }
      }
    }

    return res;
  },

  /** 2.4 POST /api/packer-app/orders/{id}/assign-rider */
  async assignRider(orderId: number, payload: { riderId: number; notes?: string }): Promise<string> {
    const res = await apiRequest<string>(`/api/packer-app/orders/${orderId}/assign-rider`, {
      method: "POST",
      body: JSON.stringify({
        riderId: payload.riderId,
        notes: payload.notes || undefined,
      }),
    });

    // Assigned-order API only returns PACKING/PACKED orders. Remove the dispatched
    // order from this active queue instead of inventing a client-side status transition.
    cachedAssignedOrders = cachedAssignedOrders.filter((order) => order.orderId !== orderId);

    return typeof res === "string" ? res : "Rider assigned";
  },

  /** 2.5 GET /api/packer-app/orders/{id}/items */
  async getOrderRawItems(orderId: number): Promise<RawSalesOrderItemDto[]> {
    return apiRequest<RawSalesOrderItemDto[]>(`/api/packer-app/orders/${orderId}/items`);
  },

  /** 2.6 GET /api/packer-app/stats */
  async getStats(): Promise<PackerStatsDto> {
    return apiRequest<PackerStatsDto>("/api/packer-app/stats");
  },

  /** 2.7 GET /api/packer-app/riders/available */
  async getAvailableRiders(): Promise<RiderCandidateDto[]> {
    return apiRequest<RiderCandidateDto[]>("/api/packer-app/riders/available");
  },

  /** 2.8 GET /api/packer-app/profile */
  async getProfile(): Promise<FulfillmentStaffProfileDto> {
    return apiRequest<FulfillmentStaffProfileDto>("/api/packer-app/profile");
  },

  /** 2.9 PUT /api/packer-app/profile */
  async updateProfile(patch: Partial<FulfillmentStaffProfileDto>): Promise<FulfillmentStaffProfileDto> {
    return apiRequest<FulfillmentStaffProfileDto>("/api/packer-app/profile", {
      method: "PUT",
      body: JSON.stringify(patch),
    });
  },

  /** 2.10 POST /api/packer-app/change-password */
  async changePassword(payload: { currentPassword: string; newPassword: string }): Promise<string> {
    const res = await apiRequest<string>("/api/packer-app/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return typeof res === "string" ? res : "Password updated";
  },

  async getHistory(page = 0, size = 20, orderId?: number): Promise<HistoryPageDto> {
    const query = `page=${page}&size=${size}${orderId === undefined ? "" : `&orderId=${orderId}`}`;
    const result = await apiRequest<HistoryPageDto>(`/api/packer-app/orders/history?${query}`);
    if (!result || !Array.isArray(result.content) || typeof result.last !== "boolean") {
      throw new Error("The packing history response is invalid.");
    }
    return result;
  },

  async getHistoryOrderCount(): Promise<number> {
    const count = await apiRequest<number>("/api/packer-app/orders/history/count");
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("The packing history count is invalid.");
    return count;
  },

  async toggleStatus(): Promise<FulfillmentStaffProfileDto> {
    return apiRequest<FulfillmentStaffProfileDto>("/api/packer-app/profile/status", { method: "PUT" });
  },

  /** Clears cached order details on logout. Persisted workflow state stays on the server. */
  clearSession(): void {
    cachedAssignedOrders = [];
  },
};
