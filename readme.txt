Cinny Dev-/Produktiv-Build
=========================

Alle umgebungsabhaengigen Werte liegen ausschliesslich in einer lokalen,
nicht versionierten `.env.local`. Die frueheren Dateien `config.dev.json`,
`config.prod.json` und der Kopiermechanismus nach `config.json` existieren nicht
mehr.

Vollstaendige Anleitung:

KICONNECT_DEPLOYMENT_ENV.md

Auf dem jeweiligen Server:

1. `.env.example` lokal nach `.env.local` kopieren und alle Werte setzen.
2. `KICONNECT_ENV` muss exakt `dev` oder `prod` sein.
3. `npm run build` ausfuehren.

Ausgabe:

- Dev: `dist-dev/`
- Produktion: `dist-prod/`

Der Build validiert Matrix, Portal, Keycloak, Redirect-URI und oeffentlichen
Hostname als zusammengehoeriges Profil. Gemischte Dev-/Prod-Werte brechen den
Build vor Vite ab.

Nach dem Build immer die generierte Datei im passenden Ausgabeordner pruefen:

Dev:

  cat dist-dev/config.json

Produktion:

  cat dist-prod/config.json

Niemals ein Ausgabe-Verzeichnis vom anderen System ausliefern. Cinny prueft den
in `config.json` hinterlegten `expectedHostname` zusaetzlich im Browser und
verweigert auf einem falschen oeffentlichen Host den Start sowie die
Keycloak-Weiterleitung.
