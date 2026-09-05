import React, { useCallback, useEffect, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Dialog,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  config,
} from 'folds';
import { EventType } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { isKeyHotkey } from 'is-hotkey';
import { useStateEvent } from '../../hooks/useStateEvent';
import { StateEvent } from '../../../types/matrix/room';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useEditor } from '../../components/editor';
import { RoomInputPlaceholder } from './RoomInputPlaceholder';
import { RoomTimeline } from './RoomTimeline';
import { RoomViewTyping } from './RoomViewTyping';
import { RoomTombstone } from './RoomTombstone';
import { RoomInput } from './RoomInput';
import { MedicationDialogView } from './MedicationDialog';
import { RoomViewFollowing, RoomViewFollowingPlaceholder } from './RoomViewFollowing';
import { Page } from '../../components/page';
import { useKeyDown } from '../../hooks/useKeyDown';
import { editableActiveElement } from '../../utils/dom';
import { settingsAtom } from '../../state/settings';
import { useSetting } from '../../state/hooks/settings';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoom } from '../../hooks/useRoom';
import { getRoomOwner, isPatientRoom } from '../../kiconnect/logic/roomState';
import { readAccountType } from '../../kiconnect/logic/accountType';

const FN_KEYS_REGEX = /^F\d+$/;
const shouldFocusMessageField = (evt: KeyboardEvent): boolean => {
  const { code } = evt;
  if (evt.metaKey || evt.altKey || evt.ctrlKey) {
    return false;
  }

  if (FN_KEYS_REGEX.test(code)) return false;

  if (
    code.startsWith('OS') ||
    code.startsWith('Meta') ||
    code.startsWith('Shift') ||
    code.startsWith('Alt') ||
    code.startsWith('Control') ||
    code.startsWith('Arrow') ||
    code.startsWith('Page') ||
    code.startsWith('End') ||
    code.startsWith('Home') ||
    code === 'Tab' ||
    code === 'Space' ||
    code === 'Enter' ||
    code === 'NumLock' ||
    code === 'ScrollLock'
  ) {
    return false;
  }

  return true;
};

