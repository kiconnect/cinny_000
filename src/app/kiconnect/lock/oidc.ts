import type { ClientConfig } from '../../hooks/useClientConfig';
import { writeUnlockTransaction } from './storage';

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

export async function beginPasskeyUnlock(config: ClientConfig): Promise<void> {
  const unlock = config.keycloakUnlock;
  if (!unlock?.issuer || !unlock.clientId) {
    throw new Error('Die Passkey-Entsperrung ist noch nicht konfiguriert.');
  }

  const issuer = unlock.issuer.replace(/\/$/, '');
  const codeVerifier = randomBase64Url(64);
  const state = randomBase64Url();
  const nonce = randomBase64Url();
  const redirectUri = unlock.redirectUri ?? `${window.location.origin}/unlock/callback`;
  const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  writeUnlockTransaction({
    state,
    nonce,
    codeVerifier,
    redirectUri,
    returnUrl,
    createdAt: Date.now(),
  });

  const authorizeUrl = new URL(`${issuer}/protocol/openid-connect/auth`);
  authorizeUrl.searchParams.set('client_id', unlock.clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid');
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('code_challenge', await sha256Base64Url(codeVerifier));
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('nonce', nonce);
  authorizeUrl.searchParams.set('max_age', '0');
  authorizeUrl.searchParams.set('prompt', 'login');

  window.location.assign(authorizeUrl.toString());
}
