import React, { MouseEventHandler, forwardRef, useEffect, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Avatar,
  Text,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  IconButton,
  Icon,
  Icons,
  Tooltip,
  TooltipProvider,
  Menu,
  MenuItem,
  toRem,
  config,
  Line,
  PopOut,
  RectCords,
  Badge,
  Button,
  Dialog,
  Input,
} from 'folds';
import { useNavigate } from 'react-router-dom';
import { Room } from 'matrix-js-sdk';
import { useStateEvent } from '../../hooks/useStateEvent';
import { PageHeader } from '../../components/page';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { UseStateProvider } from '../../components/UseStateProvider';
import { RoomTopicViewer } from '../../components/room-topic-viewer';
import { StateEvent } from '../../../types/matrix/room';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useIsDirectRoom, useRoom } from '../../hooks/useRoom';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { getHomeSearchPath, getSpaceSearchPath, withSearchParam } from '../../pages/pathUtils';
import { getCanonicalAliasOrRoomId, mxcUrlToHttp } from '../../utils/matrix';
import { _SearchPathSearchParams } from '../../pages/paths';
import * as css from './RoomViewHeader.css';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { useRoomAvatar, useRoomName, useRoomTopic } from '../../hooks/useRoomMeta';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { stopPropagation } from '../../utils/keyboard';
import { BackRouteHandler } from '../../components/BackRouteHandler';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoomPinnedEvents } from '../../hooks/useRoomPinnedEvents';
import { RoomPinMenu } from './room-pin-menu';
import { JumpToTime } from './jump-to-time';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { useCallEmbed, useCallStart } from '../../hooks/useCallEmbed';
import { useLivekitSupport } from '../../hooks/useLivekitSupport';
import { webRTCSupported } from '../../utils/rtc';
import { useKiconnectLock } from '../../kiconnect/lock/LockProvider';
import { clientLogout } from '../../kiconnect/logic/logout';
import { useClientConfig } from '../../hooks/useClientConfig';
import {
  disableWebPush,
  enableWebPush,
  getWebPushStatus,
  WebPushStatus,
} from '../../kiconnect/push/webPush';
import { getRoomOwner, isPatientRoom } from '../../kiconnect/logic/roomState';
import { useTeamIdleMonitor } from '../../kiconnect/idle/TeamIdleMonitor';

