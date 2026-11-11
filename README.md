# Shamba Market

React Native / Expo marketplace with a **FastAPI + PostgreSQL backend** and **Firebase live chat**. There is no demo mode or local substitute for accounts or marketplace data. An unavailable backend produces an error.

## Project layout

```text
e-market/
├── frontend/          # Expo app, UI, API/chat clients, tests, npm dependencies
│   ├── App.tsx
│   ├── src/
│   ├── scripts/
│   ├── tests/
│   ├── .env           # Local frontend configuration (ignored by Git)
│   └── package.json
├── backend/           # FastAPI app, PostgreSQL models, migrations, tests
├── compose.yaml       # Backend/database containers
├── firebase.json      # Shared Firebase deployment configuration
├── firestore.rules
└── storage.rules
```

Run frontend npm/Expo commands from `frontend/` and Python/Alembic commands from `backend/`. Run Docker Compose and Firebase deployment commands from the repository root. Frontend environment values are in `frontend/.env`; backend settings are in `backend/.env`.

## Where data lives

| Data | Storage |
|---|---|
| Accounts, Argon2 password hashes, revocable API sessions | PostgreSQL |
| Farmer contacts, area, consent, private farm coordinates | PostgreSQL |
| Listings, stock, reviews, per-seller orders, sales analytics | PostgreSQL |
| Produce photos | API upload volume; metadata and ownership in PostgreSQL |
| Conversation membership, participant display names, messages | Firebase Firestore |

The app authenticates with FastAPI. `/chat/token` exchanges an authenticated API session for a Firebase custom token with the same user ID. Only the server creates conversation membership. Firestore rules reject arbitrary Firebase accounts and prevent clients from changing participants. Chat access claims expire after at most one hour (or earlier when the API session expires); the active app renews them every 45 minutes. Logging out revokes the API session and signs the local app out of Firebase. A copied Firebase credential can remain valid until its chat claim expires.

## Start the backend

Use Python 3.12+, PostgreSQL 16+, Node 22.13+ or Node 24.3+ (24 recommended) for the app.

```sh
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock
cp .env.example .env
```

Create an empty PostgreSQL database and update `backend/.env` with its connection URL. Use a dedicated database user and password. Set `PUBLIC_BASE_URL` to the API address reachable from your phone, e.g. `http://192.168.1.10:8000`; this address is used in photo URLs. Set `CORS_ORIGINS` to your web app origins, if using web.

```sh
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --no-access-log
```

API documentation: `http://localhost:8000/docs`. Access logging is disabled in these commands so buyer coordinates in search query strings are not logged. Apply equivalent redaction to reverse proxies and monitoring tools.

Alternatively, copy `backend/.env.example` to `backend/.env`, configure it, and run from the repository root:

```sh
export POSTGRES_PASSWORD='choose-a-long-url-safe-password'
export FIREBASE_ADMIN_CREDENTIALS_PATH='/absolute/path/to/service-account.json'
docker compose up --build
```

The Compose database and upload directories use persistent volumes. Never delete those volumes to upgrade the app. PostgreSQL is exposed on localhost only. The supplied Compose file is a development deployment; use HTTPS, managed secrets, backups, and appropriate network controls for a public service.

## Configure Firebase chat

1. Create a Firebase project, register a web app, and create a Firestore database.
2. Put the Firebase web configuration values in `frontend/.env` (copy `frontend/.env.example`). No Firebase email/password login provider is used.
3. Set `FIREBASE_PROJECT_ID` in `backend/.env`. Provide the Admin SDK with a service account using `GOOGLE_APPLICATION_CREDENTIALS`, or workload identity in a supported hosting environment. The service account needs Firebase Auth custom-token signing and Firestore access. **Server credentials must never appear in Expo public variables or Git.**
4. Deploy `firestore.rules` to that same Firebase project:

