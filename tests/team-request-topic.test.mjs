import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(
  readFileSync(new URL('../src/app/kiconnect/logic/teamRequestTopic.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }
);
const { suggestTeamRequestTopic: topic } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
);
const members = [
  { matrix_user_id: '@doctor:test', display_name: 'Dr. Alfred Doblinger' },
  { matrix_user_id: '@team:test', display_name: 'Maria' },
];
test('individual uses display names', () => {
  assert.equal(topic('Anna', ['@doctor:test'], members), 'Anna – Dr. Alfred Doblinger');
});
test('explicit group selection uses group name even with one member', () => {
  assert.equal(topic('Anna', ['@doctor:test'], members, 'arzt'), 'Anna – Ärzteteam');
  assert.equal(topic('Anna', ['@team:test'], members, 'team'), 'Anna – Team');
});
test('manual multi-selection lists recipients without duplicates', () => {
  assert.equal(topic(' Anna ', ['@doctor:test', '@team:test', '@team:test'], members),
    'Anna – Dr. Alfred Doblinger, Maria');
});
test('no incomplete suggestion before selection', () => {
  assert.equal(topic('Anna', [], members, 'team'), '');
  assert.equal(topic('', ['@team:test'], members), '');
});
test('missing display name falls back to known Matrix id', () => {
  assert.equal(topic('Anna', ['@missing:test'], members), 'Anna – @missing:test');
});
