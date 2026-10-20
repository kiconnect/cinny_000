import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { MatrixEvent } from 'matrix-js-sdk';
import { PushProcessor } from 'matrix-js-sdk/lib/pushprocessor.js';

const compiled = ts.transpileModule(
  readFileSync(new URL('../src/app/kiconnect/push/patientPushRules.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2020 } }
);
const { patientPushRules, ownedPatientPushRooms, installPatientPushRules } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
);
const room = '!patient:test';
const patient = '@a123:test';
const policy = patientPushRules(room).map((rule) => ({ ...rule, enabled: true }));
const defaultRule = {
  rule_id: '.default',
  default: true,
  enabled: true,
  conditions: [],
  actions: ['notify'],
};

function notify(type, sender, content = {}, roomId = room, rules = [...policy, defaultRule]) {
  const client = {
    getSafeUserId: () => patient,
    supportsIntentionalMentions: () => true,
    pushRules: { global: { override: rules } },
  };
  const processor = new PushProcessor(client);
  processor.updateCachedPushRuleKeys(client.pushRules);
  return Boolean(
    processor.actionsForEvent(
      new MatrixEvent({
        type,
        sender,
        content,
        room_id: roomId,
        event_id: '$synthetic:test',
      })
    ).notify
  );
}

test('team messages, files, photos and encrypted messages remain eligible', () => {
  for (const msgtype of ['m.text', 'm.notice', 'm.image', 'm.file', 'm.audio', 'm.video']) {
    assert.equal(notify('m.room.message', '@zdoctor:test', { msgtype }), true);
  }
  assert.equal(notify('m.room.encrypted', '@zteam:test'), true);
});

test('bot replies, mentions and state text do not notify', () => {
  for (const body of [
    'Erledigt',
    'Weitergeleitet',
    'Neue Anfrage?',
    'Mitteilung Ihrer Ordination',
  ]) {
    assert.equal(
      notify('m.room.message', '@bot-100001:test', {
        body,
        'm.mentions': { user_ids: [patient] },
      }),
      false
    );
  }
  assert.equal(notify('m.room.encrypted', '@bot-100001:test'), false);
});

test('only explicitly tagged bot broadcasts notify, never body matching', () => {
  assert.equal(
    notify('m.room.message', '@bot-100001:test', {
      'io.kiconnect.broadcast': { request_id: 'synthetic-broadcast' },
    }),
    true
  );
  for (const request_id of [null, undefined]) {
    assert.equal(
      notify('m.room.message', '@bot-100001:test', {
        'io.kiconnect.broadcast': { request_id },
      }),
      false
    );
  }
  assert.equal(
    notify('m.room.message', '@other:test', {
      'io.kiconnect.broadcast': { request_id: 'fake' },
    }),
    false
  );
});

test('all room state events stay silent regardless of sender', () => {
  for (const sender of ['@bot-100001:test', '@zdoctor:test']) {
    for (const type of ['m.room.member', 'm.room.topic', 'm.room.name', 'io.kiconnect.case']) {
      assert.equal(notify(type, sender), false);
    }
  }
});

test('edits do not generate a second push', () => {
  assert.equal(
    notify('m.room.message', '@zdoctor:test', {
      'm.relates_to': { rel_type: 'm.replace', event_id: '$original' },
    }),
    false
  );
});

test('other rooms and team policy remain untouched, own messages stay silent', () => {
  assert.equal(notify('m.room.message', '@bot-100001:test', {}, '!other:test'), true);
  assert.equal(notify('m.room.message', patient), false);
  assert.equal(notify('m.room.message', '@other-patient:test'), false);
});

test('explicit mute and master rule ahead of the policy remain effective', () => {
  assert.equal(
    notify('m.room.message', '@zdoctor:test', {}, room, [
      { rule_id: '.m.rule.master', enabled: true, conditions: [], actions: [] },
      ...policy,
    ]),
    false
  );
});

function candidate(id, owner = patient, kind = 'patient', membership = 'join') {
  return {
    roomId: id,
    getMyMembership: () => membership,
    currentState: { getStateEvents: () => ({ getContent: () => ({ owner, kind }) }) },
  };
}
test('only own joined patient rooms, never unknown or team accounts', () => {
  const rooms = [
    candidate(room),
    candidate('foreign', '@other:test'),
    candidate('team', patient, 'team'),
    candidate('invite', patient, 'patient', 'invite'),
  ];
  assert.deepEqual(ownedPatientPushRooms(rooms, patient, 'patient'), [room]);
  for (const role of ['team', 'unknown'])
    assert.deepEqual(ownedPatientPushRooms(rooms, patient, role), []);
  assert.deepEqual(
    ownedPatientPushRooms([candidate(room, '@zdoctor:test')], '@zdoctor:test', 'patient'),
    []
  );
});

test('installer is idempotent and adds all allows before scoped deny', async () => {
  const calls = [];
  await installPatientPushRules([], patientPushRules(room), async (r, p) => calls.push([r, p]));
  assert.equal(calls.length, 5);
  assert.equal(calls[4][0].actions.length, 0);
  for (let i = 1; i < 5; i += 1) {
    assert.equal(calls[i][1].after, calls[i - 1][0].rule_id);
  }
  await installPatientPushRules(policy, patientPushRules(room), async () =>
    assert.fail('Unnecessary write')
  );
});

test('installer preserves mute before policy and installs before custom notify', async () => {
  const calls = [];
  const existing = [
    { rule_id: 'mute', actions: [] },
    { rule_id: 'notify-all', actions: ['notify'] },
    defaultRule,
  ];
  await installPatientPushRules(existing, patientPushRules(room), async (r, p) =>
    calls.push([r, p])
  );
  assert.deepEqual(calls[0][1], { before: 'notify-all' });
});

test('failed allow installation never proceeds to deny; partial installs can retry', async () => {
  const calls = [];
  await assert.rejects(
    installPatientPushRules([], patientPushRules(room), async (r) => {
      calls.push(r);
      if (calls.length === 2) throw Error('offline');
    })
  );
  assert.ok(calls.every((r) => !r.rule_id.endsWith('.other')));
  await installPatientPushRules(policy.slice(0, 3), patientPushRules(room), async (r) => {
    assert.ok(['broadcast', 'other'].some((suffix) => r.rule_id.endsWith(suffix)));
  });
});
