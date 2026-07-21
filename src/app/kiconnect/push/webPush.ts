import type { MatrixClient } from 'matrix-js-sdk';
import type { ClientConfig } from '../../hooks/useClientConfig';

export const WEB_PUSH_APP_ID = 'at.kiconnect.cinny.webpush';
const PUSHKEY_STORAGE_KEY = 'kiconnect.webpush.pushkey.v1';

export type WebPushStatus = 'unsupported' | 'off' | 'on';

const base64UrlToBytes = (value: string): Uint8Array => {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const pushConfig = (config: ClientConfig) => {
  const gatewayUrl = config.webPush?.gatewayUrl?.replace(/\/$/, '');
  const vapidPublicKey = config.webPush?.vapidPublicKey;
  if (!gatewayUrl || !vapidPublicKey) throw new Error('Push-Nachrichten sind nicht konfiguriert.');
  return { gatewayUrl, vapidPublicKey };
};

export const webPushSupported = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const getPushkey = (): string | undefined => localStorage.getItem(PUSHKEY_STORAGE_KEY) ?? undefined;

const getOrCreatePushkey = (): string => {
  const existing = getPushkey();
  if (existing) return existing;
  const pushkey = crypto.randomUUID();
  localStorage.setItem(PUSHKEY_STORAGE_KEY, pushkey);
  return pushkey;
};

export async function getWebPushStatus(mx: MatrixClient): Promise<WebPushStatus> {
  if (!webPushSupported()) return 'unsupported';
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  const pushkey = getPushkey();
  if (!subscription || !pushkey) return 'off';
  const { pushers } = await mx.getPushers();
  return pushers.some((pusher) => pusher.app_id === WEB_PUSH_APP_ID && pusher.pushkey === pushkey)
    ? 'on'
    : 'off';
}

export async function enableWebPush(mx: MatrixClient, config: ClientConfig): Promise<void> {
  if (!webPushSupported()) {
    throw new Error(
      'Push wird von diesem Browser nicht unterstützt. Installieren Sie KI-Connect als PWA.'
    );
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');

  const { gatewayUrl, vapidPublicKey } = pushConfig(config);
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(vapidPublicKey),
    }));
  const subscriptionJson = subscription.toJSON();
  if (!subscriptionJson.endpoint || !subscriptionJson.keys?.p256dh || !subscriptionJson.keys.auth) {
    throw new Error('Das Gerät hat keine vollständige Push-Adresse geliefert.');
  }

  const pushkey = getOrCreatePushkey();
  await mx.setPusher({
    app_display_name: 'KI-Connect',
    app_id: WEB_PUSH_APP_ID,
    append: true,
    data: {
      url: `${gatewayUrl}/_matrix/push/v1/notify`,
      format: 'event_id_only',
      webpush_subscription: subscriptionJson,
    },
    device_display_name: 'KI-Connect PWA',
    kind: 'http',
    lang: navigator.language || 'de',
    profile_tag: '',
    pushkey,
  } as Parameters<MatrixClient['setPusher']>[0]);
}

export async function removeLocalWebPushSubscription(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager?.getSubscription();
      await subscription?.unsubscribe();
    }
  } finally {
    localStorage.removeItem(PUSHKEY_STORAGE_KEY);
  }
}

export async function disableWebPush(mx: MatrixClient): Promise<void> {
  const pushkey = getPushkey();
  if (pushkey) await mx.removePusher(pushkey, WEB_PUSH_APP_ID);
  await removeLocalWebPushSubscription();
}