```sh
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

If migrating an existing Firebase project, deploy the included deny-all `storage.rules` too (`firebase deploy --only storage`). Firebase Storage is no longer used. Old Firebase marketplace collections are denied by the new Firestore rules. Existing data is **not automatically imported** into PostgreSQL; existing Firebase users would need an explicit migration plan. Firebase Auth users created by custom-token login contain the marketplace ID, not the PostgreSQL password.

Accounts, listings, and orders work independently of Firebase. If chat is not configured, the app displays its connection error and a reconnect button; it never pretends to deliver a message.

## Start the app

From the repository root:

```sh
cd frontend
npm ci
# First setup only; preserve an existing .env with your Firebase/API values.
cp -n .env.example .env
npm start
```

Set `EXPO_PUBLIC_API_URL` to the API address accessible from the device:

- Physical phone: your computer's LAN address, such as `http://192.168.1.10:8000`.
- Android emulator: `http://10.0.2.2:8000`.
- iOS simulator or web on the same computer: `http://localhost:8000`.

Keep the phone and computer on the same network for local development. Restart Expo after changing `frontend/.env`. Use HTTPS for deployed builds. API session tokens are held in memory and expire after 24 hours by default; restarting the app requires login. No account data or passwords are stored in AsyncStorage.

## Phone access when Expo runs inside WSL2

The API and Expo use different ports: **8000** for FastAPI and **8081** for the JavaScript development server. Both must be reachable from the phone. A working API health check does not prove Expo is reachable.

Set `EXPO_PUBLIC_API_URL` in `frontend/.env` to the Windows Wi-Fi address, such as `http://192.168.8.17:8000`. Stop the previous Expo process, then run from the repository root:

```sh
cd frontend
npm run start:lan
```

This reads the hostname from your API URL and sets Expo's advertised host to that address. It does not change Windows networking. With WSL2 NAT, open **Windows PowerShell as Administrator**, replace the example addresses with your actual Windows LAN IP and WSL IP (`hostname -I` inside WSL), and run:

```powershell
netsh interface portproxy add v4tov4 listenaddress=192.168.8.17 listenport=8081 connectaddress=172.17.37.156 connectport=8081
New-NetFirewallRule -DisplayName "Shamba Expo 8081" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8081 -LocalAddress 192.168.8.17 -RemoteAddress LocalSubnet -Profile Any
```

If the firewall rule already exists, use `Set-NetFirewallRule` instead of creating a duplicate. Before scanning the new Expo QR code, open `http://192.168.8.17:8081/status` on the phone. It should show `packager-status:running`. Keep the phone on the same Wi-Fi. Update forwarding if the WSL IP changes. Expo Go must support this project's SDK 58. If the status page works but Expo still fails, open its detailed error log to distinguish SDK incompatibility from a JavaScript runtime error.

## Location behavior

- **Farmers:** registration requests foreground device permission and explicit consent to save a farm location. Capture it while physically at the farm. Exact latitude/longitude and the consent timestamp are stored privately in PostgreSQL. Farmers can capture and save an updated farm location on **My farm**.
- **Buyers:** the **Use my current location** button reads location once. Search coordinates stay in app memory and are sent to the API for a radius query. They are not saved in buyer profiles or sent to Firestore. No background tracking is used.
- **Nearby search:** PostgreSQL calculates great-circle distances, with a default 30 km radius. The endpoint supports 1–200 km. Public listings contain the farmer's area and an approximate rounded-up distance, **never exact farm coordinates**. Repeated nearby searches can still infer location; approximate display is not a guarantee of anonymity.
- **Permission denied:** buyers can still browse and filter by their entered area. Farmer registration requires location, matching the current product requirement. The OS permission prompt is distinct from the app's disclosure/consent to save farm coordinates.
- **Photos:** the server validates and re-encodes images, removing original metadata including embedded GPS information.
- **Location removal:** authenticated users can call `DELETE /me/location`; their listings disappear from coordinate-radius search. Publishing new listings requires saving a location again. Profile/location removal UI beyond that endpoint is future work.
- Web device location requires localhost or HTTPS. The SQL distance implementation needs no map API key or PostGIS extension. For large datasets, add PostGIS geography columns and spatial indexes. No map or address autocomplete service is integrated.

