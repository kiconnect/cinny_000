import type { Room } from 'matrix-js-sdk/src/matrix';
import type { MatrixClient } from 'matrix-js-sdk';

export async function clientLogin(
  mx: MatrixClient,
  room: Room,
  username: string,
  password: string
): Promise<void> {
  await mx.sendEvent(room.roomId, 'io.kiconnect.login', {
    username,
    password,
  });
}
