import { Room, RoomStateEvent } from 'matrix-js-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Membership } from '../../../types/matrix/room';

export const KIPA_ROOM_STATE_EVENT = 'io.kiconnect.kipa';

export type KipaRoomConfig = {
  enabled: boolean;
  paUserId: string;
  protocol: number;
};

type KipaRoomStateContent = {
  enabled?: unknown;
  pa_user_id?: unknown;
  protocol?: unknown;
};

const isPaUserId = (userId: string): boolean => userId.toLowerCase().startsWith('@pa-');

export const getKipaRoomConfig = (room: Room): KipaRoomConfig | undefined => {
  const stateEvent = room.currentState.getStateEvents(KIPA_ROOM_STATE_EVENT, '');
  const content = stateEvent?.getContent<KipaRoomStateContent>();

  if (content?.enabled !== true) return undefined;

  const configuredPaUserId =
    typeof content.pa_user_id === 'string' ? content.pa_user_id.trim() : '';

  const paMember = room
    .getJoinedMembers()
    .find(
      (member) =>
        member.membership === Membership.Join &&
        isPaUserId(member.userId) &&
        (!configuredPaUserId || member.userId === configuredPaUserId)
    );

  if (!paMember) return undefined;

  const protocol =
    typeof content.protocol === 'number' && Number.isInteger(content.protocol)
      ? content.protocol
      : 1;

  return {
    enabled: true,
    paUserId: paMember.userId,
    protocol,
  };
};

export const useKipaRoomConfig = (room: Room): KipaRoomConfig | undefined => {
  const readConfig = useCallback(() => getKipaRoomConfig(room), [room]);
  const [config, setConfig] = useState<KipaRoomConfig | undefined>(readConfig);

  useEffect(() => {
    const update = () => setConfig(readConfig());

    room.currentState.on(RoomStateEvent.Events, update);
    room.currentState.on(RoomStateEvent.Members, update);

    update();
    return () => {
      room.currentState.off(RoomStateEvent.Events, update);
      room.currentState.off(RoomStateEvent.Members, update);
    };
  }, [room, readConfig]);

  return useMemo(
    () => config,
    // Keep consumers stable while unrelated room state changes arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config?.enabled, config?.paUserId, config?.protocol]
  );
};
