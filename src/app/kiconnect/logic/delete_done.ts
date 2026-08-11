import type { MatrixClient } from "matrix-js-sdk";
import { getRoomOwner } from "./roomState";

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

type TeamRequestContent = {
  status?: string;
};

function normalizeState(value: unknown): CaseStatus {
  return String(value || "").trim().toLowerCase() === "done" ? "done" : "open";
}

function getRoleEntryState(entry: CaseRoleEntry | string | undefined): CaseStatus {
  if (typeof entry === "string") {
    return normalizeState(entry);
  }

  return normalizeState(entry?.state);
}

function getOverallCaseState(content: CaseContent | undefined): CaseStatus {
  const arzt = getRoleEntryState(content?.roles?.arzt);
  const team = getRoleEntryState(content?.roles?.team);
  return arzt === "done" && team === "done" ? "done" : "open";
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

function shouldDeleteRoom(
  content: CaseContent | undefined,
  selectedSpaceId: string | undefined
): boolean {
  const role = getRoleFromSpaceId(content, selectedSpaceId);

  if (role) {
    return getRoleEntryState(content?.roles?.[role]) === "done";
  }

  return getOverallCaseState(content) === "done";
}

function isDoneTeamRequest(content: TeamRequestContent | undefined): boolean {
  return String(content?.status || "").trim().toLowerCase() === "done";
}

async function waitUntilLeft(mx: MatrixClient, roomId: string, timeoutMs = 4000): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const room = mx.getRoom(roomId);
    const membership = room?.getMyMembership?.();

    if (membership !== "join" && membership !== "invite") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

export async function delete_done(
  mx: MatrixClient,
  selectedSpaceId: string | undefined
): Promise<void> {
  const rooms = mx.getRooms();

  for (const room of rooms) {
    const membership = room.getMyMembership?.();
    if (membership !== "join" && membership !== "invite") continue;

    const kindEv = room.currentState?.getStateEvents?.("io.kiconnect.room", "");
    const kind = kindEv?.getContent?.()?.kind;
    if (kind !== "patient" && kind !== "team_communication" && kind !== "team_request") continue;
    if (kind !== "team_request" && getRoomOwner(room) === mx.getUserId()) continue;

    if (kind === "team_request") {
      const requestEv = room.currentState?.getStateEvents?.("io.kiconnect.team_request", "");
      const requestContent = requestEv?.getContent?.() as TeamRequestContent | undefined;
      if (!isDoneTeamRequest(requestContent)) continue;
    } else {
      const caseEv = room.currentState?.getStateEvents?.("io.kiconnect.case", "");
      const caseContent = caseEv?.getContent?.() as CaseContent | undefined;
      if (!shouldDeleteRoom(caseContent, selectedSpaceId)) continue;
    }

    try {
      await mx.leave(room.roomId);
    } catch {}

    await waitUntilLeft(mx, room.roomId);

    try {
      await mx.forget(room.roomId);
    } catch {}
  }
}
