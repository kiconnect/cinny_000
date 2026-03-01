import type { MatrixClient } from "matrix-js-sdk";

const KC_REALM_ISSUER = "https://sso.id-am.at/realms/KIconnect";
const KC_CLIENT_ID = "kiconnect_cinny";

function buildKeycloakLogoutUrl(): string {
  const postLogoutRedirect = `${window.location.origin}/`;
  const url = new URL(`${KC_REALM_ISSUER}/protocol/openid-connect/logout`);

  // Ohne id_token_hint: client_id mitschicken, sonst kommt "Missing parameters: id_token_hint"
  url.searchParams.set("client_id", KC_CLIENT_ID);
  url.searchParams.set("post_logout_redirect_uri", postLogoutRedirect);

  return url.toString();
}

export async function clientLogout(mx: MatrixClient): Promise<void> {
  // Matrix logout
  try {
    await mx.logout();
  } catch {}

  // Client stoppen
  try {
    mx.stopClient();
  } catch {}

  // Optional: lokale App-Daten weg, damit wirklich "fresh"
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {}

  // Keycloak SSO logout -> zurück zur App
  window.location.assign(buildKeycloakLogoutUrl());
}