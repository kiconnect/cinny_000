import type {
  MatrixClient,
  MatrixEvent,
  Room,
  ClientEvent,
  RoomEvent,
  RoomStateEvent,
} from 'matrix-js-sdk';

export type CaseStatus = 'open' | 'pending' | 'waiting' | 'done';
export type CaseRole = 'arzt' | 'team';
export type CaseRoleEntry = { space_room_id?: string; state?: string };
export type CaseContent = {
  waiting_patient?: boolean;
  roles?: Partial<Record<CaseRole | 'bot', CaseRoleEntry | string>>;
};
export type OwnRoleStatus = {
  role?: CaseRole;
  own?: CaseStatus;
  other?: CaseStatus;
  spaceRoomId?: string;
  ready: boolean;
};

export function getCaseContent(room: Room): CaseContent | undefined {
  return room.currentState.getStateEvents('io.kiconnect.case', '')?.getContent();
}

export function getRoleEntryState(
  entry: CaseRoleEntry | string | undefined
): CaseStatus | undefined {
  const state = String(typeof entry === 'string' ? entry : entry?.state || '')
    .trim()
    .toLowerCase();
  return ['open', 'pending', 'waiting', 'done'].includes(state) ? (state as CaseStatus) : undefined;
}

export function getPatientCaseStatus(content: CaseContent | undefined): CaseStatus | undefined {
  const states = (['bot', 'arzt', 'team'] as const).map((role) =>
    getRoleEntryState(content?.roles?.[role])
  );
  if (states.every((state) => state === 'done')) return 'done';
  if (states.includes('pending')) return 'pending';
  if (states.includes('open')) return 'open';
  if (states.includes('waiting')) return 'waiting';
  return undefined;
}

export function getCaseSpaceIds(room: Room): string[] {
  const content = getCaseContent(room);
  const ids = new Set<string>();
  (['arzt', 'team'] as const).forEach((role) => {
    const entry = content?.roles?.[role];
    if (entry && typeof entry === 'object' && entry.space_room_id?.startsWith('!')) {
      ids.add(entry.space_room_id);
    }
  });
  // Legacy rooms can lack role-space IDs in the case event. Their restricted
  // join rule still names the relevant tenant's spaces; never scan other tenants.
  const rules = room.currentState.getStateEvents('m.room.join_rules', '')?.getContent();
  (Array.isArray(rules?.allow) ? rules.allow : []).forEach((allow) => {
    if (
      allow.type === 'm.room_membership' &&
      typeof allow.room_id === 'string' &&
      allow.room_id.startsWith('!')
    ) {
      ids.add(allow.room_id);
    }
  });
  return [...ids];
}

export function getOwnRoleStatus(
  mx: MatrixClient,
  room: Room,
  selectedSpaceId?: string
): OwnRoleStatus {
  const content = getCaseContent(room);
  const candidates: Array<{ role: CaseRole; spaceRoomId: string }> = [];
  getCaseSpaceIds(room).forEach((spaceRoomId) => {
    const space = mx.getRoom(spaceRoomId);
    if (!space || space.getMyMembership() !== 'join' || !space.isSpaceRoom()) return;
    const roles = (['arzt', 'team'] as const).filter((role) => {
      const entry = content?.roles?.[role];
      const mapped = entry && typeof entry === 'object' && entry.space_room_id === spaceRoomId;
      const marker = space.currentState.getStateEvents(`io.kiconnect.${role}`, '');
      const opposite = space.currentState.getStateEvents(
        `io.kiconnect.${role === 'arzt' ? 'team' : 'arzt'}`,
        ''
      );
      return (mapped || !!marker) && !opposite;
    });
    if (roles.length === 1) candidates.push({ role: roles[0], spaceRoomId });
  });
  // Some staff belong to both spaces. The bot's role-space payload also
  // carries the tenant's team directory, which can disambiguate their role.
  const assigned = candidates.filter((item) => {
    const payload = mx
      .getRoom(item.spaceRoomId)
      ?.currentState.getStateEvents(`io.kiconnect.${item.role}`, '')
      ?.getContent();
    return (Array.isArray(payload?.team) ? payload.team : []).some((member) => {
      const id =
        member.matrix_uid ||
        member.matrix_user_id ||
        member.matrix_id ||
        member.mxid ||
        member.user_id;
      return id === mx.getUserId() && member.role === item.role;
    });
  });
  const candidate =
    candidates.find((item) => item.spaceRoomId === selectedSpaceId) ||
    (candidates.length === 1 ? candidates[0] : undefined) ||
    (assigned.length === 1 ? assigned[0] : undefined);
  if (!candidate) return { ready: false };
  const own = getRoleEntryState(content?.roles?.[candidate.role]);
  const other = getRoleEntryState(content?.roles?.[candidate.role === 'arzt' ? 'team' : 'arzt']);
  return { ...candidate, own, other, ready: own !== undefined };
}

export function subscribeCaseContext(
  mx: MatrixClient,
  room: Room,
  onUpdate: () => void
): () => void {
  const relevant = (id: string | undefined) =>
    id === room.roomId || getCaseSpaceIds(room).includes(id || '');
  const onState = (event: MatrixEvent) => {
    if (relevant(event.getRoomId())) onUpdate();
  };
  const onRoom = (changed: Room) => {
    if (relevant(changed.roomId)) onUpdate();
  };
  mx.on('RoomState.events' as RoomStateEvent.Events, onState);
  mx.on('Room.myMembership' as RoomEvent.MyMembership, onRoom);
  mx.on('Room' as ClientEvent.Room, onRoom);
  return () => {
    mx.removeListener('RoomState.events' as RoomStateEvent.Events, onState);
    mx.removeListener('Room.myMembership' as RoomEvent.MyMembership, onRoom);
    mx.removeListener('Room' as ClientEvent.Room, onRoom);
  };
}

export async function sendCaseAction(
  mx: MatrixClient,
  room: Room,
  selectedSpaceId: string | undefined,
  action: 'toggle' | 'forward' | 'wait_patient'
): Promise<void> {
  // Re-resolve on click: status and membership may have changed since rendering.
  const info = getOwnRoleStatus(mx, room, selectedSpaceId);
  if (!info.ready || !info.spaceRoomId)
    throw new Error('Rollen- oder Statusdaten sind noch nicht verfügbar.');
  if (
    action === 'forward' &&
    (!['open', 'pending'].includes(info.own || '') || info.other !== 'done')
  ) {
    throw new Error('Diese Anfrage kann im aktuellen Status nicht weitergeleitet werden.');
  }
  await mx.sendEvent(room.roomId, `io.kiconnect.case.${action}`, {
    by: mx.getUserId(),
    ts: Date.now(),
    space_room_id: info.spaceRoomId,
    ...(action === 'toggle' ? { target_state: info.own === 'done' ? 'open' : 'done' } : {}),
  });
}
