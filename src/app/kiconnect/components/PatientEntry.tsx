import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { getHomeRoomPath } from '../../pages/pathUtils';
import { readAccountType } from '../logic/accountType';
import { isPatientEntryPath, patientEntryRooms } from '../logic/patientEntry';

/** Runs only on the initial landing view, never over a room link or a user-selected page. */
export function PatientEntry() {
  const mx = useMatrixClient();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const finished = useRef(!isPatientEntryPath(pathname));
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!isPatientEntryPath(pathname)) {
      finished.current = true;
      setChoices([]);
    }
    if (finished.current) return undefined;
    let previous = '';
    let stableSince = Date.now();
    const check = () => {
      if (finished.current) return;
      const sync = mx.getSyncState();
      if (sync !== 'PREPARED' && sync !== 'SYNCING') return;
      const userId = mx.getUserId();
      if (!userId) return;
      const rooms: Parameters<typeof patientEntryRooms>[0] = mx.getRooms();
      const candidates = patientEntryRooms(rooms, userId, readAccountType(userId));
      // Auto-join and room state can arrive in different sync responses. Avoid
      // selecting the first of multiple rooms while invitations are still joining.
      if (rooms.some((room) => room.getMyMembership() === 'invite')) {
        stableSince = Date.now();
        return;
      }
      const signature = JSON.stringify(candidates);
      if (signature !== previous) {
        previous = signature;
        stableSince = Date.now();
      }
      if (Date.now() - stableSince < 1000) return;
      if (candidates.length === 1) {
        finished.current = true;
        navigate(getHomeRoomPath(candidates[0].id), { replace: true });
      } else {
        setChoices((old) => JSON.stringify(old) === signature ? old : candidates);
      }
    };
    const timer = window.setInterval(check, 250);
    check();
    return () => window.clearInterval(timer);
  }, [mx, navigate, pathname]);

  if (choices.length < 2 || !isPatientEntryPath(pathname)) return null;
  return (
    <div role="region" aria-label="Ordination auswählen" style={{ position: 'fixed', inset: 0,
      zIndex: 100, background: '#fff', color: '#111', overflowY: 'auto', padding: '32px 20px' }}>
      <section style={{ maxWidth: 520, margin: '40px auto' }}>
        <h1>Willkommen bei KIconnect</h1>
        <p>Mit welcher Ordination möchten Sie Kontakt aufnehmen?</p>
        {choices.map((choice) => (
          <button key={choice.id} type="button" style={{ display: 'block', width: '100%',
            marginTop: 16, padding: 18, fontSize: '1rem', whiteSpace: 'normal', overflowWrap: 'anywhere',
            background: '#fff', color: '#111', border: '2px solid #1e7f93', borderRadius: 8 }}
            onClick={() => { finished.current = true; setChoices([]); navigate(getHomeRoomPath(choice.id)); }}>
            {choice.name}
          </button>
        ))}
        <button type="button" style={{ marginTop: 24, padding: 12 }}
          onClick={() => { finished.current = true; setChoices([]); }}>Zur Raumübersicht</button>
      </section>
    </div>
  );
}
