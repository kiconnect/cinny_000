import React, { ChangeEvent, useEffect, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { Box, Button, Dialog, Overlay, OverlayBackdrop, OverlayCenter, Text } from 'folds';
import type { Room } from 'matrix-js-sdk/src/matrix';
import { StateEvent } from '../../../types/matrix/room';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useStateEvent } from '../../hooks/useStateEvent';
import { getRoomOwner, isPatientRoom } from '../../kiconnect/logic/roomState';

const DIALOG_EVENT = 'io.kiconnect.medication_dialog';
const ACTION_EVENT = 'io.kiconnect.medication_action';

type EkoPackage = {
  eeko_id?: string;
  authorization_number?: string;
  name?: string;
  box?: string;
  package_text?: string;
  max_request_packages?: number;
  reimbursement_rule?: string;
};

type EkoInfo = {
  matched?: boolean;
  match_status?: string;
  packages?: EkoPackage[];
  preferred_package?: EkoPackage | null;
  box?: string | null;
  reimbursement_rule?: string | null;
  max_request_packages?: number;
};

type MedicationItem = {
  id: string;
  name: string;
  package_count?: number;
  max_request_packages?: number;
  package_text?: string;
  box?: string;
  reimbursement_rule?: string;
  preferred_package?: EkoPackage;
  eko?: EkoInfo;
  last_requested_at?: number;
  request_count?: number;
};

type MedicationDialogContent = {
  protocol?: number;
  status?: string;
  stage?: 'method' | 'selection';
  session_id?: string;
  initial_query?: string;
  query?: string;
  results?: MedicationItem[];
  selected?: MedicationItem[];
  previous?: MedicationItem[];
  hidden_previous?: MedicationItem[];
  error?: string;
};

type MedicationDialogProps = {
  room: Room;
};

