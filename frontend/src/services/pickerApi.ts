// Repository-facing API contract. Mirrors OpenAPI request/response shapes.
// UI depends ONLY on this interface. Phase 1 impl = MockPickerApi.
// Future: HttpPickerApi with zero screen changes.
import type {
  ApiError,
  AuthResponse,
  EvidenceItem,
  EvidenceUploadGrant,
  LineException,
  Order,
  OrderLine,
  Result,
  WmsMode,
} from "@/types";

export interface OtpRequestResponse {
  expiresInSeconds: number;
  maskedContact: string;
}

export interface DashboardData {
  pickerName: string;
  pickerCode: string;
  warehouseName: string;
  pendingCount: number;
  activeOrder: Order | null;
  completedToday: number;
  online: boolean;
  metrics: import("@/api/client").PickerMetrics;
}

export interface IPickerApi {
  requestOtp(pickerId: string): Promise<Result<OtpRequestResponse>>;
  verifyOtp(pickerId: string, otp: string, deviceId: string): Promise<Result<AuthResponse>>;
  logout(): Promise<void>;
  getDashboard(): Promise<Result<DashboardData>>;
  getOrders(): Promise<Result<Order[]>>;
  getOrder(id: string): Promise<Result<Order>>;
  // PENDING → ASSIGNED (claim). Documented as POST /orders/{id}/start.
  // OpenAPI/sequence docs collapse claim+begin; the mock preserves the
  // documented ASSIGNED step internally (deviceId binds the claim).
  startOrder(
    id: string,
    idemKey: string,
    deviceId?: string,
    expectedVersion?: number
  ): Promise<Result<Order>>;
  // ASSIGNED → IN_PROGRESS (device confirmed). Same picker + same device only.
  beginPicking(
    id: string,
    deviceId: string,
    idemKey: string,
    expectedVersion?: number
  ): Promise<Result<Order>>;
  // Any non-terminal → CANCELLED (WMS signal / supervisor override seam).
  cancelOrder(id: string, reason?: string): Promise<Result<Order>>;
  // PENDING → SKIPPED, SUPERVISOR role only.
  skipLine(lineId: string, actorRole: string): Promise<Result<OrderLine>>;
  validateLocation(lineId: string, scanValue: string): Promise<Result<OrderLine>>;
  validateSku(lineId: string, scanValue: string): Promise<Result<OrderLine>>;
  pickQuantity(lineId: string, qty: number, uom: string, idemKey: string): Promise<Result<OrderLine>>;
  createException(
    lineId: string,
    type: LineException["type"],
    reasonCode: string,
    qty: number | null,
    note: string | null,
    idemKey: string,
    evidenceKeys?: string[]
  ): Promise<Result<LineException>>;
  completeOrder(id: string, idemKey: string, expectedVersion?: number): Promise<Result<Order>>;
  // Evidence lifecycle (online only — bytes cannot queue offline).
  // Flow: createException → grantEvidenceUpload → uploadEvidenceBytes (PUT)
  // → completeEvidenceUpload. listExceptionEvidence reads metadata.
  grantEvidenceUpload(
    exceptionId: string,
    fileName: string,
    mimeType: string,
    fileSizeBytes?: number
  ): Promise<Result<EvidenceUploadGrant>>;
  uploadEvidenceBytes(
    uploadUrl: string,
    bytes: Uint8Array,
    mimeType: string
  ): Promise<Result<{ objectKey: string }>>;
  completeEvidenceUpload(exceptionId: string, evidenceId: string): Promise<Result<EvidenceItem>>;
  listExceptionEvidence(exceptionId: string): Promise<Result<EvidenceItem[]>>;
  // POST /auth/token/refresh (OpenAPI): rotate mock tokens.
  refreshToken(refreshToken: string): Promise<Result<AuthResponse>>;
  setWmsMode(mode: WmsMode): void;
  getWmsMode(): WmsMode;
  simulateTakenByOther(orderId: string, taken: boolean): void;
  simulateSupervisor(on: boolean): void;
}

export type { ApiError };
