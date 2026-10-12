// YBM Picker App — Phase 1 shared types.
// Mirrors OpenAPI contract + state machines. No backend types here.

export type OrderStatus =
  | "PENDING"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type LineStatus =
  | "PENDING"
  | "LOCATION_VALIDATED"
  | "SKU_VALIDATED"
  | "PICKED"
  | "EXCEPTION"
  | "SKIPPED";

export type ExceptionType =
  | "SHORT_PICK"
  | "DAMAGED"
  | "WRONG_ITEM"
  | "LOCATION_EMPTY"
  | "EXPIRED"
  | "OTHER";

export type WmsMode = "WMS_SUCCESS" | "WMS_PENDING" | "WMS_FAILURE";
export type WmsStatus = "NONE" | "PENDING" | "SYNCED" | "FAILED";

export interface PickerProfile {
  id: string;
  pickerCode: string;
  name: string;
  role: "PICKER" | "LEAD_PICKER" | "SUPERVISOR" | "PACKER";
  warehouseId: string;
  warehouseName: string;
}

export interface OrderLine {
  id: string;
  lineNo: number;
  skuCode: string;
  skuName: string;
  productSpecs: string;
  productImageUrl?: string | null;
  skuBarcode: string;
  locationCode: string;
  locationBarcode: string;
  requiredQty: number;
  pickedQty: number;
  uom: string;
  status: LineStatus;
}

export interface Order {
  id: string;
  externalId: string; // e.g. YBM-000234
  status: OrderStatus;
  priority: number;
  slaDueAt: string;
  totalLines: number;
  version: number;
  assignedPickerCode: string | null;
  // Documented lifecycle side effects (State_Machine.md guards table).
  // startOrder (claim) sets assignedDeviceId/assignedAt;
  // beginPicking (device confirmed) sets startedAt.
  assignedDeviceId: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  cancelledAt: string | null;
  lines: OrderLine[];
  wmsStatus: WmsStatus;
  completedAt: string | null;
}

export interface LineException {
  id: string;
  lineId: string;
  type: ExceptionType;
  reasonCode: string;
  qty: number | null;
  note: string | null;
  createdAt: string;
}

// Evidence metadata (list/detail shapes). Object keys are server-generated
// references, never credentials; bytes upload via short-lived signed URLs.
export interface EvidenceItem {
  id: string;
  objectKey: string;
  mimeType: string;
  fileSizeBytes: number | null;
  status: string;
  uploadAttempts: number;
  lastError: string | null;
  createdAt: string;
  uploadedAt: string | null;
}

export interface EvidenceUploadGrant {
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
}

export interface ApiError {
  error: string;
  message: string;
  details: Array<{ field: string; message: string; code: string }>;
  requestId: string;
  timestamp: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; apiError: ApiError };

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  picker: PickerProfile;
}
