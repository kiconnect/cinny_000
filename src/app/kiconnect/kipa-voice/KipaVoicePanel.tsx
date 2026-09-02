import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Icon, Icons, Text } from 'folds';
import type { Room } from 'matrix-js-sdk';

import { useMatrixClient } from '../../hooks/useMatrixClient';
import { KipaMatrixCall, type KipaCallStatus } from './KipaMatrixCall';
import type { KipaRoomConfig } from './room';

import './KipaVoice.css';

type Props = {
  room: Room;
  config: KipaRoomConfig;
};

const statusLabel: Record<KipaCallStatus, string> = {
  idle: 'Bereit',
  starting: 'Mikrofon wird vorbereitet …',
  calling: 'KIPA wird gerufen …',
  connecting: 'Verbindung wird aufgebaut …',
  connected: 'Mit KIPA verbunden',
  ended: 'Gespräch beendet',
  error: 'Verbindung fehlgeschlagen',
};

const errorText = (error: unknown): string => {
  if (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  ) {
    return 'Mikrofonzugriff verweigert. Am iPhone bitte in den Einstellungen unter Datenschutz & Sicherheit > Mikrofon KIconnect erlauben und danach erneut auf Sprechen tippen.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Die KIPA-Sprachverbindung konnte nicht gestartet werden.';
};

const requestMicrophonePermission = async (): Promise<void> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Dieser Browser unterstützt keinen Mikrofonzugriff.');
  }

  // Request permission directly from the button gesture. This is especially
  // important for an iOS PWA, where a later WebRTC request may not show the
  // native permission prompt reliably.
  const permissionStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
  permissionStream.getTracks().forEach((track) => track.stop());
};

export default function KipaVoicePanel({ room, config }: Props): JSX.Element {
  const mx = useMatrixClient();
  const sessionRef = useRef<KipaMatrixCall>();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<KipaCallStatus>('idle');
  const [error, setError] = useState<string>();

  const setRemoteStream = useCallback((stream: MediaStream | undefined) => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = stream ?? null;
    if (stream) {
      audioRef.current.play().catch(() => {
        // The controls remain available if a browser blocks autoplay.
      });
    }
  }, []);

  const endCall = useCallback(() => {
    sessionRef.current?.hangup();
    sessionRef.current = undefined;
    setRemoteStream(undefined);
  }, [setRemoteStream]);

  const startCall = useCallback(async () => {
    if (sessionRef.current) return;

    setError(undefined);
    const session = new KipaMatrixCall(mx, room.roomId, config.paUserId, {
      onStatus: setStatus,
      onRemoteStream: setRemoteStream,
      onError: (callError) => setError(errorText(callError)),
    });
    sessionRef.current = session;

    try {
      await requestMicrophonePermission();
      await session.start();
    } catch (startError) {
      session.dispose(false);
      sessionRef.current = undefined;
      setStatus('error');
      setError(errorText(startError));
    }
  }, [config.paUserId, mx, room.roomId, setRemoteStream]);

  useEffect(
    () => () => {
      sessionRef.current?.dispose();
      sessionRef.current = undefined;
    },
    []
  );

  const active =
    status === 'starting' ||
    status === 'calling' ||
    status === 'connecting' ||
    status === 'connected';

  return (
    <div className="kipa-voice-panel">
      <div className="kipa-voice-panel__divider" />
      <Box direction="Row" alignItems="Center" gap="300" wrap="Wrap">
        <Text size="T300" weight="Medium">
          KIPA Sprache
        </Text>
        <Text size="T200" priority="400">
          {statusLabel[status]}
        </Text>
        {active ? (
          <Button
            size="300"
            variant="Critical"
            before={<Icon size="100" src={Icons.PhoneDown} filled />}
            onClick={endCall}
          >
            Beenden
          </Button>
        ) : (
          <Button
            size="300"
            variant="Primary"
            before={<Icon size="100" src={Icons.Mic} filled />}
            onClick={startCall}
          >
            Sprechen
          </Button>
        )}
        {error && (
          <Text size="T200" className="kipa-voice-panel__error">
            {error}
          </Text>
        )}
      </Box>
      {/* The remote KIPA speech is generated live and has no separate caption track. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} autoPlay controls={status === 'connected'} />
    </div>
  );
}