type RoomMenuProps = {
  room: Room;
  requestClose: () => void;
  canAddAuth: boolean;
  requestAuthAdd: () => void;
  canManageConsent: boolean;
  requestConsent: () => void;
};
const RoomMenu = forwardRef<HTMLDivElement, RoomMenuProps>(
  ({ room, requestClose, canAddAuth, requestAuthAdd, canManageConsent, requestConsent }, ref) => {
    const mx = useMatrixClient();
    const clientConfig = useClientConfig();
    const { accountType, canLock, idleTimeoutMinutes, setIdleTimeoutMinutes, lock } =
      useKiconnectLock();
    const idleMonitor = useTeamIdleMonitor();
    const { navigateRoom } = useRoomNavigate();
    const [loggingOut, setLoggingOut] = useState(false);
    const [pushStatus, setPushStatus] = useState<WebPushStatus>('off');
    const [changingPush, setChangingPush] = useState(false);
    const [pushError, setPushError] = useState<string>();
    const [idleTimeoutInput, setIdleTimeoutInput] = useState(String(idleTimeoutMinutes));
    const [savingIdleTimeout, setSavingIdleTimeout] = useState(false);
    const [idleTimeoutMessage, setIdleTimeoutMessage] = useState<string>();

    useEffect(() => setIdleTimeoutInput(String(idleTimeoutMinutes)), [idleTimeoutMinutes]);

    useEffect(() => {
      getWebPushStatus(mx)
        .then(setPushStatus)
        .catch(() => setPushStatus('off'));
    }, [mx]);

    const handlePushToggle = async () => {
      if (changingPush || pushStatus === 'unsupported') return;
      setChangingPush(true);
      setPushError(undefined);
      try {
        if (pushStatus === 'on') {
          await disableWebPush(mx);
          setPushStatus('off');
        } else {
          await enableWebPush(mx, clientConfig);
          setPushStatus('on');
        }
      } catch (error) {
        setPushError(
          error instanceof Error ? error.message : 'Push-Einstellung konnte nicht geändert werden.'
        );
      } finally {
        setChangingPush(false);
      }
    };

    const handleLock = () => {
      requestClose();
      lock();
    };

    const handleLogout = async () => {
      if (loggingOut) return;
      setLoggingOut(true);
      await clientLogout(mx);
    };

    const handleIdleTimeoutSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (savingIdleTimeout) return;
      const minutes = Number(idleTimeoutInput);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 120) {
        setIdleTimeoutMessage('Bitte eine ganze Zahl von 0 bis 120 eingeben.');
        return;
      }
      setSavingIdleTimeout(true);
      setIdleTimeoutMessage(undefined);
      try {
        if (
          accountType === 'team' &&
          minutes > 0 &&
          (idleMonitor.status === 'permission-required' || idleMonitor.status === 'denied')
        ) {
          await idleMonitor.requestPermission();
        }
        await setIdleTimeoutMinutes(minutes);
        setIdleTimeoutMessage('Gespeichert – gilt auf allen Geräten.');
      } catch (error) {
        setIdleTimeoutMessage(
          error instanceof Error
            ? error.message
            : 'Die Einstellung konnte nicht gespeichert werden.'
        );
      } finally {
        setSavingIdleTimeout(false);
      }
    };

    return (
      <Menu ref={ref} style={{ maxWidth: toRem(230), width: '100vw' }}>
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <UseStateProvider initial={false}>
            {(promptJump, setPromptJump) => (
              <>
                <MenuItem
                  onClick={() => setPromptJump(true)}
                  size="300"
                  after={<Icon size="100" src={Icons.RecentClock} />}
                  radii="300"
                  aria-pressed={promptJump}
                >
                  <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                    Jump to Time
                  </Text>
                </MenuItem>
                {promptJump && (
                  <JumpToTime
                    onSubmit={(eventId) => {
                      setPromptJump(false);
                      navigateRoom(room.roomId, eventId);
                      requestClose();
                    }}
                    onCancel={() => setPromptJump(false)}
                  />
                )}
              </>
            )}
          </UseStateProvider>
          <MenuItem
            onClick={handlePushToggle}
            size="300"
            radii="300"
            disabled={changingPush || pushStatus === 'unsupported'}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              {changingPush
                ? 'Push-Nachrichten …'
                : `Push-Nachrichten: ${pushStatus === 'on' ? 'Ein' : 'Aus'}`}
            </Text>
          </MenuItem>
          {pushStatus === 'unsupported' && (
            <Text style={{ padding: `0 ${config.space.S200}` }} size="T200" priority="300">
              Nur in der installierten PWA verfügbar.
            </Text>
          )}
          {pushError && (
            <Text style={{ padding: `0 ${config.space.S200}`, color: '#922536' }} size="T200">
              {pushError}
            </Text>
          )}
          {canAddAuth && (
            <MenuItem
              onClick={() => {
                requestClose();
                requestAuthAdd();
              }}
              size="300"
              radii="300"
            >
              <Text style={{ flexGrow: 1, fontWeight: 700 }} as="span" size="T300" truncate>
                Anmeldeart hinzufügen
              </Text>
            </MenuItem>
          )}
          {canManageConsent && (
            <MenuItem
              onClick={() => {
                requestClose();
                requestConsent();
              }}
              size="300"
              radii="300"
            >
              <Text style={{ flexGrow: 1 }} as="span" size="T300">
                Datenschutz &amp; Einwilligung
              </Text>
            </MenuItem>
          )}
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <form onSubmit={handleIdleTimeoutSubmit} style={{ padding: config.space.S100 }}>
            <Text as="label" htmlFor="kiconnect-idle-timeout" size="T200" priority="300">
              Timeout-Zeit in Minuten (0–120, 0 = aus)
            </Text>
            <Box gap="100" alignItems="Center" style={{ marginTop: config.space.S100 }}>
              <Input
                id="kiconnect-idle-timeout"
                name="kiconnect-idle-timeout"
                type="number"
                min={0}
                max={120}
                step={1}
                inputMode="numeric"
                value={idleTimeoutInput}
                onChange={(event) => {
                  setIdleTimeoutInput(event.currentTarget.value);
                  setIdleTimeoutMessage(undefined);
                }}
                disabled={savingIdleTimeout}
                style={{ minWidth: 0, fontSize: toRem(13), color: '#527079' }}
              />
              <Button type="submit" size="300" variant="Secondary" disabled={savingIdleTimeout}>
                <Text as="span" size="T200">
                  {savingIdleTimeout ? '…' : 'Speichern'}
                </Text>
              </Button>
            </Box>
            {idleTimeoutMessage && (
              <Text size="T200" priority="300" style={{ marginTop: config.space.S100 }}>
                {idleTimeoutMessage}
              </Text>
            )}
          </form>
          {accountType === 'team' &&
            idleTimeoutMinutes > 0 &&
            (idleMonitor.status === 'unsupported' ||
              idleMonitor.status === 'denied' ||
              idleMonitor.status === 'error') && (
              <Text
                size="T200"
                priority="300"
                style={{ padding: `0 ${config.space.S100}`, color: '#922536' }}
              >
                Automatischer Logout kann in diesem Browser nicht aktiviert werden.
              </Text>
            )}
          {canLock && (
            <MenuItem onClick={handleLock} size="300" radii="300">
              <Text style={{ flexGrow: 1, fontWeight: 700 }} as="span" size="T300" truncate>
                Client sperren
              </Text>
            </MenuItem>
          )}
          <MenuItem onClick={handleLogout} size="300" radii="300" disabled={loggingOut}>
            <Text style={{ flexGrow: 1, fontWeight: 700 }} as="span" size="T300" truncate>
              {loggingOut ? 'Abmeldung läuft …' : 'Vollständig abmelden'}
            </Text>
          </MenuItem>
        </Box>
      </Menu>
    );
  }
);

