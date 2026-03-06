import type { MatrixClient } from "matrix-js-sdk";

export async function delete_done(mx: MatrixClient): Promise<void> {
  const rooms = mx.getRooms();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const room of rooms) {
    const m = room.getMyMembership?.();
    if (m !== "join" && m !== "invite") continue;

    // nur patient rooms
    const kindEv = room.currentState?.getStateEvents?.("io.kiconnect.room", "");
    const kind = kindEv?.getContent?.()?.kind;
    if (kind !== "patient") continue;

    // nur case done
    const caseEv = room.currentState?.getStateEvents?.("io.kiconnect.case", "");
    const status = caseEv?.getContent?.()?.status;
    if (status !== "done") continue;

    try { await mx.leave(room.roomId); } catch {}
    try { await mx.forget(room.roomId); } catch {}

    await sleep(400);
  }
}