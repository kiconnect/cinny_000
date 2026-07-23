import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ClientEvent, createClient, MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { useClientConfig } from '../../hooks/useClientConfig';
import { useSyncState } from '../../hooks/useSyncState';
import { getFallbackSession } from '../../state/sessions';
import {
  detectAccountType,
  KiconnectAccountType,
  readAccountType,
  writeAccountType,
} from '../logic/accountType';
import { clientLogout } from '../logic/logout';
import {
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  KICONNECT_PREFERENCES_EVENT_TYPE,
  parseIdleTimeoutMinutes,
  readIdleTimeoutMinutes,
  writeIdleTimeoutMinutes,
} from '../logic/idlePreference';
import { beginPasskeyUnlock, preparePasskeyUnlock } from './oidc';
import {
  clearUnlockTransaction,
  LockRecord,
  lockStorageKey,
  readLockRecord,
  readUnlockTransaction,
  UNLOCK_ID_TOKEN_KEY,
  writeLockRecord,
} from './storage';

type LockContextValue = {
  locked: boolean;
  canLock: boolean;
  accountType: KiconnectAccountType;
  idleTimeoutMinutes: number;
  setIdleTimeoutMinutes: (minutes: number) => Promise<void>;
  lock: () => void;
};

const LockContext = createContext<LockContextValue | undefined>(undefined);
const CHANNEL_NAME = 'kiconnect-lock-v1';
const ACTIVITY_WRITE_INTERVAL = 5000;

const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 52,
  border: 0,
  borderRadius: 14,
  background: '#1e7f93',
  color: '#fff',
  fontSize: 17,
  fontWeight: 700,
  cursor: 'pointer',
  marginBottom: 12,
};

const logoutButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  border: '1px solid #922536',
  background: '#fff',
  color: '#922536',
};

export const useKiconnectLock = (): LockContextValue => {
  const value = useContext(LockContext);
  if (!value) throw new Error('useKiconnectLock must be used inside KiconnectLockProvider');
  return value;
};

type Props = { children: ReactNode; mx?: MatrixClient };

