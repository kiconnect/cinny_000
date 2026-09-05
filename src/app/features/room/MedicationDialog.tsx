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

type MedicationItem = {
  id: string;
  name: string;
  package_count?: number;
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
  }, [room.roomId, sessionId, dialogEventId]);

  useEffect(() => {
    setActiveList('previous');
    setShowHidden(false);
    setLocallySubmitted(false);
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
        error instanceof Error ? error.message : 'Die Medikamentenauswahl konnte nicht gesendet werden.'
      );
      return false;
    } finally {
      setSending(false);
    }
  };

  const addMedication = (medicationId: string) => {
    setQuery('');
    lastSentQuery.current = '';
    void sendAction('add', { medication_id: medicationId });
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
                <Text>Suchen Sie Medikamente und fügen Sie diese Ihrer Anforderungsliste hinzu.</Text>
              </Box>

              <Box gap="100" style={{ flexWrap: 'wrap' }}>
                <Button style={tabStyle(activeList === 'previous')} onClick={() => setActiveList('previous')}>
                  Bisherige ({previous.length})
                </Button>
                <Button style={tabStyle(activeList === 'search')} onClick={() => setActiveList('search')}>
                  Neu suchen
                </Button>
                <Button style={tabStyle(activeList === 'selected')} onClick={() => setActiveList('selected')}>
                  Ausgewählt ({selected.length})
                </Button>
              </Box>

              {activeList === 'search' && (
                <input
                  type="search"
                  value={query}
                  onChange={(evt: ChangeEvent<HTMLInputElement>) => setQuery(evt.currentTarget.value)}
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
                  <Box
                    direction="Column"
                    gap="100"
                    style={{ padding: 12, border: '1px solid #8b8b8b', borderRadius: 10 }}
                  >
                    <Text size="L400">Bisher angeforderte Medikamente</Text>
                    <Text>Tippen Sie ein Medikament an, um es auszuwählen.</Text>
                    {previous.length === 0 && <Text>Noch keine bisherigen Medikamente vorhanden.</Text>}
                    {previous
                      .filter((item) => !selectedIds.has(item.id))
                      .map((item) => (
                        <Box key={item.id} gap="100" alignItems="Center">
                          <Button
                            variant="Secondary"
                            disabled={sending}
                            onClick={() => addMedication(item.id)}
                            style={{
                              flex: 1,
                              justifyContent: 'flex-start',
                              minHeight: 48,
                              whiteSpace: 'normal',
                              textAlign: 'left',
                              backgroundColor: '#ffffff',
                              color: '#111111',
                              borderColor: '#8b8b8b',
                            }}
                          >
                            {item.name} · zuletzt {formatDate(item.last_requested_at)}
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
                        {showHidden ? 'Ausgeblendete schließen' : `Ausgeblendete anzeigen (${hiddenPrevious.length})`}
                      </Button>
                    )}
                    {showHidden &&
                      hiddenPrevious.map((item) => (
                        <Button
                          key={item.id}
                          variant="Secondary"
                          disabled={sending}
                          onClick={() => sendAction('unhide_previous', { medication_id: item.id })}
                          style={{ backgroundColor: '#ffffff', color: '#111111', textAlign: 'left' }}
                        >
                          {item.name} wieder anzeigen
                        </Button>
                      ))}
                  </Box>
                )}

                {activeList === 'search' && (
                  <Box
                    direction="Column"
                    gap="100"
                    style={{ padding: 12, border: '1px solid #8b8b8b', borderRadius: 10 }}
                  >
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
                        onClick={() => addMedication(item.id)}
                        style={{
                          justifyContent: 'flex-start',
                          minHeight: 42,
                          textAlign: 'left',
                          whiteSpace: 'normal',
                          overflowWrap: 'anywhere',
                          backgroundColor: '#ffffff',
                          color: '#111111',
                          borderColor: '#8b8b8b',
                        }}
                      >
                        {item.name} hinzufügen
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
                  {selected.map((item) => (
                    <Box key={item.id} gap="200" alignItems="Center" style={{ padding: '6px 0' }}>
                      <Text style={{ flex: 1, overflowWrap: 'anywhere' }}>
                        1 Packung {item.name}
                      </Text>
                      <Button
                        variant="Secondary"
                        disabled={sending}
                        onClick={() => sendAction('remove', { medication_id: item.id })}
                        style={{ backgroundColor: '#ffffff', color: '#111111', borderColor: '#8b8b8b' }}
                      >
                        Entfernen
                      </Button>
                    </Box>
                  ))}
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
                  {selected.map((item) => (
                    <Box key={item.id} gap="200" alignItems="Center">
                      <Text style={{ flex: 1, overflowWrap: 'anywhere' }}>1 Packung {item.name}</Text>
                      <Button
                        variant="Secondary"
                        disabled={sending}
                        onClick={() => sendAction('remove', { medication_id: item.id })}
                        style={{ backgroundColor: '#ffffff', color: '#111111' }}
                      >
                        Entfernen
                      </Button>
                    </Box>
                  ))}
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
