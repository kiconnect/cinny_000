/** Server-side policy, scoped to rooms owned by the signed-in patient.
 * No message contents or credentials are sent to a new service.
 */
export const PATIENT_PUSH_PREFIX = 'io.kiconnect.patient-push.v1.';

type Condition = { kind: 'event_match'; key: string; pattern: string };
export type PatientPushRule = {
  rule_id: string;
  conditions: Condition[];
  actions: ('notify' | { set_tweak: string; value?: boolean | string })[];
};
type ExistingRule = {
  rule_id: string;
  default?: boolean;
  enabled?: boolean;
  conditions?: unknown[];
  actions: unknown[];
};

const match = (key: string, pattern: string): Condition => ({
  kind: 'event_match',
  key,
  pattern,
});
const literalGlob = (text: string) => text.replace(/[\\*?[\]]/g, '\\$&');

/** Highest priority first. An empty action list explicitly suppresses push. */
export function patientPushRules(roomId: string): PatientPushRule[] {
  const prefix = `${PATIENT_PUSH_PREFIX}${encodeURIComponent(roomId)}.`;
  const room = match('room_id', literalGlob(roomId));
  const notify: PatientPushRule['actions'] = [
    'notify',
    { set_tweak: 'sound', value: 'default' },
    { set_tweak: 'highlight', value: false },
  ];
  return [
    {
      rule_id: `${prefix}edits`,
      conditions: [room, match('content.m\\.relates_to.rel_type', 'm.replace')],
      actions: [],
    },
    {
      rule_id: `${prefix}team-message`,
      conditions: [room, match('type', 'm.room.message'), match('sender', '@z*:*')],
      actions: notify,
    },
    {
      rule_id: `${prefix}team-encrypted`,
      conditions: [room, match('type', 'm.room.encrypted'), match('sender', '@z*:*')],
      actions: notify,
    },
    {
      rule_id: `${prefix}broadcast`,
      conditions: [
        room,
        match('type', 'm.room.message'),
        match('sender', '@bot-*:*'),
        match('content.io\\.kiconnect\\.broadcast.request_id', '*'),
      ],
      actions: notify,
    },
    { rule_id: `${prefix}other`, conditions: [room], actions: [] },
  ];
}

export function ownedPatientPushRooms(
  rooms: {
    roomId: string;
    getMyMembership(): string;
    currentState: {
      getStateEvents(type: string, key: string): { getContent(): Record<string, unknown> } | null;
    };
  }[],
  userId: string,
  accountType: string
): string[] {
  if (accountType !== 'patient' || /^@z/i.test(userId)) return [];
  return rooms
    .filter((room) => {
      const state = room.currentState.getStateEvents('io.kiconnect.room', '')?.getContent();
      return (
        room.getMyMembership() === 'join' && state?.kind === 'patient' && state.owner === userId
      );
    })
    .map((room) => room.roomId)
    .sort();
}

/** Install allows first; only then install the scoped deny below them.
 * Retries are idempotent, including an interrupted installation.
 */
export async function installPatientPushRules(
  existing: ExistingRule[],
  desired: PatientPushRule[],
  put: (rule: PatientPushRule, position: { before?: string; after?: string }) => Promise<unknown>
): Promise<void> {
  let currentRules = existing;
  const custom = existing.filter(
    (rule) => !rule.default && !rule.rule_id.startsWith(PATIENT_PUSH_PREFIX)
  );
  // Preserve existing explicit mute overrides ahead of our notification policy.
  const firstNotify = custom.find((rule) => rule.actions.includes('notify'));
  const initialPosition: { before?: string; after?: string } = {};
  if (firstNotify) initialPosition.before = firstNotify.rule_id;
  else if (custom.length) initialPosition.after = custom[custom.length - 1].rule_id;
  // Ordering requires sequential server writes, not Promise.all.
  await desired.reduce(async (pending, rule, ruleIndex) => {
    await pending;
    const previous = desired[ruleIndex - 1]?.rule_id;
    const index = currentRules.findIndex((r) => r.rule_id === rule.rule_id);
    const current = currentRules[index];
    const previousIndex = currentRules.findIndex((r) => r.rule_id === previous);
    if (
      !current ||
      current.enabled === false ||
      JSON.stringify(current.conditions) !== JSON.stringify(rule.conditions) ||
      JSON.stringify(current.actions) !== JSON.stringify(rule.actions) ||
      (previous && index <= previousIndex)
    ) {
      await put(rule, previous ? { after: previous } : initialPosition);
      const filtered = currentRules.filter((r) => r.rule_id !== rule.rule_id);
      let position = 0;
      if (previous) position = filtered.findIndex((r) => r.rule_id === previous) + 1;
      else if (firstNotify) position = filtered.findIndex((r) => r.rule_id === firstNotify.rule_id);
      else if (custom.length)
        position = filtered.findIndex((r) => r.rule_id === custom[custom.length - 1].rule_id) + 1;
      filtered.splice(position, 0, { ...rule, enabled: true });
      currentRules = filtered;
    }
  }, Promise.resolve());
}
