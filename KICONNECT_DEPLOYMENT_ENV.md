# KIconnect deployment environment

Cinny obtains every value that differs between development and production from
one local deployment file. The repository does not contain an active dev or prod
client configuration.

## Local file

Copy `.env.example` to `.env.local` on the target server and fill every value.
The local file is ignored by Git and must not be committed.

`KICONNECT_ENV` must be exactly `dev` or `prod`. The build validates the complete
combination of public hostname, Matrix server, portal, Keycloak issuers, redirect
URI and lock preferences URL. A mixed dev/prod configuration stops before Vite
starts.

The values in this client environment are public browser configuration. Never
place Keycloak client secrets, Matrix access tokens or other private credentials
in it.

## Commands

Build the profile selected by the server-local `.env.local`:

```bash
npm run build
```

Start the local Vite server or preview the matching build:

```bash
npm start
npm run preview -- --host 0.0.0.0 --port 8001
```

For local cross-profile verification, separate ignored files can be used:

```bash
npm run build:dev   # reads .env.dev.local and writes dist-dev
npm run build:prod  # reads .env.prod.local and writes dist-prod
```

Development and production never share an output directory:

- `dev` writes `dist-dev`;
- `prod` writes `dist-prod`.

The generated `config.json` includes the deployment profile and expected public
hostname. Cinny refuses to start on a different non-loopback hostname. The same
check protects the early Keycloak unlock flow, so a mismatched build cannot
redirect a user to the wrong SSO system.

## Docker

Docker uses the local `.env.local` during the builder stage. The final image does
not contain the ENV file. `KICONNECT_ENV` must also be selected as build argument
so Docker copies the matching output directory:

```bash
docker build --build-arg KICONNECT_ENV=prod .
```

If the local profile and Docker build argument differ, the expected output
directory is absent and the image build stops instead of packaging the other
environment.
