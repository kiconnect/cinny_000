/* eslint-disable import/first */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';

enableMapSet();

import './index.css';

import { trimTrailingSlash } from './app/utils/common';
import App from './app/pages/App';

// import i18n (needs to be bundled ;))
import './app/i18n';
import { pushSessionToSW } from './sw-session';
import { getFallbackSession } from './app/state/sessions';
import { handleTeamColdStart } from './app/kiconnect/logic/teamColdStart';

document.body.classList.add(configClass, varsClass);

const clearAppBadge = () => {
  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => undefined);
  }
};

clearAppBadge();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') clearAppBadge();
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  const swUrl =
    import.meta.env.DEV
      ? `/dev-sw.js?dev-sw`
      : `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`;

  const sendSessionToSW = () => {
    const session = getFallbackSession();
    pushSessionToSW(session?.baseUrl, session?.accessToken);
  };

  let reloadingForServiceWorker = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForServiceWorker) return;
    reloadingForServiceWorker = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register(swUrl, { updateViaCache: 'none' })
    .then(async (registration) => {
      sendSessionToSW();
      await registration.update();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => undefined);
        }
      });
    });
  navigator.serviceWorker.ready.then(sendSessionToSW);

  navigator.serviceWorker.addEventListener('message', (ev) => {
    const { type } = ev.data ?? {};

    if (type === 'requestSession') {
      sendSessionToSW();
    }
  });
}

const mountApp = () => {
  const rootContainer = document.getElementById('root');

  if (rootContainer === null) {
    console.error('Root container element not found!');
    return;
  }

  const root = createRoot(rootContainer);
  root.render(<App />);
};

const startApp = async () => {
  try {
    if (await handleTeamColdStart()) return;
  } catch (error) {
    console.error('Team cold-start logout failed', error);
    sessionStorage.removeItem('kiconnect.team-runtime-session.v1');
    document.body.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;background:#f7fafb">
        <section style="max-width:440px;padding:28px;text-align:center;font-family:Inter,system-ui,sans-serif">
          <h1 style="margin:0 0 14px;color:#1e7f93;font-size:30px">KI connect</h1>
          <p style="color:#263238;font-size:17px;line-height:1.5">
            Die vorherige Team-Sitzung konnte noch nicht sicher beendet werden.
          </p>
          <button id="kiconnect-team-logout-retry" type="button"
            style="border:0;border-radius:12px;background:#1e7f93;color:#fff;padding:13px 20px;font-size:16px;font-weight:700;cursor:pointer">
            Erneut versuchen
          </button>
        </section>
      </main>`;
    document.getElementById('kiconnect-team-logout-retry')?.addEventListener('click', () => {
      window.location.reload();
    });
    return;
  }
  mountApp();
};

void startApp();
