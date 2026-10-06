// Stable device id for this install/session (mock + HTTP transports share it).
let deviceId: string | null = null;
export function getDeviceId(): string {
  if (!deviceId) deviceId = `dev-${Math.random().toString(36).slice(2, 10)}`;
  return deviceId;
}
