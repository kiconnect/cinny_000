export type LockRecord = {
  locked: boolean;
  lastActivity: number;
  backgroundAt?: number;
};

export type UnlockTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  returnUrl: string;
  createdAt: number;
  popup: boolean;
};

const LOCK_PREFIX = 'kiconnect.lock.v1.';
export const UNLOCK_TRANSACTION_KEY = 'kiconnect.unlock.transaction.v1';

export const lockStorageKey = (userId: string): string =>
  `${LOCK_PREFIX}${encodeURIComponent(userId)}`;

export function readLockRecord(userId: string): LockRecord {
  try {
    const value = localStorage.getItem(lockStorageKey(userId));
    if (value) {
      const parsed = JSON.parse(value) as Partial<LockRecord>;
      if (typeof parsed.locked === 'boolean' && typeof parsed.lastActivity === 'number') {
        return {
          locked: parsed.locked,
          lastActivity: parsed.lastActivity,
          backgroundAt: typeof parsed.backgroundAt === 'number' ? parsed.backgroundAt : undefined,
        };
      }
    }
  } catch {
    // A missing/corrupt record must never unlock an explicitly locked record.
  }

  return { locked: false, lastActivity: Date.now() };
}

export function writeLockRecord(userId: string, record: LockRecord): void {
  localStorage.setItem(lockStorageKey(userId), JSON.stringify(record));
}

export function readUnlockTransaction(): UnlockTransaction | undefined {
  try {
    const value = localStorage.getItem(UNLOCK_TRANSACTION_KEY);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as UnlockTransaction;
    if (
      typeof parsed.state === 'string' &&
      typeof parsed.nonce === 'string' &&
      typeof parsed.codeVerifier === 'string' &&
      typeof parsed.redirectUri === 'string' &&
      typeof parsed.returnUrl === 'string' &&
      typeof parsed.createdAt === 'number' &&
      typeof parsed.popup === 'boolean'
    ) {
      return parsed;
    }
  } catch {
    // Ignore invalid transient state; the callback will remain locked.
  }
  return undefined;
}

export function writeUnlockTransaction(transaction: UnlockTransaction): void {
  localStorage.setItem(UNLOCK_TRANSACTION_KEY, JSON.stringify(transaction));
}

export function clearUnlockTransaction(): void {
  localStorage.removeItem(UNLOCK_TRANSACTION_KEY);
}