export function KiconnectLockProvider({ children, mx }: Props): JSX.Element {
  const config = useClientConfig();
  const fallbackSession = getFallbackSession();
  const userId = mx?.getUserId() ?? fallbackSession?.userId ?? 'unknown';
  const configuredDefault = parseIdleTimeoutMinutes(config.kiconnectLock?.timeoutMinutes);
  const defaultIdleTimeoutMinutes = configuredDefault ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  const [idleTimeoutMinutes, setIdleTimeoutMinutesState] = useState(() =>
    readIdleTimeoutMinutes(userId, defaultIdleTimeoutMinutes)
  );
  const [accountType, setAccountType] = useState<KiconnectAccountType>(() =>
    readAccountType(userId)
  );
  const isTeam = accountType === 'team';
  const timeoutMs = idleTimeoutMinutes * 60 * 1000;
  const initialRecord = useMemo(() => {
    const record = readLockRecord(userId);
    if (readAccountType(userId) === 'team') {
      const unlockedRecord = { locked: false, lastActivity: Date.now() };
      writeLockRecord(userId, unlockedRecord);
      return unlockedRecord;
    }
    if (!record.locked && Date.now() - record.lastActivity >= timeoutMs) {
      const expiredRecord = { ...record, locked: true };
      writeLockRecord(userId, expiredRecord);
      return expiredRecord;
    }
    return record;
  }, [timeoutMs, userId]);
  const [locked, setLocked] = useState(initialRecord.locked);
  const [privacyShield, setPrivacyShield] = useState(false);
  const [unlocking, setUnlocking] = useState(() => {
    const transaction = readUnlockTransaction();
    return Boolean(transaction && Date.now() - transaction.createdAt < 10 * 60 * 1000);
  });
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string>();
  const recordRef = useRef<LockRecord>(initialRecord);
  const lastWriteRef = useRef(initialRecord.lastActivity);
  const channelRef = useRef<BroadcastChannel>();
  const logoutInProgressRef = useRef(false);

  useEffect(() => {
    if (!isTeam && locked) preparePasskeyUnlock(config);
  }, [config, isTeam, locked]);

  const applyIdleTimeout = useCallback(
    (minutes: number) => {
      writeIdleTimeoutMinutes(userId, minutes);
      setIdleTimeoutMinutesState(minutes);
    },
    [userId]
  );

  const readServerIdleTimeout = useCallback(() => {
    if (!mx) return;
    const content = mx.getAccountData(KICONNECT_PREFERENCES_EVENT_TYPE as any)?.getContent();
    const minutes = parseIdleTimeoutMinutes(content?.idle_timeout_minutes);
    if (minutes !== undefined) applyIdleTimeout(minutes);
  }, [applyIdleTimeout, mx]);

  useSyncState(
    mx,
    useCallback(
      (state) => {
        if (!mx || (state !== 'PREPARED' && state !== 'SYNCING')) return;
        const detected = detectAccountType(mx);
        writeAccountType(userId, detected);
        setAccountType(detected);
        readServerIdleTimeout();
      },
      [mx, readServerIdleTimeout, userId]
    )
  );

  useEffect(() => {
    if (!mx) return undefined;
    const onAccountData = (event: MatrixEvent) => {
      if (event.getType() !== KICONNECT_PREFERENCES_EVENT_TYPE) return;
      const minutes = parseIdleTimeoutMinutes(event.getContent()?.idle_timeout_minutes);
      if (minutes !== undefined) applyIdleTimeout(minutes);
    };
    mx.on(ClientEvent.AccountData, onAccountData);
    return () => mx.removeListener(ClientEvent.AccountData, onAccountData);
  }, [applyIdleTimeout, mx]);

  useEffect(() => {
    document.getElementById('kiconnect-early-lock')?.remove();
    setAccountType(readAccountType(userId));
    setIdleTimeoutMinutesState(readIdleTimeoutMinutes(userId, defaultIdleTimeoutMinutes));
    const current = readLockRecord(userId);
    recordRef.current = current;
    setLocked(current.locked);
    setPrivacyShield(current.locked);
  }, [defaultIdleTimeoutMinutes, userId]);

  const setIdleTimeoutMinutes = useCallback(
    async (minutes: number) => {
      const validMinutes = parseIdleTimeoutMinutes(minutes);
      if (validMinutes === undefined) {
        throw new Error('Bitte eine ganze Zahl zwischen 1 und 120 eingeben.');
      }
      if (!mx) throw new Error('Die Einstellung kann derzeit nicht gespeichert werden.');
      const existing =
        mx.getAccountData(KICONNECT_PREFERENCES_EVENT_TYPE as any)?.getContent() ?? {};
      await mx.setAccountData(
        KICONNECT_PREFERENCES_EVENT_TYPE as any,
        {
          ...existing,
          idle_timeout_minutes: validMinutes,
        } as any
      );
      applyIdleTimeout(validMinutes);
    },
    [applyIdleTimeout, mx]
  );

  useEffect(() => {
    if (!isTeam) return;
    const unlockedRecord = { locked: false, lastActivity: Date.now() };
    recordRef.current = unlockedRecord;
    lastWriteRef.current = unlockedRecord.lastActivity;
    writeLockRecord(userId, unlockedRecord);
    setLocked(false);
    setPrivacyShield(false);
    setUnlocking(false);
  }, [isTeam, userId]);

  const persist = useCallback(
    (record: LockRecord, broadcast = false) => {
      if (logoutInProgressRef.current) return;
      recordRef.current = record;
      writeLockRecord(userId, record);
      if (broadcast) channelRef.current?.postMessage(record);
    },
    [userId]
  );

  const lock = useCallback(() => {
    if (isTeam) return;
    const record = { ...recordRef.current, locked: true };
    persist(record, true);
    setLocked(true);
    setPrivacyShield(true);
  }, [isTeam, persist]);

  const evaluateElapsedTime = useCallback(() => {
    if (isTeam) {
      setPrivacyShield(false);
      return false;
    }
    const record = recordRef.current;
    if (record.locked || Date.now() - record.lastActivity >= timeoutMs) {
      lock();
      return true;
    }
    return false;
  }, [isTeam, lock, timeoutMs]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent<LockRecord & { idToken?: string }>) => {
        const record = event.data;
        if (!record || typeof record.locked !== 'boolean') return;
        if (typeof record.idToken === 'string') {
          localStorage.setItem(UNLOCK_ID_TOKEN_KEY, record.idToken);
        }
        const effectiveRecord = isTeam ? { locked: false, lastActivity: Date.now() } : record;
        recordRef.current = effectiveRecord;
        writeLockRecord(userId, effectiveRecord);
        setLocked(effectiveRecord.locked);
        setPrivacyShield(effectiveRecord.locked);
        if (!record.locked) {
          clearUnlockTransaction();
          setUnlocking(false);
        }
      };
      return () => {
        channel.close();
        channelRef.current = undefined;
      };
    }
    return undefined;
  }, [isTeam, userId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== 'kiconnect-unlock-success'
      ) {
        return;
      }
      const messageRecord = event.data?.record as Partial<LockRecord> | undefined;
      const record: LockRecord =
        messageRecord?.locked === false && typeof messageRecord.lastActivity === 'number'
          ? { locked: false, lastActivity: messageRecord.lastActivity }
          : { locked: false, lastActivity: Date.now() };
      if (typeof event.data?.idToken === 'string') {
        localStorage.setItem(UNLOCK_ID_TOKEN_KEY, event.data.idToken);
      }
      recordRef.current = record;
      writeLockRecord(userId, record);
      clearUnlockTransaction();
      setLocked(record.locked);
      setPrivacyShield(record.locked);
      setUnlocking(false);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [userId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== lockStorageKey(userId) || !event.newValue) return;
      const record = readLockRecord(userId);
      if (isTeam) return;
      recordRef.current = record;
      setLocked(record.locked);
      setPrivacyShield(record.locked);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [isTeam, userId]);

  useEffect(() => {
    evaluateElapsedTime();
    const timer = window.setInterval(evaluateElapsedTime, 15000);
    return () => window.clearInterval(timer);
  }, [evaluateElapsedTime]);

  useEffect(() => {
    const activity = () => {
      if (recordRef.current.locked || document.visibilityState !== 'visible') return;
      const now = Date.now();
      recordRef.current = { locked: false, lastActivity: now };
      if (now - lastWriteRef.current >= ACTIVITY_WRITE_INTERVAL) {
        lastWriteRef.current = now;
        persist(recordRef.current, false);
      }
    };
    const options = { capture: true, passive: true };
    window.addEventListener('pointerdown', activity, options);
    window.addEventListener('touchstart', activity, options);
    window.addEventListener('keydown', activity, true);
    window.addEventListener('focus', activity, true);
    return () => {
      window.removeEventListener('pointerdown', activity, true);
      window.removeEventListener('touchstart', activity, true);
      window.removeEventListener('keydown', activity, true);
      window.removeEventListener('focus', activity, true);
    };
  }, [persist]);

  useEffect(() => {
    const hide = () => {
      setPrivacyShield(true);
      const now = Date.now();
      const record = recordRef.current.locked
        ? { ...recordRef.current, backgroundAt: now }
        : { locked: false, lastActivity: now, backgroundAt: now };
      lastWriteRef.current = now;
      persist(record, false);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        hide();
      } else if (!evaluateElapsedTime() && !recordRef.current.locked) {
        setPrivacyShield(false);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibility);
    };
  }, [evaluateElapsedTime, persist]);

  const unlock = async () => {
    if (unlocking) return;
    setUnlocking(true);
    setError(undefined);
    try {
      const popup = await beginPasskeyUnlock(config);
      if (popup) {
        const popupWatcher = window.setInterval(() => {
          if (!popup.closed) return;
          window.clearInterval(popupWatcher);
          if (recordRef.current.locked) {
            setUnlocking(false);
            setError('Die Entsperrung wurde abgebrochen.');
          }
        }, 400);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Entsperren fehlgeschlagen.');
      setUnlocking(false);
    }
  };

  const logout = async () => {
    if (loggingOut) return;
    logoutInProgressRef.current = true;
    setLoggingOut(true);
    setError(undefined);
    try {
      const logoutClient =
        mx ??
        (fallbackSession
          ? createClient({
              baseUrl: fallbackSession.baseUrl,
              accessToken: fallbackSession.accessToken,
              userId: fallbackSession.userId,
              deviceId: fallbackSession.deviceId,
            })
          : undefined);
      if (!logoutClient) throw new Error('Die lokale Sitzung ist nicht mehr vorhanden.');
      await clientLogout(logoutClient);
    } catch (reason) {
      logoutInProgressRef.current = false;
      setError(reason instanceof Error ? reason.message : 'Vollständige Abmeldung fehlgeschlagen.');
      setLoggingOut(false);
    }
  };

  const contextValue = useMemo(
    () => ({
      locked: isTeam ? false : locked,
      canLock: !isTeam,
      accountType,
      idleTimeoutMinutes,
      setIdleTimeoutMinutes,
      lock,
    }),
    [accountType, idleTimeoutMinutes, isTeam, lock, locked, setIdleTimeoutMinutes]
  );

  return (
    <LockContext.Provider value={contextValue}>
      {children}
      {!isTeam && (locked || privacyShield) && (
        <div
          role={locked ? 'dialog' : 'presentation'}
          aria-modal={locked ? 'true' : undefined}
          aria-label={locked ? 'KI-Connect ist gesperrt' : undefined}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483647,
            display: 'grid',
            placeItems: 'center',
            background: '#f7fafb',
            color: '#16343b',
            padding: 24,
          }}
        >
          {locked && (
            <section style={{ width: 'min(100%, 420px)', textAlign: 'center' }}>
              <img
                src="/kiconnect-lock-logo.png"
                alt="KI-Connect"
                style={{ width: 112, height: 112, objectFit: 'contain' }}
              />
              <h1 style={{ margin: '16px 0 8px', fontSize: 28 }}>
                {unlocking ? 'Sichere Anmeldung wird geprüft …' : 'KI-Connect ist gesperrt'}
              </h1>
              <p style={{ margin: '0 0 24px', color: '#527079' }}>
                {unlocking
                  ? 'Nach erfolgreicher Prüfung wird KI connect geladen.'
                  : 'Entsperren Sie die App sicher mit Ihrem Passkey.'}
              </p>
              <button
                type="button"
                onClick={unlock}
                disabled={unlocking || loggingOut}
                style={primaryButtonStyle}
              >
                {unlocking ? 'Sichere Anmeldung wurde geöffnet …' : 'Client entsperren'}
              </button>
              <button
                type="button"
                onClick={logout}
                disabled={unlocking || loggingOut}
                style={logoutButtonStyle}
              >
                {loggingOut ? 'Abmeldung läuft …' : 'Vollständig abmelden'}
              </button>
              {error && <p style={{ color: '#922536', fontWeight: 600 }}>{error}</p>}
            </section>
          )}
        </div>
      )}
    </LockContext.Provider>
  );
}
