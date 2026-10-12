import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/app/kiconnect/logic/caseStatus.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
});
const logic = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
);

function event(roomId, type, content) {
  return { getRoomId: () => roomId, getType: () => type, getContent: () => content };
}

function fixture(role = 'arzt', status = 'open') {
  const mx = new EventEmitter();
  const states = new Map();
  const makeRoom = (roomId, entries, membership = 'join', space = false) => {
    const state = new Map(Object.entries(entries));
    const room = {
      roomId,
      currentState: {
        getStateEvents: (type) => (state.has(type) ? event(roomId, type, state.get(type)) : null),
      },
      getMyMembership: () => membership,
      isSpaceRoom: () => space,
    };
    states.set(roomId, room);
    return { room, state };
  };
  const spaces = { arzt: '!arzt:test', team: '!team:test' };
  const patient = makeRoom('!patient:test', {
    'io.kiconnect.case': {
      roles: {
        bot: { state: 'done' },
        arzt: { state: role === 'arzt' ? status : 'done', space_room_id: spaces.arzt },
        team: { state: role === 'team' ? status : 'done', space_room_id: spaces.team },
      },
    },
    'm.room.join_rules': {
      allow: Object.values(spaces).map((room_id) => ({ type: 'm.room_membership', room_id })),
    },
  });
  makeRoom(spaces[role], { [`io.kiconnect.${role}`]: {} }, 'join', true);
  const personal = makeRoom('!personal:test', {}, 'join', true);
  mx.getRoom = (id) => states.get(id);
  mx.getUserId = () => '@zstaff:test';
  mx.sent = [];
  mx.sendEvent = async (id, type, content) => {
    assert.equal(content.space_room_id, spaces[role]);
    mx.sent.push({ id, type, content });
    if (type === 'io.kiconnect.case.toggle') {
      const current = patient.state.get('io.kiconnect.case');
      current.roles[role].state = content.target_state;
      mx.emit('RoomState.events', event(id, 'io.kiconnect.case', current));
    }
    return { event_id: '$test' };
  };
  return { mx, patient, spaces, states, makeRoom, personal };
}

for (const role of ['arzt', 'team']) {
  for (const entry of ['search', 'room-list', 'home']) {
    for (const status of ['open', 'pending', 'waiting', 'done']) {
      test(`${role} / ${entry} / ${status}: resolves authorized role and performs status change`, async () => {
        const f = fixture(role, status);
        const selected =
          entry === 'home'
            ? undefined
            : entry === 'search'
            ? f.personal.room.roomId
            : f.spaces[role];
        const info = logic.getOwnRoleStatus(f.mx, f.patient.room, selected);
        assert.equal(info.role, role);
        assert.equal(info.spaceRoomId, f.spaces[role]);
        assert.equal(info.own, status);
        assert.equal(info.ready, true);
        await logic.sendCaseAction(f.mx, f.patient.room, selected, 'toggle');
        const after = logic.getOwnRoleStatus(f.mx, f.patient.room, selected);
        assert.equal(after.own, status === 'done' ? 'open' : 'done');
        assert.equal(f.mx.sent.length, 1);
      });
    }
  }
}

test('missing membership is unknown, never done, and sends no action', async () => {
  const f = fixture();
  f.states.delete(f.spaces.arzt);
  assert.deepEqual(logic.getOwnRoleStatus(f.mx, f.patient.room), { ready: false });
  await assert.rejects(
    logic.sendCaseAction(f.mx, f.patient.room, undefined, 'toggle'),
    /noch nicht verfügbar/
  );
  assert.equal(f.mx.sent.length, 0);
});

