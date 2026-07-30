import { createClient } from 'matrix-js-sdk';
import { getFallbackSession } from '../../state/sessions';
import { readAccountType } from './accountType';
import { clientLogout } from './logout';

const TEAM_RUNTIME_SESSION_KEY = 'kiconnect.team-runtime-session.v1';

function showLogoutNotice(): void {
  document.body.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;background:#f7fafb">
      <section style="max-width:440px;padding:28px;text-align:center;font-family:Inter,system-ui,sans-serif">
        <h1 style="margin:0 0 14px;color:#1e7f93;font-size:30px">KI connect</h1>
        <p style="margin:0;color:#263238;font-size:17px;line-height:1.5">
          Die vorherige Team-Sitzung wird sicher beendet …
        </p>
      </section>
    </main>`;
}

/**
 * A full PWA/browser-window restart clears sessionStorage, while a reload does
 * not. Team accounts must therefore revoke their previous Matrix and Keycloak
 * session before the restored client is allowed to render.
 */
export async function handleTeamColdStart(): Promise<boolean> {
  const pathname = window.location.pathname;
  if (pathname === '/logout/callback' || pathname === '/unlock/callback') return false;

  const session = getFallbackSession();
  const runtimeSessionExists = sessionStorage.getItem(TEAM_RUNTIME_SESSION_KEY) === 'active';
  sessionStorage.setItem(TEAM_RUNTIME_SESSION_KEY, 'active');

  if (!session || runtimeSessionExists || readAccountType(session.userId) !== 'team') {
    return false;
  }

  showLogoutNotice();
  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    deviceId: session.deviceId,
  });
  await clientLogout(mx);
  return true;
}

