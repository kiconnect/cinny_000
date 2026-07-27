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
import { clientLogout } from '../logic/logout';
import { useKiconnectLock } from '../lock/LockProvider';

type IdleUserState = 'active' | 'idle';
type IdleScreenState = 'locked' | 'unlocked';

type IdleDetectorInstance = EventTarget & {
  userState: IdleUserState | null;
  screenState: IdleScreenState | null;
  start: (options: { threshold: number; signal: AbortSignal }) => Promise<void>;
};

type IdleDetectorConstructor = {
  new (): IdleDetectorInstance;
  requestPermission: () => Promise<PermissionState>;
};

export type TeamIdleStatus =
  | 'not-team'
  | 'disabled'
  | 'unsupported'
  | 'permission-required'
  | 'denied'
  | 'starting'
  | 'active'
  | 'idle'
  | 'screen-locked'
  | 'logging-out'
  | 'error';

type TeamIdleContextValue = {
  status: TeamIdleStatus;
  changedAt?: number;
  requestPermission: () => Promise<void>;
};

const TeamIdleContext = createContext<TeamIdleContextValue | undefined>(undefined);
const getIdleDetector = (): IdleDetectorConstructor | undefined =>
  (window as typeof window & { IdleDetector?: IdleDetectorConstructor }).IdleDetector;

export const useTeamIdleMonitor = (): TeamIdleContextValue => {
  const context = useContext(TeamIdleContext);
  if (!context) throw new Error('useTeamIdleMonitor must be used inside TeamIdleMonitorProvider');
  return context;
};

export function TeamIdleMonitorProvider({ children }: { children: ReactNode }): JSX.Element {
  const mx = useMatrixClient();
  const { accountType, idleTimeoutMinutes } = useKiconnectLock();
  const [status, setStatus] = useState<TeamIdleStatus>(
    accountType === 'team' ? 'starting' : 'not-team'
  );
  const [changedAt, setChangedAt] = useState<number>();
  const abortRef = useRef<AbortController>();
  const detectorRef = useRef<IdleDetectorInstance>();
  const logoutStartedRef = useRef(false);

  const updateStatus = useCallback((next: TeamIdleStatus) => {
    setStatus((current) => {
      if (current !== next) setChangedAt(Date.now());
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = undefined;
    detectorRef.current = undefined;
  }, []);

  const logoutTeam = useCallback(async () => {
    if (logoutStartedRef.current) return;
    logoutStartedRef.current = true;
    updateStatus('logging-out');
    try {
      // Obtain an ID token through prompt=none before the destructive logout.
      // Keycloak otherwise displays an unavoidable logout confirmation page.
      await clientLogout(mx);
    } catch {
      logoutStartedRef.current = false;
      updateStatus('error');
    }
  }, [mx, updateStatus]);

  const start = useCallback(async () => {
    const IdleDetector = getIdleDetector();
    if (!IdleDetector) {
      updateStatus('unsupported');
      return;
    }

    stop();
    updateStatus('starting');
    const controller = new AbortController();
    const detector = new IdleDetector();
    abortRef.current = controller;
    detectorRef.current = detector;

    const applyState = () => {
      if (detector.userState === 'idle') {
        updateStatus('idle');
        void logoutTeam();
        return;
      }
      if (detector.screenState === 'locked') {
        updateStatus('screen-locked');
      } else {
        updateStatus('active');
      }
    };
    detector.addEventListener('change', applyState);

    try {
      await detector.start({ threshold: idleTimeoutMinutes * 60_000, signal: controller.signal });
      applyState();
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') updateStatus('error');
    }
  }, [idleTimeoutMinutes, logoutTeam, stop, updateStatus]);

  const requestPermission = useCallback(async () => {
    const IdleDetector = getIdleDetector();
    if (!IdleDetector) {
      updateStatus('unsupported');
      return;
    }
    try {
      const permission = await IdleDetector.requestPermission();
      if (permission === 'granted') {
        await start();
      } else {
        updateStatus('denied');
      }
    } catch {
      updateStatus('error');
    }
  }, [start, updateStatus]);

  useEffect(() => {
    if (accountType !== 'team') {
      logoutStartedRef.current = false;
      stop();
      updateStatus('not-team');
      return undefined;
    }

    if (idleTimeoutMinutes === 0) {
      logoutStartedRef.current = false;
      stop();
      updateStatus('disabled');
      return undefined;
    }

    const IdleDetector = getIdleDetector();
    if (!IdleDetector) {
      updateStatus('unsupported');
      return undefined;
    }

    navigator.permissions
      .query({ name: 'idle-detection' as PermissionName })
      .then((permission) => {
        if (permission.state === 'granted') start();
        else if (permission.state === 'denied') updateStatus('denied');
        else updateStatus('permission-required');
      })
      .catch(() => updateStatus('permission-required'));

    return stop;
  }, [accountType, idleTimeoutMinutes, start, stop, updateStatus]);

  const value = useMemo(
    () => ({ status, changedAt, requestPermission }),
    [changedAt, requestPermission, status]
  );

  return <TeamIdleContext.Provider value={value}>{children}</TeamIdleContext.Provider>;
}
