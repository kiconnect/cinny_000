import type { ClientConfig } from '../../hooks/useClientConfig';

export type LogoutTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  issuer: string;
  clientId: string;
  createdAt: number;
};

const LOGOUT_TRANSACTION_KEY = 'kiconnect.logout.transaction.v1';

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const randomBase64Url = (length = 32): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

const sha256Base64Url = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
};

export function readLogoutTransaction(): LogoutTransaction | undefined {
  try {
    const value = localStorage.getItem(LOGOUT_TRANSACTION_KEY);
    if (!value) return undefined;
    const transaction = JSON.parse(value) as LogoutTransaction;
    if (
      typeof transaction.state === 'string' &&
      typeof transaction.nonce === 'string' &&
      typeof transaction.codeVerifier === 'string' &&
      typeof transaction.redirectUri === 'string' &&
      typeof transaction.issuer === 'string' &&
      typeof transaction.clientId === 'string' &&
      typeof transaction.createdAt === 'number'
    ) {
      return transaction;
    }
  } catch {
    // The callback treats missing or malformed state as a failed logout preflight.
  }
  return undefined;
}

export function clearLogoutTransaction(): void {
  localStorage.removeItem(LOGOUT_TRANSACTION_KEY);
}

export async function beginSilentLogoutAuthentication(config: ClientConfig): Promise<void> {
  const oidc = config.keycloakUnlock;
  if (!oidc?.issuer || !oidc.clientId) {
    throw new Error('Die Keycloak-Abmeldung ist nicht konfiguriert.');
  }

  const issuer = oidc.issuer.replace(/\/$/, '');
  const codeVerifier = randomBase64Url(64);
  const state = randomBase64Url();
  const nonce = randomBase64Url();
  const redirectUri = `${window.location.origin}/logout/callback`;
  const transaction: LogoutTransaction = {
    state,
    nonce,
    codeVerifier,
    redirectUri,
    issuer,
    clientId: oidc.clientId,
    createdAt: Date.now(),
  };
  localStorage.setItem(LOGOUT_TRANSACTION_KEY, JSON.stringify(transaction));

  const authorizeUrl = new URL(`${issuer}/protocol/openid-connect/auth`);
  authorizeUrl.searchParams.set('client_id', oidc.clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid');
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('code_challenge', await sha256Base64Url(codeVerifier));
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('nonce', nonce);
  authorizeUrl.searchParams.set('prompt', 'none');
  window.location.replace(authorizeUrl.toString());
}
