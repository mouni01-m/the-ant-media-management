import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  let stage = "Founder authentication";
  try {
    const { requireFounder } = await import("@/lib/client-api-auth");
    stage = "Founder session validation";
    const auth = await requireFounder(request);
    if (auth.error) return auth.error;

    stage = "Google Calendar connection lookup";
    const { connection, getRefreshToken, refreshGoogleToken, googleRequest, isOfficialCalendarAccount, isReconnectRequired, markConnectionNeedsReconnect } = await import("@/lib/founder-google-calendar");
    const value = await connection(auth.uid);
    console.info("[Google Calendar] credential lookup completed", { credentialRecordFound: Boolean(value) });
    if (!value) return Response.json({ connected: false });

    try {
      if (value.credentialStatus === "needs_reconnect") {
        return Response.json({ connected: false, needsAttention: true, email: value.email });
      }
      stage = "Stored refresh-token decryption";
      console.info("[Google Calendar] credential decryption started");
      const refreshToken = getRefreshToken(value);
      console.info("[Google Calendar] credential decryption succeeded");
      stage = "Google access-token refresh";
      console.info("[Google Calendar] access token refresh started");
      const accessToken = await refreshGoogleToken(refreshToken);
      console.info("[Google Calendar] access token refresh succeeded");
      stage = "Google account identity verification";
      const identity = await googleRequest<{ email?: string; email_verified?: boolean }>(
        "https://openidconnect.googleapis.com/v1/userinfo",
        accessToken,
      );
      if (identity.email_verified !== true || !identity.email || identity.email.toLowerCase() !== value.email.toLowerCase()) {
        console.warn("[Google Calendar] stored account identity does not match the verified account");
        await markConnectionNeedsReconnect(auth.uid, "refresh_rejected");
        return Response.json({ connected: false, needsAttention: true, email: value.email });
      }
      stage = "Google Calendar API authorization check";
      console.info("[Google Calendar] calendars.list health check started");
      await googleRequest("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", accessToken);
      console.info("[Google Calendar] calendars.list health check succeeded");
      console.info("[Google Calendar] account health check succeeded");
      return Response.json({ connected: true, email: value.email, accountMatchesTarget: isOfficialCalendarAccount(value.email), calendarId: value.calendarId, calendarName: value.calendarName });
    } catch (error) {
      if (isReconnectRequired(error)) {
        console.warn("[Google Calendar] stored credentials need reconnect", { failure: error.failure });
        await markConnectionNeedsReconnect(auth.uid, error.failure);
        return Response.json({ connected: false, needsAttention: true, email: value.email });
      }
      throw error;
    }
  } catch (error) {
    console.error("[Google Calendar] status health check failed", {
      stage,
      errorType: error instanceof Error ? error.name : "UnknownError",
      code: (error as { code?: string })?.code || "unknown",
    });
    return Response.json({ error: "Google Calendar status is temporarily unavailable. Please contact the administrator.", code: "GOOGLE_CALENDAR_STATUS_UNAVAILABLE" }, { status: 503 });
  }
}
