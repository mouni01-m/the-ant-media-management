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
const credential = serviceAccountJson
  ? cert({
      ...JSON.parse(serviceAccountJson),
      privateKey: JSON.parse(serviceAccountJson).private_key?.replace(
        /\\n/g,
        "\n",
      ),
    })
  : applicationDefault();
const adminApp = getApps()[0] || initializeApp({ credential, projectId });
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
