import React, { useEffect, useState } from 'react';
import type { Room } from 'matrix-js-sdk/src/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';

import { isTeamRoom } from '../logic/roomState';
import { clientLogoutAll } from '../logic/logout';
import KiconnectLoginDialog from '../components/KiconnectLoginDialog';
import KiconnectSearchDialog from '../components/KiconnectSearchDialog';

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
  const [showSearch, setShowSearch] = useState(false);

  // 🔁 Re-Render bei Case-State-Änderung (NUR im Patientenraum)
  useEffect(() => {
    if (isTeamRoom(room)) return;

    const handler = (event: any) => {
      if (
        event.getType?.() === 'io.kiconnect.case' &&
        event.getStateKey?.() === ''
      ) {
        forceUpdate((x) => x + 1);
      }
    };

    room.on('RoomState.events', handler);
    return () => {
      room.off('RoomState.events', handler);
    };
  }, [room]);

  

  // -----------------------------
  // TEAMRAUM → Suche / Login / Logout
  // -----------------------------
  if (isTeamRoom(room)) {
    return (
      <>
        {showSearch && (
          <KiconnectSearchDialog
            room={room}
            onFinished={() => setShowSearch(false)}
          />
        )}

        {showLogin && (
          <KiconnectLoginDialog
            room={room}
            onFinished={() => setShowLogin(false)}
          />
        )}

        <div className="kiconnect-room-actions">
          <div className="kiconnect-room-actions-divider" />
          <button onClick={() => setShowSearch(true)}>Suche</button>
          <button onClick={() => setShowLogin(true)}>Login</button>
          <button onClick={() => clientLogoutAll(mx, room)}>Logout</button>
        </div>
      </>
    );
  }

  // -----------------------------
  // PATIENTENRAUM → Erledigt / Undo
  // -----------------------------
  const status = getCaseStatus(room);
  const label = status === 'done' ? 'Wieder öffnen' : 'Erledigt';

  const onToggleDone = () => {
    mx.sendEvent(room.roomId, 'io.kiconnect.case.toggle', {
      by: mx.getUserId(),
      ts: Date.now(),
    });
  };

  return (
    <div className="kiconnect-room-actions">
      <div className="kiconnect-room-actions-divider" />
      <button onClick={onToggleDone}>{label}</button>
    </div>
  );
}
