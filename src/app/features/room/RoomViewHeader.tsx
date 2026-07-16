import React, { MouseEventHandler, forwardRef, useState } from 'react';
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

type RoomMenuProps = {
  room: Room;
  requestClose: () => void;
};
const RoomMenu = forwardRef<HTMLDivElement, RoomMenuProps>(({ room, requestClose }, ref) => {
  const mx = useMatrixClient();
  const { lock } = useKiconnectLock();
  const { navigateRoom } = useRoomNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLock = () => {
    requestClose();
    lock();
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await clientLogout(mx);
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
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem onClick={handleLock} size="300" radii="300">
          <Text style={{ flexGrow: 1, fontWeight: 700 }} as="span" size="T300" truncate>
            Client sperren
          </Text>
        </MenuItem>
        <MenuItem onClick={handleLogout} size="300" radii="300" disabled={loggingOut}>
          <Text style={{ flexGrow: 1, fontWeight: 700 }} as="span" size="T300" truncate>
            {loggingOut ? 'Abmeldung läuft …' : 'Vollständig abmelden'}
          </Text>
        </MenuItem>
      </Box>
    </Menu>
  );
});

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

  const hasCallPermission = permissions.stateEvent(
    StateEvent.GroupCallMemberPrefix,
    mx.getSafeUserId()
  );
  const livekitSupported = useLivekitSupport();
  const rtcSupported = webRTCSupported();

  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [pinMenuAnchor, setPinMenuAnchor] = useState<RectCords>();
  const direct = useIsDirectRoom();

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

  return (
    <PageHeader
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
                <RoomMenu room={room} requestClose={() => setMenuAnchor(undefined)} />
              </FocusTrap>
            }
          />
        </Box>
      </Box>
    </PageHeader>
  );
}
