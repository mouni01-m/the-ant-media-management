import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  let stage = "Firebase Admin and Founder auth initialization";
  try {
    const { requireFounder } = await import("@/lib/client-api-auth");
    stage = "Founder session validation";
    const auth = await requireFounder(request);
    if (auth.error) return auth.error;

    stage = "Google Calendar connection lookup";
    const { connection, isOfficialCalendarAccount } = await import("@/lib/founder-google-calendar");
    const value = await connection(auth.uid);
    return Response.json(value
      ? { connected: true, email: value.email, accountMatchesTarget: isOfficialCalendarAccount(value.email), calendarId: value.calendarId, calendarName: value.calendarName }
      : { connected: false });
  } catch (error) {
    console.error("[Google Calendar] status initialization failed", {
      stage,
      error: error instanceof Error ? error.message : String(error),
      hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      hasGoogleRedirectUri: Boolean(process.env.GOOGLE_REDIRECT_URI),
      hasOAuthStateSecret: Boolean(process.env.GOOGLE_OAUTH_STATE_SECRET),
      hasEncryptionKey: Boolean(process.env.CLIENT_CREDENTIALS_ENCRYPTION_KEY),
      hasFirebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
      hasPublicFirebaseProjectId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
      hasFirebaseServiceAccountJson: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
      hasFirebaseClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
      hasFirebasePrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
      hasFirebaseAdminConfig: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)),
      hasGoogleApplicationCredentials: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    });
    return Response.json({ error: "Google Calendar status is temporarily unavailable. Please contact the administrator.", code: "GOOGLE_CALENDAR_STATUS_UNAVAILABLE" }, { status: 503 });
  }
}
