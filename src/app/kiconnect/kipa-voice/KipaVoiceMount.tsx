import React, { lazy, Suspense } from 'react';
import type { Room } from 'matrix-js-sdk';

import { useKipaRoomConfig } from './room';

const KipaVoicePanel = lazy(() => import('./KipaVoicePanel'));

type Props = {
  room: Room;
};

export function KipaVoiceMount({ room }: Props): JSX.Element | null {
  const config = useKipaRoomConfig(room);

  if (!config) return null;

  return (
    <Suspense fallback={null}>
      <KipaVoicePanel key={`${room.roomId}:${config.paUserId}`} room={room} config={config} />
    </Suspense>
  );
}
