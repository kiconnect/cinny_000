Cinny Produktiv-Deployment
==========================

Wichtig:
- Auf dem Produktivserver wird Cinny nicht mit npm start betrieben.
- Produktiv wird der statische Build aus dist/ ausgeliefert.
- Die richtige Produktiv-Konfiguration wird automatisch durch npm run build:prod gesetzt.
- Cinny ist eine Browser-Webanwendung. Matrix, Keycloak und Bots laufen nicht im
  Cinny-Prozess. Ein Webserver muss lediglich die statischen Dateien aus dist/
  inklusive SPA-Fallback auf index.html ausliefern.

Ablauf am Produktivserver
-------------------------

1. In das Cinny-Repository wechseln:

   cd /pfad/zu/cinny

2. Aktuellen Stand holen:

   git pull

3. Nur falls package.json oder package-lock.json geaendert wurden:

   npm ci

4. Produktiv-Build erstellen:

   npm run build:prod

Dieser Befehl macht automatisch:
- config.prod.json wird nach config.json kopiert.
- vite build wird ausgefuehrt.
- dist/config.json enthaelt danach die Produktivwerte.

Produktivwerte, die nach dem Build in dist/config.json stehen muessen:

   homeserverList: kiconnect.at
   hidePasswordLogin: true
   keycloakLogout.issuer: https://sso.id-am.at/realms/KIconnect
   keycloakLogout.clientId: kiconnect-matrix
   keycloakUnlock.issuer: https://sso.id-am.at/realms/KIconnect
   keycloakUnlock.clientId: kiconnect_cinny
   keycloakUnlock.redirectUri: https://cinny.kiconnect.at/unlock/callback
   kiconnectLock.timeoutMinutes: 5

Kontrolle nach dem Build:

   cat dist/config.json

Nicht verwenden auf Produktiv:

   npm start
   npm run build
   npm run build:dev

Fuer Produktiv immer:

   npm run build:prod

Keycloak-Check am Produktivsystem
---------------------------------

Im Realm KIconnect muss der Client kiconnect-matrix zur produktiven Cinny-Adresse passen:

- Valid Redirect URIs: https://cinny.kiconnect.at/*
- Web Origins: https://cinny.kiconnect.at
- Valid post logout redirect URIs: https://cinny.kiconnect.at/* oder +

Der Logout muss den Client kiconnect-matrix verwenden, weil genau dieser Client
die Keycloak-Sitzung bei der Matrix-Anmeldung eroeffnet. kiconnect_cinny wird nur
fuer die separate Passkey-Entsperrung verwendet. Wird beim Logout faelschlich
kiconnect_cinny verwendet, kann die Matrix-Sitzung zwar beendet werden, die
Keycloak-SSO-Sitzung bleibt jedoch bestehen.

Der Logout-Code setzt folgende Parameter:

   client_id=kiconnect-matrix
   post_logout_redirect_uri=https://cinny.kiconnect.at/

Keycloak vergleicht die post_logout_redirect_uri mit dem Client
kiconnect-matrix. Wenn nach Logout "Invalid redirect uri" erscheint, zuerst im Realm
KIconnect unter Clients -> kiconnect-matrix -> Settings -> Logout settings die
"Valid post logout redirect URIs" pruefen. Eine Aenderung dort braucht keinen
Neustart von Keycloak oder Cinny.

Wichtig bei der Einstellung "+": Sie verweist auf die normalen "Valid Redirect
URIs" desselben Clients. Die produktive Cinny-Adresse muss daher dort enthalten
sein. Fehlt sie, meldet Keycloak trotz "+" weiterhin "Invalid redirect uri".

Cinny erhaelt keinen Keycloak-ID-Token, weil die OIDC-Anmeldung ueber Synapse
laeuft. Ohne id_token_hint zeigt Keycloak standardmaessig "Do you want to log
out?". Deshalb muss im produktiven Keycloak-Compose folgende Option gesetzt
sein:

   KC_SPI_LOGIN_PROTOCOL_OPENID_CONNECT_SUPPRESS_LOGOUT_CONFIRMATION_SCREEN: "true"

Danach den Keycloak-Container neu erstellen/starten und kontrollieren, dass die
Variable im Container aktiv ist. Diese Einstellung ist im SSO-Repository in
docker-compose.keycloak.yml bereits enthalten. Sie gilt serverweit und ist fuer
den KIconnect-Aufbau erforderlich, damit der Sicherheits-Logout ohne zweite
Benutzerinteraktion abgeschlossen wird.

Caddy / Webserver auf Produktion
--------------------------------