export function MedicationDialogView({ room }: MedicationDialogProps) {
  const mx = useMatrixClient();
  const dialogEvent =
    useStateEvent(room, DIALOG_EVENT as StateEvent) ??
    room.currentState.getStateEvents(DIALOG_EVENT, '');
  const content = (dialogEvent?.getContent?.() ?? {}) as MedicationDialogContent;
  const dialogEventId = dialogEvent?.getId?.() ?? '';
  const sessionId = content.session_id ?? '';

  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [locallySubmitted, setLocallySubmitted] = useState(false);
  const [activeList, setActiveList] = useState<'previous' | 'search' | 'selected'>('previous');
  const [showHidden, setShowHidden] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [confirmRemoveId, setConfirmRemoveId] = useState<string>();
  const lastSentQuery = useRef('');
  const pending =
    !locallySubmitted &&
    isPatientRoom(room) &&
    getRoomOwner(room) === mx.getUserId() &&
    (content.protocol === 1 || content.protocol === 2) &&
    content.status === 'pending' &&
    sessionId.length > 0;

  useEffect(() => {
    const nextQuery = content.query ?? content.initial_query ?? '';
    setQuery(nextQuery);
    lastSentQuery.current = nextQuery;
    setLocalError(undefined);
    setNotice(undefined);
    setConfirmRemoveId(undefined);
  }, [room.roomId, sessionId, dialogEventId]);

  useEffect(() => {
    setActiveList('previous');
    setShowHidden(false);
    setLocallySubmitted(false);
    setNotice(undefined);
    setConfirmRemoveId(undefined);
  }, [room.roomId, sessionId]);

  const sendAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!sessionId) return false;
    setSending(true);
    setLocalError(undefined);
    try {
      await mx.sendEvent(room.roomId, ACTION_EVENT, {
        protocol: 1,
        session_id: sessionId,
        action,
        ...extra,
      });
      return true;
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : 'Die Medikamentenauswahl konnte nicht gesendet werden.'
      );
      return false;
    } finally {
      setSending(false);
    }
  };

  const maxPackages = (item: MedicationItem) => {
    const raw = item.max_request_packages ?? item.eko?.max_request_packages ?? 1;
    const value = Number.isFinite(Number(raw)) ? Number(raw) : 1;
    return Math.min(3, Math.max(1, Math.trunc(value)));
  };

  const packageCount = (item: MedicationItem) => {
    const value = Number.isFinite(Number(item.package_count)) ? Number(item.package_count) : 1;
    return Math.min(maxPackages(item), Math.max(1, Math.trunc(value)));
  };

  const packageLabel = (count: number) => (count === 1 ? 'Packung' : 'Packungen');

  const hasEkoInfo = (item: MedicationItem) =>
    item.eko !== undefined || Boolean(item.box || item.package_text || item.preferred_package);

  const ekoMatched = (item: MedicationItem) =>
    item.eko?.matched === true || item.box === 'G' || item.box === 'Y';

  const addMedication = (item: MedicationItem) => {
    if (hasEkoInfo(item) && !ekoMatched(item)) {
      setNotice('Dieses Medikament wird von der Krankenversicherung nicht erstattet.');
      setConfirmRemoveId(undefined);
      return;
    }
    setQuery('');
    lastSentQuery.current = '';
    void sendAction('add', { medication_id: item.id, package_count: packageCount(item) });
  };

  const setPackageCount = (item: MedicationItem, nextCount: number) => {
    const currentMax = maxPackages(item);
    if (nextCount > currentMax) {
      setNotice('Maximum erreicht.');
      return;
    }
    void sendAction('set_package_count', {
      medication_id: item.id,
      package_count: Math.min(currentMax, Math.max(1, nextCount)),
    });
  };

  const decrementMedication = (item: MedicationItem) => {
    const current = packageCount(item);
    if (current <= 1) {
      setConfirmRemoveId(item.id);
      setNotice(undefined);
      return;
    }
    setPackageCount(item, current - 1);
  };

  const removeMedication = (medicationId: string) => {
    setConfirmRemoveId(undefined);
    void sendAction('remove', { medication_id: medicationId });
  };

  const renderEkoBadge = (item: MedicationItem) => {
    const box =
      item.box ||
      item.eko?.box ||
      item.preferred_package?.box ||
      item.eko?.preferred_package?.box ||
      '';
    const rule =
      item.reimbursement_rule ||
      item.eko?.reimbursement_rule ||
      item.preferred_package?.reimbursement_rule ||
      item.eko?.preferred_package?.reimbursement_rule ||
      '';
    const packageText =
      item.package_text ||
      item.preferred_package?.package_text ||
      item.eko?.preferred_package?.package_text ||
      '';
    const known = hasEkoInfo(item);
    const matched = ekoMatched(item);
    const color = box === 'G' ? '#2f8f46' : box === 'Y' ? '#b7791f' : '#6b7280';
    const label = !known
      ? 'EKO-Info fehlt'
      : matched
      ? [box, rule, packageText].filter(Boolean).join(' · ')
      : 'nicht im EKO';
    return (
      <span
        style={{
          display: 'inline-flex',
          flex: '0 0 auto',
          width: 'fit-content',
          maxWidth: '100%',
          minHeight: 22,
          padding: '3px 8px',
          borderRadius: 999,
          backgroundColor: color,
          color: '#ffffff',
          fontSize: 12,
          lineHeight: '16px',
          overflowWrap: 'anywhere',
          whiteSpace: 'normal',
          alignItems: 'center',
        }}
      >
        {label}
      </span>
    );
  };

  const renderMedicationButtonContent = (item: MedicationItem, suffix?: string) => (
    <span
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-start',
        width: '100%',
        minWidth: 0,
      }}
    >
      <span style={{ display: 'block', lineHeight: '20px', overflowWrap: 'anywhere' }}>
        {suffix ? `${item.name} ${suffix}` : item.name}
      </span>
      {renderEkoBadge(item)}
    </span>
  );

  const renderSelectedItem = (item: MedicationItem) => {
    const count = packageCount(item);
    const currentMax = maxPackages(item);
    const confirmRemove = confirmRemoveId === item.id;
    return (
      <Box
        key={item.id}
        direction="Column"
        gap="100"
        style={{ padding: '8px 0', borderBottom: '1px solid rgba(139, 139, 139, 0.35)' }}
      >
        <Text style={{ overflowWrap: 'anywhere' }}>{item.name}</Text>
        {renderEkoBadge(item)}
        <Box gap="200" alignItems="Center" style={{ flexWrap: 'wrap' }}>
          <Button
            variant="Secondary"
            disabled={sending}
            aria-label={count <= 1 ? `${item.name} entfernen` : `${item.name} eine Packung weniger`}
            onClick={() => decrementMedication(item)}
            style={{
              minWidth: 44,
              backgroundColor: '#ffffff',
              color: '#111111',
              borderColor: '#8b8b8b',
            }}
          >
            −
          </Button>
          <Text style={{ minWidth: 96, textAlign: 'center' }}>
            {count} {packageLabel(count)}
          </Text>
          <Button
            variant="Secondary"
            disabled={sending}
            aria-label={`${item.name} eine Packung mehr`}
            onClick={() => setPackageCount(item, count + 1)}
            style={{
              minWidth: 44,
              backgroundColor: '#ffffff',
              color: '#111111',
              borderColor: '#8b8b8b',
            }}
          >
            +
          </Button>
        </Box>
        {currentMax <= 1 && (
          <Text size="T200">Für dieses Medikament ist aktuell nur 1 Packung auswählbar.</Text>
        )}
        {confirmRemove && (
          <Box
            direction="Column"
            gap="100"
            style={{ padding: 10, border: '1px solid #922536', borderRadius: 8 }}
          >
            <Text>Medikament aus der Anforderungsliste entfernen?</Text>
            <Box gap="200" justifyContent="End">
              <Button
                variant="Secondary"
                disabled={sending}
                onClick={() => setConfirmRemoveId(undefined)}
                style={{ backgroundColor: '#ffffff', color: '#111111' }}
              >
                Abbrechen
              </Button>
              <Button
                variant="Secondary"
                disabled={sending}
                onClick={() => removeMedication(item.id)}
                style={{ backgroundColor: '#ffffff', color: '#111111', borderColor: '#922536' }}
              >
                Entfernen
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    );
  };

  const submitSelection = async () => {
    setLocallySubmitted(true);
    if (!(await sendAction('submit'))) {
      setLocallySubmitted(false);
    }
  };

  const chooseInputMethod = async (method: 'photo' | 'report' | 'list') => {
    if (method !== 'list') setLocallySubmitted(true);
    if (!(await sendAction('choose_method', { method })) && method !== 'list') {
      setLocallySubmitted(false);
    }
  };

  useEffect(() => {
    if (!pending || query === lastSentQuery.current) return undefined;
    const timeout = window.setTimeout(() => {
      lastSentQuery.current = query;
      void sendAction('search', { query });
    }, 400);
    return () => window.clearTimeout(timeout);
    // sendAction intentionally uses the current Matrix client and session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, query, sessionId]);

  if (!pending) return null;

  if (content.stage !== 'selection') {
    const methodButtonStyle = {
      width: '100%',
      minHeight: 64,
      justifyContent: 'flex-start',
      whiteSpace: 'normal' as const,
      textAlign: 'left' as const,
      padding: '12px 16px',
      backgroundColor: '#ffffff',
      color: '#111111',
      border: '2px solid #1e7f93',
      borderRadius: 10,
    };
    const renderUploadIcon = () => (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          flex: '0 0 auto',
          width: 28,
          height: 28,
          marginRight: 12,
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid #1e7f93',
          borderRadius: '50%',
          color: '#1e7f93',
          fontSize: 24,
          lineHeight: 1,
        }}
      >
        +
      </span>
    );

    return (
      <Overlay open backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              escapeDeactivates: false,
              clickOutsideDeactivates: false,
              initialFocus: false,
            }}
          >
            <Dialog
              variant="Surface"
              role="dialog"
              aria-modal="true"
              aria-labelledby="medication-method-dialog-title"
              style={{
                width: 'min(560px, calc(100vw - 24px))',
                maxHeight: 'calc(100dvh - 24px)',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
                color: '#111111',
              }}
            >
              <Box
                direction="Column"
                gap="300"
                style={{ padding: 20, backgroundColor: '#ffffff', color: '#111111' }}
              >
                <Box direction="Column" gap="100">
                  <Text id="medication-method-dialog-title" size="H4">
                    Medikamente angeben
                  </Text>
                  <Text>Wie möchten Sie Ihre Medikamente angeben?</Text>
                </Box>

                <Button
                  variant="Secondary"
                  disabled={sending}
                  onClick={() => void chooseInputMethod('photo')}
                  style={methodButtonStyle}
                >
                  {renderUploadIcon()}
                  Foto der Medikamentenliste machen oder hochladen
                </Button>
                <Button
                  variant="Secondary"
                  disabled={sending}
                  onClick={() => void chooseInputMethod('report')}
                  style={methodButtonStyle}
                >
                  {renderUploadIcon()}
                  Befund mit den Medikamenten hochladen
                </Button>
                <Button
                  variant="Secondary"
                  disabled={sending}
                  onClick={() => void chooseInputMethod('list')}
                  style={methodButtonStyle}
                >
                  Medikamente aus einer Liste auswählen
                </Button>

                {(localError || content.error) && (
                  <Text style={{ color: '#922536' }}>{localError ?? content.error}</Text>
                )}

                <Button
                  variant="Secondary"
                  disabled={sending}
                  onClick={() => sendAction('cancel')}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    backgroundColor: '#ffffff',
                    color: '#111111',
                    border: '2px solid #6f6f6f',
                    borderRadius: 8,
                  }}
                >
                  Abbrechen
                </Button>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    );
  }

  const results = Array.isArray(content.results) ? content.results : [];
  const selected = Array.isArray(content.selected) ? content.selected : [];
  const previous = Array.isArray(content.previous) ? content.previous : [];
  const hiddenPrevious = Array.isArray(content.hidden_previous) ? content.hidden_previous : [];
  const selectedIds = new Set(selected.map((item) => item.id));

  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return '';
    return new Intl.DateTimeFormat('de-AT').format(new Date(timestamp * 1000));
  };

  const tabStyle = (active: boolean) => ({
    flex: '1 1 120px',
    minHeight: 44,
    backgroundColor: '#ffffff',
    color: '#111111',
    border: `2px solid ${active ? '#1e7f93' : '#8b8b8b'}`,
    borderRadius: 8,
  });

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            escapeDeactivates: false,
            clickOutsideDeactivates: false,
            initialFocus: false,
          }}
        >
          <Dialog
            variant="Surface"
            role="dialog"
            aria-modal="true"
            aria-labelledby="medication-dialog-title"
            style={{
              width: 'min(680px, calc(100vw - 24px))',
              height: 'min(720px, calc(100dvh - 24px))',
              overflow: 'hidden',
              backgroundColor: '#ffffff',
              color: '#111111',
            }}
          >
            <Box
              direction="Column"
              gap="300"
              style={{
                padding: 20,
                height: '100%',
                minHeight: 0,
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                color: '#111111',
              }}
            >
              <Box direction="Column" gap="100">
                <Text id="medication-dialog-title" size="H4">
                  Medikamente auswählen
                </Text>
                <Text>
                  Suchen Sie Medikamente und fügen Sie diese Ihrer Anforderungsliste hinzu.
                </Text>
              </Box>

              <Box gap="100" style={{ flexWrap: 'wrap' }}>
                <Button
                  style={tabStyle(activeList === 'previous')}
                  onClick={() => setActiveList('previous')}
                >
                  Bisherige ({previous.length})
                </Button>
                <Button
                  style={tabStyle(activeList === 'search')}
                  onClick={() => setActiveList('search')}
                >
                  Neu suchen
                </Button>
                <Button
                  style={tabStyle(activeList === 'selected')}
                  onClick={() => setActiveList('selected')}
                >
                  Ausgewählt ({selected.length})
                </Button>
              </Box>

              {activeList === 'search' && (
                <input
                  type="search"
                  value={query}
                  onChange={(evt: ChangeEvent<HTMLInputElement>) =>
                    setQuery(evt.currentTarget.value)
                  }
                  placeholder="Medikament suchen"
                  autoComplete="off"
                  autoFocus
                  style={{
                    width: '100%',
                    minHeight: 44,
                    border: '2px solid rgba(127, 127, 127, 0.55)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    font: 'inherit',
                    background: '#ffffff',
                    color: '#111111',
                  }}
                />
              )}

              {(localError || content.error) && (
                <Text style={{ color: '#922536' }}>{localError ?? content.error}</Text>
              )}
              {notice && (
                <Box
                  gap="200"
                  alignItems="Center"
                  style={{ padding: 10, border: '1px solid #6b7280', borderRadius: 8 }}
                >
                  <Text style={{ flex: 1 }}>{notice}</Text>
                  <Button
                    variant="Secondary"
                    disabled={sending}
                    onClick={() => setNotice(undefined)}
                    style={{ backgroundColor: '#ffffff', color: '#111111' }}
                  >
                    OK
                  </Button>
                </Box>
              )}

              <Box
                direction="Column"
                gap="300"
                style={{
                  overflowY: 'auto',
                  flex: '1 1 auto',
                  minHeight: 0,
                  paddingRight: 2,
                }}
              >
                {activeList === 'previous' && (
                  <Box direction="Column" gap="100" style={{ padding: 0 }}>
                    <Text size="L400">Bisher angeforderte Medikamente</Text>
                    <Text>Tippen Sie ein Medikament an, um es auszuwählen.</Text>
                    {previous.length === 0 && (
                      <Text>Noch keine bisherigen Medikamente vorhanden.</Text>
                    )}
                    {previous
                      .filter((item) => !selectedIds.has(item.id))
                      .map((item) => (
                        <Box key={item.id} gap="100" alignItems="Center">
                          <Button
                            variant="Secondary"
                            disabled={sending}
                            onClick={() => addMedication(item)}
                            style={{
                              flex: 1,
                              justifyContent: 'flex-start',
                              minHeight: 74,
                              height: 'auto',
                              padding: '12px',
                              lineHeight: '20px',
                              whiteSpace: 'normal',
                              textAlign: 'left',
                              overflowWrap: 'anywhere',
                              backgroundColor: '#ffffff',
                              color: '#111111',
                              borderColor: '#8b8b8b',
                            }}
                          >
                            {renderMedicationButtonContent(
                              item,
                              `· zuletzt ${formatDate(item.last_requested_at)}`
                            )}
                          </Button>
                          <Button
                            variant="Secondary"
                            disabled={sending}
                            aria-label={`${item.name} nicht mehr anzeigen`}
                            title="Nicht mehr anzeigen"
                            onClick={() => sendAction('hide_previous', { medication_id: item.id })}
                            style={{ minWidth: 44, backgroundColor: '#ffffff', color: '#111111' }}
                          >
                            …
                          </Button>
                        </Box>
                      ))}
                    {hiddenPrevious.length > 0 && (
                      <Button
                        variant="Secondary"
                        onClick={() => setShowHidden((value) => !value)}
                        style={{ backgroundColor: '#ffffff', color: '#111111' }}
                      >
                        {showHidden
                          ? 'Ausgeblendete schließen'
                          : `Ausgeblendete anzeigen (${hiddenPrevious.length})`}
                      </Button>
                    )}
                    {showHidden &&
                      hiddenPrevious.map((item) => (
                        <Button
                          key={item.id}
                          variant="Secondary"
                          disabled={sending}
                          onClick={() => sendAction('unhide_previous', { medication_id: item.id })}
                          style={{
                            minHeight: 44,
                            height: 'auto',
                            padding: '10px 12px',
                            lineHeight: 1.35,
                            backgroundColor: '#ffffff',
                            color: '#111111',
                            textAlign: 'left',
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {item.name} wieder anzeigen
                        </Button>
                      ))}
                  </Box>
                )}

                {activeList === 'search' && (
                  <Box direction="Column" gap="100" style={{ padding: 0 }}>
                    <Text size="L400">Suchergebnisse</Text>
                    {query.trim().length < 2 && <Text>Geben Sie mindestens zwei Zeichen ein.</Text>}
                    {query.trim().length >= 2 && results.length === 0 && !sending && (
                      <Text>Kein passendes Medikament gefunden.</Text>
                    )}
                    {results
                      .filter((item) => !selectedIds.has(item.id))
                      .map((item) => (
                        <Button
                          key={item.id}
                          variant="Secondary"
                          disabled={sending}
                          onClick={() => addMedication(item)}
                          style={{
                            justifyContent: 'flex-start',
                            minHeight: 74,
                            height: 'auto',
                            padding: '12px',
                            lineHeight: '20px',
                            textAlign: 'left',
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                            backgroundColor: '#ffffff',
                            color: '#111111',
                            borderColor: '#8b8b8b',
                          }}
                        >
                          {renderMedicationButtonContent(item, 'hinzufügen')}
                        </Button>
                      ))}
                  </Box>
                )}

                {activeList === 'selected' && (
                  <Box
                    direction="Column"
                    gap="100"
                    style={{
                      flex: '0 0 auto',
                      padding: 12,
                      border: '2px solid #1e7f93',
                      borderRadius: 10,
                      backgroundColor: '#ffffff',
                      color: '#111111',
                    }}
                  >
                    <Text size="L400">Anforderungsliste</Text>
                    {selected.length === 0 && <Text>Noch kein Medikament ausgewählt.</Text>}
                    {selected.map((item) => renderSelectedItem(item))}
                  </Box>
                )}
              </Box>

              {activeList !== 'selected' && selected.length > 0 && (
                <Box
                  direction="Column"
                  gap="100"
                  style={{
                    flex: '0 1 auto',
                    maxHeight: '22vh',
                    overflowY: 'auto',
                    padding: 12,
                    border: '2px solid #1e7f93',
                    borderRadius: 10,
                    backgroundColor: '#ffffff',
                    color: '#111111',
                  }}
                >
                  <Text size="L400">Ausgewählte Medikamente ({selected.length})</Text>
                  {selected.map((item) => renderSelectedItem(item))}
                </Box>
              )}

              <Box direction="Column" gap="200" style={{ flex: '0 0 auto' }}>
                <Button
                  variant="Primary"
                  disabled={sending || selected.length === 0}
                  onClick={() => void submitSelection()}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    backgroundColor: '#ffffff',
                    border: '2px solid #1e7f93',
                    borderRadius: 8,
                    color: '#111111',
                  }}
                >
                  Auswahl abschließen
                </Button>
                <Button
                  variant="Secondary"
                  disabled={sending}
                  onClick={() => sendAction('cancel')}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    backgroundColor: '#ffffff',
                    color: '#111111',
                    border: '2px solid #6f6f6f',
                    borderRadius: 8,
                  }}
                >
                  Abbrechen
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
