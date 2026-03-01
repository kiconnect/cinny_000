import type { MatrixClient } from "matrix-js-sdk";

const KC_REALM_ISSUER = "https://sso.id-am.at/realms/KIconnect";
const KC_CLIENT_ID = "kiconnect_cinny";

function buildKeycloakLogoutUrl(): string {
  const postLogoutRedirect = `${window.location.origin}/`;
  const url = new URL(`${KC_REALM_ISSUER}/protocol/openid-connect/logout`);
  url.searchParams.set("client_id", KC_CLIENT_ID);
  url.searchParams.set("post_logout_redirect_uri", postLogoutRedirect);
  return url.toString();
}

async function deleteAllIndexedDBForOrigin(): Promise<void> {
  // Modern browsers: list DBs, delete all for this origin
  const anyIDB: any = indexedDB as any;

  if (typeof anyIDB.databases === "function") {
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
  const candidates = [
    "matrix-js-sdk",
    "matrix-react-sdk",
    "cinny",
    "sync_store",
    "crypto_store",
  ];

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

export async function clientLogout(mx: MatrixClient): Promise<void> {
  // 1) Matrix logout
  try {
    await mx.logout();
  } catch {}

  // 2) Client stoppen
  try {
    mx.stopClient();
  } catch {}

  // 3) lokalen Storage + IndexedDB killen (sonst "expected X got Y")
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {}

  try {
    await deleteAllIndexedDBForOrigin();
  } catch {}

  // 4) Keycloak SSO logout -> zurück zur App
  window.location.assign(buildKeycloakLogoutUrl());
}