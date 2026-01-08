import React, { useState } from 'react';
import type { Room } from 'matrix-js-sdk/src/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';

import { isTeamRoom } from '../logic/roomState';
import { clientLogoutAll } from '../logic/logout';
import KiconnectLoginDialog from '../components/KiconnectLoginDialog';

import '../styles/RoomActions.css';

type Props = {
  room: Room;
};

function getCaseStatus(room: Room): 'open' | 'done' {
  const ev = room.currentState.getStateEvents('io.kiconnect.case', '');
  return ev?.getContent()?.status === 'done' ? 'done' : 'open';
}

export function KiconnectRoomActions({ room }: Props): JSX.Element {
  const mx = useMatrixClient();
  const [showLogin, setShowLogin] = useState(false);

  // -----------------------------
  // TEAMRAUM → Login / Logout
  // -----------------------------
  if (isTeamRoom(room)) {
    return (
      <>
        {showLogin && (
          <KiconnectLoginDialog
            room={room}
            onFinished={() => setShowLogin(false)}
          />
        )}

        <div className="kiconnect-room-actions">
          <div className="kiconnect-room-actions-divider" />
          <button onClick={() => setShowLogin(true)}>Login</button>
          <button onClick={() => clientLogoutAll(mx)}>Logout</button>
        </div>
      </>
    );
  }

  // -----------------------------
  // PATIENTENRAUM → Erledigt
  // -----------------------------
  const status = getCaseStatus(room);
  const label = status === 'done' ? 'Wieder öffnen' : 'Erledigt';

  const onDone = async () => {
    if (!window.confirm('Alles erledigt?\nDie Anfrage wird endgültig gelöscht.')) {
      return;
    }

    await mx.sendStateEvent(
      room.roomId,
      'io.kiconnect.case',
      {
        status: 'done',
        by: mx.getUserId(),
        ts: Date.now(),
      },
      ''
    );
  };

  return (
    <div className="kiconnect-room-actions">
      <div className="kiconnect-room-actions-divider" />
      <button onClick={onDone}>{label}</button>
    </div>
  );
}
