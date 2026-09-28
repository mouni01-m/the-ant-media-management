import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const EXPECTED_PROJECT_ID = "the-ant-media-management";

type AdminApp = ReturnType<typeof initializeApp>;
type AdminAuth = ReturnType<typeof getAuth>;
type AdminFirestore = ReturnType<typeof getFirestore>;

export class FirebaseAdminConfigurationError extends Error {
  readonly code: string;

  constructor(
    message = "Server Firebase configuration is incomplete.",
    code = "FIREBASE_ADMIN_CONFIG_MISSING",
  ) {
    super(message);
    this.name = "FirebaseAdminConfigurationError";
    this.code = code;
  }
}

function firebaseConfigPresence() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  return {
    projectId,
    clientEmail,
    privateKey,
    serviceAccountJson,
    hasFirebaseProjectId: Boolean(projectId),
    hasServerFirebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
    hasPublicFirebaseProjectId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    hasFirebaseClientEmail: Boolean(clientEmail),
    hasFirebasePrivateKey: Boolean(privateKey),
    hasFirebaseServiceAccountJson: Boolean(serviceAccountJson),
    hasGoogleApplicationCredentials: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    hasFirebaseAdminConfig: Boolean(
      serviceAccountJson || (process.env.FIREBASE_PROJECT_ID && clientEmail && privateKey),
    ),
  };
}

let app: AdminApp | undefined;
let auth: AdminAuth | undefined;
let firestore: AdminFirestore | undefined;

function initializeFirebaseAdmin(): AdminApp {
  if (app) return app;

  const config = firebaseConfigPresence();
  try {
    const projectId = config.projectId || EXPECTED_PROJECT_ID;
    if (projectId !== EXPECTED_PROJECT_ID) {
      throw new FirebaseAdminConfigurationError(
        `Firebase Admin is configured for a different project; expected ${EXPECTED_PROJECT_ID}.`,
        "FIREBASE_ADMIN_CONFIG_INVALID",
      );
    }

    let credential;
    if (config.serviceAccountJson) {
      const serviceAccount = JSON.parse(config.serviceAccountJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (serviceAccount.project_id !== EXPECTED_PROJECT_ID) {
        throw new FirebaseAdminConfigurationError(
          `Firebase service-account project must be ${EXPECTED_PROJECT_ID}.`,
          "FIREBASE_ADMIN_CONFIG_INVALID",
        );
      }
      credential = cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key?.replace(/\\n/g, "\n"),
      });
    } else if (config.clientEmail || config.privateKey) {
      if (!process.env.FIREBASE_PROJECT_ID || !config.clientEmail || !config.privateKey) {
        throw new FirebaseAdminConfigurationError(
          "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY together.",
        );
      }
      credential = cert({
        projectId: EXPECTED_PROJECT_ID,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey.replace(/\\n/g, "\n"),
      });
    } else if (process.env.VERCEL) {
      // Vercel does not provide Google Application Default Credentials by
      // default. Do not rely on a developer-machine credentials file there.
      throw new FirebaseAdminConfigurationError(
        "Set FIREBASE_SERVICE_ACCOUNT_JSON or the FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY variables in Vercel.",
      );
    } else {
      credential = applicationDefault();
    }

    const existingApp = getApps()[0];
    if (existingApp?.options.projectId && existingApp.options.projectId !== EXPECTED_PROJECT_ID) {
      throw new FirebaseAdminConfigurationError(
        `The initialized Firebase Admin app targets a different project; expected ${EXPECTED_PROJECT_ID}.`,
      );
    }
    app = existingApp || initializeApp({ credential, projectId });
    return app;
  } catch (error) {
    console.error("[Firebase Admin] initialization failed", {
      error: error instanceof Error ? error.message : String(error),
      hasFirebaseProjectId: config.hasFirebaseProjectId,
      hasServerFirebaseProjectId: config.hasServerFirebaseProjectId,
      hasPublicFirebaseProjectId: config.hasPublicFirebaseProjectId,
      hasFirebaseClientEmail: config.hasFirebaseClientEmail,
      hasFirebasePrivateKey: config.hasFirebasePrivateKey,
      hasFirebaseServiceAccountJson: config.hasFirebaseServiceAccountJson,
      hasFirebaseAdminConfig: config.hasFirebaseAdminConfig,
      hasGoogleApplicationCredentials: config.hasGoogleApplicationCredentials,
      usingApplicationDefaultCredentials: !config.serviceAccountJson && !config.clientEmail && !config.privateKey,
    });
    if (error instanceof FirebaseAdminConfigurationError) throw error;
    throw new FirebaseAdminConfigurationError(
      "Firebase Admin credentials could not be initialized.",
      "FIREBASE_ADMIN_CONFIG_INVALID",
    );
  }
}

function getAdminAuth(): AdminAuth {
  try {
    auth ||= getAuth(initializeFirebaseAdmin());
    return auth;
  } catch (error) {
    if (error instanceof FirebaseAdminConfigurationError) throw error;
    logFirebaseAdminClientInitializationFailure(error);
    throw new FirebaseAdminConfigurationError(
      "Firebase Admin Auth could not be initialized.",
      "FIREBASE_ADMIN_CONFIG_INVALID",
    );
  }
}

function getAdminFirestore(): AdminFirestore {
  try {
    firestore ||= getFirestore(initializeFirebaseAdmin());
    return firestore;
  } catch (error) {
    if (error instanceof FirebaseAdminConfigurationError) throw error;
    logFirebaseAdminClientInitializationFailure(error);
    throw new FirebaseAdminConfigurationError(
      "Firebase Admin Firestore could not be initialized.",
      "FIREBASE_ADMIN_CONFIG_INVALID",
    );
  }
}

function logFirebaseAdminClientInitializationFailure(error: unknown) {
  const config = firebaseConfigPresence();
  console.error("[Firebase Admin] service initialization failed", {
    error: error instanceof Error ? error.message : String(error),
    hasFirebaseProjectId: config.hasFirebaseProjectId,
    hasServerFirebaseProjectId: config.hasServerFirebaseProjectId,
    hasPublicFirebaseProjectId: config.hasPublicFirebaseProjectId,
    hasFirebaseClientEmail: config.hasFirebaseClientEmail,
    hasFirebasePrivateKey: config.hasFirebasePrivateKey,
    hasFirebaseServiceAccountJson: config.hasFirebaseServiceAccountJson,
    hasFirebaseAdminConfig: config.hasFirebaseAdminConfig,
    hasGoogleApplicationCredentials: config.hasGoogleApplicationCredentials,
  });
}

function lazyProxy<T extends object>(getTarget: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = getTarget();
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(_target, property, value) {
      return Reflect.set(getTarget(), property, value, getTarget());
    },
  });
}

// Existing callers keep the Admin SDK interface, but importing this module
// no longer reads credentials or initializes Firebase. Initialization occurs
// only when a request actually uses Auth or Firestore.
export const adminAuth = lazyProxy(getAdminAuth);
export const adminDb = lazyProxy(getAdminFirestore);
