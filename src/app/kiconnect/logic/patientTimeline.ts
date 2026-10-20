import type { KiconnectAccountType } from './accountType';

const ROOM_ACTIVITY_TYPES = new Set([
  'm.room.member',
  'm.room.topic',
  'm.room.name',
  'm.room.avatar',
]);

/** Presentation only: never suppress chat messages or change Matrix state. */
export function hidePatientRoomActivity(
  accountType: KiconnectAccountType,
  userId: string,
  eventType: string,
  isStateEvent: boolean
): boolean {
  return (
    accountType === 'patient' &&
    !/^@z/i.test(userId) &&
    isStateEvent &&
    ROOM_ACTIVITY_TYPES.has(eventType)
  );
}
