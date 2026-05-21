Cinny vor Produktiv-Build umstellen
===================================

Ziel Produktivumgebung:
- Matrix-Servername: kiconnect.at
- Matrix-Base-URL per well-known: https://matrix.kiconnect.at
- Keycloak/SSO: https://sso.id-am.at/realms/KIconnect

Vor dem Kompilieren fuer Produktion pruefen/aendern:

1. config.json

Datei:
config.json

Produktiv muss dort stehen:

{
  "defaultHomeserver": 0,
  "homeserverList": [
    "kiconnect.at"
  ],
  ...
}

Fuer Dev steht hier aktuell:

"dev.kiconnect.at"

Das muss vor einem Produktiv-Build wieder auf "kiconnect.at" geaendert werden.

2. Keycloak-Logout im Code

Datei:
src/app/kiconnect/logic/logout.ts

Produktiv muss dort stehen:

const KC_REALM_ISSUER = "https://sso.id-am.at/realms/KIconnect";
const KC_CLIENT_ID = "kiconnect_cinny";

Wenn dort devsso.id-am.at steht, ist es noch auf Dev gestellt.

Hinweis:
Diese Stelle ist aktuell hart im Code. Sie wird nicht aus config.json oder .env gelesen.

3. dist/config.json nicht als Quelle verwenden

dist/config.json ist nur das Ergebnis des Builds bzw. eine laufende Auslieferungsdatei.
Vor dem Build ist config.json die relevante Datei.

Nach npm run build wird config.json nach dist/config.json kopiert.

4. Keycloak Client pruefen

Im Produktiv-Keycloak Realm KIconnect muss der Client kiconnect_cinny zu der produktiven Cinny-Adresse passen.

Typische Werte:
- Client ID: kiconnect_cinny
- Valid Redirect URIs: die produktive Cinny-URL, je nach Hosting z.B. https://cinny.kiconnect.at/*
- Web Origins: die produktive Cinny-Origin, z.B. https://cinny.kiconnect.at

5. Matrix well-known pruefen

Fuer Produktion muss erreichbar sein:

https://kiconnect.at/.well-known/matrix/client

und diese Antwort liefern:

{"m.homeserver":{"base_url":"https://matrix.kiconnect.at"}}

Der Browser muss diese URL aus Cinny heraus lesen duerfen. Falls Cinny nicht verbinden kann, zuerst CORS/Header der well-known-Antwort pruefen.

6. Build

Erst nach diesen Checks bauen:

npm run build

Danach liegt die auslieferbare Version in:

dist/

