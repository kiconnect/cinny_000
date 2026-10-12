type RequestRoom = {
  roomId: string;
  getMyMembership(): string;
  currentState: {
    getStateEvents(type: string, key: string): { getContent(): Record<string, unknown> } | null;
  };
};

// Only the client holding this freshly generated request ID may change its view.
export function findCreatedTeamRoom(
  rooms: RequestRoom[], requestId: string, userId: string
): string | undefined {
  if (!requestId || !userId) return undefined;
  return rooms.find((room) => {
    if (room.getMyMembership() !== 'join') return false;
    const content = room.currentState.getStateEvents('io.kiconnect.room', '')?.getContent();
    return content?.kind === 'team_request' && content.request_id === requestId
      && content.owner === userId;
  })?.roomId;
}
