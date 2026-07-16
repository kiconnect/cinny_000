import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Dialog, Overlay, OverlayBackdrop, OverlayCenter, Text } from "folds";
import type { Room } from "matrix-js-sdk/src/matrix";
import type { MatrixClient } from "matrix-js-sdk";
import { useMatrixClient } from "../../hooks/useMatrixClient";
import { useSelectedSpace } from "../../hooks/router/useSelectedSpace";

import { getRoomOwner, isPatientRoom, isTeamRoom } from "../logic/roomState";
import { delete_done } from "../logic/delete_done";
import { clientLogout } from "../logic/logout";
import { useKiconnectLock } from "../lock/LockProvider";
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

function getRoleFromCurrentUser(
  mx: MatrixClient,
  content: CaseContent | undefined
): CaseRole | undefined {
  const roles = content?.roles;
  if (!roles || typeof roles !== "object") return undefined;

  for (const role of ["arzt", "team"] as const) {
    const entry = roles[role];
    if (!entry || typeof entry !== "object") continue;

    const spaceRoomId = entry.space_room_id;
    if (typeof spaceRoomId !== "string" || !spaceRoomId) continue;

    const membership = mx.getRoom(spaceRoomId)?.getMyMembership?.();
    if (membership === "join" || membership === "invite") {
      return role;
    }
  }

  return undefined;
}

function getOtherRole(role: CaseRole | undefined): CaseRole | undefined {
  if (role === "arzt") return "team";
  if (role === "team") return "arzt";
  return undefined;
}

function getRoleSpaceRoomId(
  content: CaseContent | undefined,
  role: CaseRole | undefined
): string | undefined {
  if (!role) return undefined;

  const entry = content?.roles?.[role];
  if (!entry || typeof entry !== "object") return undefined;

  const spaceRoomId = entry.space_room_id;
  return typeof spaceRoomId === "string" && spaceRoomId.trim() ? spaceRoomId.trim() : undefined;
}

function getCaseContent(room: Room): CaseContent | undefined {
  const ev = room.currentState?.getStateEvents?.("io.kiconnect.case", "");
  return ev?.getContent?.() as CaseContent | undefined;
}

function getOwnRoleStatus(
  mx: MatrixClient,
  room: Room,
  selectedSpaceId: string | undefined
): { role?: CaseRole; own: CaseStatus; other: CaseStatus; spaceRoomId?: string } {
  const content = getCaseContent(room);
  const role = getRoleFromSpaceId(content, selectedSpaceId) || getRoleFromCurrentUser(mx, content);
  const otherRole = getOtherRole(role);
  const spaceRoomId = selectedSpaceId?.trim() || getRoleSpaceRoomId(content, role);

  if (!role || !otherRole) {
    return { role: undefined, own: "done", other: "done" };
  }

  return {
    role,
    own: getRoleEntryState(content?.roles?.[role]),
    other: getRoleEntryState(content?.roles?.[otherRole]),
    spaceRoomId,
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
  const { lock } = useKiconnectLock();

  const [showSearch, setShowSearch] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [, forceUpdate] = useState(0);
  const [sending, setSending] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const teamRoom = useMemo(() => isTeamRoom(room), [room]);
  const caseInfo = getOwnRoleStatus(mx, room, selectedSpaceId);
  const roomOwner = getRoomOwner(room);
  const patientRoomOwner =
    isPatientRoom(room) &&
    (roomOwner ? roomOwner === mx.getUserId() : caseInfo.role === undefined);

  const erledigtLabel = caseInfo.own === "done" ? "Wieder öffnen" : "Erledigt";

  const canForward =
    !!caseInfo.role &&
    caseInfo.own === "open" &&
    caseInfo.other === "done";

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

  const onSecureLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    setErr(null);
    try {
      await clientLogout(mx);
    } catch (e) {
      setErr(toErrString(e));
      setLoggingOut(false);
    }
  };

  const sessionButtons = (
    <div className="kiconnect-secure-logout">
      <button type="button" className="kiconnect-lock-button" onClick={lock} disabled={loggingOut}>
        Cinny sperren
      </button>
      <button type="button" onClick={onSecureLogout} disabled={loggingOut}>
        {loggingOut ? "Abmeldung läuft …" : "Vollständig abmelden"}
      </button>
    </div>
  );

  const onToggleDone = async () => {
    if (sending) return;

    setSending(true);
    setErr(null);

    try {
      const spaceRoomId = caseInfo.spaceRoomId?.trim();

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
      const spaceRoomId = caseInfo.spaceRoomId?.trim();
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

  const onResetChat = async () => {
    if (sending) return;

    setSending(true);
    setErr(null);

    try {
      await mx.sendEvent(room.roomId, "m.room.message", {
        msgtype: "m.text",
        body: "storno!",
      });
      setShowResetConfirm(false);
    } catch (e) {
      setErr(toErrString(e));
    } finally {
      setSending(false);
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
        {sessionButtons}
      </>
    );
  }

  if (patientRoomOwner) {
    return (
      <>
        {showResetConfirm && (
          <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <Dialog variant="Surface" style={{ width: "min(420px, calc(100vw - 32px))" }}>
                <Box direction="Column" gap="400" style={{ padding: 24 }}>
                  <Box direction="Column" gap="200">
                    <Text size="H4">Chat zurücksetzen</Text>
                    <Text priority="400">Soll der Chat wirklich zurückgesetzt werden?</Text>
                  </Box>
                  {err && <Text size="T300">{err}</Text>}
                  <Box direction="Row" gap="200" justifyContent="End">
                    <Button
                      variant="Secondary"
                      onClick={() => setShowResetConfirm(false)}
                      disabled={sending}
                    >
                      Abbrechen
                    </Button>
                    <Button variant="Critical" onClick={onResetChat} disabled={sending}>
                      {sending ? "Wird zurückgesetzt …" : "Chat zurücksetzen"}
                    </Button>
                  </Box>
                </Box>
              </Dialog>
            </OverlayCenter>
          </Overlay>
        )}

        <div className="kiconnect-room-actions">
          <div className="kiconnect-room-actions-divider" />
          <button onClick={() => setShowResetConfirm(true)} disabled={sending}>
            Chat zurücksetzen
          </button>
          {err && !showResetConfirm && (
            <span style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>
          )}
        </div>
        {sessionButtons}
      </>
    );
  }

  return (
    <>
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
      {sessionButtons}
    </>
  );
}
