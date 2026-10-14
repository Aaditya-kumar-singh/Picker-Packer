// Stable device id for this install/session.
// Synchronously returns the cached/generated ID for immediate callers and
// persists to AsyncStorage when running in React Native / Expo.
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_STORAGE_KEY = "ybm.device.id";
let deviceId: string | null = null;
let hydrating: Promise<string> | null = null;

function generateDeviceId(): string {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceId(): string {
  if (!deviceId) {
    deviceId = generateDeviceId();
    void hydrateDeviceId();
  }
  return deviceId;
}

export async function hydrateDeviceId(): Promise<string> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const stored = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (stored && stored.trim().length > 0) {
        deviceId = stored.trim();
        return deviceId;
      }
      const next = deviceId ?? generateDeviceId();
      deviceId = next;
      await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
      return next;
    } catch {
      if (!deviceId) deviceId = generateDeviceId();
      return deviceId;
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}