export function RoomView({ eventId }: { eventId?: string }) {
  const roomInputRef = useRef<HTMLDivElement>(null);
  const roomViewRef = useRef<HTMLDivElement>(null);

  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');

  const room = useRoom();
  const { roomId } = room;
  const editor = useEditor();
  const [sendingConsent, setSendingConsent] = useState(false);
  const [sendingEmergencyReply, setSendingEmergencyReply] = useState(false);
  const [emergencyReplySubmitted, setEmergencyReplySubmitted] = useState(false);
  const [emergencyReplyError, setEmergencyReplyError] = useState<string>();
  const emergencyReplyInFlightRef = useRef(false);

  const mx = useMatrixClient();

  const tombstoneEvent = useStateEvent(room, StateEvent.RoomTombstone);
  const consentEvent = useStateEvent(
    room,
    'io.kiconnect.consent.current' as StateEvent
  );
  const ownPatientRoom = isPatientRoom(room) && getRoomOwner(room) === mx.getUserId();
  const currentUserId = mx.getUserId();
  const accountType = currentUserId ? readAccountType(currentUserId) : 'unknown';
  const isTeamAccount = accountType === 'team' || currentUserId?.startsWith('@z') || currentUserId?.startsWith('@bot');
  const patientCanAnswerEmergency = ownPatientRoom || (isPatientRoom(room) && !isTeamAccount);
  const consentContent = consentEvent?.getContent();
  const ownConsent = consentContent?.matrix_user_id === mx.getUserId() ? consentContent : undefined;
  const consentAccepted = ownConsent?.status === 'accepted';
  const consentBlocksInput = ownPatientRoom && !consentAccepted;
  const consentPending = ownConsent?.status === 'pending';
  const emergencyDialogEventType = 'io.kiconnect.emergency_dialog';
  const emergencyDialogEvent =
    useStateEvent(room, emergencyDialogEventType as StateEvent) ??
    room.currentState.getStateEvents(emergencyDialogEventType, '');
  const emergencyDialogEventId = emergencyDialogEvent?.getId();
  const intakeDialogContent = emergencyDialogEvent?.getContent?.() ?? {};
  const intakeDialogStage =
    intakeDialogContent.stage === 'request_type' ? 'request_type' : 'emergency';
  useEffect(() => {
    emergencyReplyInFlightRef.current = false;
    setEmergencyReplySubmitted(false);
    setEmergencyReplyError(undefined);
  }, [roomId, emergencyDialogEventId]);
  const emergencyDialogPending =
    patientCanAnswerEmergency &&
    emergencyDialogEvent?.getContent()?.status === 'pending' &&
    !emergencyReplySubmitted;

  const sendEmergencyReply = async (isEmergency: boolean) => {
    if (emergencyReplyInFlightRef.current) return;
    emergencyReplyInFlightRef.current = true;
    setSendingEmergencyReply(true);
    setEmergencyReplySubmitted(true);
    setEmergencyReplyError(undefined);
    try {
      await mx.sendEvent(roomId, 'm.room.message', {
        msgtype: 'm.text',
        body: isEmergency ? 'Notfall' : 'Kein medizinischer Notfall',
        'io.kiconnect.emergency_response': {
          value: isEmergency ? 'emergency' : 'notfall_no',
        },
      });
    } catch (error) {
      emergencyReplyInFlightRef.current = false;
      setEmergencyReplySubmitted(false);
      setEmergencyReplyError(
        error instanceof Error ? error.message : 'Die Antwort konnte nicht gesendet werden.'
      );
    } finally {
      setSendingEmergencyReply(false);
    }
  };

  const sendRequestTypeReply = async (requestType: 'prescription' | 'other') => {
    if (emergencyReplyInFlightRef.current) return;
    emergencyReplyInFlightRef.current = true;
    setSendingEmergencyReply(true);
    setEmergencyReplySubmitted(true);
    setEmergencyReplyError(undefined);
    try {
      await mx.sendEvent(roomId, 'm.room.message', {
        msgtype: 'm.text',
        body:
          requestType === 'prescription'
            ? 'Rezept / Medikamente nachbestellen'
            : 'Anderes Anliegen',
        'io.kiconnect.request_type_response': { value: requestType },
      });
    } catch (error) {
      emergencyReplyInFlightRef.current = false;
      setEmergencyReplySubmitted(false);
      setEmergencyReplyError(
        error instanceof Error ? error.message : 'Die Auswahl konnte nicht gesendet werden.'
      );
    } finally {
      setSendingEmergencyReply(false);
    }
  };

  const sendConsentReply = async (accepted: boolean) => {
    if (sendingConsent) return;
    setSendingConsent(true);
    try {
      await mx.sendEvent(roomId, 'm.room.message', {
        msgtype: 'm.text',
        body: accepted ? 'ICH STIMME ZU' : 'ICH STIMME NICHT ZU',
      });
    } finally {
      setSendingConsent(false);
    }
  };
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canMessage = permissions.event(EventType.RoomMessage, mx.getSafeUserId());

  useKeyDown(
    window,
    useCallback(
      (evt) => {
        if (editableActiveElement() || consentBlocksInput) return;
        const portalContainer = document.getElementById('portalContainer');
        if (portalContainer && portalContainer.children.length > 0) {
          return;
        }
        if (shouldFocusMessageField(evt) || isKeyHotkey('mod+v', evt)) {
          ReactEditor.focus(editor);
        }
      },
      [editor, consentBlocksInput]
    )
  );

  return (
    <Page ref={roomViewRef}>
      <MedicationDialogView room={room} />
      {emergencyDialogPending && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                escapeDeactivates: false,
                clickOutsideDeactivates: false,
                initialFocus: false,
              }}
            >
              <Dialog
                variant="Surface"
                role={intakeDialogStage === 'emergency' ? 'alertdialog' : 'dialog'}
                aria-modal="true"
                aria-labelledby="intake-dialog-title"
                style={{ width: 'min(440px, calc(100vw - 32px))' }}
              >
                <Box direction="Column" gap="400" style={{ padding: 24 }}>
                  {intakeDialogStage === 'request_type' ? (
                    <>
                      <Box direction="Column" gap="200">
                        <Text id="intake-dialog-title" size="H4">
                          Ich brauche:
                        </Text>
                        <Text>Bitte wählen Sie aus, worum es geht.</Text>
                      </Box>
                      {emergencyReplyError && (
                        <Text style={{ color: '#922536' }}>{emergencyReplyError}</Text>
                      )}
                      <Box direction="Column" gap="200">
                        <Button
                          variant="Secondary"
                          onClick={() => sendRequestTypeReply('prescription')}
                          disabled={sendingEmergencyReply}
                          style={{
                            width: '100%',
                            minHeight: 58,
                            backgroundColor: '#ffffff',
                            border: '2px solid #1e7f93',
                            color: '#111111',
                            whiteSpace: 'normal',
                          }}
                        >
                          Rezept / Medikamente nachbestellen
                        </Button>
                        <Button
                          variant="Secondary"
                          onClick={() => sendRequestTypeReply('other')}
                          disabled={sendingEmergencyReply}
                          style={{
                            width: '100%',
                            minHeight: 78,
                            backgroundColor: '#ffffff',
                            border: '2px solid #1e7f93',
                            color: '#111111',
                            whiteSpace: 'normal',
                            lineHeight: 1.35,
                          }}
                        >
                          Anderes Anliegen
                          <br />
                          <small>
                            Termin, medizinisches Problem, Überweisung, Arztkonsultation im Chat …
                          </small>
                        </Button>
                      </Box>
                    </>
                  ) : (
                    <>
                      <Box direction="Column" gap="200">
                        <Text id="intake-dialog-title" size="H4">
                          Medizinischer Notfall
                        </Text>
                        <Text>Handelt es sich um einen medizinischen Notfall?</Text>
                      </Box>
                      {emergencyReplyError && (
                        <Text style={{ color: '#922536' }}>{emergencyReplyError}</Text>
                      )}
                      <Box gap="200" style={{ flexWrap: 'wrap' }}>
                        <Button
                          variant="Primary"
                          onClick={() => sendEmergencyReply(false)}
                          disabled={sendingEmergencyReply}
                          style={{
                            flex: '1 1 160px',
                            backgroundColor: '#1e7f93',
                            borderColor: '#1e7f93',
                            color: '#ffffff',
                          }}
                        >
                          Nein
                        </Button>
                        <Button
                          variant="Critical"
                          onClick={() => sendEmergencyReply(true)}
                          disabled={sendingEmergencyReply}
                          style={{
                            flex: '1 1 160px',
                            backgroundColor: '#c62828',
                            borderColor: '#c62828',
                            color: '#ffffff',
                          }}
                        >
                          Ja
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>
              </Dialog>
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
      <Box grow="Yes" direction="Column">
        <RoomTimeline
          key={roomId}
          room={room}
          eventId={eventId}
          roomInputRef={roomInputRef}
          editor={editor}
        />
        <RoomViewTyping room={room} />
      </Box>
      <Box shrink="No" direction="Column">
        <div style={{ padding: `0 ${config.space.S400}` }}>
          {tombstoneEvent ? (
            <RoomTombstone
              roomId={roomId}
              body={tombstoneEvent.getContent().body}
              replacementRoomId={tombstoneEvent.getContent().replacement_room}
            />
          ) : (
            <>
              {canMessage && !consentBlocksInput && (
                <RoomInput
                  room={room}
                  editor={editor}
                  roomId={roomId}
                  fileDropContainerRef={roomViewRef}
                  ref={roomInputRef}
                />
              )}
              {canMessage && consentBlocksInput && (
                <RoomInputPlaceholder
                  style={{ padding: config.space.S200 }}
                  alignItems="Center"
                  justifyContent="Center"
                >
                  <Box direction="Column" gap="200" alignItems="Center">
                    <Text align="Center">
                      {consentPending
                        ? 'Bitte bestätigen Sie zuerst die Einverständniserklärung im Chat.'
                        : 'Der Chat ist ohne gültige Einwilligung gesperrt.'}
                    </Text>
                    {consentPending && (
                      <Box gap="200" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                        <Button onClick={() => sendConsentReply(true)} disabled={sendingConsent}>
                          Ich stimme zu
                        </Button>
                        <Button
                          variant="Secondary"
                          onClick={() => sendConsentReply(false)}
                          disabled={sendingConsent}
                        >
                          Ich stimme nicht zu
                        </Button>
                      </Box>
                    )}
                  </Box>
                </RoomInputPlaceholder>
              )}
              {!canMessage && (
                <RoomInputPlaceholder
                  style={{ padding: config.space.S200 }}
                  alignItems="Center"
                  justifyContent="Center"
                >
                  <Text align="Center">You do not have permission to post in this room</Text>
                </RoomInputPlaceholder>
              )}
            </>
          )}
        </div>
        {hideActivity ? <RoomViewFollowingPlaceholder /> : <RoomViewFollowing room={room} />}
      </Box>
    </Page>
  );
}