type CallMenuProps = {
  onVoiceCall: () => void;
  onVideoCall: () => void;
  requestClose: () => void;
};
const CallMenu = forwardRef<HTMLDivElement, CallMenuProps>(
  ({ requestClose, onVoiceCall, onVideoCall }, ref) => {
    const handleVoice = () => {
      onVoiceCall();
      requestClose();
    };
    const handleVideo = () => {
      onVideoCall();
      requestClose();
    };

    return (
      <Menu ref={ref} style={{ padding: config.space.S200, minWidth: toRem(150) }}>
        <Box direction="Column" gap="200">
          <Text size="L400">Start Call</Text>
          <Box direction="Column" gap="200">
            <Button
              size="300"
              variant="Success"
              fill="Soft"
              outlined
              radii="300"
              before={<Icon size="100" src={Icons.Phone} filled />}
              onClick={handleVoice}
            >
              <Text size="B300">Voice</Text>
            </Button>
            <Button
              size="300"
              variant="Success"
              radii="300"
              before={<Icon size="100" src={Icons.VideoCamera} filled />}
              onClick={handleVideo}
            >
              <Text size="B300">Video</Text>
            </Button>
          </Box>
        </Box>
      </Menu>
    );
  }
);

function CallButton() {
  const room = useRoom();
  const direct = useIsDirectRoom();

  const callEmbed = useCallEmbed();
  const startCall = useCallStart(direct);
  const callStarted = callEmbed && callEmbed.roomId === room.roomId;
  const inAnotherCall = callEmbed && !callStarted;
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <>
      <TooltipProvider
        position="Bottom"
        offset={4}
        tooltip={
          <Tooltip>
            {inAnotherCall ? (
              <Text size="L400">Already in another call — End the current call to join!</Text>
            ) : (
              <Text>Call</Text>
            )}
          </Tooltip>
        }
      >
        {(triggerRef) => (
          <IconButton
            variant="Surface"
            fill="None"
            ref={triggerRef}
            onClick={handleOpenMenu}
            onContextMenu={(evt) => {
              evt.preventDefault();
              startCall(room, {
                microphone: true,
                video: true,
                sound: true,
              });
            }}
            disabled={inAnotherCall || callStarted}
            aria-pressed={!!menuAnchor}
          >
            <Icon size="400" src={Icons.VideoCamera} filled={!!menuAnchor} />
          </IconButton>
        )}
      </TooltipProvider>
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="Center"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: () => setMenuAnchor(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <CallMenu
              onVideoCall={() => startCall(room, { microphone: true, video: true, sound: true })}
              onVoiceCall={() => startCall(room, { microphone: true, video: false, sound: true })}
              requestClose={() => setMenuAnchor(undefined)}
            />
          </FocusTrap>
        }
      />
    </>
  );
}

