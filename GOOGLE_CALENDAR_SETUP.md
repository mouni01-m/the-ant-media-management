# Founder Google Calendar setup

Founder Content Calendar uses a server-side Google OAuth web flow. Refresh tokens are AES-256-GCM encrypted in the Admin Firestore collection `googleCalendarConnections`; Firestore client rules deny direct access. The browser receives account/calendar metadata and event IDs only. The integration stores the verified email returned by Google and compares it with `theantmediaa@gmail.com` before allowing content events to sync.

## Server environment

Configure these values in the server deployment environment (not in a `NEXT_PUBLIC_*` variable):

- `GOOGLE_CLIENT_ID`: OAuth 2.0 Web application client ID. For migration, the code can temporarily fall back to the existing `NEXT_PUBLIC_GOOGLE_CLIENT_ID` value in `.env`; prefer moving it to `GOOGLE_CLIENT_ID`.
- `GOOGLE_CLIENT_SECRET`: OAuth web client secret. Keep this server-only.
- `GOOGLE_REDIRECT_URI`: exact OAuth callback URI registered in Google Cloud. For local development, use `http://localhost:3000/api/google-calendar/callback`; for production, use `https://<your-vercel-domain>/api/google-calendar/callback`.
- `APP_URL`: canonical application origin fallback used to construct the callback URI when `GOOGLE_REDIRECT_URI` is omitted.
- `GOOGLE_OAUTH_STATE_SECRET`: cryptographically random secret used to sign short-lived OAuth state values.
- `CLIENT_CREDENTIALS_ENCRYPTION_KEY`: 32-byte encryption key, base64 or 64-character hex. This is also used for the existing encrypted client credentials.

The existing Firebase Admin setup must also be available to the server (`FIREBASE_SERVICE_ACCOUNT_JSON` or application default credentials, plus the Firebase project ID). Admin credentials must remain server-only.

The current local `.env` contains only `NEXT_PUBLIC_GOOGLE_CLIENT_ID` among Google Calendar variables. It does not contain the web client secret, redirect URI/app URL, OAuth state key, or the credential encryption key. Use an ignored `.env.local` for local-only values, or configure them in the deployment secret manager. Generate independent random values for the state and encryption keys.

API routes verify the Firebase ID token and then check the Founder role and active status in Firestore. The browser obtains the Firebase token from the existing Firebase Auth session and retries once with a freshly refreshed ID token after a 401. Token failures return 401; Firebase Admin/profile lookup failures return 503 so server credential problems are not mislabeled as expired user sessions. The server needs Firebase Admin credentials via `FIREBASE_SERVICE_ACCOUNT_JSON` or Application Default Credentials, and the Firebase project ID.

## Google Cloud Console

1. Enable the Google Calendar API for the OAuth project.
2. Configure the OAuth consent screen and publish/verify it as required for the organization's users and requested scopes. Google may require verification for the Calendar scopes.
3. Create/use an OAuth client of type **Web application**.
4. Add the exact `GOOGLE_REDIRECT_URI` (or `${APP_URL}/api/google-calendar/callback`) to authorized redirect URIs. The URI must match exactly, including scheme, host, port, and path.
5. If using the existing browser GIS integration on employee calendars, retain the app origin under authorized JavaScript origins. Founder Content Calendar no longer sends OAuth tokens to the browser.

## Scopes and event reminders

The server requests `openid`, `email`, `https://www.googleapis.com/auth/calendar.events`, and `https://www.googleapis.com/auth/calendar.calendarlist.readonly`. The first two identify the authenticated account, Calendar Events permits event create/update/delete, and Calendar List read-only permits listing/selecting writable calendars. It uses `select_account consent` and a login hint for the official account, then validates the actual returned identity; the hint alone is not treated as authentication.

The reminder dropdown maps “No reminder” to `useDefault: false` with no overrides. Values 0, 10, 15, 30, 60, 120, and 1440 are sent as Google Calendar popup reminder overrides in minutes. Google Calendar delivers the reminder according to its own device and notification settings.

The callback stores the verified account returned by Google so the UI can show the actual email. If it is not `theantmediaa@gmail.com`, the UI clearly identifies the different account and offers Disconnect/Reconnect; event writes are blocked until the official account is connected. The application cannot establish or verify the real account/calendar until the server values and Google Cloud Console setup above are configured and a Founder completes the OAuth flow. No live Google account was connected during code validation.
