import type { Room } from "matrix-js-sdk/src/matrix";

export const ROOM_KIND_STATE_TYPE = "io.kiconnect.room";
export const ROOM_KIND_STATE_KEY = "";

export function getRoomKind(room: Room | undefined): "team" | "patient" | undefined {
  if (!room?.currentState) return undefined;

  const ev = room.currentState.getStateEvents(ROOM_KIND_STATE_TYPE, ROOM_KIND_STATE_KEY);
  const kind = ev?.getContent?.()?.kind;

  if (kind === "team" || kind === "patient") return kind;
  return undefined;
}

export function isTeamRoom(room: Room | undefined): boolean {
  return getRoomKind(room) === "team";
}

export function isPatientRoom(room: Room | undefined): boolean {
  return getRoomKind(room) === "patient";
}