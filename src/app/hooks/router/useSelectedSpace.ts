import { useEffect, useState } from "react";
import { useMatch } from "react-router-dom";
import { getSpaceLobbyPath, getSpaceSearchPath } from "../../pages/pathUtils";
import { useMatrixClient } from "../useMatrixClient";

const USER_SPACE_STORAGE_KEY = "kiconnect.user_space_room_id";
const CINNY_SPACES_EVENT_TYPE = "cinny.spaces";

function getStoredSpaceId(): string | undefined {
  try {
    return localStorage.getItem(USER_SPACE_STORAGE_KEY)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function setStoredSpaceId(spaceId: string | undefined): void {
  const value = (spaceId || "").trim();
  if (!value) return;

  try {
    localStorage.setItem(USER_SPACE_STORAGE_KEY, value);
  } catch {}
}

export function clearPersistedSelectedSpace(): void {
  try {
    localStorage.removeItem(USER_SPACE_STORAGE_KEY);
  } catch {}
}

function isJoinedSpaceRoom(mx: ReturnType<typeof useMatrixClient>, roomId: unknown): string | undefined {
  if (typeof roomId !== "string" || !roomId.trim()) return undefined;

  const room = mx.getRoom(roomId);
  if (!room) return undefined;
  if (room.getMyMembership?.() !== "join") return undefined;

  const type =
    room.currentState?.getStateEvents?.("m.room.create", "")?.getContent?.()?.type;

  if (type !== "m.space") return undefined;

  return room.roomId;
}

function extractCandidateIds(content: any): string[] {
  if (!content || typeof content !== "object") return [];

  const result: string[] = [];

  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) result.push(value.trim());
  };

  const scan = (value: any) => {
    if (!value) return;

    if (typeof value === "string") {
      add(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(scan);
      return;
    }

    if (typeof value === "object") {
      add(value.roomId);
      add(value.room_id);
      add(value.id);
      add(value.spaceId);
      add(value.space_id);

      if (Array.isArray(value.content)) value.content.forEach(scan);
      if (Array.isArray(value.sidebar)) value.sidebar.forEach(scan);
      if (Array.isArray(value.sidebarItems)) value.sidebarItems.forEach(scan);
      if (Array.isArray(value.shortcut)) value.shortcut.forEach(scan);
      if (Array.isArray(value.spaces)) value.spaces.forEach(scan);
      if (Array.isArray(value.items)) value.items.forEach(scan);
    }
  };

  scan(content);

  return result;
}

function resolveUserSpaceId(mx: ReturnType<typeof useMatrixClient>): string | undefined {
  const stored = getStoredSpaceId();
  const validStored = isJoinedSpaceRoom(mx, stored);
  if (validStored) return validStored;

  const content = mx.getAccountData?.(CINNY_SPACES_EVENT_TYPE)?.getContent?.();
  const candidates = extractCandidateIds(content);

  for (const candidate of candidates) {
    const valid = isJoinedSpaceRoom(mx, candidate);
    if (valid) return valid;
  }

  const joinedSpaces = (mx.getRooms?.() || []).filter((room) => {
    if (!room) return false;
    if (room.getMyMembership?.() !== "join") return false;

    const type =
      room.currentState?.getStateEvents?.("m.room.create", "")?.getContent?.()?.type;

    return type === "m.space";
  });

  if (joinedSpaces.length === 1) {
    return joinedSpaces[0].roomId;
  }

  return undefined;
}

export function useSelectedSpace(): string | undefined {
  const mx = useMatrixClient();
  const [spaceId, setSpaceId] = useState<string | undefined>(() => resolveUserSpaceId(mx));

  useEffect(() => {
    const next = resolveUserSpaceId(mx);
    setSpaceId(next);
    if (next) setStoredSpaceId(next);
  }, [mx]);

  return spaceId;
}

export function useSpaceLobbySelected(spaceIdOrAlias: string): boolean {
  const match = useMatch({
    path: decodeURIComponent(getSpaceLobbyPath(spaceIdOrAlias)),
    caseSensitive: true,
    end: false,
  });

  return !!match;
}

export function useSpaceSearchSelected(spaceIdOrAlias: string): boolean {
  const match = useMatch({
    path: decodeURIComponent(getSpaceSearchPath(spaceIdOrAlias)),
    caseSensitive: true,
    end: false,
  });

  return !!match;
}