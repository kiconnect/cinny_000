import type { MatrixClient } from 'matrix-js-sdk';
import { isTeamRoom } from './roomState';

export type KiconnectAccountType = 'team' | 'patient' | 'unknown';

const ACCOUNT_TYPE_PREFIX = 'kiconnect.account-type.v1.';

export const accountTypeStorageKey = (userId: string): string =>
  `${ACCOUNT_TYPE_PREFIX}${encodeURIComponent(userId)}`;

export function readAccountType(userId: string): KiconnectAccountType {
  const value = localStorage.getItem(accountTypeStorageKey(userId));
  return value === 'team' || value === 'patient' ? value : 'unknown';
}

export function writeAccountType(userId: string, accountType: KiconnectAccountType): void {
  if (accountType === 'unknown') {
    localStorage.removeItem(accountTypeStorageKey(userId));
    return;
  }
  localStorage.setItem(accountTypeStorageKey(userId), accountType);
}

/**
 * Reuse the same room-state distinction that controls KIconnect's existing
 * team and patient actions. This must only run after Matrix has prepared room state.
 */
export function detectAccountType(mx: MatrixClient): Exclude<KiconnectAccountType, 'unknown'> {
  const isTeam = mx
    .getRooms()
    .some((room) => room.getMyMembership() === 'join' && isTeamRoom(room));
  return isTeam ? 'team' : 'patient';
}
