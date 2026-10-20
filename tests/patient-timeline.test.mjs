import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(
  readFileSync(new URL('../src/app/kiconnect/logic/patientTimeline.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2020 } }
);
const { hidePatientRoomActivity: hide } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
);

test('patients do not see membership, topic, name or avatar activity', () => {
  for (const type of ['m.room.member', 'm.room.topic', 'm.room.name', 'm.room.avatar']) {
    assert.equal(hide('patient', '@a123:test', type, true), true);
    assert.equal(hide('team', '@z123:test', type, true), false);
    assert.equal(hide('unknown', '@a123:test', type, true), false);
    assert.equal(hide('patient', '@z123:test', type, true), false);
  }
});

test('all chat messages including Gustav status messages remain visible', () => {
  for (const type of ['m.room.message', 'm.room.encrypted', 'm.reaction']) {
    assert.equal(hide('patient', '@a123:test', type, false), false);
  }
  assert.equal(hide('patient', '@a123:test', 'm.room.topic', false), false);
});

test('security state events are not blanket-hidden', () => {
  for (const type of ['m.room.encryption', 'm.room.power_levels']) {
    assert.equal(hide('patient', '@a123:test', type, true), false);
  }
});
