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

type PatientSearchResult = {
  room_id?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
};

const PATIENT_SEARCH_EVENT_TYPE = 'io.kiconnect.patient.search';
const PATIENT_SEARCH_RESULT_EVENT_TYPE = 'io.kiconnect.patient.search.result';

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function KiconnectSearchDialog({ room, onFinished }: Props) {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [requestId, setRequestId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const timeoutRef = useRef<number | undefined>();

  useEffect(() => {
    const handleTimeline = (event: any, eventRoom?: Room) => {
      const eventRoomId = eventRoom?.roomId || event?.getRoomId?.();
      if (eventRoomId !== room.roomId) return;
      if (event?.getType?.() !== PATIENT_SEARCH_RESULT_EVENT_TYPE) return;

      const content = event.getContent?.() || {};
      if (!requestId || content.request_id !== requestId) return;

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }

      setLoading(false);
      setError(typeof content.error === 'string' ? content.error : '');
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

  const submit = async () => {
    const cleanQuery = query.trim();
    if (!cleanQuery || loading) return;

    const nextRequestId = makeRequestId();
    setRequestId(nextRequestId);
    setLoading(true);
    setError('');
    setResults([]);

    await mx.sendEvent(room.roomId, PATIENT_SEARCH_EVENT_TYPE, {
      request_id: nextRequestId,
      query: cleanQuery,
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
      <Box direction="Column" gap="300" style={{ padding: 16, minWidth: 360, maxWidth: 520 }}>
        <Text size="H4">Patient suchen</Text>

        <input
          type="text"
          placeholder="Nachname Vorname (Teile genügen)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          style={{
            padding: '10px 12px',
            border: '1px solid var(--bg-surface-border)',
            borderRadius: 6,
            fontSize: 14,
          }}
        />

        {loading ? <Text size="T200">Suche läuft ...</Text> : null}
        {error ? <Text size="T200">{error}</Text> : null}

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
            Abbrechen
          </Button>
          <Button variant="Primary" disabled={!query.trim() || loading} onClick={submit}>
            {loading ? 'Suche ...' : 'Suche'}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
