import React, { useEffect, useMemo, useState } from "react";
import type { Room } from "matrix-js-sdk/src/matrix";
import { useMatrixClient } from "../../hooks/useMatrixClient";
import { useSelectedSpace } from "../../hooks/router/useSelectedSpace";

import { isTeamRoom } from "../logic/roomState";
import { delete_done } from "../logic/delete_done";
import KiconnectSearchDialog from "../components/KiconnectSearchDialog";

import "../styles/RoomActions.css";

type Props = {
  room: Room;
};

type CaseStatus = "open" | "done";
type CaseRole = "arzt" | "team";

type CaseRoleEntry = {
  space_room_id?: string;
  state?: string;
};

type CaseContent = {
  roles?: {
    arzt?: CaseRoleEntry | string;
    team?: CaseRoleEntry | string;
  };
};

function normalizeState(value: unknown): CaseStatus {
  const norm = String(value || "").trim().toLowerCase();
  return norm === "done" ? "done" : "open";
}

function getRoleEntryState(entry: CaseRoleEntry | string | undefined): CaseStatus {
  if (typeof entry === "string") {
    return normalizeState(entry);
  }

  return normalizeState(entry?.state);
}

function getRoleFromSpaceId(
  content: CaseContent | undefined,
  selectedSpaceId: string | undefined
): CaseRole | undefined {
  if (!selectedSpaceId) return undefined;

  const roles = content?.roles;
  if (!roles || typeof roles !== "object") return undefined;

  const arzt = roles.arzt;
  if (
    arzt &&
    typeof arzt === "object" &&
    typeof arzt.space_room_id === "string" &&
    arzt.space_room_id === selectedSpaceId
  ) {
    return "arzt";
  }

  const team = roles.team;
  if (
    team &&
    typeof team === "object" &&
    typeof team.space_room_id === "string" &&
    team.space_room_id === selectedSpaceId
  ) {
    return "team";
  }

  return undefined;
}

function getOtherRole(role: CaseRole | undefined): CaseRole | undefined {
  if (role === "arzt") return "team";
  if (role === "team") return "arzt";
  return undefined;
}

function getCaseContent(room: Room): CaseContent | undefined {
  const ev = room.currentState?.getStateEvents?.("io.kiconnect.case", "");
  return ev?.getContent?.() as CaseContent | undefined;
}

function getOwnRoleStatus(
  room: Room,
  selectedSpaceId: string | undefined
): { role?: CaseRole; own: CaseStatus; other: CaseStatus } {
  const content = getCaseContent(room);
  const role = getRoleFromSpaceId(content, selectedSpaceId);
  const otherRole = getOtherRole(role);

  if (!role || !otherRole) {
    return { role: undefined, own: "done", other: "done" };
  }

  return {
    role,
    own: getRoleEntryState(content?.roles?.[role]),
    other: getRoleEntryState(content?.roles?.[otherRole]),
  };
}

function toErrString(e: unknown): string {
  if (!e) return "unknown error";
  if (typeof e === "string") return e;

  const anyE = e as any;

  if (anyE?.message) return String(anyE.message);
  if (anyE?.errcode) return String(anyE.errcode);

  try {
    return JSON.stringify(anyE);
  } catch {
    return String(anyE);
  }
}

function isUsableSpaceId(value: unknown): value is string {
  return typeof value === "string" && value.trim().startsWith("!");
}

export function KiconnectRoomActions({ room }: Props): JSX.Element {
  const mx = useMatrixClient();
  const selectedSpaceId = useSelectedSpace();

  const [showSearch, setShowSearch] = useState(false);
  const [, forceUpdate] = useState(0);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const teamRoom = useMemo(() => isTeamRoom(room), [room]);
  const caseInfo = getOwnRoleStatus(room, selectedSpaceId);

  const erledigtLabel = caseInfo.own === "done" ? "Wieder öffnen" : "Erledigt";

  const canForward =
    !!caseInfo.role &&
    (
      (caseInfo.own === "open" && caseInfo.other === "done") ||
      (caseInfo.own === "done" && caseInfo.other === "open")
    );

  const forwardLabel =
    caseInfo.own === "done" && caseInfo.other === "open"
      ? "Weitergeleitet"
      : "Weiterleiten";

  useEffect(() => {
    if (teamRoom) return;

    const handler = (event: any) => {
      const type = event?.getType?.();
      const stateKey = event?.getStateKey?.();

      if (stateKey !== "") return;

      if (type === "io.kiconnect.case" || type === "io.kiconnect.room") {
        forceUpdate((x) => x + 1);
      }
    };

    room.on("RoomState.events", handler);

    return () => {
      room.off("RoomState.events", handler);
    };
  }, [room, teamRoom]);

  const onDeleteDone = async () => {
    setErr(null);

    try {
      await delete_done(mx, selectedSpaceId);
    } catch (e) {
      setErr(toErrString(e));
    }
  };

  const onToggleDone = async () => {
    if (sending) return;

    setSending(true);
    setErr(null);

    try {
      const spaceRoomId = selectedSpaceId?.trim();

      if (!isUsableSpaceId(spaceRoomId)) {
        throw new Error("Keine gültige User-Space-ID verfügbar.");
      }

      await mx.sendEvent(room.roomId, "io.kiconnect.case.toggle", {
        by: mx.getUserId(),
        ts: Date.now(),
        space_room_id: spaceRoomId,
      });
    } catch (e) {
      setErr(toErrString(e));
    } finally {
      setSending(false);
    }
  };

  const onForward = async () => {
    console.log("[FORWARD] click", {
      sending,
      roomId: room.roomId,
      selectedSpaceId,
      caseInfo,
    });

    if (sending) {
      console.log("[FORWARD] abort sending=true");
      return;
    }

    setSending(true);
    setErr(null);

    try {
      const spaceRoomId = selectedSpaceId?.trim();
      console.log("[FORWARD] spaceRoomId", spaceRoomId);

      if (!isUsableSpaceId(spaceRoomId)) {
        console.log("[FORWARD] abort invalid spaceRoomId");
        throw new Error("Keine gültige User-Space-ID verfügbar.");
      }

      console.log("[FORWARD] before sendEvent");

      const res = await mx.sendEvent(room.roomId, "io.kiconnect.case.forward", {
        by: mx.getUserId(),
        ts: Date.now(),
        space_room_id: spaceRoomId,
      });

      console.log("[FORWARD] sendEvent ok", res);
    } catch (e) {
      console.error("[FORWARD] sendEvent error", e);
      setErr(toErrString(e));
    } finally {
      setSending(false);
      console.log("[FORWARD] finally");
    }
  };

  if (teamRoom) {
    return (
      <>
        {showSearch && (
          <KiconnectSearchDialog
            room={room}
            onFinished={() => setShowSearch(false)}
          />
        )}

        <div className="kiconnect-room-actions">
          <div className="kiconnect-room-actions-divider" />
          <button onClick={() => setShowSearch(true)}>Suche</button>
          <button onClick={onDeleteDone}>Erledigte Chats löschen</button>
          {err && <span style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>}
        </div>
      </>
    );
  }

  return (
    <div className="kiconnect-room-actions">
      <div className="kiconnect-room-actions-divider" />
      <button onClick={onToggleDone} disabled={sending}>
        {sending ? "…" : erledigtLabel}
      </button>

      {canForward && (
        <button onClick={onForward} disabled={sending}>
          {sending ? "…" : forwardLabel}
        </button>
      )}

      {err && <span style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>}
    </div>
  );
}