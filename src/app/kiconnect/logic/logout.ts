import type { MatrixClient } from "matrix-js-sdk";

type KeycloakLogoutConfig = {
  issuer?: string;
  clientId?: string;
  postLogoutRedirectUri?: string;
};

async function getKeycloakLogoutConfig(): Promise<KeycloakLogoutConfig> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/config.json`, {
      cache: "no-store",
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
  const issuer = config.issuer ?? "https://sso.id-am.at/realms/KIconnect";
  const clientId = config.clientId ?? "kiconnect_cinny";
  const postLogoutRedirect = config.postLogoutRedirectUri ?? `${window.location.origin}/`;
  const url = new URL(`${issuer}/protocol/openid-connect/logout`);
  url.searchParams.set("client_id", clientId);
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
  window.location.assign(await buildKeycloakLogoutUrl());
}
