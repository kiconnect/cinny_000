import type { MatrixClient } from 'matrix-js-sdk';
import type { ClientConfig } from '../../hooks/useClientConfig';
import { removeLocalWebPushSubscription } from '../push/webPush';
import { UNLOCK_ID_TOKEN_KEY } from '../lock/storage';
import { beginSilentLogoutAuthentication } from './logoutOidc';

type KeycloakLogoutConfig = {
  issuer?: string;
  clientId?: string;
  postLogoutRedirectUri?: string;
};

async function getClientConfig(): Promise<ClientConfig> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/config.json`, {
      cache: 'no-store',
    });
    if (!response.ok) return {};
    return (await response.json()) as ClientConfig;
  } catch {
    return {};
  }
}

function isUnexpiredIdToken(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const base64 = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims = JSON.parse(atob(base64)) as { exp?: number };
    return typeof claims.exp === 'number' && claims.exp * 1000 > Date.now() + 5000;
  } catch {
    return false;
  }
}

async function buildKeycloakLogoutUrl(): Promise<string> {
  const config: KeycloakLogoutConfig = (await getClientConfig()).keycloakLogout ?? {};
  const issuer = config.issuer ?? 'https://sso.id-am.at/realms/KIconnect';
  const storedUnlockIdToken = localStorage.getItem(UNLOCK_ID_TOKEN_KEY) ?? undefined;
  const unlockIdToken =
    storedUnlockIdToken && isUnexpiredIdToken(storedUnlockIdToken)
      ? storedUnlockIdToken
      : undefined;
  const clientId = storedUnlockIdToken ? 'kiconnect_cinny' : config.clientId ?? 'kiconnect-matrix';
  const postLogoutRedirect = config.postLogoutRedirectUri ?? `${window.location.origin}/`;
  const url = new URL(`${issuer}/protocol/openid-connect/logout`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
  if (unlockIdToken) url.searchParams.set('id_token_hint', unlockIdToken);
  return url.toString();
}

async function deleteAllIndexedDBForOrigin(): Promise<void> {
  // Modern browsers: list DBs, delete all for this origin
  const anyIDB: any = indexedDB as any;

  if (typeof anyIDB.databases === 'function') {
    try {
      const dbs: Array<{ name?: string | null }> = await anyIDB.databases();
      await Promise.all(
        (dbs || [])
          .map((d) => d?.name)
          .filter((name): name is string => !!name)
          .map(
            (name) =>
              new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              })
          )
      );
      return;
    } catch {
      // fall through
    }
  }

  // Fallback: try common names (Cinny/Matrix SDK variants)
  const candidates = ['matrix-js-sdk', 'matrix-react-sdk', 'cinny', 'sync_store', 'crypto_store'];

  await Promise.all(
    candidates.map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        })
    )
  );
}

async function removeCurrentDevicePushers(mx: MatrixClient): Promise<void> {
  const deviceId = mx.getDeviceId();
  if (!deviceId) return;

  try {
    const { pushers } = await mx.getPushers();
    const currentDevicePushers = pushers.filter(
      (pusher) =>
        pusher.device_id === deviceId || pusher['org.matrix.msc3881.device_id'] === deviceId
    );
    await Promise.allSettled(
      currentDevicePushers.map((pusher) => mx.removePusher(pusher.pushkey, pusher.app_id))
    );
  } catch {
    // Matrix logout below still revokes the access token even if pusher discovery fails.
  }
}

export async function clientLogout(
  mx: MatrixClient,
  options?: { skipTokenAcquisition?: boolean; skipKeycloak?: boolean }
): Promise<void> {
  const storedToken = localStorage.getItem(UNLOCK_ID_TOKEN_KEY);
  if (!options?.skipTokenAcquisition && (!storedToken || !isUnexpiredIdToken(storedToken))) {
    await beginSilentLogoutAuthentication(await getClientConfig());
    return;
  }

  (window as typeof window & { __kiconnectFullLogout?: boolean }).__kiconnectFullLogout = true;

  // These independent preparations used to run serially and made logout time
  // depend on the sum of several network roundtrips. Run them concurrently,
  // while the Matrix token is still valid and local configuration still exists.
  const badgeCleanup =
    'clearAppBadge' in navigator
      ? navigator.clearAppBadge().catch(() => undefined)
      : Promise.resolve();
  const [keycloakLogoutUrl] = await Promise.all([
    buildKeycloakLogoutUrl(),
    removeCurrentDevicePushers(mx),
    removeLocalWebPushSubscription(),
    badgeCleanup,
  ]);

  // Storage synchronously first, then perform network logout and the potentially
  // slower IndexedDB cleanup in parallel. Local logout succeeds even if Keycloak
  // is unavailable after this point.
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Continue with server-side logout even if browser storage is unavailable.
  }

  // Stop long-polling sync before deleting IndexedDB. This releases Matrix store
  // handles earlier and avoids an intermittent wait on an active sync request.
  try {
    mx.stopClient();
  } catch {
    // The browser navigation below completes the logout hand-off.
  }

  await Promise.allSettled([mx.logout(), deleteAllIndexedDBForOrigin()]);

  // Matrix and local state are gone; now terminate the Keycloak browser SSO.
  window.location.replace(options?.skipKeycloak ? '/' : keycloakLogoutUrl);
}
