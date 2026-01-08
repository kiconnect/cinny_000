import { EventType, type Room, type MatrixClient } from 'matrix-js-sdk';

export async function clientLogoutAll(mx: MatrixClient): Promise<void> {
  const rooms: Room[] = mx.getRooms();
  let botRoomId: string | null = null;

  const actions: Promise<unknown>[] = [];

  for (const room of rooms) {
    const isBotRoom = !!room.currentState?.getStateEvents(
      'io.kiconnect.teamroom',
      ''
    );

    if (isBotRoom) {
      botRoomId = room.roomId;
      continue;
    }

    const m = room.getMyMembership();
    if (m === 'join' || m === 'invite') {
      actions.push(
        (async () => {
          try {
            await mx.leave(room.roomId);
          } catch {}
          try {
            await mx.forget(room.roomId);
          } catch {}
        })()
      );
    }
  }

  await Promise.allSettled(actions);

  if (botRoomId) {
    await mx.sendEvent(botRoomId, EventType.RoomMessage, {
      msgtype: 'm.text',
      body: '!logout',
    });
  }
}
