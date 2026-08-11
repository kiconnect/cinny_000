import type { Room } from "matrix-js-sdk/src/matrix";

export const ROOM_KIND_STATE_TYPE = "io.kiconnect.room";
export const ROOM_KIND_STATE_KEY = "";

export type KiconnectRoomKind = "team" | "team_communication" | "team_request" | "patient";

export function getRoomKind(room: Room | undefined): KiconnectRoomKind | undefined {
  if (!room?.currentState) return undefined;

  const ev = room.currentState.getStateEvents(ROOM_KIND_STATE_TYPE, ROOM_KIND_STATE_KEY);
  const kind = ev?.getContent?.()?.kind;

  if (kind === "team" || kind === "team_communication" || kind === "team_request" || kind === "patient") return kind;
  return undefined;
}

export function isTeamRoom(room: Room | undefined): boolean {
  return getRoomKind(room) === "team";
}

export function isTeamCommunicationRoom(room: Room | undefined): boolean {
  return getRoomKind(room) === "team_communication";
}

export function isTeamRequestRoom(room: Room | undefined): boolean {
  return getRoomKind(room) === "team_request";
}

export function isPatientRoom(room: Room | undefined): boolean {
  return getRoomKind(room) === "patient";
}

export function getRoomOwner(room: Room | undefined): string | undefined {
  if (!room?.currentState) return undefined;

  const ev = room.currentState.getStateEvents(ROOM_KIND_STATE_TYPE, ROOM_KIND_STATE_KEY);
  const owner = ev?.getContent?.()?.owner;

  return typeof owner === "string" && owner ? owner : undefined;
}

export function isOwnedTeamRoom(
  room: Room | undefined,
  userId: string | null | undefined
): boolean {
  if (!userId || getRoomKind(room) !== "team") return false;
  return getRoomOwner(room) === userId;
}

export function isOwnedTeamCommunicationRoom(
  room: Room | undefined,
  userId: string | null | undefined
): boolean {
  if (!userId || getRoomKind(room) !== "team_communication") return false;
  return getRoomOwner(room) === userId;
}
