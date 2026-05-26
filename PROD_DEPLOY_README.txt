Cinny Produktiv-Deployment
==========================

Wichtig:
- Auf dem Produktivserver wird Cinny nicht mit npm start betrieben.
- Produktiv wird der statische Build aus dist/ ausgeliefert.
- Die richtige Produktiv-Konfiguration wird automatisch durch npm run build:prod gesetzt.

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
- Valid post logout redirect URIs: + oder https://cinny.kiconnect.at/*

Wenn nach Logout wieder "Invalid redirect url" erscheint, zuerst diese drei Keycloak-Werte pruefen.
