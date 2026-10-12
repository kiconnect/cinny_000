import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHomeRoomPath } from '../../pages/pathUtils';
import { findCreatedTeamRoom } from '../logic/teamRequestNavigation';
import { Box, Button, Dialog, Overlay, OverlayBackdrop, OverlayCenter, Text } from 'folds';
import type { Room } from 'matrix-js-sdk/src/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSelectedSpace } from '../../hooks/router/useSelectedSpace';
import { useCaseRoleStatus } from '../hooks/useCaseRoleStatus';
import { suggestTeamRequestTopic } from '../logic/teamRequestTopic';
import {
  getCaseContent,
  sendCaseAction,
  type CaseRole,
  type CaseStatus,
} from '../logic/caseStatus';

import {
  getRoomOwner,
  isPatientRoom,
  isTeamCommunicationRoom,
  isTeamRequestRoom,
  isTeamRoom,
} from '../logic/roomState';
import { delete_done } from '../logic/delete_done';
import KiconnectSearchDialog from '../components/KiconnectSearchDialog';
import KiconnectDayListDialog from '../components/KiconnectDayListDialog';
import KiconnectTeamRequestsDialog from '../components/KiconnectTeamRequestsDialog';

import '../styles/RoomActions.css';

type Props = {
  room: Room;
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
  if (norm === 'waiting') return 'waiting';
  if (norm === 'pending') return 'pending';
  return 'open';
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
      const role = String(member.role || '')
        .trim()
        .toLowerCase();
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
  return (
    String(content?.status || '')
      .trim()
      .toLowerCase() === 'open'
  );
}

