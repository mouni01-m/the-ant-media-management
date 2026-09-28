import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { requireFounder } = await import("@/lib/client-api-auth");
    const auth = await requireFounder(request);
    if (auth.error) return auth.error;

    const { connection, isOfficialCalendarAccount } = await import("@/lib/founder-google-calendar");
    const value = await connection(auth.uid);
    return Response.json(value
      ? { connected: true, email: value.email, accountMatchesTarget: isOfficialCalendarAccount(value.email), calendarId: value.calendarId, calendarName: value.calendarName }
      : { connected: false });
  } catch (error) {
    console.error("[Google Calendar] status failed", {
      error: error instanceof Error ? error.message : String(error),
      hasFirebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
      hasFirebaseServiceAccountJson: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
      hasGoogleApplicationCredentials: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    });
    return Response.json({ error: "Unable to read Google Calendar connection." }, { status: 503 });
  }
}
