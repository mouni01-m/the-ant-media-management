# Client credential service setup

Social account credentials are stored in the `clientAccounts` collection with passwords encrypted using AES-256-GCM. The collection is inaccessible through the Firebase client SDK; the API requires a verified Firebase ID token and an active Founder profile before it can read or modify account records.

Configure the server runtime with:

- Firebase Admin credentials. On Google Cloud, use Application Default Credentials and a runtime service identity with Firestore access. On other hosts, set `FIREBASE_SERVICE_ACCOUNT_JSON` to the service account JSON as a server-only secret. For local development, `GOOGLE_APPLICATION_CREDENTIALS` may point to a service account JSON file outside the repository.
- `FIREBASE_PROJECT_ID` (optional when `NEXT_PUBLIC_FIREBASE_PROJECT_ID` already identifies the project).
- `CLIENT_CREDENTIALS_ENCRYPTION_KEY`, a base64 encoded random 32-byte key. Generate one with `openssl rand -base64 32` and store it in the server's secret manager/environment. Do not commit it or expose it as a `NEXT_PUBLIC_` variable.

Keep the encryption key stable and back it up securely. Losing it makes saved passwords unrecoverable. Rotate it only with a planned decrypt-and-reencrypt migration. Account listing APIs omit encrypted password fields; password plaintext is returned only from the explicit reveal endpoint and is marked `Cache-Control: no-store`.
