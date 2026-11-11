# Shamba Market frontend

React Native / Expo SDK 58 app for Android, iOS, and web.

Run from this directory:

```sh
npm ci
# First setup only. Existing API and Firebase settings are already in .env.
cp -n .env.example .env
npm run start:lan
```

The LAN command uses `EXPO_PUBLIC_API_URL` in this directory's `.env` to advertise the Windows LAN address to your phone. Keep the backend running separately. Use `npm start` for standard Expo startup or `npm run web` for browser development.

```sh
npm run typecheck
npm test
npx expo export --platform android --platform ios --platform web
```

See the [repository setup guide](../README.md) for backend configuration, Firebase chat, location permissions, and Windows/WSL port forwarding. Firebase deployment files remain at the repository root because the rules are shared with the backend.

## Account screens

Login and registration live in `src/screens/AuthScreen.tsx`. Shared brown, clay, and cream colors live in `src/theme.ts`. Buyers register through six pages: role, name/email, password, contact, area, and review. Farmers have a seventh page for produce information and capture their farm location with explicit storage consent. Back navigation preserves details in memory; registration is submitted to FastAPI only from the final review page.

## Marketplace screens, wholesale and notifications

Buyers have Market, Cart, History, Messages and Account tabs. Farmers have My farm, Add produce, Analytics, Messages and Account. The bell opens account-specific order updates and unread messages. The four-step produce flow supports retail only, retail plus wholesale, and wholesale only. Enter the wholesale price per unit and the minimum quantity independently of the retail price. The basket previews the tier automatically; FastAPI calculates the authoritative price again at checkout and saves it with each order item.

Apply backend migrations before using these features:

```sh
cd ../backend
source .venv/bin/activate
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --no-access-log
```

Migration `0002` preserves existing listings and treats legacy bulk listings as wholesale only, retaining their price and minimum. Order notifications are saved transactionally in PostgreSQL. Chat remains live through Firestore; per-account conversation read timestamps are saved in PostgreSQL. No new Firebase rules deployment is needed. Order updates refresh every 30 seconds while signed in; messages arrive through the existing live listener. Incoming updates show an in-app banner, unread badge and notification center; historical updates do not trigger banners at sign-in.

These are **in-app notifications**. Background/lock-screen remote push delivery is not implemented. It requires a development/production build, device registration and Android/iOS push credentials; Expo Go does not support remote push in current SDKs. See [Expo's development-build FAQ](https://docs.expo.dev/develop/development-builds/faq/).


## Account management

The Account tab and header account icon open `src/screens/AccountScreen.tsx`. Both roles can edit their name, contacts and area, change their password, sign out, or request account deletion. Farmers manage private farm GPS coordinates under **Account → Location**. Buyer location settings save only the shopping area; exact search coordinates remain temporary. Password changes require the current password, rotate the current API token and revoke other marketplace sessions. The app uses passwords, not a separate PIN.

Deletion requires the current password and typing `DELETE`. It revokes marketplace sessions, removes personal profile details, unpublishes listings, cancels open orders and releases their stock. Completed/shared order records retain anonymous account IDs; seller contacts and photo links are scrubbed from snapshots. An internal anonymous user row remains for purchase-record references. Reviews involving the removed account are deleted. A durable PostgreSQL cleanup job removes Firebase identity, both participants' copies of affected chats, and owned produce photos. Cleanup runs after deletion and retries every minute while the API is running if Firebase or storage is unavailable. Existing Firebase ID tokens can last until their current short chat lease expires; deleting a Firebase Auth user alone does not instantly invalidate issued ID tokens ([Firebase session documentation](https://firebase.google.com/docs/auth/admin/manage-sessions)).

Migration `0003` adds deletion state and the cleanup queue without changing existing accounts. The frontend checks `/health` for API version 3 before login/register and before produce upload. If the app reports that the server is older, stop the stale FastAPI process and start it from `backend/` with `--reload` as shown above. A missing `/notifications` route or rejected `wholesale_price`/`wholesale_minimum` input usually indicates the old API process is still running. Docker users must rebuild their API image after backend changes; `--reload` is for local development.
