import { useEffect, useReducer } from 'react';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import { getCaseSpaceIds, getOwnRoleStatus, subscribeCaseContext } from '../logic/caseStatus';

export function useCaseRoleStatus(mx: MatrixClient, room: Room, selectedSpaceId?: string) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const spaceIds = getCaseSpaceIds(room).join('|');
  useEffect(() => subscribeCaseContext(mx, room, refresh), [mx, room]);
  useEffect(() => {
    let disposed = false;
    const spaces = spaceIds.split('|').filter(Boolean);
    Promise.all(
      spaces.map((id) =>
        mx
          .getRoom(id)
          ?.loadMembersIfNeeded()
          .catch(() => undefined)
      )
    ).then(() => {
      if (!disposed) refresh();
    });
    return () => {
      disposed = true;
    };
  }, [mx, spaceIds]);
  return getOwnRoleStatus(mx, room, selectedSpaceId);
}
