import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROFILES = {
  dev: {
    hostname: 'devcinny.kiconnect.at',
    matrixServer: 'dev.kiconnect.at',
    portalOrigin: 'https://devportal.kiconnect.at',
    logoutIssuer: 'https://devsso.id-am.at/realms/KIconnect',
    unlockIssuer: 'https://devsso.id-am.at/realms/KIconnect',
  },
  prod: {
    hostname: 'cinny.kiconnect.at',
    matrixServer: 'kiconnect.at',
    portalOrigin: 'https://portal.kiconnect.at',
    logoutIssuer: 'https://sso.id-am.at/realms/KIconnect',
    unlockIssuer: 'https://sso.id-am.at/realms/KIconnect',
  },
};

const unquote = (value) => {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const readDeploymentEnv = (fileName) => {
  const filePath = resolve(fileName);
  const values = {};
  const source = readFileSync(filePath, 'utf8');

  source.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separator = normalized.indexOf('=');
    if (separator <= 0) {
      throw new Error(`${fileName}:${index + 1}: Ungültiger ENV-Eintrag`);
    }

    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      throw new Error(`${fileName}:${index + 1}: Ungültiger ENV-Schlüssel ${key}`);
    }
    values[key] = unquote(normalized.slice(separator + 1));
  });

  return { filePath, values };
};

const required = (env, key) => {
  const value = String(env[key] ?? '').trim();
  if (!value) throw new Error(`Pflichtwert ${key} fehlt in der lokalen Deployment-ENV.`);
  return value;
};

const validUrl = (env, key) => {
  const value = required(env, key);
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${key} muss eine HTTPS-URL sein.`);
  return value.replace(/\/$/, '');
};

const assertEqual = (actual, expected, key, deployment) => {
  if (actual !== expected) {
    throw new Error(
      `${key} passt nicht zum Profil ${deployment}. Erwartet: ${expected}; erhalten: ${actual}`
    );
  }
};

export const deploymentFromEnv = (env) => {
  const deployment = required(env, 'KICONNECT_ENV').toLowerCase();
  if (!(deployment in PROFILES)) {
    throw new Error('KICONNECT_ENV muss exakt dev oder prod sein.');
  }

  const profile = PROFILES[deployment];
  const hostname = required(env, 'KICONNECT_PUBLIC_HOSTNAME').toLowerCase();
  const matrixServer = required(env, 'KICONNECT_MATRIX_SERVER').toLowerCase();
  const portalUrl = validUrl(env, 'KICONNECT_PORTAL_URL');
  const logoutIssuer = validUrl(env, 'KICONNECT_KEYCLOAK_LOGOUT_ISSUER');
  const unlockIssuer = validUrl(env, 'KICONNECT_KEYCLOAK_UNLOCK_ISSUER');
  const unlockRedirectUri = validUrl(env, 'KICONNECT_KEYCLOAK_UNLOCK_REDIRECT_URI');
  const lockPreferencesUrl = validUrl(env, 'KICONNECT_LOCK_PREFERENCES_URL');

  assertEqual(hostname, profile.hostname, 'KICONNECT_PUBLIC_HOSTNAME', deployment);
  assertEqual(matrixServer, profile.matrixServer, 'KICONNECT_MATRIX_SERVER', deployment);
  assertEqual(portalUrl, profile.portalOrigin, 'KICONNECT_PORTAL_URL', deployment);
  assertEqual(logoutIssuer, profile.logoutIssuer, 'KICONNECT_KEYCLOAK_LOGOUT_ISSUER', deployment);
  assertEqual(unlockIssuer, profile.unlockIssuer, 'KICONNECT_KEYCLOAK_UNLOCK_ISSUER', deployment);

  const redirect = new URL(unlockRedirectUri);
  if (redirect.hostname !== hostname || redirect.pathname !== '/unlock/callback') {
    throw new Error(
      'KICONNECT_KEYCLOAK_UNLOCK_REDIRECT_URI muss auf /unlock/callback des konfigurierten öffentlichen Hosts zeigen.'
    );
  }
  if (new URL(lockPreferencesUrl).origin !== portalUrl) {
    throw new Error(
      'KICONNECT_LOCK_PREFERENCES_URL muss dieselbe Origin wie das Portal verwenden.'
    );
  }

  const timeoutMinutes = Number(required(env, 'KICONNECT_LOCK_TIMEOUT_MINUTES'));
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    throw new Error('KICONNECT_LOCK_TIMEOUT_MINUTES muss eine positive Zahl sein.');
  }

  const pushGatewayUrl = String(env.KICONNECT_WEB_PUSH_GATEWAY_URL ?? '').trim();
  const pushVapidPublicKey = String(env.KICONNECT_WEB_PUSH_VAPID_PUBLIC_KEY ?? '').trim();
  if (Boolean(pushGatewayUrl) !== Boolean(pushVapidPublicKey)) {
    throw new Error(
      'KICONNECT_WEB_PUSH_GATEWAY_URL und KICONNECT_WEB_PUSH_VAPID_PUBLIC_KEY müssen gemeinsam gesetzt oder leer sein.'
    );
  }

  const clientConfig = {
    deployment,
    expectedHostname: hostname,
    defaultHomeserver: 0,
    homeserverList: [matrixServer],
    allowCustomHomeservers: false,
    disableSSO: true,
    hidePasswordLogin: true,
    portalUrl,
    keycloakLogout: {
      issuer: logoutIssuer,
      clientId: required(env, 'KICONNECT_KEYCLOAK_LOGOUT_CLIENT_ID'),
    },
    keycloakUnlock: {
      issuer: unlockIssuer,
      clientId: required(env, 'KICONNECT_KEYCLOAK_UNLOCK_CLIENT_ID'),
      redirectUri: unlockRedirectUri,
    },
    kiconnectLock: {
      timeoutMinutes,
      preferencesUrl: lockPreferencesUrl,
    },
    ...(pushGatewayUrl
      ? {
          webPush: {
            gatewayUrl: validUrl(env, 'KICONNECT_WEB_PUSH_GATEWAY_URL'),
            vapidPublicKey: pushVapidPublicKey,
          },
        }
      : {}),
    appearance: { theme: 'light' },
    featuredCommunities: {
      openAsDefault: false,
      spaces: [],
      rooms: [],
      servers: [],
    },
    hashRouter: {
      enabled: false,
      basename: '/',
    },
  };

  const iconProfile = deployment === 'dev' ? 'dev' : 'v2';
  const manifest = {
    name: required(env, 'KICONNECT_PWA_NAME'),
    short_name: required(env, 'KICONNECT_PWA_SHORT_NAME'),
    description: required(env, 'KICONNECT_PWA_DESCRIPTION'),
    dir: 'auto',
    lang: 'de-AT',
    id: required(env, 'KICONNECT_PWA_ID'),
    display: 'standalone',
    orientation: 'portrait',
    start_url: '/',
    scope: '/',
    background_color: '#fff',
    theme_color: '#1E7F93',
    icons: [
      {
        src: `/kiconnect-desktop-${iconProfile}-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/kiconnect-desktop-${iconProfile}-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/kiconnect-maskable-${iconProfile}-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: `/kiconnect-maskable-${iconProfile}-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return {
    deployment,
    isDev: deployment === 'dev',
    outDir: `dist-${deployment}`,
    hostname,
    clientConfig,
    manifest,
  };
};