## Marketplace behavior

- Farmers publish photos and stock through a four-step flow. Listings support retail only, retail plus wholesale, or wholesale only, with an independent wholesale unit price and quantity threshold. Contacts and area are visible to authenticated buyers.
- Search, ratings, and popularity ordering run on the API. Popularity counts **completed orders across all buyers**. Reviews are one per buyer per farmer and are not verified-purchase reviews.
- Checkout accepts listing IDs and quantities only. The server reloads prices, validates minimums, locks stock rows, reserves stock atomically, and splits the basket into separate orders per farmer. Each seller sees only their own order. Idempotency keys prevent retries from reserving twice.
- Farmers confirm orders and mark them collected and paid. These are manual seller attestations, not verified bank/payment events. Buyers or farmers can cancel pending/confirmed orders; cancellation returns reserved stock once. Reservations do not expire automatically.
- Analytics count completed orders separately from pending requests. No M-Pesa or bank payment is collected by the app; checkout records an agreed payment method.
- The in-app notification center shows order requests/status changes and unread messages. Order events and conversation read timestamps persist in PostgreSQL; new incoming events show badges and an in-app banner. This does not provide background/lock-screen push delivery.
- Marketplace screens refresh every 30 seconds while signed in. Chat uses Firestore listeners. Listings are capped at 200 per request, orders at the latest 200, and review display at 1,000; pagination UI remains to be added. Server analytics and ranking use all relevant rows.
- Produce uploads currently use persistent local disk with public opaque URLs. Move them to object storage when scaling across API instances. Do not upload sensitive documents; anyone who possesses a photo URL can view it.

Account settings are available through the Account tab: profile and location updates, password changes, sign-out and guarded account deletion. See [frontend account-management details](frontend/README.md#account-management) for deletion, shared-record retention and cleanup behavior.

## Dependency baseline

The app targets **Expo SDK 58** with React Native 0.88.1, React 19.3.0, and TypeScript 6.0.3. Use an SDK 58-compatible Expo Go client. `frontend/package-lock.json` records the installed dependency tree; use `npm ci` to reproduce it. Safe areas use `react-native-safe-area-context` at the application root.

From `frontend/`, after dependency changes, run `npx expo install --check` and `npx expo-doctor`, then type checks and platform exports below. Restart any Metro process started before the upgrade with `npm run start:lan`; an old running process can still serve the previous SDK.

The November 10, 2026 npm audit reported 9 transitive findings: Expo tooling's glob/minimatch chain (5 moderate) and Firebase's Node-only gRPC dependency chain (4 high). The gRPC Node transport is not the Firestore React Native/web transport used by this app. These findings remain in the lockfile; successful bundling is not a security audit clearance. The latest Firebase release inspected also pins that older gRPC range. npm's suggested automatic fixes downgrade Expo/Firebase to old majors, so they were not applied. Recheck upstream fixes before deployment rather than using `npm audit fix --force` or unverified major transitive overrides.

## Validation

From the repository root:

```sh
cd frontend
npm test
npm run typecheck
npx expo export --platform web
npx expo export --platform android --platform ios
```

Backend integration tests use a **disposable PostgreSQL database**, not SQLite. The tests truncate all marketplace tables in that database. The database name must contain `test`:

From a separate terminal at the repository root:

```sh
cd backend
TEST_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/market_test .venv/bin/python -m pytest -q
```

Tests cover authentication/revocation, coordinate privacy and radius search, upload ownership, server-computed pricing, bulk minimums, concurrent stock reservation, idempotent retries, order separation, cancellation, ratings, and completed-sales analytics. Chat token issuance is mocked for API contract tests; real Firebase credentials and two registered accounts are required to verify remote delivery and the deployed Firestore rules.

Email-based account recovery, persistent secure mobile login, automated reservation expiry, push notifications, abuse/rate controls, database/upload backups, and production operations remain deployment work. Nothing in this repository provisions a remote database or Firebase project automatically.
