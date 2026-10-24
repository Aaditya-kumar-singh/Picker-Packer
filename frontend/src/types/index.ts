// YBM Picker & Packer — Unified REST API Types
// Derived strictly from picker-app-api.md and packer-app-api.md

export type UserRole = "PICKER" | "PACKER";

export type OrderStatus =
  | "CONFIRMED"
  | "PICKING"
  | "PACKING"
  | "PACKED"
  | "RIDER_ASSIGNED";

/** Order item representation across picker and packer REST endpoints */
export interface FulfillmentOrderItemDto {
  itemId: number;
  productId: number;
  variantId: number;
  sku: string;
  productName: string;
  variantLabel: string | null;
  orderedQty: number;
  pickedQty: number;
  packedQty: number | null;
  fullyScanned: boolean;
  barcode?: string | null;
  // Pick location fields (included in picker responses; null if not mapped)
  zone?: string | null;
  aisle?: string | null;
  rack?: string | null;
  bin?: string | null;
  shelf?: string | null;
  locationCode?: string | null;
}

/** Full order DTO returned by /orders/assigned and /orders/{id} */
export interface FulfillmentOrderDto {
  orderId: number;
  orderNumber: string;
  orderStatus: OrderStatus;
  orderDate: string;
  grandTotal: number;
  paymentMethod: string;
  warehouseId: number;
  warehouseName?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  shippingAddress?: string | null;
  fulfillmentStaffId?: number | null;
  fulfillmentStaffName?: string | null;
  fulfillmentStartedAt?: string | null;
  fulfillmentCompletedAt?: string | null;
  pickerId: number | null;
  packerId: number | null;
  packerAssignedAt: string | null;
  totalItems: number;
  totalItemsScanned: number;
  items: FulfillmentOrderItemDto[];
}

/** Response from POST /api/picker-app/orders/{id}/scan */
export interface PickerScanResponseDto {
  success: boolean;
  message: string;
  barcode: string | null;
  scannedItemName?: string | null;
  scannedQty?: number | null;
  orderedQty?: number | null;
  totalItemsPicked?: number | null;
  totalItems?: number | null;
  orderStatus?: string | null;
  orderFullyPicked?: boolean | null;
  scannedAt?: string | null;
  items?: FulfillmentOrderItemDto[] | null;
}

/** Response from POST /api/packer-app/orders/{id}/scan */
export interface PackerScanResponseDto {
  success: boolean;
  message: string;
  barcode: string | null;
  scannedItemName?: string | null;
  scannedQty?: number | null;
  orderedQty?: number | null;
  totalItemsScanned?: number | null;
  totalItems?: number | null;
  orderStatus?: "PACKING" | "PACKED" | string | null;
  orderFullyPacked?: boolean | null;
  scannedAt?: string | null;
  items?: FulfillmentOrderItemDto[] | null;
}

/** GET /api/picker-app/stats */
export interface PickerStatsDto {
  assignedOrdersCount: number;
  completedOrdersCount: number;
  totalItemsPickedToday: number;
}

/** GET /api/packer-app/stats */
export interface PackerStatsDto {
  assignedOrders: number;
  completedOrders: number;
  todayOrdersPacked: number;
  todayItemsScanned: number;
}

export interface FulfillmentHistoryDto {
  taskId: number;
  orderId: number;
  orderNumber: string;
  orderStatus: OrderStatus;
  itemId: number;
  productName: string;
  variantLabel: string | null;
  sku: string;
  barcode: string;
  scannedQty: number;
  orderedQty: number;
  taskType: "PICK" | "PACK";
  scannedAt: string;
}

export interface HistoryPageDto {
  content: FulfillmentHistoryDto[];
  totalElements: number;
  totalPages: number;
  last: boolean;
  number: number;
  size: number;
}

/** GET /api/picker-app/available-packers candidate */
export interface PackerCandidateDto {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  status: string;
  loginEnabled: boolean;
  rating: number | null;
  idCardType?: string | null;
  idCardNumber?: string | null;
  photoFilePath?: string | null;
  address?: string | null;
  warehouseId: number;
}

/** GET /api/packer-app/riders/available candidate */
export interface RiderCandidateDto {
  id: number;
  name: string;
  phone: string;
  vehicleType: string;
  status: string;
  loginEnabled: boolean;
  rating: number | null;
  warehouseId: number;
}

/** GET/PUT /api/{picker|packer}-app/profile */
export interface FulfillmentStaffProfileDto {
  staffId: number;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  rating: number | null;
  idCardType: string | null;
  idCardNumber: string | null;
  address: string | null;
  photoFilePath: string | null;
  /** Assigned warehouse identity returned by the REST profile endpoint when available. */
  warehouseId?: number | string | null;
  warehouseName?: string | null;
}

/** Raw order item from GET /api/packer-app/orders/{id}/items */
export interface RawSalesOrderItemDto {
  id: number;
  salesOrderId: number;
  productId: number;
  variantId: number;
  batchId?: number | null;
  sku: string;
  productName: string;
  variantLabel: string | null;
  hsn?: string | null;
  orderedQty: number;
  reservedQty?: number;
  pickedQty: number;
  packedQty: number;
  shippedQty?: number;
  unitPrice: number;
  discountAmount: number;
  taxPercentage: number;
  netUnitPrice: number;
  taxAmount: number;
  lineTotal: number;
  bundleId?: number | null;
  activeFlag?: boolean;
  crtBy?: number;
  updtBy?: number;
  crtDt?: string;
  updtDt?: string;
}

/** Standard API envelope */
export interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

/** Structured server error envelope */
export interface ApiErrorEnvelope {
  traceId?: string;
  error: string;
  message: string;
  status: number;
  fieldErrors?: Array<{ field: string; message: string }> | null;
  timestamp?: string;
}

/** Result type for unified handler returns */
export type ApiResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; softFailure?: boolean; fieldErrors?: Array<{ field: string; message: string }> };