function isTeamRequestActive(content: TeamRequestContent | undefined): boolean {
  const status = String(content?.status || '')
    .trim()
    .toLowerCase();
  return status === 'open' || status === 'pending' || status === 'waiting';
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

export function KiconnectRoomActions({ room }: Props): JSX.Element {
  const mx = useMatrixClient();
  const selectedSpaceId = useSelectedSpace();

  const [showSearch, setShowSearch] = useState(false);
  const [showDayList, setShowDayList] = useState(false);
  const [showTeamRequestsRecent, setShowTeamRequestsRecent] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastPreview, setBroadcastPreview] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [showTeamRequest, setShowTeamRequest] = useState(false);
  const [teamRequestTopic, setTeamRequestTopic] = useState('');
  const [teamRequestTopicEdited, setTeamRequestTopicEdited] = useState(false);
  const [recipientGroup, setRecipientGroup] = useState<CaseRole | undefined>();
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [sendingTeamRequest, setSendingTeamRequest] = useState(false);
  const [pendingTeamRequest, setPendingTeamRequest] = useState<{ id: string; source: string } | null>(null);
  const navigate = useNavigate();
  const [, forceUpdate] = useState(0);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const teamRoom = useMemo(() => isTeamRoom(room), [room]);
  const teamCommunicationRoom = useMemo(() => isTeamCommunicationRoom(room), [room]);
  const teamRequestRoom = useMemo(() => isTeamRequestRoom(room), [room]);
  const caseInfo = useCaseRoleStatus(mx, room, selectedSpaceId);
  const roomOwner = getRoomOwner(room);
  const currentUserId = mx.getUserId();
  useEffect(() => {
    if (!pendingTeamRequest || !currentUserId) return undefined;
    if (pendingTeamRequest.source !== room.roomId) {
      setPendingTeamRequest(null);
      return undefined;
    }
    // Read only the local sync cache: the existing auto-join handles invitations.
    // Polling also covers state arriving after the room/membership event.
    const check = () => {
      const target = findCreatedTeamRoom(mx.getRooms(), pendingTeamRequest.id, currentUserId);
      if (!target) return;
      clearInterval(interval);
      clearTimeout(timeout);
      setPendingTeamRequest(null);
      navigate(getHomeRoomPath(target));
    };
    const interval = setInterval(check, 250);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPendingTeamRequest(null);
      setErr('Der neue Raum ist noch nicht verfügbar. Bitte prüfen Sie „Letzte 3 Tage“, bevor Sie die Anfrage erneut senden.');
    }, 60000);
    check();
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [mx, navigate, currentUserId, pendingTeamRequest, room.roomId]);
  const teamRequest = getTeamRequestContent(room);
  const teamRequestOpen = isTeamRequestOpen(teamRequest);
  const teamRequestActive = isTeamRequestActive(teamRequest);
  const teamDirectory = getTeamDirectory(room);
  const senderName = currentUserId
    ? mx.getUser(currentUserId)?.displayName?.trim() ||
      teamDirectory.find((member) => member.matrix_user_id === currentUserId)?.display_name ||
      room.getMember(currentUserId)?.name ||
      currentUserId
    : '';
  const effectiveTeamRequestTopic = teamRequestTopicEdited
    ? teamRequestTopic
    : suggestTeamRequestTopic(senderName, selectedRecipients, teamDirectory, recipientGroup);
  const editTeamRequestTopic = (value: string) => {
    setTeamRequestTopicEdited(true);
    setTeamRequestTopic(value);
  };
  const teamRequestOwner =
    (teamCommunicationRoom || teamRequestRoom) && roomOwner === currentUserId;
  const teamRequestRecipient =
    (teamCommunicationRoom || teamRequestRoom) &&
    !!currentUserId &&
    isTeamRequestActive(teamRequest) &&
    !!teamRequest?.recipients?.[currentUserId];
  const patientRoomOwner = isPatientRoom(room) && !!roomOwner && roomOwner === currentUserId;

  const erledigtLabel = caseInfo.own === 'done' ? 'Wieder öffnen' : 'Erledigt';

  const canForward =
    !!caseInfo.role &&
    (caseInfo.own === 'open' || caseInfo.own === 'pending') &&
    caseInfo.other === 'done';
  const waitingPatient =
    !!caseInfo.role && !!caseInfo.spaceRoomId && !!getCaseContent(room)?.waiting_patient;

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
      await sendCaseAction(mx, room, selectedSpaceId, 'toggle');
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
      await sendCaseAction(mx, room, selectedSpaceId, 'forward');
    } catch (e) {
      console.error('[FORWARD] sendEvent error', e);
      setErr(toErrString(e));
    } finally {
      setSending(false);
      console.log('[FORWARD] finally');
    }
  };

  const onWaitPatient = async () => {
    if (sending) return;

    setSending(true);
    setErr(null);

    try {
      await sendCaseAction(mx, room, selectedSpaceId, 'wait_patient');
    } catch (e) {
      setErr(toErrString(e));
    } finally {
      setSending(false);
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
    setRecipientGroup(undefined);
    setSelectedRecipients((current) =>
      current.includes(mxid) ? current.filter((item) => item !== mxid) : [...current, mxid]
    );
  };

  const selectRecipientsByRole = (role: CaseRole) => {
    setRecipientGroup(role);
    const ids = teamDirectory
      .filter((member) => member.role === role && member.matrix_user_id !== currentUserId)
      .map((member) => member.matrix_user_id);
    setSelectedRecipients(ids);
  };

  const closeTeamRequest = () => {
    if (sendingTeamRequest) return;
    setShowTeamRequest(false);
    setTeamRequestTopic('');
    setTeamRequestTopicEdited(false);
    setRecipientGroup(undefined);
    setSelectedRecipients([]);
  };

  const onSendTeamRequest = async () => {
    const topic = effectiveTeamRequestTopic.trim();
    if (sendingTeamRequest || pendingTeamRequest) return;
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
      const requestId = crypto.randomUUID();
      await mx.sendEvent(room.roomId, 'io.kiconnect.team.request', {
        request_id: requestId,
        topic,
        recipients: selectedRecipients,
        by: currentUserId,
        ts: Date.now(),
      });
      closeTeamRequest();
      setPendingTeamRequest({ id: requestId, source: room.roomId });
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

  const onSetTeamRequestStatus = async (status: CaseStatus) => {
    if (sendingTeamRequest) return;
    setSendingTeamRequest(true);
    setErr(null);
    try {
      await mx.sendEvent(room.roomId, 'io.kiconnect.team.request.status', {
        status,
        by: currentUserId,
        ts: Date.now(),
      });
    } catch (e) {
      setErr(toErrString(e));
    } finally {
      setSendingTeamRequest(false);
    }
  };

  const recipientCandidates = teamDirectory.filter(
    (member) => member.matrix_user_id !== currentUserId
  );
  const arztCandidateCount = recipientCandidates.filter((member) => member.role === 'arzt').length;
  const teamCandidateCount = recipientCandidates.filter((member) => member.role === 'team').length;

  if (teamRoom) {
    return (
      <>
        {showSearch && (
          <KiconnectSearchDialog room={room} onFinished={() => setShowSearch(false)} />
        )}
        {showDayList && (
          <KiconnectDayListDialog room={room} onFinished={() => setShowDayList(false)} />
        )}
        {showTeamRequestsRecent && (
          <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <KiconnectTeamRequestsDialog
                room={room}
                onFinished={() => setShowTeamRequestsRecent(false)}
              />
            </OverlayCenter>
          </Overlay>
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
        {showTeamRequest && (
          <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <Dialog variant="Surface" style={{ width: 'min(560px, calc(100vw - 32px))' }}>
                <Box direction="Column" gap="400" style={{ padding: 24 }}>
                  <Box direction="Column" gap="200">
                    <Text size="H4">Empfänger</Text>
                    <Text priority="400">
                      Wählen Sie die Empfänger für eine neue Team-Anfrage aus.
                    </Text>
                  </Box>

                  <input
                    value={effectiveTeamRequestTopic}
                    onChange={(event) => editTeamRequestTopic(event.target.value)}
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

                  <Box direction="Row" gap="200">
                    <Button
                      variant="Secondary"
                      onClick={() => {
                        setShowTeamRequest(false);
                        setShowTeamRequestsRecent(true);
                      }}
                    >
                      Letzte 3 Tage
                    </Button>
                  </Box>

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
                        Keine weiteren Empfänger vorhanden. Sie selbst werden nicht als Empfänger
                        angeboten.
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
                    <Button
                      variant="Secondary"
                      onClick={closeTeamRequest}
                      disabled={sendingTeamRequest}
                    >
                      Abbrechen
                    </Button>
                    <Button
                      onClick={onSendTeamRequest}
                      disabled={
                        sendingTeamRequest ||
                        !effectiveTeamRequestTopic.trim() ||
                        selectedRecipients.length === 0
                      }
                    >
                      {sendingTeamRequest ? '…' : 'Einladen'}
                    </Button>
                  </Box>
                </Box>
              </Dialog>
            </OverlayCenter>
          </Overlay>
        )}

        <div className="kiconnect-room-actions">
          <div className="kiconnect-room-actions-divider" />
          <button onClick={() => setShowSearch(true)}>Suche</button>
          <button onClick={() => setShowDayList(true)}>Tageslisten</button>
          <button
            onClick={() => {
              setErr(null);
              setShowTeamRequest(true);
            }}
          >
            Team-Anfrage
          </button>
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
    const recipientCandidates = teamDirectory.filter(
      (member) => member.matrix_user_id !== currentUserId
    );
    const arztCandidateCount = recipientCandidates.filter(
      (member) => member.role === 'arzt'
    ).length;
    const teamCandidateCount = recipientCandidates.filter(
      (member) => member.role === 'team'
    ).length;

    return (
      <>
        {showTeamRequest && (
          <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <Dialog variant="Surface" style={{ width: 'min(560px, calc(100vw - 32px))' }}>
                <Box direction="Column" gap="400" style={{ padding: 24 }}>
                  <Box direction="Column" gap="200">
                    <Text size="H4">Empfänger</Text>
                    {teamRequestActive ? (
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

                  {teamRequestActive ? (
                    <Box direction="Row" gap="200" justifyContent="End">
                      <Button
                        variant="Secondary"
                        onClick={closeTeamRequest}
                        disabled={sendingTeamRequest}
                      >
                        Abbrechen
                      </Button>
                      {teamRequestOwner && (
                        <Button
                          variant="Critical"
                          onClick={onResetTeamRequest}
                          disabled={sendingTeamRequest}
                        >
                          {sendingTeamRequest ? '…' : 'Zurücksetzen'}
                        </Button>
                      )}
                    </Box>
                  ) : (
                    <>
                      <input
                        value={effectiveTeamRequestTopic}
                        onChange={(event) => editTeamRequestTopic(event.target.value)}
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
                        <Button
                          variant="Secondary"
                          onClick={closeTeamRequest}
                          disabled={sendingTeamRequest}
                        >
                          Abbrechen
                        </Button>
                        <Button
                          onClick={onSendTeamRequest}
                          disabled={
                            sendingTeamRequest ||
                            !effectiveTeamRequestTopic.trim() ||
                            selectedRecipients.length === 0
                          }
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
              {teamRequestActive && (
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

  if (teamRequestRoom) {
    const requestStatus = normalizeState(teamRequest?.status);
    const requestLabel = requestStatus === 'done' ? 'Wieder öffnen' : 'Erledigt';
    const nextStatus: CaseStatus = requestStatus === 'done' ? 'open' : 'done';

    return (
      <div className="kiconnect-room-actions">
        <div className="kiconnect-room-actions-divider" />
        <button onClick={() => onSetTeamRequestStatus(nextStatus)} disabled={sendingTeamRequest}>
          {sendingTeamRequest ? '…' : requestLabel}
        </button>
        {err && <span style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>}
      </div>
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
        {caseInfo.ready ? (
          <button onClick={onToggleDone} disabled={sending}>
            {sending ? '…' : erledigtLabel}
          </button>
        ) : (
          <span style={{ fontSize: 12 }}>Rollen- oder Statusdaten noch nicht verfügbar.</span>
        )}

        {canForward && (
          <button onClick={onForward} disabled={sending}>
            {sending ? '…' : forwardLabel}
          </button>
        )}

        {caseInfo.ready && (
          <button onClick={onWaitPatient} disabled={sending || waitingPatient}>
            {sending ? '…' : waitingPatient ? 'Wartet auf Patient' : 'Warte auf Patient'}
          </button>
        )}

        {err && <span style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>}
      </div>
    </>
  );
}