export function RoomViewHeader({ callView }: { callView?: boolean }) {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const screenSize = useScreenSizeContext();
  const room = useRoom();
  const space = useSpaceOptionally();
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const clientConfig = useClientConfig();
  const { accountType } = useKiconnectLock();

  const hasCallPermission = permissions.stateEvent(
    StateEvent.GroupCallMemberPrefix,
    mx.getSafeUserId()
  );
  const livekitSupported = useLivekitSupport();
  const rtcSupported = webRTCSupported();

  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [pinMenuAnchor, setPinMenuAnchor] = useState<RectCords>();
  const [showAuthAdd, setShowAuthAdd] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawingConsent, setWithdrawingConsent] = useState(false);
  const [reopeningConsent, setReopeningConsent] = useState(false);
  const [consentError, setConsentError] = useState<string>();
  const [sendingAuthAdd, setSendingAuthAdd] = useState(false);
  const [authAddError, setAuthAddError] = useState<string>();
  const direct = useIsDirectRoom();
  const canAddAuth = getRoomOwner(room) === mx.getUserId();
  const canManageConsent = isPatientRoom(room) && getRoomOwner(room) === mx.getUserId();
  const consentEvent = useStateEvent(
    room,
    'io.kiconnect.consent.current' as StateEvent
  );
  const consent = consentEvent?.getContent() as
    | {
        version?: string;
        document?: string;
        pdf_mxc?: string;
        status?: string;
        decided_at?: string;
        matrix_user_id?: string;
      }
    | undefined;
  const ownConsent = consent?.matrix_user_id === mx.getUserId() ? consent : undefined;

  const pinnedEvents = useRoomPinnedEvents(room);
  const encryptionEvent = useStateEvent(room, StateEvent.RoomEncryption);
  const encryptedRoom = !!encryptionEvent;
  const avatarMxc = useRoomAvatar(room, direct);
  const name = useRoomName(room);
  const topic = useRoomTopic(room);
  const subject = topic?.trim() || 'Kein Betreff';
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const handleSearchClick = () => {
    const searchParams: _SearchPathSearchParams = {
      rooms: room.roomId,
    };
    const path = space
      ? getSpaceSearchPath(getCanonicalAliasOrRoomId(mx, space.roomId))
      : getHomeSearchPath();
    navigate(withSearchParam(path, searchParams));
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleOpenPinMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setPinMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleOpenPortal = async () => {
    if (!clientConfig.portalUrl) return;
    const portalWindow = window.open('', 'kiconnect-portal');
    if (!portalWindow) {
      window.alert('Bitte erlauben Sie Pop-up-Fenster für KI connect.');
      return;
    }
    portalWindow.document.body.textContent = 'Das sichere Portal wird geöffnet …';
    try {
      const response = await fetch(
        `${clientConfig.portalUrl.replace(/\/$/, '')}/api/portal-launch`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${mx.getAccessToken() ?? ''}` },
        }
      );
      if (!response.ok) throw new Error('Portalzugang wurde abgelehnt.');
      const result = await response.json();
      if (typeof result?.launch_url !== 'string') throw new Error('Portalantwort ist ungültig.');
      portalWindow.location.replace(result.launch_url);
    } catch (error) {
      portalWindow.close();
      window.alert(error instanceof Error ? error.message : 'Portal konnte nicht geöffnet werden.');
    }
  };

  const handleAddAuth = async (method: 'passkey' | 'password_2fa') => {
    if (sendingAuthAdd) return;
    setSendingAuthAdd(true);
    setAuthAddError(undefined);
    try {
      await mx.sendEvent(room.roomId, 'io.kiconnect.auth.add.request', {
        request_id: crypto.randomUUID(),
        method,
        created_by: mx.getUserId(),
        created_at: Date.now(),
      });
      setShowAuthAdd(false);
    } catch (error) {
      setAuthAddError(
        error instanceof Error ? error.message : 'Die Anfrage konnte nicht gesendet werden.'
      );
    } finally {
      setSendingAuthAdd(false);
    }
  };

  const handleWithdrawConsent = async () => {
    if (withdrawingConsent) return;
    setWithdrawingConsent(true);
    setConsentError(undefined);
    try {
      await mx.sendEvent(room.roomId, 'io.kiconnect.consent.withdraw', {
        requested_by: mx.getUserId(),
        requested_at: Date.now(),
        version: ownConsent?.version,
      });
      setConfirmWithdraw(false);
      setShowConsent(false);
    } catch (error) {
      setConsentError(
        error instanceof Error ? error.message : 'Der Widerruf konnte nicht übermittelt werden.'
      );
    } finally {
      setWithdrawingConsent(false);
    }
  };

  const handleReopenConsent = async () => {
    if (reopeningConsent) return;
    setReopeningConsent(true);
    setConsentError(undefined);
    try {
      await mx.sendEvent(room.roomId, 'io.kiconnect.consent.reopen', {
        requested_by: mx.getUserId(),
        requested_at: Date.now(),
        previous_status: ownConsent?.status,
      });
      setShowConsent(false);
    } catch (error) {
      setConsentError(
        error instanceof Error
          ? error.message
          : 'Die erneute Einwilligung konnte nicht gestartet werden.'
      );
    } finally {
      setReopeningConsent(false);
    }
  };

  const consentStatus =
    ownConsent?.status === 'accepted'
      ? 'Zugestimmt'
      : ownConsent?.status === 'withdrawn'
        ? 'Widerrufen'
        : ownConsent?.status === 'declined'
          ? 'Nicht zugestimmt'
          : 'Zustimmung ausständig';
  const consentPdfUrl = ownConsent?.pdf_mxc
    ? mx.mxcUrlToHttp(ownConsent.pdf_mxc, undefined, undefined, undefined, undefined, undefined, true)
    : undefined;

  return (
    <>
      {showAuthAdd && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <Dialog variant="Surface" style={{ width: 'min(480px, calc(100vw - 32px))' }}>
              <Box direction="Column" gap="400" style={{ padding: 24 }}>
                <Box direction="Column" gap="200">
                  <Text size="H4">Anmeldeart hinzufügen</Text>
                  <Text priority="400">
                    Die Einrichtungs-E-Mail wird an Ihre hinterlegte Adresse gesendet.
                  </Text>
                </Box>
                <Box direction="Column" gap="200">
                  <Button onClick={() => handleAddAuth('passkey')} disabled={sendingAuthAdd}>
                    Passkey / Sicherheitsschlüssel
                  </Button>
                  <Text size="T200" priority="400">
                    Fügt ein Smartphone, einen Geräte-Passkey oder einen FIDO2-Sicherheitsschlüssel
                    hinzu. Bestehende Zugänge bleiben erhalten.
                  </Text>
                  <Button
                    variant="Secondary"
                    onClick={() => handleAddAuth('password_2fa')}
                    disabled={sendingAuthAdd}
                  >
                    Benutzername, Passwort und 2FA
                  </Button>
                  <Text size="T200" priority="400">
                    Ein vorhandenes Passwort wird aktualisiert; bestehende Passkeys bleiben
                    erhalten.
                  </Text>
                </Box>
                {authAddError && <Text style={{ color: '#922536' }}>{authAddError}</Text>}
                <Box justifyContent="End">
                  <Button
                    variant="Secondary"
                    onClick={() => setShowAuthAdd(false)}
                    disabled={sendingAuthAdd}
                  >
                    Abbrechen
                  </Button>
                </Box>
              </Box>
            </Dialog>
          </OverlayCenter>
        </Overlay>
      )}
      {showConsent && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <Dialog
              variant="Surface"
              style={{
                width: 'min(760px, calc(100vw - 24px))',
                height: 'min(760px, calc(100dvh - 24px))',
                maxHeight: 'calc(100dvh - 24px)',
                overflow: 'hidden',
              }}
            >
              <Box
                direction="Column"
                gap="300"
                style={{ padding: 20, height: '100%', minHeight: 0, boxSizing: 'border-box' }}
              >
                <Box alignItems="Center" justifyContent="SpaceBetween" gap="200" shrink="No">
                  <Text size="H4">Datenschutz &amp; Einwilligung</Text>
                  <Button variant="Secondary" size="300" onClick={() => setShowConsent(false)}>
                    Schließen
                  </Button>
                </Box>
                <Text priority="400">
                  Status: <strong>{consentStatus}</strong>
                  {ownConsent?.version ? ` · Version ${ownConsent.version}` : ''}
                </Text>
                {ownConsent?.decided_at && (
                  <Text size="T200" priority="400">
                    Letzte Entscheidung: {new Date(ownConsent.decided_at).toLocaleString('de-AT')}
                  </Text>
                )}
                <div
                  style={{
                    flex: '1 1 auto',
                    minHeight: 0,
                    whiteSpace: 'pre-wrap',
                    overflow: 'auto',
                    border: '1px solid #b8c7cb',
                    borderRadius: 12,
                    padding: 16,
                    lineHeight: 1.5,
                  }}
                >
                  {ownConsent?.document ??
                    'Die Einverständniserklärung ist in diesem Raum noch nicht verfügbar.'}
                </div>
                {consentError && <Text style={{ color: '#922536' }}>{consentError}</Text>}
                <Box
                  gap="200"
                  justifyContent="End"
                  shrink="No"
                  style={{ flexWrap: 'wrap' }}
                >
                  {consentPdfUrl && (
                    <Button
                      as="a"
                      variant="Secondary"
                      href={consentPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDF anzeigen
                    </Button>
                  )}
                  {ownConsent?.status === 'accepted' && (
                    <Button variant="Secondary" onClick={() => setConfirmWithdraw(true)}>
                      Einwilligung widerrufen
                    </Button>
                  )}
                  {(ownConsent?.status === 'withdrawn' || ownConsent?.status === 'declined') && (
                    <Button onClick={handleReopenConsent} disabled={reopeningConsent}>
                      {reopeningConsent ? 'Wird vorbereitet …' : 'Einwilligung erneut erteilen'}
                    </Button>
                  )}
                </Box>
              </Box>
            </Dialog>
          </OverlayCenter>
        </Overlay>
      )}
      {confirmWithdraw && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <Dialog variant="Surface" style={{ width: 'min(480px, calc(100vw - 32px))' }}>
              <Box direction="Column" gap="300" style={{ padding: 24 }}>
                <Text size="H4">Einwilligung widerrufen?</Text>
                <Text priority="400">
                  Der Chat wird unmittelbar gesperrt. Der Widerruf wirkt für die Zukunft;
                  gesetzlich erforderliche Dokumentation bleibt erhalten. Für weitere Anliegen
                  kontaktieren Sie bitte Ihre Ordination telefonisch oder persönlich.
                </Text>
                {consentError && <Text style={{ color: '#922536' }}>{consentError}</Text>}
                <Box gap="200" justifyContent="End">
                  <Button
                    variant="Secondary"
                    onClick={() => setConfirmWithdraw(false)}
                    disabled={withdrawingConsent}
                  >
                    Abbrechen
                  </Button>
                  <Button onClick={handleWithdrawConsent} disabled={withdrawingConsent}>
                    {withdrawingConsent ? 'Wird übermittelt …' : 'Jetzt widerrufen'}
                  </Button>
                </Box>
              </Box>
            </Dialog>
          </OverlayCenter>
        </Overlay>
      )}
      <PageHeader
        data-call-view={callView || undefined}
        className={ContainerColor({ variant: 'Surface' })}
        balance={screenSize === ScreenSize.Mobile}
      >
        <Box grow="Yes" gap="300">
          {screenSize === ScreenSize.Mobile && (
            <BackRouteHandler>
              {(onBack) => (
                <Box shrink="No" alignItems="Center">
                  <IconButton fill="None" onClick={onBack}>
                    <Icon src={Icons.ArrowLeft} />
                  </IconButton>
                </Box>
              )}
            </BackRouteHandler>
          )}
          <Box grow="Yes" alignItems="Center" gap="300">
            {screenSize !== ScreenSize.Mobile && (
              <Avatar size="300">
                <RoomAvatar
                  roomId={room.roomId}
                  src={avatarUrl}
                  alt={name}
                  renderFallback={() => (
                    <RoomIcon size="200" joinRule={room.getJoinRule()} roomType={room.getType()} />
                  )}
                />
              </Avatar>
            )}
            <Box direction="Column">
              <Text size="H5" truncate>
                {name}
              </Text>
              <UseStateProvider initial={false}>
                {(viewTopic, setViewTopic) => (
                  <>
                    <Overlay open={viewTopic} backdrop={<OverlayBackdrop />}>
                      <OverlayCenter>
                        <FocusTrap
                          focusTrapOptions={{
                            initialFocus: false,
                            clickOutsideDeactivates: true,
                            onDeactivate: () => setViewTopic(false),
                            escapeDeactivates: stopPropagation,
                          }}
                        >
                          <RoomTopicViewer
                            name={name}
                            topic={subject}
                            requestClose={() => setViewTopic(false)}
                          />
                        </FocusTrap>
                      </OverlayCenter>
                    </Overlay>
                    <Text
                      as="button"
                      type="button"
                      onClick={() => setViewTopic(true)}
                      className={css.HeaderTopic}
                      size="T200"
                      priority="300"
                      truncate
                    >
                      Betreff: {subject}
                    </Text>
                  </>
                )}
              </UseStateProvider>
            </Box>
          </Box>

          <Box shrink="No">
            {!encryptedRoom && (
              <TooltipProvider
                position="Bottom"
                offset={4}
                tooltip={
                  <Tooltip>
                    <Text>Search</Text>
                  </Tooltip>
                }
              >
                {(triggerRef) => (
                  <IconButton fill="None" ref={triggerRef} onClick={handleSearchClick}>
                    <Icon size="400" src={Icons.Search} />
                  </IconButton>
                )}
              </TooltipProvider>
            )}
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>Pinned Messages</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  style={{ position: 'relative' }}
                  onClick={handleOpenPinMenu}
                  ref={triggerRef}
                  aria-pressed={!!pinMenuAnchor}
                >
                  {pinnedEvents.length > 0 && (
                    <Badge
                      style={{
                        position: 'absolute',
                        left: toRem(3),
                        top: toRem(3),
                      }}
                      variant="Secondary"
                      size="400"
                      fill="Solid"
                      radii="Pill"
                    >
                      <Text as="span" size="L400">
                        {pinnedEvents.length}
                      </Text>
                    </Badge>
                  )}
                  <Icon size="400" src={Icons.Pin} filled={!!pinMenuAnchor} />
                </IconButton>
              )}
            </TooltipProvider>
            <PopOut
              anchor={pinMenuAnchor}
              position="Bottom"
              content={
                <FocusTrap
                  focusTrapOptions={{
                    initialFocus: false,
                    returnFocusOnDeactivate: false,
                    onDeactivate: () => setPinMenuAnchor(undefined),
                    clickOutsideDeactivates: true,
                    isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                    isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                    escapeDeactivates: stopPropagation,
                  }}
                >
                  <RoomPinMenu room={room} requestClose={() => setPinMenuAnchor(undefined)} />
                </FocusTrap>
              }
            />
            {!room.isCallRoom() && livekitSupported && rtcSupported && hasCallPermission && (
              <CallButton />
            )}
            {accountType === 'team' && clientConfig.portalUrl && (
              <Button
                size="300"
                variant="Secondary"
                onClick={handleOpenPortal}
                aria-label="Benutzerverwaltung öffnen"
                style={{
                  marginInline: toRem(4),
                  border: '1px solid #c7cdd1',
                  background: '#eef1f2',
                  color: '#111111',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <Text as="span" size="T200" style={{ color: '#111111' }}>
                  Benutzerverwaltung
                </Text>
              </Button>
            )}
            <TooltipProvider
              position="Bottom"
              align="End"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>More Options</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  onClick={handleOpenMenu}
                  ref={triggerRef}
                  aria-pressed={!!menuAnchor}
                >
                  <Icon size="400" src={Icons.VerticalDots} filled={!!menuAnchor} />
                </IconButton>
              )}
            </TooltipProvider>
            <PopOut
              anchor={menuAnchor}
              position="Bottom"
              align="End"
              content={
                <FocusTrap
                  focusTrapOptions={{
                    initialFocus: false,
                    returnFocusOnDeactivate: false,
                    onDeactivate: () => setMenuAnchor(undefined),
                    clickOutsideDeactivates: true,
                    isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                    isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                    escapeDeactivates: stopPropagation,
                  }}
                >
                  <RoomMenu
                    room={room}
                    requestClose={() => setMenuAnchor(undefined)}
                    canAddAuth={canAddAuth}
                    requestAuthAdd={() => setShowAuthAdd(true)}
                    canManageConsent={canManageConsent}
                    requestConsent={() => setShowConsent(true)}
                  />
                </FocusTrap>
              }
            />
          </Box>
        </Box>
      </PageHeader>
    </>
  );
}
