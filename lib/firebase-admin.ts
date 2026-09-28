import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let adminApp;

try {
  let credential;
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    credential = cert({
      ...serviceAccount,
      privateKey: serviceAccount.private_key?.replace(/\\n/g, "\n"),
    });
  } else {
    credential = applicationDefault();
  }
  adminApp = getApps()[0] || initializeApp({ credential, projectId });
} catch (error) {
  console.error("[Firebase Admin] initialization failed", {
    error: error instanceof Error ? error.message : String(error),
    hasFirebaseProjectId: Boolean(projectId),
    hasFirebaseServiceAccountJson: Boolean(serviceAccountJson),
    hasGoogleApplicationCredentials: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    usingApplicationDefaultCredentials: !serviceAccountJson,
  });
  throw error;
}

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
