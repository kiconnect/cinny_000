import type { MatrixClient } from 'matrix-js-sdk';
import { removeLocalWebPushSubscription } from '../push/webPush';

type KeycloakLogoutConfig = {
  issuer?: string;
  clientId?: string;
  postLogoutRedirectUri?: string;
};

async function getKeycloakLogoutConfig(): Promise<KeycloakLogoutConfig> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/config.json`, {
      cache: 'no-store',
    });
    if (!response.ok) return {};
    const config = await response.json();
    return config?.keycloakLogout ?? {};
  } catch {
    return {};
  }
}

async function buildKeycloakLogoutUrl(): Promise<string> {
  const config = await getKeycloakLogoutConfig();
  const issuer = config.issuer ?? 'https://sso.id-am.at/realms/KIconnect';
  const clientId = config.clientId ?? 'kiconnect-matrix';
  const postLogoutRedirect = config.postLogoutRedirectUri ?? `${window.location.origin}/`;
  const url = new URL(`${issuer}/protocol/openid-connect/logout`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
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

export async function clientLogout(mx: MatrixClient): Promise<void> {
  if ('clearAppBadge' in navigator) {
    await navigator.clearAppBadge().catch(() => undefined);
  }

  // Remove the current device's push endpoints before revoking its Matrix token.
  await removeCurrentDevicePushers(mx);

  // Storage synchronously first, then perform network logout and the potentially
  // slower IndexedDB cleanup in parallel. Local logout succeeds even if Keycloak
  // is unavailable after this point.
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Continue with server-side logout even if browser storage is unavailable.
  }

  await Promise.allSettled([
    mx.logout(),
    deleteAllIndexedDBForOrigin(),
    removeLocalWebPushSubscription(),
  ]);

  try {
    mx.stopClient();
  } catch {
    // The browser navigation below completes the logout hand-off.
  }

  // Matrix and local state are gone; now terminate the Keycloak browser SSO.
  window.location.assign(await buildKeycloakLogoutUrl());
}
