export const KICONNECT_PREFERENCES_EVENT_TYPE = 'io.kiconnect.preferences';
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 5;
export const MIN_IDLE_TIMEOUT_MINUTES = 0;
export const MAX_IDLE_TIMEOUT_MINUTES = 120;

const storageKey = (userId: string): string =>
  `kiconnect.idle-timeout.v1.${encodeURIComponent(userId)}`;

export const parseIdleTimeoutMinutes = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  if (value < MIN_IDLE_TIMEOUT_MINUTES || value > MAX_IDLE_TIMEOUT_MINUTES) return undefined;
  return value;
};

export const readIdleTimeoutMinutes = (userId: string, fallback: number): number => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw === null) return fallback;
    const stored = Number(raw);
    return parseIdleTimeoutMinutes(stored) ?? fallback;
  } catch {
    return fallback;
  }
};

export const writeIdleTimeoutMinutes = (userId: string, minutes: number): void => {
  localStorage.setItem(storageKey(userId), String(minutes));
};
