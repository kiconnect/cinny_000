import { EventType, type Room, type MatrixClient } from 'matrix-js-sdk';

export async function clientLogoutAll(mx: MatrixClient, room: Room): Promise<void> {
  // 1) Logout-Command senden (NUR Text)
  await mx.sendEvent(room.roomId, EventType.RoomMessage, {
    msgtype: 'm.text',
    body: '!logout',
  });

  // 2) danach alle anderen Räume verlassen
  const rooms = mx.getRooms();
  for (const r of rooms) {
    if (r.roomId === room.roomId) continue;

    const m = r.getMyMembership();
    if (m === 'join' || m === 'invite') {
      try { await mx.leave(r.roomId); } catch {}
      try { await mx.forget(r.roomId); } catch {}
    }
  }
}
