// RoomActions.tsx

import React, { useEffect, useMemo, useState } from "react";
import type { Room } from "matrix-js-sdk/src/matrix";
import { useMatrixClient } from "../../hooks/useMatrixClient";

import { isTeamRoom } from "../logic/roomState";
import { delete_done } from "../logic/delete_done";
import KiconnectSearchDialog from "../components/KiconnectSearchDialog";

import "../styles/RoomActions.css";

type Props = {
  room: Room;
};

function getCaseStatus(room: Room): "open" | "done" {
  const ev = room.currentState?.getStateEvents?.("io.kiconnect.case", "");
  return ev?.getContent?.()?.status === "done" ? "done" : "open";
}

function toErrString(e: unknown): string {
  if (!e) return "unknown error";
  if (typeof e === "string") return e;
  // matrix-js-sdk errors often have: errcode, message, name
  const anyE = e as any;
  if (anyE?.message) return String(anyE.message);
  if (anyE?.errcode) return String(anyE.errcode);
  try {
    return JSON.stringify(anyE);
  } catch {
    return String(anyE);
  }
}

export function KiconnectRoomActions({ room }: Props): JSX.Element {
  const mx = useMatrixClient();

  // Hooks MUST be unconditional (no early return before them)
  const [showSearch, setShowSearch] = useState(false);
  const [, forceUpdate] = useState(0);

  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const teamRoom = useMemo(() => isTeamRoom(room), [room]);

  // Re-render on relevant state changes (only patient rooms)
  useEffect(() => {
    if (teamRoom) return;

    const handler = (event: any) => {
      const t = event?.getType?.();
      const sk = event?.getStateKey?.();
      if (sk !== "") return;

      if (t === "io.kiconnect.case" || t === "io.kiconnect.room") {
        forceUpdate((x) => x + 1);
      }
    };

    // room.currentState exists on Room; event emitter is room
    room.on("RoomState.events", handler);
    return () => {
      room.off("RoomState.events", handler);
    };
  }, [room, teamRoom]);

  // TEAM ROOM UI
  if (teamRoom) {
    return (
      <>
        {showSearch && (
          <KiconnectSearchDialog room={room} onFinished={() => setShowSearch(false)} />
        )}

        <div className="kiconnect-room-actions">
          <div className="kiconnect-room-actions-divider" />
          <button onClick={() => setShowSearch(true)}>Suche</button>
          <button
            onClick={async () => {
              setErr(null);
              try {
                await delete_done(mx);
              } catch (e) {
                setErr(toErrString(e));
              }
            }}
          >
            Erledigte Chats löschen
          </button>
          {err && (
            <span style={{ marginLeft: 8, fontSize: 12 }}>
              {err}
            </span>
          )}
        </div>
      </>
    );
  }

  // PATIENT ROOM UI
  const status = getCaseStatus(room);
  const label = status === "done" ? "Wieder öffnen" : "Erledigt";

  const onToggleDone = async () => {
    if (sending) return;

    setSending(true);
    setErr(null);

    try {
      // IMPORTANT: await + show any server rejection in UI
      await mx.sendEvent(room.roomId, "io.kiconnect.case.toggle", {
        by: mx.getUserId(),
        ts: Date.now(),
      });
    } catch (e) {
      setErr(toErrString(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="kiconnect-room-actions">
      <div className="kiconnect-room-actions-divider" />
      <button onClick={onToggleDone} disabled={sending}>
        {sending ? "…" : label}
      </button>
      {err && (
        <span style={{ marginLeft: 8, fontSize: 12 }}>
          {err}
        </span>
      )}
    </div>
  );
}