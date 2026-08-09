import React, { useEffect, useRef, useState } from 'react';
import { Dialog, Box, Button, Text } from 'folds';
import { RoomEvent } from 'matrix-js-sdk';
import type { Room } from 'matrix-js-sdk/src/matrix';
import { useNavigate } from 'react-router-dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { getHomeRoomPath } from '../../pages/pathUtils';

type Props = {
  room: Room;
  onFinished: () => void;
};

type DayListResult = {
  room_id?: string;
  display_name?: string;
  message_count?: number;
  last_activity?: number;
};

const PATIENT_DAY_LIST_EVENT_TYPE = 'io.kiconnect.patient.day_list';
const PATIENT_DAY_LIST_RESULT_EVENT_TYPE = 'io.kiconnect.patient.day_list.result';

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(timestampSeconds: number | undefined): string {
  if (!timestampSeconds) return '';
  return new Intl.DateTimeFormat('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampSeconds * 1000));
}

export default function KiconnectDayListDialog({ room, onFinished }: Props) {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const [dateValue, setDateValue] = useState(todayIso());
  const [requestId, setRequestId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedDay, setResolvedDay] = useState('');
  const [results, setResults] = useState<DayListResult[]>([]);
  const timeoutRef = useRef<number | undefined>();

  useEffect(() => {
    const handleTimeline = (event: any, eventRoom?: Room) => {
      const eventRoomId = eventRoom?.roomId || event?.getRoomId?.();
      if (eventRoomId !== room.roomId) return;
      if (event?.getType?.() !== PATIENT_DAY_LIST_RESULT_EVENT_TYPE) return;

      const content = event.getContent?.() || {};
      if (!requestId || content.request_id !== requestId) return;

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }

      setLoading(false);
      setError(typeof content.error === 'string' ? content.error : '');
      setResolvedDay(typeof content.day === 'string' ? content.day : '');
      setResults(Array.isArray(content.results) ? content.results : []);
    };

    room.on(RoomEvent.Timeline, handleTimeline);
    return () => {
      room.off(RoomEvent.Timeline, handleTimeline);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };
  }, [requestId, room]);

  const loadDay = async (day: string) => {
    const cleanDay = day.trim();
    if (!cleanDay || loading) return;

    const nextRequestId = makeRequestId();
    setRequestId(nextRequestId);
    setLoading(true);
    setError('');
    setResolvedDay('');
    setResults([]);

    await mx.sendEvent(room.roomId, PATIENT_DAY_LIST_EVENT_TYPE, {
      request_id: nextRequestId,
      day: cleanDay,
      by: mx.getUserId(),
      ts: Date.now(),
    });

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setLoading(false);
      setError('Keine Antwort vom Bot erhalten.');
    }, 10000);
  };

  const openPatientRoom = (roomId: string | undefined) => {
    if (!roomId) return;
    navigate(getHomeRoomPath(roomId));
    onFinished();
  };

  return (
    <Dialog variant="Surface">
      <Box direction="Column" gap="300" style={{ padding: 16, minWidth: 360, maxWidth: 560 }}>
        <Text size="H4">Tageslisten</Text>

        <Box direction="Row" gap="200">
          <Button
            variant="Secondary"
            disabled={loading}
            onClick={() => {
              const day = todayIso(-1);
              setDateValue(day);
              loadDay(day);
            }}
          >
            Gestern
          </Button>
          <Button
            variant="Secondary"
            disabled={loading}
            onClick={() => {
              const day = todayIso();
              setDateValue(day);
              loadDay(day);
            }}
          >
            Heute
          </Button>
        </Box>

        <Box direction="Row" gap="200" alignItems="Center">
          <input
            type="date"
            value={dateValue}
            onChange={(event) => setDateValue(event.target.value)}
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid var(--bg-surface-border)',
              borderRadius: 6,
              fontSize: 14,
            }}
          />
          <Button variant="Primary" disabled={!dateValue || loading} onClick={() => loadDay(dateValue)}>
            Anzeigen
          </Button>
        </Box>

        {loading ? <Text size="T200">Tagesliste wird geladen ...</Text> : null}
        {error ? <Text size="T200">{error}</Text> : null}
        {resolvedDay && !error ? <Text size="T200">Kommunikation am {resolvedDay}</Text> : null}

        {results.length > 0 ? (
          <Box direction="Column" gap="100">
            {results.map((item) => (
              <Box
                key={item.room_id}
                direction="Row"
                gap="200"
                alignItems="Center"
                justifyContent="SpaceBetween"
                style={{
                  border: '1px solid var(--bg-surface-border)',
                  borderRadius: 6,
                  padding: '8px 10px',
                }}
              >
                <button
                  type="button"
                  onClick={() => openPatientRoom(item.room_id)}
                  style={{
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                    padding: 0,
                    textAlign: 'left',
                    flex: 1,
                  }}
                >
                  <Text size="T300">{item.display_name || item.room_id}</Text>
                  <Text size="T200" priority="300">
                    {formatTime(item.last_activity)}
                    {item.message_count ? ` · ${item.message_count} Ereignisse` : ''}
                  </Text>
                </button>
                <Button variant="Secondary" onClick={() => openPatientRoom(item.room_id)}>
                  Öffnen
                </Button>
              </Box>
            ))}
          </Box>
        ) : null}

        <Box direction="Row" gap="200" justifyContent="End">
          <Button variant="Secondary" onClick={onFinished}>
            Schließen
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
