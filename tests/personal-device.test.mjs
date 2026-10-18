import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function setup() {
  const values = new Map();
  const localStorage = { getItem: k => values.get(k) ?? null,
    setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  const window = { dispatchEvent() {}, location: { pathname: '/' } };
  function load(file, imports = {}, extra = {}) {
    const source = readFileSync(new URL(`../src/app/kiconnect/logic/${file}.ts`, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS }});
    const ctx = { exports: {}, localStorage, window, Event: class {},
      require: name => { assert.ok(name in imports, name); return imports[name]; }, ...extra };
    vm.runInNewContext(compiled.outputText, ctx);
    return ctx.exports;
  }
  const personal = load('personalDevice');
  return { personal, values, localStorage, load };
}

test('personal device defaults off; preference belongs to full user id', () => {
  const { personal: p } = setup();
  assert.equal(p.readPersonalDevice('@z:test'), false);
  p.writePersonalDevice('@z:test', true);
  assert.equal(p.readPersonalDevice('@z:test'), true);
  assert.equal(p.readPersonalDevice('@other:test'), false);
  assert.equal(p.readPersonalDevice('@z:other'), false);
  p.writePersonalDevice('@z:test', false);
  assert.equal(p.readPersonalDevice('@z:test'), false);
});

test('corrupt or inaccessible storage fails closed', () => {
  const { personal: p, values, localStorage } = setup();
  values.set(p.personalDeviceKey('@z:test'), 'yes');
  assert.equal(p.readPersonalDevice('@z:test'), false);
  localStorage.getItem = () => { throw new Error('blocked'); };
  assert.equal(p.readPersonalDevice('@z:test'), false);
  assert.throws(() => p.writePersonalDevice('unknown', true));
});

test('clearing local storage on explicit logout removes the opt-in', () => {
  const { personal: p, values } = setup();
  p.writePersonalDevice('@z:test', true);
  values.clear();
  assert.equal(p.readPersonalDevice('@z:test'), false);
});

for (const enabled of [false, true]) {
  test(`team cold start: personal device ${enabled}`, async () => {
    const { personal, load } = setup();
    personal.writePersonalDevice('@z:test', enabled);
    let logouts = 0;
    const cold = load('teamColdStart', {
      'matrix-js-sdk': { createClient: () => ({}) },
      '../../state/sessions': { getFallbackSession: () => ({userId: '@z:test'}) },
      './accountType': { readAccountType: () => 'team' },
      './logout': { clientLogout: async () => { logouts += 1; } },
      './personalDevice': personal,
    }, { sessionStorage: { getItem: () => null, setItem() {} }, document: {body:{}} });
    assert.equal(await cold.handleTeamColdStart(), !enabled);
    assert.equal(logouts, enabled ? 0 : 1);
  });
}

for (const enabled of [false, true]) {
  test(`idle detector: personal device ${enabled}`, async () => {
    const { personal } = setup();
    personal.writePersonalDevice('@z:test', enabled);
    const effects = [];
    let starts = 0;
    let logouts = 0;
    class Detector {
      userState = 'idle';
      addEventListener() {}
      async start() { starts += 1; }
    }
    const React = { createContext: () => ({Provider: {}}), createElement: () => null,
      useState: value => [value, () => {}], useRef: () => ({}), useCallback: fn => fn,
      useMemo: fn => fn(), useEffect: fn => effects.push(fn), useContext: () => ({}) };
    const source = readFileSync(new URL('../src/app/kiconnect/idle/TeamIdleMonitor.tsx', import.meta.url), 'utf8');
    const imports = { react: React,
      '../../hooks/useMatrixClient': { useMatrixClient: () => ({getUserId: () => '@z:test'}) },
      '../logic/logout': { clientLogout: async () => { logouts += 1; } },
      '../logic/personalDevice': personal,
      '../lock/LockProvider': { useKiconnectLock: () => ({accountType: 'team', idleTimeoutMinutes: 5, personalDevice: enabled}) } };
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } });
    const context = { exports: {}, require: name => imports[name], AbortController,
      window: { IdleDetector: Detector }, navigator: {permissions: {query: async () => ({state:'granted'})}} };
    vm.runInNewContext(compiled.outputText, context);
    context.exports.TeamIdleMonitorProvider({children: null});
    effects.forEach(fn => fn());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(starts, enabled ? 0 : 1);
    assert.equal(logouts, enabled ? 0 : 1);
  });
}
