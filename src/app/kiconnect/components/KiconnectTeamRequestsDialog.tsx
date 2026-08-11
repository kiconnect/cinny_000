import React, { useEffect, useState } from 'react';
import { Dialog, Box, Button, Text } from 'folds';
import type { Room } from 'matrix-js-sdk/src/matrix';
import { useNavigate } from 'react-router-dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useClientConfig } from '../../hooks/useClientConfig';
import { getHomeRoomPath } from '../../pages/pathUtils';

type Props = {
  room: Room;
  onFinished: () => void;
};

type TeamRequestItem = {
  request_id?: string;
  room_id?: string;
  topic?: string;
  status?: string;
  created_by?: string;
  recipients?: string[];
  updated_at?: string;
  created_at?: string;
};

function formatDateTime(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-AT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(value: string | undefined): string {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'done') return 'erledigt';
  if (status === 'pending') return 'begonnen';
  if (status === 'waiting') return 'wartend';
  return 'offen';
}

export default function KiconnectTeamRequestsDialog({ onFinished }: Props) {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<TeamRequestItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      setItems([]);
      try {
        if (!clientConfig.portalUrl) throw new Error('Portal-URL ist nicht konfiguriert.');
        const response = await fetch(
          `${clientConfig.portalUrl.replace(/\/$/, '')}/api/user/team-requests/recent?days=3`,
          {
            headers: { Authorization: `Bearer ${mx.getAccessToken() ?? ''}` },
          }
        );
        if (!response.ok) throw new Error(`Abfrage fehlgeschlagen (${response.status})`);
        const data = await response.json();
        if (!cancelled) setItems(Array.isArray(data?.requests) ? data.requests : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Abfrage fehlgeschlagen.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clientConfig.portalUrl, mx]);

  const openRoom = (roomId: string | undefined) => {
    if (!roomId) return;
    navigate(getHomeRoomPath(roomId));
    onFinished();
  };

  return (
    <Dialog
      variant="Surface"
      style={{
        width: 'min(760px, calc(100vw - 32px))',
        maxHeight: 'min(760px, calc(100vh - 48px))',
      }}
    >
      <Box direction="Column" gap="300" style={{ padding: 16, minWidth: 360, maxHeight: 'inherit' }}>
        <Text size="H4">Letzte 3 Tage</Text>
        <Text size="T200" priority="300">
          Team-Anfragen, an denen Sie beteiligt waren.
        </Text>

        {loading ? <Text size="T200">Team-Anfragen werden geladen ...</Text> : null}
        {error ? <Text size="T200">{error}</Text> : null}

        {!loading && !error && items.length === 0 ? (
          <Text size="T200" priority="300">
            Keine Team-Anfragen in den letzten 3 Tagen gefunden.
          </Text>
        ) : null}

        {items.length > 0 ? (
          <Box
            direction="Column"
            gap="100"
            style={{
              overflow: 'auto',
              maxHeight: 'min(520px, calc(100vh - 230px))',
              paddingRight: 4,
            }}
          >
            {items.map((item) => (
              <Box
                key={item.request_id || item.room_id}
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
                  onClick={() => openRoom(item.room_id)}
                  style={{
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                    padding: 0,
                    textAlign: 'left',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Text size="T300" truncate>{item.topic || item.room_id}</Text>
                  <Text size="T200" priority="300" truncate>
                    {statusLabel(item.status)}
                    {item.updated_at ? ` · ${formatDateTime(item.updated_at)}` : ''}
                  </Text>
                </button>
                <Button variant="Secondary" onClick={() => openRoom(item.room_id)}>
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
