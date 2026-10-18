const PREFIX = 'kiconnect.personal-device.v1.';
export const PERSONAL_DEVICE_CHANGED = 'kiconnect-personal-device-changed';
export const personalDeviceKey = (userId: string): string => `${PREFIX}${encodeURIComponent(userId)}`;

export function readPersonalDevice(userId: string): boolean {
  try {
    return Boolean(userId && userId !== 'unknown' && localStorage.getItem(personalDeviceKey(userId)) === 'true');
  } catch {
    return false;
  }
}

export function writePersonalDevice(userId: string, enabled: boolean): void {
  if (!userId || userId === 'unknown') throw new Error('Kein angemeldeter Benutzer.');
  if (enabled) localStorage.setItem(personalDeviceKey(userId), 'true');
  else localStorage.removeItem(personalDeviceKey(userId));
  window.dispatchEvent(new Event(PERSONAL_DEVICE_CHANGED));
}
