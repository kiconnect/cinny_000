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

type PreparedUnlock = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  nonce: string;
};

let preparedUnlock: Promise<PreparedUnlock> | undefined;
let preparedUnlockKey: string | undefined;
let preparedUnlockValue: PreparedUnlock | undefined;

const addKeycloakPreconnect = (issuer: string) => {
  const origin = new URL(issuer).origin;
  if (document.querySelector(`link[data-kiconnect-preconnect="${origin}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.crossOrigin = 'anonymous';
  link.dataset.kiconnectPreconnect = origin;
  document.head.append(link);
};

const createPreparedUnlock = async (config: ClientConfig): Promise<PreparedUnlock> => {
  const unlock = config.keycloakUnlock;
  if (!unlock?.issuer || !unlock.clientId) {
    throw new Error('Die Passkey-Entsperrung ist noch nicht konfiguriert.');
  }
  const issuer = unlock.issuer.replace(/\/$/, '');
  addKeycloakPreconnect(issuer);
  const codeVerifier = randomBase64Url(64);
  return {
    issuer,
    clientId: unlock.clientId,
    redirectUri: unlock.redirectUri ?? `${window.location.origin}/unlock/callback`,
    codeVerifier,
    codeChallenge: await sha256Base64Url(codeVerifier),
    state: randomBase64Url(),
    nonce: randomBase64Url(),
  };
};

export function preparePasskeyUnlock(config: ClientConfig): void {
  const unlock = config.keycloakUnlock;
  if (!unlock?.issuer || !unlock.clientId) return;
  const key = `${unlock.issuer}|${unlock.clientId}|${unlock.redirectUri ?? ''}`;
  if (!preparedUnlock || preparedUnlockKey !== key) {
    preparedUnlockKey = key;
    preparedUnlock = createPreparedUnlock(config);
    preparedUnlock.then((value) => {
      if (preparedUnlockKey === key) preparedUnlockValue = value;
    });
    void preparedUnlock.catch(() => undefined);
  }
}

const createAuthorizeUrl = (preparation: PreparedUnlock): URL => {
  const authorizeUrl = new URL(`${preparation.issuer}/protocol/openid-connect/auth`);
  authorizeUrl.searchParams.set('client_id', preparation.clientId);
  authorizeUrl.searchParams.set('redirect_uri', preparation.redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid');
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('code_challenge', preparation.codeChallenge);
  authorizeUrl.searchParams.set('state', preparation.state);
  authorizeUrl.searchParams.set('nonce', preparation.nonce);
  authorizeUrl.searchParams.set('max_age', '0');
  authorizeUrl.searchParams.set('prompt', 'login');
  return authorizeUrl;
};

export async function beginPasskeyUnlock(config: ClientConfig): Promise<Window | undefined> {
  const unlock = config.keycloakUnlock;
  if (!unlock?.issuer || !unlock.clientId) {
    throw new Error('Die Passkey-Entsperrung ist noch nicht konfiguriert.');
  }

  const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const popupName = `kiconnect-passkey-unlock-${Date.now()}`;
  const popupFeatures = 'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes';

  const readyPreparation = preparedUnlockValue;
  if (readyPreparation) {
    preparedUnlock = undefined;
    preparedUnlockKey = undefined;
    preparedUnlockValue = undefined;
    writeUnlockTransaction({
      state: readyPreparation.state,
      nonce: readyPreparation.nonce,
      codeVerifier: readyPreparation.codeVerifier,
      redirectUri: readyPreparation.redirectUri,
      returnUrl,
      createdAt: Date.now(),
      popup: true,
    });
    const authorizeUrl = createAuthorizeUrl(readyPreparation);
    const directPopup = window.open(authorizeUrl.toString(), popupName, popupFeatures);
    if (directPopup) {
      directPopup.focus();
      return directPopup;
    }
    const transaction = {
      state: readyPreparation.state,
      nonce: readyPreparation.nonce,
      codeVerifier: readyPreparation.codeVerifier,
      redirectUri: readyPreparation.redirectUri,
      returnUrl,
      createdAt: Date.now(),
      popup: false,
    };
    writeUnlockTransaction(transaction);
    window.location.assign(authorizeUrl.toString());
    return undefined;
  }

  const popup = window.open('', popupName, popupFeatures);

  if (popup) {
    popup.document.head.innerHTML =
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>KI connect – Sichere Anmeldung</title>';
    popup.document.body.style.cssText =
      'margin:0;min-height:100vh;display:grid;place-items:center;padding:36px;box-sizing:border-box;text-align:center;font:24px system-ui;background:#f7fafb;color:#16343b';
    popup.document.body.innerHTML =
      '<main><h1 style="margin:0 0 18px;font-size:36px;line-height:1.2">Sichere Anmeldung</h1>' +
      '<p style="margin:0;color:#527079;font-size:24px;line-height:1.5">Sie werden zur sicheren Anmeldung weitergeleitet …</p></main>';
  }

  const preparation = preparedUnlock ?? createPreparedUnlock(config);
  preparedUnlock = undefined;
  preparedUnlockKey = undefined;
  preparedUnlockValue = undefined;
  const { issuer, clientId, redirectUri, codeVerifier, codeChallenge, state, nonce } =
    await preparation;

  writeUnlockTransaction({
    state,
    nonce,
    codeVerifier,
    redirectUri,
    returnUrl,
    createdAt: Date.now(),
    popup: popup !== null,
  });

  const authorizeUrl = createAuthorizeUrl({
    issuer,
    clientId,
    redirectUri,
    codeVerifier,
    codeChallenge,
    state,
    nonce,
  });

  if (popup) {
    popup.location.replace(authorizeUrl.toString());
    popup.focus();
    return popup;
  }

  window.location.assign(authorizeUrl.toString());
  return undefined;
}
