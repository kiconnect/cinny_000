import React, { useEffect, useState } from 'react';
import { createClient } from 'matrix-js-sdk';
import { getFallbackSession } from '../../state/sessions';
import { UNLOCK_ID_TOKEN_KEY } from '../lock/storage';
import { clientLogout } from './logout';
import { clearLogoutTransaction, readLogoutTransaction } from './logoutOidc';

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

export function LogoutCallback(): JSX.Element {
  const [error, setError] = useState<string>();

  useEffect(() => {
    const complete = async () => {
      const transaction = readLogoutTransaction();
      const query = new URLSearchParams(window.location.search);
      const code = query.get('code');
      const state = query.get('state');
      const oidcError = query.get('error');

      if (!transaction || Date.now() - transaction.createdAt > 10 * 60 * 1000) {
        throw new Error('Die Abmeldeanfrage ist abgelaufen.');
      }
      if (!state || state !== transaction.state) {
        throw new Error('Die Abmeldeanfrage konnte nicht sicher bestätigt werden.');
      }

      const session = getFallbackSession();
      if (!session) {
        clearLogoutTransaction();
        window.location.replace('/');
        return;
      }
      const mx = createClient({
        baseUrl: session.baseUrl,
        accessToken: session.accessToken,
        userId: session.userId,
        deviceId: session.deviceId,
      });

      if (oidcError === 'login_required' || oidcError === 'interaction_required') {
        clearLogoutTransaction();
        await clientLogout(mx, { skipTokenAcquisition: true, skipKeycloak: true });
        return;
      }
      if (oidcError || !code) throw new Error(oidcError || 'Keycloak hat keinen Code geliefert.');

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: transaction.clientId,
        code,
        redirect_uri: transaction.redirectUri,
        code_verifier: transaction.codeVerifier,
      });
      const response = await fetch(`${transaction.issuer}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!response.ok) throw new Error('Keycloak konnte die Abmeldung nicht vorbereiten.');

      const tokens = (await response.json()) as { id_token?: string };
      if (!tokens.id_token) throw new Error('Keycloak hat kein ID-Token geliefert.');
      const claims = decodeClaims(tokens.id_token);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (
        claims.iss !== transaction.issuer ||
        !audiences.includes(transaction.clientId) ||
        claims.nonce !== transaction.nonce ||
        typeof claims.exp !== 'number' ||
        claims.exp * 1000 <= Date.now()
      ) {
        throw new Error('Die Keycloak-Antwort ist ungültig oder abgelaufen.');
      }

      localStorage.setItem(UNLOCK_ID_TOKEN_KEY, tokens.id_token);
      clearLogoutTransaction();
      await clientLogout(mx, { skipTokenAcquisition: true });
    };

    complete().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Abmeldung fehlgeschlagen.');
    });
  }, []);

  return (
    <main
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f7fafb' }}
    >
      <section style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
        <h1 style={{ color: '#1e7f93' }}>KI connect</h1>
        <p>{error ?? 'Vollständige Abmeldung wird vorbereitet …'}</p>
      </section>
    </main>
  );
}
