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
   keycloakLogout.clientId: kiconnect_cinny

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

Im Realm KIconnect muss der Client kiconnect_cinny zur produktiven Cinny-Adresse passen:

- Valid Redirect URIs: https://cinny.kiconnect.at/*
- Web Origins: https://cinny.kiconnect.at
- Valid post logout redirect URIs: https://cinny.kiconnect.at/*

Der Logout-Code setzt folgende Parameter:

   client_id=kiconnect_cinny
   post_logout_redirect_uri=https://cinny.kiconnect.at/

Keycloak vergleicht die post_logout_redirect_uri mit dem Client
kiconnect_cinny. Der Matrix-OIDC-Client und dessen Synapse-Callback sind davon
getrennt. Wenn nach Logout "Invalid redirect uri" erscheint, zuerst im Realm
KIconnect unter Clients -> kiconnect_cinny -> Settings -> Logout settings die
"Valid post logout redirect URIs" pruefen. Eine Aenderung dort braucht keinen
Neustart von Keycloak oder Cinny.

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
   Valid post logout redirect URIs: https://devcinny.kiconnect.at/*

Sicherheits- und Oberflaechenfunktionen im gemeinsamen Build
------------------------------------------------------------

- Grosser, auch mobil gut sichtbarer Button "Sicher abmelden".
- Vollstaendiger Logout aus Matrix und Keycloak sowie Loeschen lokaler Daten.
- Automatischer Komplett-Logout nach 30 Minuten echter Inaktivitaet.
- Patientenraum-Owner: "Chat zuruecksetzen" mit Rueckfrage; sendet storno!.
- Team/Nicht-Owner: bestehende Erledigt-/Weiterleiten- und Suchfunktionen.
- E-Mail-artige Inbox mit Betreff, Vorschau, 24-Stunden-Zeit und breiterer Liste.
- Helles Farbschema, reduzierte Teilnehmerdarstellung und dezente Rollen-Icons.
- Angepasste KIconnect-Browser-, PWA- und App-Icons.

Abnahmetest nach Produktivdeployment
------------------------------------

1. https://cinny.kiconnect.at/ liefert HTTP 200 und die Cinny-Oberflaeche.
2. Anmeldung per produktivem Matrix/Keycloak-SSO testen.
3. Patienten- und Teamraumfunktionen entsprechend der Rollen testen.
4. "Chat zuruecksetzen" pruefen: storno!, neutraler Betreff und entfernte
   Team-Einladungen/-Mitglieder.
5. "Sicher abmelden" pruefen: Keycloak-Sitzung beendet und Rueckleitung ohne
   "Invalid redirect uri".
6. 30 Minuten echte Inaktivitaet sowie fortlaufende Aktivitaet testen.
7. PWA/Browser-Icon nach Entfernen einer alten Installation bzw. nach Leeren des
   Service-Worker-Caches pruefen.