Empfohlen ist, dass Caddy auf dem Produktivserver dist/ direkt ausliefert:

   cinny.kiconnect.at {
       encode zstd gzip
       root * /srv/kiconnect/cinny/dist
       try_files {path} /index.html
       file_server
   }

Den realen Pfad an das Produktionslayout anpassen. Bei direkter Auslieferung
werden weder Vite Preview noch Port 8001 benoetigt. Nach einem neuen Build muss
der Inhalt des produktiven Webroots aktualisiert werden.

Falls Caddy auf einer separaten VM laeuft, braucht der Cinny-Server dagegen
einen internen statischen HTTP-Webserver. Caddy kann das entfernte dist/
Verzeichnis nicht direkt lesen. Beispiel fuer den vorgeschalteten Caddy:

   cinny.kiconnect.at {
       encode zstd gzip
       reverse_proxy http://PROD-CINNY-IP:8001
   }

Fuer einen dauerhaften Produktionsbetrieb Nginx/Caddy als lokalen statischen
Webserver oder einen systemd-/Container-Dienst verwenden. "vite preview" ist
nur fuer Vorschau und Entwicklung gedacht und nicht neustartfest.

Aktueller Dev-Aufbau und Fehlersuche
-----------------------------------

Dev-Adresse:

   https://devcinny.kiconnect.at/

Dev-Build und interner Aufruf:

   npm run build:dev
   npm run preview

Die Preview-Konfiguration bindet auf alle Interfaces, verwendet Port 8001 und
erlaubt den Host devcinny.kiconnect.at. Der externe Caddy-Eintrag lautet:

   devcinny.kiconnect.at {
       encode zstd gzip
       reverse_proxy http://192.168.20.197:8001
   }

Wenn Caddy HTTP 403 mit "via: 1.1 Caddy" liefert, den Upstream direkt testen:

   curl -I http://127.0.0.1:8001/
   curl -I -H 'Host: devcinny.kiconnect.at' http://127.0.0.1:8001/

Liefert localhost 200, der Domain-Host aber 403 mit "This host is not
allowed", fehlt die Domain in preview.allowedHosts oder der alte Vite-Prozess
muss nach der Konfigurationsaenderung neu gestartet werden. HEAD-Requests werden
von Vite normal beantwortet und waren nicht die Ursache des beobachteten 403.

Der Dev-Keycloak-Client kiconnect_cinny braucht entsprechend:

   Valid Redirect URIs: https://devcinny.kiconnect.at/*
   Web Origins: https://devcinny.kiconnect.at
   Valid post logout redirect URIs beim Client kiconnect-matrix:
   https://devcinny.kiconnect.at/*

Fuer die Entsperrung muss insbesondere dieser Callback erlaubt sein:

   https://devcinny.kiconnect.at/unlock/callback

Der Client bleibt oeffentlich (Client authentication: Off), Standard Flow ist
aktiv und PKCE muss S256 verwenden. Der Browser-Flow des Clients muss auf einen
eigenen Passkey-/WebAuthn-Flow zeigen. Dieser Flow darf keine Passwort- oder
OTP-Ausweichmoeglichkeit enthalten. Cinny sendet max_age=0 und prompt=login,
damit eine vorhandene SSO-Sitzung die erneute Benutzerpruefung nicht umgeht.

Wichtig: Keycloak vergleicht Web Origins exakt. Der Eintrag darf weder fuehrende
Leerzeichen noch einen abschliessenden Slash oder `/*` enthalten. Korrekt ist:

   https://devcinny.kiconnect.at

Beim Dev-Test fuehrten zwei unsichtbare Leerzeichen vor der URL zu `Failed to
fetch` in Cinny und `{"error":"Invalid origin"}` am Keycloak-Token-Endpunkt.
Wenn dieser Fehler auftritt, den Web-Origin vollstaendig loeschen, von Hand ohne
Leerzeichen neu eingeben, mit Enter bestaetigen und speichern. Ein Browser- oder
PWA-Cache war dabei nicht die Ursache.

Am Produktivsystem gelten dieselben Einstellungen mit:

   Valid Redirect URIs: https://cinny.kiconnect.at/*
   Web Origins: https://cinny.kiconnect.at
   Callback: https://cinny.kiconnect.at/unlock/callback
   Valid post logout redirect URIs: https://cinny.kiconnect.at/*

Auch im Dev-System kann "Valid post logout redirect URIs" auf "+" stehen, aber
dann muss https://devcinny.kiconnect.at/* zwingend unter "Valid Redirect URIs"
eingetragen sein.

Sicherheits- und Oberflaechenfunktionen im gemeinsamen Build
------------------------------------------------------------