test('late-loaded space triggers refresh and makes the correct role actionable', () => {
  const f = fixture();
  const space = f.states.get(f.spaces.arzt);
  f.states.delete(f.spaces.arzt);
  const observed = [];
  const cleanup = logic.subscribeCaseContext(f.mx, f.patient.room, () =>
    observed.push(logic.getOwnRoleStatus(f.mx, f.patient.room))
  );
  f.states.set(f.spaces.arzt, space);
  f.mx.emit('Room', space);
  assert.equal(observed.at(-1).role, 'arzt');
  f.mx.emit('Room.myMembership', space);
  assert.equal(observed.length, 2);
  cleanup();
  assert.equal(f.mx.listenerCount('RoomState.events'), 0);
  assert.equal(f.mx.listenerCount('Room.myMembership'), 0);
});

test('late case state refreshes actions and list from the same state', () => {
  const f = fixture();
  const content = f.patient.state.get('io.kiconnect.case');
  f.patient.state.delete('io.kiconnect.case');
  assert.equal(logic.getOwnRoleStatus(f.mx, f.patient.room).ready, false);
  assert.equal(logic.getPatientCaseStatus(undefined), undefined);
  let latest;
  const cleanup = logic.subscribeCaseContext(f.mx, f.patient.room, () => {
    latest = logic.getOwnRoleStatus(f.mx, f.patient.room);
  });
  f.patient.state.set('io.kiconnect.case', content);
  f.mx.emit('RoomState.events', event(f.patient.room.roomId, 'io.kiconnect.case', content));
  assert.equal(latest.own, logic.getPatientCaseStatus(content));
  assert.equal(latest.ready, true);
  cleanup();
});

test('missing role-space metadata resolves via restricted join rules, not other tenants', async () => {
  const f = fixture('team');
  delete f.patient.state.get('io.kiconnect.case').roles.team.space_room_id;
  assert.equal(logic.getOwnRoleStatus(f.mx, f.patient.room).spaceRoomId, f.spaces.team);
  f.makeRoom('!other-tenant:test', { 'io.kiconnect.arzt': {} }, 'join', true);
  await logic.sendCaseAction(f.mx, f.patient.room, '!other-tenant:test', 'toggle');
  assert.equal(f.mx.sent[0].content.space_room_id, f.spaces.team);
});

test('an invitation is not a joined, authorized role space', () => {
  const f = fixture();
  f.states.get(f.spaces.arzt).getMyMembership = () => 'invite';
  assert.equal(logic.getOwnRoleStatus(f.mx, f.patient.room).ready, false);
});

test('ambiguous joined roles need a verified role-space selection', () => {
  const f = fixture();
  f.makeRoom(f.spaces.team, { 'io.kiconnect.team': {} }, 'join', true);
  assert.equal(logic.getOwnRoleStatus(f.mx, f.patient.room).ready, false);
  assert.equal(logic.getOwnRoleStatus(f.mx, f.patient.room, f.spaces.team).role, 'team');
});

test('bot-managed team directory disambiguates a doctor joined to both spaces', () => {
  const f = fixture();
  const payload = { team: [{ matrix_uid: '@zstaff:test', role: 'arzt' }] };
  f.makeRoom(f.spaces.arzt, { 'io.kiconnect.arzt': payload }, 'join', true);
  f.makeRoom(f.spaces.team, { 'io.kiconnect.team': payload }, 'join', true);
  assert.equal(logic.getOwnRoleStatus(f.mx, f.patient.room, f.personal.room.roomId).role, 'arzt');
});

test('status is re-read on click instead of toggling a stale displayed value', async () => {
  const f = fixture();
  assert.equal(logic.getOwnRoleStatus(f.mx, f.patient.room).own, 'open');
  f.patient.state.get('io.kiconnect.case').roles.arzt.state = 'done';
  await logic.sendCaseAction(f.mx, f.patient.room, undefined, 'toggle');
  assert.equal(f.mx.sent[0].content.target_state, 'open');
});

test('unknown role status does not create a done/open fallback', async () => {
  const f = fixture();
  delete f.patient.state.get('io.kiconnect.case').roles.arzt.state;
  assert.equal(logic.getOwnRoleStatus(f.mx, f.patient.room).own, undefined);
  await assert.rejects(logic.sendCaseAction(f.mx, f.patient.room, undefined, 'toggle'));
  assert.equal(f.mx.sent.length, 0);
});
