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
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useClientConfig } from '../../hooks/useClientConfig';
import { clientLogout } from '../logic/logout';
import { beginPasskeyUnlock } from './oidc';
import { LockRecord, lockStorageKey, readLockRecord, writeLockRecord } from './storage';

type LockContextValue = {
  locked: boolean;
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

type Props = { children: ReactNode };

export function KiconnectLockProvider({ children }: Props): JSX.Element {
  const mx = useMatrixClient();
  const config = useClientConfig();
  const userId = mx.getSafeUserId();
  const timeoutMs = Math.max(1, config.kiconnectLock?.timeoutMinutes ?? 5) * 60 * 1000;
  const initialRecord = useMemo(() => {
    const record = readLockRecord(userId);
    if (!record.locked && Date.now() - record.lastActivity >= timeoutMs) {
      const expiredRecord = { ...record, locked: true };
      writeLockRecord(userId, expiredRecord);
      return expiredRecord;
    }
    return record;
  }, [timeoutMs, userId]);
  const [locked, setLocked] = useState(initialRecord.locked);
  const [privacyShield, setPrivacyShield] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string>();
  const recordRef = useRef<LockRecord>(initialRecord);
  const lastWriteRef = useRef(initialRecord.lastActivity);
  const channelRef = useRef<BroadcastChannel>();
  const logoutInProgressRef = useRef(false);

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
    const record = { ...recordRef.current, locked: true };
    persist(record, true);
    setLocked(true);
    setPrivacyShield(true);
  }, [persist]);

  const evaluateElapsedTime = useCallback(() => {
    const record = recordRef.current;
    if (record.locked || Date.now() - record.lastActivity >= timeoutMs) {
      lock();
      return true;
    }
    return false;
  }, [lock, timeoutMs]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent<LockRecord>) => {
        const record = event.data;
        if (!record || typeof record.locked !== 'boolean') return;
        recordRef.current = record;
        writeLockRecord(userId, record);
        setLocked(record.locked);
        setPrivacyShield(record.locked);
      };
      return () => {
        channel.close();
        channelRef.current = undefined;
      };
    }
    return undefined;
  }, [userId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== lockStorageKey(userId) || !event.newValue) return;
      const record = readLockRecord(userId);
      recordRef.current = record;
      setLocked(record.locked);
      setPrivacyShield(record.locked);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

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
      await beginPasskeyUnlock(config);
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
      await clientLogout(mx);
    } catch (reason) {
      logoutInProgressRef.current = false;
      setError(reason instanceof Error ? reason.message : 'Vollständige Abmeldung fehlgeschlagen.');
      setLoggingOut(false);
    }
  };

  const contextValue = useMemo(() => ({ locked, lock }), [lock, locked]);

  return (
    <LockContext.Provider value={contextValue}>
      {children}
      {(locked || privacyShield) && (
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
                src="/kiconnect-icon-v5-512.png"
                alt="KI-Connect"
                style={{ width: 112, height: 112, objectFit: 'contain' }}
              />
              <h1 style={{ margin: '16px 0 8px', fontSize: 28 }}>KI-Connect ist gesperrt</h1>
              <p style={{ margin: '0 0 24px', color: '#527079' }}>
                Entsperren Sie die App sicher mit Ihrem Passkey.
              </p>
              <button
                type="button"
                onClick={unlock}
                disabled={unlocking || loggingOut}
                style={primaryButtonStyle}
              >
                {unlocking ? 'Passkey wird geöffnet …' : 'Client entsperren'}
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
