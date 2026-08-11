import { useAtomValue } from 'jotai';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { mDirectAtom } from '../../../state/mDirectList';
import { roomToParentsAtom } from '../../../state/room/roomToParents';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { useOrphanRooms } from '../../../state/hooks/roomList';
import {
  isOwnedTeamCommunicationRoom,
  isOwnedTeamRoom,
  isTeamRequestRoom,
} from '../../../kiconnect/logic/roomState';

export const useHomeRooms = () => {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const allRooms = useAtomValue(allRoomsAtom);
  const rooms = useOrphanRooms(mx, allRoomsAtom, mDirects, roomToParents);
  const currentUserId = mx.getUserId();
  const pinnedRooms = allRooms.filter((roomId) => {
    const room = mx.getRoom(roomId);
    return (
      isOwnedTeamRoom(room, currentUserId) ||
      isOwnedTeamCommunicationRoom(room, currentUserId) ||
      isTeamRequestRoom(room)
    );
  });

  return Array.from(new Set([...pinnedRooms, ...rooms]));
};