- Zwei getrennte, auch mobil gut sichtbare Buttons "Cinny sperren" und
  "Vollstaendig abmelden".
- Die manuelle und automatische Sperre verdeckt die gesamte Oberflaeche, laesst
  Matrix-Sitzung, Synchronisation, Access-Token und Push-Registrierung aber aktiv.
- Automatische Sperre nach 5 Minuten echter Inaktivitaet. Zeitstempel und
  Sperrzustand werden persistent gespeichert und beim Sichtbarwerden der PWA
  ausgewertet; ein Reload umgeht die Sperre nicht.
- Beim Wechsel in den Hintergrund wird sofort ein neutraler Sichtschutz gezeigt,
  damit der App-Switcher keine Chat-Inhalte abbildet.
- Entsperrung ueber einen separaten OIDC Authorization Code Flow mit PKCE,
  max_age=0 und prompt=login am Client kiconnect_cinny. Die bestehende
  Matrix-Sitzung und ihr Token werden dabei nicht ersetzt.
- Im gesperrten Zustand enthalten Browser-Benachrichtigungen keine Raumtitel,
  Absender, Avatare oder Nachrichtentexte.
- Vollstaendiger Logout aus Matrix und Keycloak sowie Loeschen lokaler Daten.
- Vor dem Matrix-Logout werden die Pusher des aktuellen Matrix-Geraets entfernt.
- Matrix-Logout und IndexedDB-Bereinigung laufen parallel; erst nach Abschluss
  beider Schritte erfolgt die Weiterleitung zum Keycloak-Logout.
- Patientenraum-Owner: "Chat zuruecksetzen" mit Rueckfrage; sendet storno!.
- Team/Nicht-Owner: bestehende Erledigt-/Weiterleiten- und Suchfunktionen.
- E-Mail-artige Inbox mit Betreff, Vorschau, 24-Stunden-Zeit und breiterer Liste.
- Helles Farbschema, reduzierte Teilnehmerdarstellung und dezente Rollen-Icons.
- Angepasste KIconnect-Browser-, PWA- und App-Icons.
- Manifest-Icons in 192x192 und 512x512 sowie feste id/start_url/scope-Werte,
  damit Edge die Anwendung als installierbare PWA erkennt.
- "Invite Member" ist in der Raum-Einleitung global entfernt; Benutzer werden
  ausschliesslich ueber die vorgesehene KIconnect-Raumlogik verwaltet.
- Raum-Owner sehen "Anmeldeart hinzufuegen". Der Dialog bietet einen additiven
  Passkey-/Sicherheitsschluessel-Link oder den klassischen Zugang mit Passwort
  und TOTP an. Cinny sendet dafuer das interne Event
  `io.kiconnect.auth.add.request`; es erscheint kein Chatbefehl.
- Der Passkey-Weg loescht oder ersetzt keine bestehenden Zugangsdaten. Beim
  klassischen Weg wird das eine Keycloak-Passwort gesetzt beziehungsweise
  aktualisiert und TOTP eingerichtet; bestehende Passkeys bleiben erhalten.
- `resetauth!` bleibt davon getrennt und ist weiterhin nur der bewusst
  versteckte Notfallweg zum gezielten Loeschen verlorener Zugangsdaten.

Web-Push fuer die installierte PWA
---------------------------------

Cinny enthaelt im Drei-Punkte-Menue den Schalter "Push-Nachrichten: Ein/Aus".
Beim Einschalten fragt die PWA nach der Betriebssystem-Berechtigung, erzeugt
eine Web-Push-Subscription und registriert diese als Matrix-HTTP-Pusher. Beim
Ausschalten werden der Pusher und die lokale Browser-Subscription entfernt.
Ein vollstaendiger Logout entfernt sie ebenfalls. Der Gateway versendet nur den
neutralen Text "Neue Nachricht in KI-Connect" und keine Patientendaten.

Dev-Konfiguration in config.dev.json/config.json:

   webPush.gatewayUrl: https://devpush.kiconnect.at
   webPush.vapidPublicKey: <oeffentlicher Dev-VAPID-Schluessel>

Fuer Dev sind zusaetzlich erforderlich:

1. DNS-A-Record devpush.kiconnect.at auf die Caddy-Adresse.
2. Eintrag auf der separaten Caddy-VM:

   devpush.kiconnect.at {
       encode zstd gzip
       reverse_proxy http://192.168.20.197:8091
   }

3. Im Portal-Repository die nicht eingecheckte Datei .env.push aus
   .env.push.example anlegen und den Gateway starten:

   docker compose up -d --build push-gateway
   curl https://devpush.kiconnect.at/health

