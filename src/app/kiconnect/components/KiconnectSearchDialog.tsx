import React, { useState } from 'react';
import { Dialog, Box, Button, Text } from 'folds';
import type { Room } from 'matrix-js-sdk/src/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';

type Props = {
  room: Room;
  onFinished: () => void;
};

export default function KiconnectSearchDialog({ room, onFinished }: Props) {
  const mx = useMatrixClient();
  const [query, setQuery] = useState('');

  const submit = async () => {
    if (!query.trim()) return;

    await mx.sendEvent(room.roomId, 'm.room.message', {
      msgtype: 'm.text',
      body: `!suche ${query.trim()}`
    });

    onFinished();
  };

  return (
    <Dialog variant="Surface">
      <Box direction="Column" gap="300" style={{ padding: 16, minWidth: 320 }}>
        <Text size="H4">Patient suchen</Text>

        <input
          type="text"
          placeholder="Nachname Vorname (Teile genügen)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />

        <Box direction="Row" gap="200" justifyContent="End">
          <Button variant="Secondary" onClick={onFinished}>
            Abbrechen
          </Button>
          <Button variant="Primary" onClick={submit}>
            Suche
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
