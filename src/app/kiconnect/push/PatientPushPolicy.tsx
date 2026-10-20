import { useEffect } from 'react';
import { Method } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useKiconnectLock } from '../lock/LockProvider';
import {
  installPatientPushRules,
  ownedPatientPushRooms,
  patientPushRules,
} from './patientPushRules';

/** Applies to existing subscriptions too; the homeserver persists the rules. */
export function PatientPushPolicy() {
  const mx = useMatrixClient();
  const { accountType } = useKiconnectLock();
  useEffect(() => {
    let stopped = false;
    let busy = false;
    let completed = '';
    const refresh = async () => {
      if (stopped || busy || accountType !== 'patient') return;
      const sync = mx.getSyncState();
      if (sync !== 'PREPARED' && sync !== 'SYNCING') return;
      const userId = mx.getUserId();
      if (!userId) return;
      const rooms = ownedPatientPushRooms(mx.getRooms(), userId, accountType);
      const signature = JSON.stringify(rooms);
      if (!rooms.length || signature === completed) return;
      busy = true;
      try {
        const rules = await mx.getPushRules();
        if (stopped) return;
        await installPatientPushRules(
          rules.global.override ?? [],
          rooms.flatMap(patientPushRules),
          async (rule, position) => {
            if (stopped) throw new Error('Policy installation cancelled');
            const path = `/pushrules/global/override/${encodeURIComponent(rule.rule_id)}`;
            await mx.http.authedRequest(Method.Put, path, position, {
              conditions: rule.conditions,
              actions: rule.actions,
            });
            await mx.http.authedRequest(Method.Put, `${path}/enabled`, undefined, {
              enabled: true,
            });
          }
        );
        const updated = await mx.getPushRules();
        mx.setPushRules(updated);
        completed = signature;
      } catch {
        // No message/account/token details. Retry transient failures on the next tick.
        console.warn(
          '[KIconnect] Patienten-Push-Regeln noch nicht gespeichert; erneuter Versuch folgt.'
        );
      } finally {
        busy = false;
      }
    };
    refresh();
    const timer = window.setInterval(() => {
      refresh();
    }, 15000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [mx, accountType]);
  return null;
}