Der private VAPID-Schluessel darf niemals in Git oder in Cinny landen. Der
Gateway ist zustandslos: Die vom Browser erzeugte Subscription wird in den
Matrix-Pusher-Daten gespeichert; eine zusaetzliche SQLite-Datenbank ist nicht
notwendig.

Produktion braucht ein eigenes VAPID-Schluesselpaar. Im Portal-Repository:

   python3 push_gateway/generate_vapid_keys.py

Den privaten Schluessel und die Absenderadresse nur in .env.push speichern. Den
ausgegebenen oeffentlichen Schluessel in config.prod.json unter
webPush.vapidPublicKey eintragen und als gatewayUrl beispielsweise
https://push.kiconnect.at verwenden. Danach DNS, Caddy-Reverse-Proxy auf Port
8091, Gateway-Container und Cinny mit npm run build:prod ausrollen.

Auf iPhone/iPad funktioniert Web-Push nur in der zum Home-Bildschirm
hinzugefuegten PWA. Die Freigabe muss durch den Benutzer ueber den Schalter
ausgeloest werden. Android und Desktop verwenden denselben Web-Push-Standard.

Rundnachrichten an alle Patienten
---------------------------------

Im persoenlichen Teamraum zeigt Cinny den Button "Rundnachricht". Das Fenster
enthaelt Texteingabe, Vorschau und eine zweite, eindeutige Bestaetigung "An alle
senden". Cinny erzeugt danach im Teamraum das Matrix-Event:

   io.kiconnect.broadcast.request

Der Browser versendet nicht selbst an die Patienten. Der Ordinations-Bot prueft
den Event-Absender gegen den in rooms.db gespeicherten Owner des Teamraums und
akzeptiert nur die lokal gespeicherte Team- oder Arzt-Space-ID. Anschliessend
sendet er die Nachricht einzeln in alle Patientenraeume aus seiner lokalen
rooms.db. Patienten sehen dadurch niemals eine Empfaengerliste oder andere
Patienten.

Der Bot speichert Auftraege und Einzelzustellungen in:

   /data/db/broadcasts.db

Die request_id und deterministische Matrix-Transaktions-IDs verhindern einen
doppelten Versand bei erneut zugestellten Events oder einem Neustart. Ein
Broadcast aendert weder Anliegenstatus noch Betreff eines Patientenraums. Nach
Abschluss schreibt der Bot Empfaenger-, Erfolgs- und Fehleranzahl in den
ausloesenden Teamraum.

Produktiv muessen deshalb zwei Repositories aktualisiert werden:

1. Cinny bauen und den neuen dist/-Inhalt ausrollen.
2. Im bots-Repository den Bot neu bauen und starten, zum Beispiel im jeweiligen
   Ordinationsverzeichnis:

   docker compose up -d --build nio-bot

Die Broadcast-Datenbank wird beim ersten Auftrag automatisch angelegt. Keine
manuelle SQL-Migration ist erforderlich.

Abnahmetest nach Produktivdeployment
------------------------------------

1. https://cinny.kiconnect.at/ liefert HTTP 200 und die Cinny-Oberflaeche.
2. Anmeldung per produktivem Matrix/Keycloak-SSO testen.
3. Patienten- und Teamraumfunktionen entsprechend der Rollen testen.
4. "Chat zuruecksetzen" pruefen: storno!, neutraler Betreff und entfernte
   Team-Einladungen/-Mitglieder.
5. "Cinny sperren" pruefen: neutraler Sperrbildschirm, keine Chatdaten sichtbar,
   Push/Matrix-Synchronisation bleiben aktiv.
6. "Mit Passkey entsperren" pruefen: Keycloak verlangt erneut WebAuthn und
   danach ist dieselbe Matrix-Sitzung weiterhin aktiv.
7. Reload im gesperrten Zustand sowie Hintergrund/Wiederaufnahme nach mehr als
   5 Minuten testen. Beides muss gesperrt bleiben bzw. sperren.
8. "Vollstaendig abmelden" normal und am Sperrbildschirm pruefen: Matrix- und
   Keycloak-Sitzung beendet und Rueckleitung ohne
   "Invalid redirect uri".
9. PWA/Browser-Icon nach Entfernen einer alten Installation bzw. nach Leeren des
   Service-Worker-Caches pruefen.
10. Im Teamraum "Rundnachricht" mit einem Testtext bis zur Vorschau pruefen.
    Einen echten Versand nur in einer Testordination mit Testpatienten
    bestaetigen. Danach den Abschlussbericht des Bots und broadcasts.db pruefen.
