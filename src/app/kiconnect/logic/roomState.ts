import type { Room } from "matrix-js-sdk/src/matrix";

export function isTeamRoom(room: Room | undefined): boolean {
    if (!room) return false;
    const cs = room.currentState;
    if (!cs) return false;
    return !!cs.getStateEvents("io.kiconnect.teamroom", "");
}
