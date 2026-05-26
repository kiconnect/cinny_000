Cinny vor Produktiv-Build umstellen
===================================

Ziel Produktivumgebung:
- Matrix-Servername: kiconnect.at
- Matrix-Base-URL per well-known: https://matrix.kiconnect.at
- Keycloak/SSO: https://sso.id-am.at/realms/KIconnect

Vor dem Kompilieren fuer Produktion nicht manuell an config.json drehen, sondern den passenden Build-Befehl verwenden:

Dev:

npm run build:dev

Prod:

npm run build:prod

Diese Befehle kopieren automatisch config.dev.json oder config.prod.json nach config.json und bauen danach dist/.

Vor Produktivdeployment trotzdem kurz pruefen:

1. config.json

Quelle fuer Dev:
config.dev.json

Quelle fuer Prod:
config.prod.json

Produktiv muss dort stehen:

{
  "defaultHomeserver": 0,
  "homeserverList": [
    "kiconnect.at"
  ],
  ...
}

Fuer Dev steht in config.dev.json:

"dev.kiconnect.at"

Der Produktiv-Build setzt das automatisch auf "kiconnect.at".

2. Keycloak-Logout in config.json

Datei:
config.prod.json

Produktiv muss dort stehen:

  "keycloakLogout": {
    "issuer": "https://sso.id-am.at/realms/KIconnect",
    "clientId": "kiconnect_cinny"
  }

Fuer Dev steht in config.dev.json:

  "keycloakLogout": {
    "issuer": "https://devsso.id-am.at/realms/KIconnect",
    "clientId": "kiconnect_cinny"
  }

Der Code liest diese Werte zur Laufzeit aus config.json. Die Build-Skripte erzeugen diese Datei aus der jeweiligen Umgebungsvorlage.

3. dist/config.json nicht als Quelle verwenden

dist/config.json ist nur das Ergebnis des Builds bzw. eine laufende Auslieferungsdatei.
Vor dem Build ist config.json die relevante Datei.

Nach npm run build wird config.json nach dist/config.json kopiert.

4. Keycloak Client pruefen

Im Produktiv-Keycloak Realm KIconnect muss der Client kiconnect_cinny zu der produktiven Cinny-Adresse passen.

Typische Werte:
- Client ID: kiconnect_cinny
- Valid Redirect URIs: die produktive Cinny-URL, je nach Hosting z.B. https://cinny.kiconnect.at/*
- Valid Post Logout Redirect URIs: + oder die produktive Cinny-URL
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
