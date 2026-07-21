import React, { useEffect, useState } from 'react';
import type { ClientConfig } from '../../hooks/useClientConfig';
import { getFallbackSession } from '../../state/sessions';
import {
  clearUnlockTransaction,
  readUnlockTransaction,
  UNLOCK_ID_TOKEN_KEY,
  writeLockRecord,
} from './storage';

type Props = { config: ClientConfig };

type IdTokenClaims = {
  aud?: string | string[];
  exp?: number;
  iss?: string;
  nonce?: string;
};

const decodeClaims = (token: string): IdTokenClaims => {
  const part = token.split('.')[1];
  if (!part) throw new Error('Keycloak hat kein gültiges ID-Token geliefert.');
  const base64 = part
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(atob(base64)) as IdTokenClaims;
};

export function UnlockCallback({ config }: Props): JSX.Element {
  const [error, setError] = useState<string>();
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const complete = async () => {
      const transaction = readUnlockTransaction();
      const unlock = config.keycloakUnlock;
      const query = new URLSearchParams(window.location.search);
      const code = query.get('code');
      const state = query.get('state');
      const oidcError = query.get('error_description') ?? query.get('error');

      if (oidcError) throw new Error(oidcError);
      if (!transaction || Date.now() - transaction.createdAt > 10 * 60 * 1000) {
        throw new Error('Die Entsperranfrage ist abgelaufen.');
      }
      if (!code || !state || state !== transaction.state) {
        throw new Error('Die Entsperranfrage konnte nicht sicher bestätigt werden.');
      }
      if (!unlock?.issuer || !unlock.clientId) {
        throw new Error('Die Passkey-Entsperrung ist nicht konfiguriert.');
      }

      const issuer = unlock.issuer.replace(/\/$/, '');
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: unlock.clientId,
        code,
        redirect_uri: transaction.redirectUri,
        code_verifier: transaction.codeVerifier,
      });
      const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!response.ok) throw new Error('Keycloak konnte die Entsperrung nicht abschließen.');

      const tokens = (await response.json()) as { id_token?: string };
      if (!tokens.id_token) throw new Error('Keycloak hat die Passkey-Prüfung nicht bestätigt.');
      const claims = decodeClaims(tokens.id_token);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (
        claims.iss !== issuer ||
        !audiences.includes(unlock.clientId) ||
        claims.nonce !== transaction.nonce ||
        typeof claims.exp !== 'number' ||
        claims.exp * 1000 <= Date.now()
      ) {
        throw new Error('Die Keycloak-Antwort ist ungültig oder abgelaufen.');
      }

      const session = getFallbackSession();
      if (!session) throw new Error('Die Matrix-Sitzung ist nicht mehr vorhanden.');
      localStorage.setItem(UNLOCK_ID_TOKEN_KEY, tokens.id_token);
      const unlockedRecord = { locked: false, lastActivity: Date.now() };
      writeLockRecord(session.userId, unlockedRecord);
      clearUnlockTransaction();
      if (transaction.popup) {
        if (typeof BroadcastChannel === 'function') {
          const channel = new BroadcastChannel('kiconnect-lock-v1');
          channel.postMessage({ ...unlockedRecord, idToken: tokens.id_token });
          channel.close();
        }
        window.opener?.postMessage(
          {
            type: 'kiconnect-unlock-success',
            record: unlockedRecord,
            idToken: tokens.id_token,
          },
          window.location.origin
        );
        setComplete(true);
        window.setTimeout(() => window.close(), 150);
        return;
      }
      window.location.replace(transaction.returnUrl || '/');
    };

    complete().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Entsperren fehlgeschlagen.');
    });
  }, [config]);

  return (
    <main
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f7fafb' }}
    >
      <section style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
        <h1 style={{ color: '#1e7f93' }}>KI-Connect</h1>
        {error ? (
          <>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.replace('/')}>
              Zurück zum Sperrbildschirm
            </button>
          </>
        ) : complete ? (
          <>
            <p>Client wurde entsperrt.</p>
            <button type="button" onClick={() => window.close()}>
              Fenster schließen
            </button>
          </>
        ) : (
          <p>Passkey wird geprüft …</p>
        )}
      </section>
    </main>
  );
}
