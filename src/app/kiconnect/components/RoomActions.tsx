import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Dialog, Overlay, OverlayBackdrop, OverlayCenter, Text } from 'folds';
import type { Room } from 'matrix-js-sdk/src/matrix';
import type { MatrixClient } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSelectedSpace } from '../../hooks/router/useSelectedSpace';

import { getRoomOwner, isPatientRoom, isTeamCommunicationRoom, isTeamRoom } from '../logic/roomState';
import { delete_done } from '../logic/delete_done';
import KiconnectSearchDialog from '../components/KiconnectSearchDialog';

import '../styles/RoomActions.css';

type Props = {
  room: Room;
};

type CaseStatus = 'open' | 'pending' | 'done';
type CaseRole = 'arzt' | 'team';

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

type TeamDirectoryMember = {
  matrix_user_id?: string;
  matrix_uid?: string;
  display_name?: string;
  role?: string;
};

type TeamRequestRecipient = {
  state?: string;
  role?: string;
  display_name?: string;
};

type TeamRequestContent = {
  status?: string;
  topic?: string;
  owner?: string;
  recipients?: Record<string, TeamRequestRecipient>;
};

function normalizeState(value: unknown): CaseStatus {
  const norm = String(value || '')
    .trim()
    .toLowerCase();
  if (norm === 'done') return 'done';
  if (norm === 'pending') return 'pending';
  return 'open';
}

function getRoleEntryState(entry: CaseRoleEntry | string | undefined): CaseStatus {
  if (typeof entry === 'string') {
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
  if (!roles || typeof roles !== 'object') return undefined;

  const arzt = roles.arzt;
  if (
    arzt &&
    typeof arzt === 'object' &&
    typeof arzt.space_room_id === 'string' &&
    arzt.space_room_id === selectedSpaceId
  ) {
    return 'arzt';
  }

  const team = roles.team;
  if (
    team &&
    typeof team === 'object' &&
    typeof team.space_room_id === 'string' &&
    team.space_room_id === selectedSpaceId
  ) {
    return 'team';
  }

  return undefined;
}

function getRoleFromCurrentUser(
  mx: MatrixClient,
  content: CaseContent | undefined
): CaseRole | undefined {
  const roles = content?.roles;
  if (!roles || typeof roles !== 'object') return undefined;

  for (const role of ['arzt', 'team'] as const) {
    const entry = roles[role];
    if (!entry || typeof entry !== 'object') continue;

    const spaceRoomId = entry.space_room_id;
    if (typeof spaceRoomId !== 'string' || !spaceRoomId) continue;

    const membership = mx.getRoom(spaceRoomId)?.getMyMembership?.();
    if (membership === 'join' || membership === 'invite') {
      return role;
    }
  }

  return undefined;
}

function getOtherRole(role: CaseRole | undefined): CaseRole | undefined {
  if (role === 'arzt') return 'team';
  if (role === 'team') return 'arzt';
  return undefined;
}

function getRoleSpaceRoomId(
  content: CaseContent | undefined,
  role: CaseRole | undefined
): string | undefined {
  if (!role) return undefined;

  const entry = content?.roles?.[role];
  if (!entry || typeof entry !== 'object') return undefined;

  const spaceRoomId = entry.space_room_id;
  return typeof spaceRoomId === 'string' && spaceRoomId.trim() ? spaceRoomId.trim() : undefined;
}

function getCaseContent(room: Room): CaseContent | undefined {
  const ev = room.currentState?.getStateEvents?.('io.kiconnect.case', '');
  return ev?.getContent?.() as CaseContent | undefined;
}

function getTeamRequestContent(room: Room): TeamRequestContent | undefined {
  const ev = room.currentState?.getStateEvents?.('io.kiconnect.team_request', '');
  return ev?.getContent?.() as TeamRequestContent | undefined;
}

function getTeamDirectory(room: Room): Array<Required<TeamDirectoryMember>> {
  const ev = room.currentState?.getStateEvents?.('io.kiconnect.team_directory', '');
  const content = ev?.getContent?.() as { members?: TeamDirectoryMember[] } | undefined;
  const members = Array.isArray(content?.members) ? content?.members || [] : [];

  return members
    .map((member) => {
      const matrixUserId = String(member.matrix_user_id || member.matrix_uid || '').trim();
      const role = String(member.role || '').trim().toLowerCase();
      const displayName = String(member.display_name || matrixUserId).trim() || matrixUserId;
      return {
        matrix_user_id: matrixUserId,
        matrix_uid: matrixUserId,
        display_name: displayName,
        role,
      };
    })
    .filter(
      (member): member is Required<TeamDirectoryMember> =>
        !!member.matrix_user_id && (member.role === 'arzt' || member.role === 'team')
    )
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'arzt' ? -1 : 1;
      return a.display_name.localeCompare(b.display_name, 'de-AT');
    });
}

