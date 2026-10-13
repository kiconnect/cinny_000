import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const compiled = ts.transpileModule(readFileSync(new URL('../src/app/kiconnect/logic/patientEntry.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2020 } });
const { patientEntryRooms: select, isPatientEntryPath: landing } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const uid = '@patient:test';
function room(id, state = { kind: 'patient', owner: uid }, membership = 'join') {
  return { roomId: id, name: id, getMyMembership: () => membership,
    currentState: { getStateEvents: () => state && ({ getContent: () => state }) } };
}
test('selects only own joined patient rooms', () => {
  const rooms = [room('own'), room('other', {kind:'patient', owner:'@other:test'}),
    room('missing', null), room('invite', undefined, 'invite'), room('left', undefined, 'leave')];
  assert.deepEqual(select(rooms, uid, 'patient').map(r => r.id), ['own']);
});
test('multiple ordinations stay separate and use ordination labels where available', () => {
  const rooms = [room('b', {kind:'patient', owner:uid, ordination_name:'Praxis B'}), room('a')];
  assert.equal(select(rooms, uid, 'unknown').length, 2);
  assert.equal(select(rooms, uid, 'unknown').find(r=>r.id==='b').name, 'Praxis B');
});
test('team accounts never auto-open', () => {
  assert.deepEqual(select([room('own')], uid, 'team'), []);
  assert.deepEqual(select([room('own'), room('team', {kind:'team'})], uid, 'unknown'), []);
  assert.deepEqual(select([room('own', {kind:'patient',owner:'@z123:test'})], '@z123:test', 'unknown'), []);
});
test('no implicit ownership or default room', () => {
  assert.deepEqual(select([room('unknown', {kind:'patient'})], uid, 'patient'), []);
  assert.deepEqual(select([], uid, 'patient'), []);
});
test('direct room links and functional pages are preserved on PC and mobile', () => {
  for (const path of ['/', '/home/', '/home', '/direct/']) assert.equal(landing(path), true);
  for (const path of ['/home/!room:test/', '/home/!room:test/$event', '/!space:test/!room:test/',
    '/home/search/', '/inbox/', '/explore/', '/logout/callback']) assert.equal(landing(path), false);
});
