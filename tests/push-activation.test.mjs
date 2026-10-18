import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, globals, imports = {}) {
  const source = readFileSync(new URL(`../src/app/${path}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const context = { exports: {}, require: key => { assert.ok(key in imports, key); return imports[key]; }, ...globals };
  vm.runInNewContext(js.outputText, context);
  return context.exports;
}

test('permission activation immediately updates listeners without browser change event', async () => {
  const window = new EventTarget();
  window.Notification = { permission: 'default', requestPermission: async () => {
    window.Notification.permission = 'granted'; return 'granted';
  }};
  const permission = load('kiconnect/push/notificationPermission', { window, Event });
  const states = [];
  let cleanup;
  const document = new EventTarget();
  const hook = load('hooks/usePermission', { window, document, navigator: {} }, {
    react: { useState: initial => [initial, value => states.push(value)], useEffect: fn => { cleanup = fn(); } },
    '../kiconnect/push/notificationPermission': permission,
  });
  hook.usePermissionState('notifications');
  assert.equal(states.at(-1), 'prompt');
  await permission.requestNotificationPermission();
  assert.equal(states.at(-1), 'granted');
  window.Notification.permission = 'denied';
  window.dispatchEvent(new Event('focus'));
  assert.equal(states.at(-1), 'denied');
  cleanup();
  const count = states.length;
  window.dispatchEvent(new Event('focus'));
  assert.equal(states.length, count);
});

for (const registered of [true, false]) {
  test(`push enable verifies actual registration: ${registered}`, async () => {
    const values = new Map();
    const subscription = { toJSON: () => ({ endpoint: 'https://push.test', keys: { p256dh: 'public', auth: 'test' } }) };
    const navigator = { language: 'de', serviceWorker: { ready: Promise.resolve({ pushManager: {
      getSubscription: async () => subscription,
    }}) }};
    const calls = [];
    const push = load('kiconnect/push/webPush', {
      navigator, window: { PushManager: {}, Notification: {} }, Notification: { permission: 'granted' },
      localStorage: { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) },
      crypto: { randomUUID: () => 'device-key' },
    }, { './notificationPermission': { requestNotificationPermission: async () => 'granted' } });
    const mx = { setPusher: async () => calls.push('set'), getPushers: async () => {
      calls.push('verify'); return { pushers: registered ? [{ app_id: push.WEB_PUSH_APP_ID, pushkey: 'device-key' }] : [] };
    }};
    const result = push.enableWebPush(mx, { webPush: { gatewayUrl: 'https://gateway.test', vapidPublicKey: 'test' } });
    if (registered) await result;
    else await assert.rejects(result, /nicht bestätigt/);
    assert.deepEqual(calls, ['set', 'verify']);
  });
}