function isTeamRequestOpen(content: TeamRequestContent | undefined): boolean {
  return String(content?.status || '').trim().toLowerCase() === 'open';
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
    return { role: undefined, own: 'done', other: 'done' };
  }

  return {
    role,
    own: getRoleEntryState(content?.roles?.[role]),
    other: getRoleEntryState(content?.roles?.[otherRole]),
    spaceRoomId,
  };
}

function toErrString(e: unknown): string {
  if (!e) return 'unknown error';
  if (typeof e === 'string') return e;

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
  return typeof value === 'string' && value.trim().startsWith('!');
}

export function KiconnectRoomActions({ room }: Props): JSX.Element {
  const mx = useMatrixClient();
  const selectedSpaceId = useSelectedSpace();

  const [showSearch, setShowSearch] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastPreview, setBroadcastPreview] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [showTeamRequest, setShowTeamRequest] = useState(false);
  const [teamRequestTopic, setTeamRequestTopic] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [sendingTeamRequest, setSendingTeamRequest] = useState(false);
  const [, forceUpdate] = useState(0);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const teamRoom = useMemo(() => isTeamRoom(room), [room]);
  const teamCommunicationRoom = useMemo(() => isTeamCommunicationRoom(room), [room]);
  const caseInfo = getOwnRoleStatus(mx, room, selectedSpaceId);
  const roomOwner = getRoomOwner(room);
  const currentUserId = mx.getUserId();
  const teamRequest = getTeamRequestContent(room);
  const teamRequestOpen = isTeamRequestOpen(teamRequest);
  const teamDirectory = getTeamDirectory(room);
  const teamRequestOwner = teamCommunicationRoom && roomOwner === currentUserId;
  const teamRequestRecipient =
    teamCommunicationRoom &&
    !!currentUserId &&
    teamRequestOpen &&
    !!teamRequest?.recipients?.[currentUserId];
  const patientRoomOwner =
    isPatientRoom(room) && (roomOwner ? roomOwner === currentUserId : caseInfo.role === undefined);

  const erledigtLabel =
    caseInfo.own === 'done' ? 'Wieder öffnen' : caseInfo.own === 'pending' ? 'Erledigt' : 'Begonnen';

  const canForward =
    !!caseInfo.role && (caseInfo.own === 'open' || caseInfo.own === 'pending') && caseInfo.other === 'done';

  const forwardLabel =
    caseInfo.own === 'done' && (caseInfo.other === 'open' || caseInfo.other === 'pending')
      ? 'Weitergeleitet'
      : 'Weiterleiten';

  useEffect(() => {
    const handler = (event: any) => {
      const type = event?.getType?.();
      const stateKey = event?.getStateKey?.();

      if (stateKey !== '') return;

      if (
        type === 'io.kiconnect.case' ||
        type === 'io.kiconnect.room' ||
        type === 'io.kiconnect.team_request' ||
        type === 'io.kiconnect.team_directory' ||
        type === 'm.room.topic'
      ) {
        forceUpdate((x) => x + 1);
      }
    };

    room.on('RoomState.events', handler);

    return () => {
      room.off('RoomState.events', handler);
    };
  }, [room]);

  const onDeleteDone = async () => {
    setErr(null);

    try {
      await delete_done(mx, selectedSpaceId);
    } catch (e) {
      setErr(toErrString(e));
    }
  };

  const closeBroadcast = () => {
    if (sendingBroadcast) return;
    setShowBroadcast(false);
    setBroadcastPreview(false);
    setBroadcastMessage('');
  };

  const onSendBroadcast = async () => {
    const message = broadcastMessage.trim();
    if (sendingBroadcast) return;
    if (!selectedSpaceId) {
      setErr('Kein Ordinations-Space ausgewählt.');
      return;
    }
    if (!message || message.length > 4000) {
      setErr('Die Rundnachricht muss zwischen 1 und 4000 Zeichen lang sein.');
      return;
    }

    setSendingBroadcast(true);
    setErr(null);
    try {
      await mx.sendEvent(room.roomId, 'io.kiconnect.broadcast.request', {
        request_id: crypto.randomUUID(),
        space_room_id: selectedSpaceId,
        message,
        created_by: mx.getUserId(),
        created_at: Date.now(),
      });
      setShowBroadcast(false);
      setBroadcastPreview(false);
      setBroadcastMessage('');
      setErr('Rundnachricht wurde zur Zustellung übergeben.');
    } catch (e) {
      setErr(toErrString(e));
    } finally {
      setSendingBroadcast(false);
    }
  };

  const onToggleDone = async () => {
    if (sending) return;

    setSending(true);
    setErr(null);

    try {
      const spaceRoomId = caseInfo.spaceRoomId?.trim();

      if (!isUsableSpaceId(spaceRoomId)) {
        throw new Error('Keine gültige User-Space-ID verfügbar.');
      }

      await mx.sendEvent(room.roomId, 'io.kiconnect.case.toggle', {
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
    console.log('[FORWARD] click', {
      sending,
      roomId: room.roomId,
      selectedSpaceId,
      caseInfo,
    });

    if (sending) {
      console.log('[FORWARD] abort sending=true');
      return;
    }

    setSending(true);
    setErr(null);

    try {
      const spaceRoomId = caseInfo.spaceRoomId?.trim();
      console.log('[FORWARD] spaceRoomId', spaceRoomId);

      if (!isUsableSpaceId(spaceRoomId)) {
        console.log('[FORWARD] abort invalid spaceRoomId');
        throw new Error('Keine gültige User-Space-ID verfügbar.');
      }

      console.log('[FORWARD] before sendEvent');

      const res = await mx.sendEvent(room.roomId, 'io.kiconnect.case.forward', {
        by: mx.getUserId(),
        ts: Date.now(),
        space_room_id: spaceRoomId,
      });

      console.log('[FORWARD] sendEvent ok', res);
    } catch (e) {
      console.error('[FORWARD] sendEvent error', e);
      setErr(toErrString(e));
    } finally {
      setSending(false);
      console.log('[FORWARD] finally');
    }
  };

  const onResetChat = async () => {
    if (sending) return;

    setSending(true);
    setErr(null);

    try {
      await mx.sendEvent(room.roomId, 'm.room.message', {
        msgtype: 'm.text',
        body: 'storno!',
      });
      setShowResetConfirm(false);
    } catch (e) {
      setErr(toErrString(e));
    } finally {
      setSending(false);
    }
  };

  const toggleRecipient = (mxid: string) => {
    setSelectedRecipients((current) =>
      current.includes(mxid) ? current.filter((item) => item !== mxid) : [...current, mxid]
    );
  };

  const selectRecipientsByRole = (role: CaseRole) => {
    const ids = teamDirectory
      .filter((member) => member.role === role && member.matrix_user_id !== currentUserId)
      .map((member) => member.matrix_user_id);
    setSelectedRecipients(ids);
  };

  const closeTeamRequest = () => {
    if (sendingTeamRequest) return;
    setShowTeamRequest(false);
    setTeamRequestTopic('');
    setSelectedRecipients([]);
  };

  const onSendTeamRequest = async () => {
    const topic = teamRequestTopic.trim();
    if (sendingTeamRequest) return;
    if (!topic) {
      setErr('Bitte ein Topic eingeben.');
      return;
    }
    if (selectedRecipients.length === 0) {
      setErr('Bitte mindestens einen Empfänger auswählen.');
      return;
    }

    setSendingTeamRequest(true);
    setErr(null);
    try {
      await mx.sendEvent(room.roomId, 'io.kiconnect.team.request', {
        request_id: crypto.randomUUID(),
        topic,
        recipients: selectedRecipients,
        by: currentUserId,
        ts: Date.now(),
      });
      closeTeamRequest();
    } catch (e) {
      setErr(toErrString(e));
    } finally {
      setSendingTeamRequest(false);
    }
  };

  const onResetTeamRequest = async () => {
    if (sendingTeamRequest) return;
    setSendingTeamRequest(true);
    setErr(null);
    try {
      await mx.sendEvent(room.roomId, 'io.kiconnect.team.request.reset', {
        by: currentUserId,
        ts: Date.now(),
      });
      closeTeamRequest();
    } catch (e) {
      setErr(toErrString(e));
    } finally {
      setSendingTeamRequest(false);
    }
  };

  const onDoneTeamRequest = async () => {
    if (sendingTeamRequest) return;
    setSendingTeamRequest(true);
    setErr(null);
    try {
      await mx.sendEvent(room.roomId, 'io.kiconnect.team.request.done', {
        by: currentUserId,
        ts: Date.now(),
      });
    } catch (e) {
      setErr(toErrString(e));
    } finally {
      setSendingTeamRequest(false);
    }
  };

  if (teamRoom) {
    return (
      <>
        {showSearch && (
          <KiconnectSearchDialog room={room} onFinished={() => setShowSearch(false)} />
        )}
        {showBroadcast && (
          <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <Dialog variant="Surface" style={{ width: 'min(560px, calc(100vw - 32px))' }}>
                <Box direction="Column" gap="400" style={{ padding: 24 }}>
                  <Box direction="Column" gap="200">
                    <Text size="H4">Rundnachricht</Text>
                    <Text priority="400">
                      Diese Nachricht wird einzeln an alle Patienten der Ordination gesendet.
                    </Text>
                  </Box>

                  {broadcastPreview ? (
                    <Box direction="Column" gap="200">
                      <Text weight="Medium">Vorschau</Text>
                      <div
                        style={{
                          whiteSpace: 'pre-wrap',
                          border: '1px solid #b8c7cb',
                          borderRadius: 12,
                          padding: 16,
                          maxHeight: 260,
                          overflow: 'auto',
                        }}
                      >
                        <strong>Mitteilung Ihrer Ordination</strong>
                        {'\n\n'}
                        {broadcastMessage.trim()}
                      </div>
                      <Text priority="400">
                        Bitte prüfen Sie den Text sorgfältig. Der Versand an alle Patienten kann
                        nicht zurückgenommen werden.
                      </Text>
                    </Box>
                  ) : (
                    <textarea
                      value={broadcastMessage}
                      onChange={(event) => setBroadcastMessage(event.target.value)}
                      maxLength={4000}
                      rows={9}
                      autoFocus
                      placeholder="Nachricht an alle Patienten …"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                        border: '1px solid #8ca4aa',
                        borderRadius: 12,
                        padding: 14,
                        font: 'inherit',
                      }}
                    />
                  )}

                  {err && <Text size="T300">{err}</Text>}
                  <Box direction="Row" gap="200" justifyContent="End">
                    <Button
                      variant="Secondary"
                      onClick={closeBroadcast}
                      disabled={sendingBroadcast}
                    >
                      Abbrechen
                    </Button>
                    {broadcastPreview ? (
                      <>
                        <Button
                          variant="Secondary"
                          onClick={() => setBroadcastPreview(false)}
                          disabled={sendingBroadcast}
                        >
                          Text bearbeiten
                        </Button>
                        <Button onClick={onSendBroadcast} disabled={sendingBroadcast}>
                          {sendingBroadcast ? 'Wird versendet …' : 'An alle senden'}
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={() => {
                          if (broadcastMessage.trim()) setBroadcastPreview(true);
                        }}
                        disabled={!broadcastMessage.trim()}
                      >
                        Vorschau
                      </Button>
                    )}
                  </Box>
                </Box>
              </Dialog>
            </OverlayCenter>
          </Overlay>
        )}

        <div className="kiconnect-room-actions">
          <div className="kiconnect-room-actions-divider" />
          <button onClick={() => setShowSearch(true)}>Suche</button>
          <button onClick={onDeleteDone}>Erledigte Chats löschen</button>
          <button
            onClick={() => {
              setErr(null);
              setShowBroadcast(true);
            }}
          >
            Rundnachricht
          </button>
          {err && <span style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>}
        </div>
      </>
    );
  }

  if (teamCommunicationRoom) {
    const recipientCandidates = teamDirectory.filter((member) => member.matrix_user_id !== currentUserId);
    const arztCandidateCount = recipientCandidates.filter((member) => member.role === 'arzt').length;
    const teamCandidateCount = recipientCandidates.filter((member) => member.role === 'team').length;

    return (
      <>
        {showTeamRequest && (
          <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <Dialog variant="Surface" style={{ width: 'min(560px, calc(100vw - 32px))' }}>
                <Box direction="Column" gap="400" style={{ padding: 24 }}>
                  <Box direction="Column" gap="200">
                    <Text size="H4">Empfänger</Text>
                    {teamRequestOpen ? (
                      <Text priority="400">
                        Es gibt bereits eine offene Anfrage: {teamRequest?.topic || 'ohne Topic'}.
                        Bitte zuerst erledigen oder zurücksetzen.
                      </Text>
                    ) : (
                      <Text priority="400">
                        Wählen Sie die Empfänger für eine neue Team-Anfrage aus.
                      </Text>
                    )}
                  </Box>

                  {teamRequestOpen ? (
                    <Box direction="Row" gap="200" justifyContent="End">
                      <Button variant="Secondary" onClick={closeTeamRequest} disabled={sendingTeamRequest}>
                        Abbrechen
                      </Button>
                      {teamRequestOwner && (
                        <Button variant="Critical" onClick={onResetTeamRequest} disabled={sendingTeamRequest}>
                          {sendingTeamRequest ? '…' : 'Zurücksetzen'}
                        </Button>
                      )}
                    </Box>
                  ) : (
                    <>
                      <input
                        value={teamRequestTopic}
                        onChange={(event) => setTeamRequestTopic(event.target.value)}
                        autoFocus
                        placeholder="Topic"
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          border: '1px solid #8ca4aa',
                          borderRadius: 12,
                          padding: 12,
                          font: 'inherit',
                        }}
                      />

                      <Box direction="Column" gap="200">
                        <button
                          type="button"
                          onClick={() => selectRecipientsByRole('arzt')}
                          disabled={arztCandidateCount === 0}
                          style={{
                            textAlign: 'left',
                            border: '1px solid #b8c7cb',
                            borderRadius: 10,
                            padding: '10px 12px',
                            opacity: arztCandidateCount === 0 ? 0.55 : 1,
                          }}
                        >
                          Ärzt*innen alle ({arztCandidateCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => selectRecipientsByRole('team')}
                          disabled={teamCandidateCount === 0}
                          style={{
                            textAlign: 'left',
                            border: '1px solid #b8c7cb',
                            borderRadius: 10,
                            padding: '10px 12px',
                            opacity: teamCandidateCount === 0 ? 0.55 : 1,
                          }}
                        >
                          Team alle ({teamCandidateCount})
                        </button>
                        {recipientCandidates.length === 0 && (
                          <Text priority="400">
                            Keine weiteren Empfänger vorhanden. Sie selbst werden nicht als
                            Empfänger angeboten.
                          </Text>
                        )}
                        {recipientCandidates.map((member) => (
                          <label
                            key={member.matrix_user_id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              border: '1px solid #c9d6da',
                              borderRadius: 10,
                              padding: '10px 12px',
                              cursor: 'pointer',
                              background: selectedRecipients.includes(member.matrix_user_id)
                                ? '#e6f4f7'
                                : '#fff',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedRecipients.includes(member.matrix_user_id)}
                              onChange={() => toggleRecipient(member.matrix_user_id)}
                            />
                            <span>
                              {member.display_name} ({member.role === 'arzt' ? 'Ärzt*in' : 'Team'})
                            </span>
                          </label>
                        ))}
                      </Box>

                      <Text priority="400">Ausgewählt: {selectedRecipients.length}</Text>

                      {err && <Text size="T300">{err}</Text>}
                      <Box direction="Row" gap="200" justifyContent="End">
                        <Button variant="Secondary" onClick={closeTeamRequest} disabled={sendingTeamRequest}>
                          Abbrechen
                        </Button>
                        <Button
                          onClick={onSendTeamRequest}
                          disabled={sendingTeamRequest || !teamRequestTopic.trim() || selectedRecipients.length === 0}
                        >
                          {sendingTeamRequest ? '…' : 'Einladen'}
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>
              </Dialog>
            </OverlayCenter>
          </Overlay>
        )}

        <div className="kiconnect-room-actions">
          <div className="kiconnect-room-actions-divider" />
          {teamRequestOwner && (
            <>
              <button
                onClick={() => {
                  setErr(null);
                  setShowTeamRequest(true);
                }}
                disabled={sendingTeamRequest}
              >
                Empfänger
              </button>
              {teamRequestOpen && (
                <button onClick={onResetTeamRequest} disabled={sendingTeamRequest}>
                  {sendingTeamRequest ? '…' : 'Zurücksetzen'}
                </button>
              )}
            </>
          )}
          {teamRequestRecipient && (
            <button onClick={onDoneTeamRequest} disabled={sendingTeamRequest}>
              {sendingTeamRequest ? '…' : 'Erledigt'}
            </button>
          )}
          {err && !showTeamRequest && <span style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>}
        </div>
      </>
    );
  }

  if (patientRoomOwner) {
    return (
      <>
        {showResetConfirm && (
          <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <Dialog variant="Surface" style={{ width: 'min(420px, calc(100vw - 32px))' }}>
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
                      {sending ? 'Wird zurückgesetzt …' : 'Chat zurücksetzen'}
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
          {err && !showResetConfirm && <span style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="kiconnect-room-actions">
        <div className="kiconnect-room-actions-divider" />
        <button onClick={onToggleDone} disabled={sending}>
          {sending ? '…' : erledigtLabel}
        </button>

        {canForward && (
          <button onClick={onForward} disabled={sending}>
            {sending ? '…' : forwardLabel}
          </button>
        )}

        {err && <span style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>}
      </div>
    </>
  );
}
