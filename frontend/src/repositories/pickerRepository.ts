const IS_EXPO_RUNTIME = typeof navigator !== "undefined" && (navigator as { product?: string }).product === "ReactNative";
import { supabasePickerApi } from "@/services/supabasePickerApi";
import type { OfflineFirstPickerApi } from "@/sync/offlineApi";
import type { IPickerApi } from "@/services/pickerApi";
import type { SyncRuntime } from "@/sync/runtime";

export { getDeviceId } from "./deviceId";

class PickerRepository implements IPickerApi {
  private offline: OfflineFirstPickerApi | null = null;
  private offlineInit: Promise<SyncRuntime> | null = null;

  private api(): Promise<IPickerApi> {
    if (!IS_EXPO_RUNTIME) return Promise.resolve(supabasePickerApi);
    if (this.offline) return Promise.resolve(this.offline);
    if (!this.offlineInit) {
      this.offlineInit = import("@/sync/setup").then(m =>
        m.getSyncRuntime().then(r => {
          this.offline = r.api;
          return r;
        })
      );
    }
    return this.offlineInit.then(r => r.api);
  }

  requestOtp = async (p: string) => (await this.api()).requestOtp(p);
  verifyOtp = async (p: string, o: string, d: string) => (await this.api()).verifyOtp(p, o, d);
  logout = async () => (await this.api()).logout();
  getDashboard = async () => (await this.api()).getDashboard();
  getOrders = async () => (await this.api()).getOrders();
  getOrder = async (id: string) => (await this.api()).getOrder(id);
  startOrder = async (id: string, k: string, deviceId?: string, expectedVersion?: number) => (await this.api()).startOrder(id, k, deviceId, expectedVersion);
  beginPicking = async (id: string, deviceId: string, k: string, expectedVersion?: number) => (await this.api()).beginPicking(id, deviceId, k, expectedVersion);
  cancelOrder = async (id: string, reason?: string) => (await this.api()).cancelOrder(id, reason);
  skipLine = async (lineId: string, actorRole: string) => (await this.api()).skipLine(lineId, actorRole);
  validateLocation = async (l: string, s: string) => (await this.api()).validateLocation(l, s);
  validateSku = async (l: string, s: string) => (await this.api()).validateSku(l, s);
  pickQuantity = async (l: string, q: number, u: string, k: string) => (await this.api()).pickQuantity(l, q, u, k);
  createException = async (l: string, t: Parameters<IPickerApi["createException"]>[1], r: string, q: number | null, n: string | null, k: string, e?: string[]) =>
    (await this.api()).createException(l, t, r, q, n, k, e);
  completeOrder = async (id: string, k: string, expectedVersion?: number) => (await this.api()).completeOrder(id, k, expectedVersion);
  grantEvidenceUpload = async (e: string, f: string, m: string, s?: number) => (await this.api()).grantEvidenceUpload(e, f, m, s);
  uploadEvidenceBytes = async (u: string, b: Uint8Array, m: string) => (await this.api()).uploadEvidenceBytes(u, b, m);
  completeEvidenceUpload = async (e: string, v: string) => (await this.api()).completeEvidenceUpload(e, v);
  listExceptionEvidence = async (e: string) => (await this.api()).listExceptionEvidence(e);
  refreshToken = async (t: string) => (await this.api()).refreshToken(t);
  setWmsMode = (m: Parameters<IPickerApi["setWmsMode"]>[0]) => void this.api().then(a => a.setWmsMode(m));
  getWmsMode = (): ReturnType<IPickerApi["getWmsMode"]> => supabasePickerApi.getWmsMode();
  simulateTakenByOther = (id: string, t: boolean) => void this.api().then(a => a.simulateTakenByOther(id, t));
  simulateSupervisor = (on: boolean) => void this.api().then(a => a.simulateSupervisor(on));
}

export const pickerRepository = new PickerRepository();
export function newIdemKey(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
