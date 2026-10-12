import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(
  readFileSync(new URL('../src/app/kiconnect/logic/teamRequestNavigation.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2020 } }
);
const { findCreatedTeamRoom: find } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
);
const state = { kind: 'team_request', request_id: 'fresh', owner: '@sender:test' };
function room(content = state, membership = 'join') {
  return { roomId: '!new:test', getMyMembership: () => membership,
    currentState: { getStateEvents: () => content && ({ getContent: () => content }) } };
}
test('opens the matching joined room for its sender', () => {
  assert.equal(find([room()], 'fresh', '@sender:test'), '!new:test');
});
test('does not open for recipients, old requests or missing local request', () => {
  assert.equal(find([room()], 'fresh', '@recipient:test'), undefined);
  assert.equal(find([room()], 'old', '@sender:test'), undefined);
  assert.equal(find([room()], '', '@sender:test'), undefined);
});
test('waits for sync, state and completed join', () => {
  for (const rooms of [[], [room(null)], [room(state, 'invite')], [room(state, 'leave')]]) {
    assert.equal(find(rooms, 'fresh', '@sender:test'), undefined);
  }
  assert.equal(find([room()], 'fresh', '@sender:test'), '!new:test');
});
test('ignores other room kinds', () => {
  assert.equal(find([room({ ...state, kind: 'team' })], 'fresh', '@sender:test'), undefined);
});
