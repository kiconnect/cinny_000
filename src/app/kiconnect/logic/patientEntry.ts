type EntryRoom = {
  roomId: string;
  name: string;
  getMyMembership(): string;
  currentState: {
    getStateEvents(type: string, key: string): { getContent(): Record<string, unknown> } | null;
  };
};

export function patientEntryRooms(rooms: EntryRoom[], userId: string, accountType: string) {
  const state = (room: EntryRoom) => room.currentState.getStateEvents('io.kiconnect.room', '')?.getContent();
  if (accountType === 'team' || /^@z/i.test(userId) || rooms.some((room) =>
    room.getMyMembership() === 'join' && state(room)?.kind === 'team')) return [];
  return rooms.filter((room) => room.getMyMembership() === 'join'
    && state(room)?.kind === 'patient' && state(room)?.owner === userId)
    .map((room) => {
      const content = state(room);
      return { id: room.roomId, name: typeof content?.ordination_name === 'string'
        ? content.ordination_name : room.name };
    }).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function isPatientEntryPath(path: string): boolean {
  return ['/', '/home', '/direct'].includes(path.replace(/\/$/, '') || '/');
}
