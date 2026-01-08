import React, { useState } from 'react';
import { Dialog, Box, Button, Text } from 'folds';
import type { Room } from 'matrix-js-sdk/src/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { clientLogin } from '../logic/login';

type Props = {
  room: Room;
  onFinished: (success?: boolean) => void;
};

export default function KiconnectLoginDialog({ room, onFinished }: Props) {
  const mx = useMatrixClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    try {
      await clientLogin(mx, room, username, password);
      onFinished(true);
    } finally {
      setPassword('');
    }
  };

  return (
    <Dialog variant="Surface">
      <Box direction="Column" gap="300" style={{ padding: 16, minWidth: 280 }}>
        <Text size="H4">KIconnect Login</Text>

        <input
          type="text"
          placeholder="Benutzername"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Box direction="Row" gap="200" justifyContent="End">
          <Button variant="Secondary" onClick={() => onFinished(false)}>
            Abbrechen
          </Button>
          <Button variant="Primary" onClick={submit}>
            Login
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
