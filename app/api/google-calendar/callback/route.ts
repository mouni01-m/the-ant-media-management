import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { exchangeCode, googleRequest, saveConnection, verifyOAuthState } from "@/lib/founder-google-calendar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const configuredOrigin = process.env.GOOGLE_REDIRECT_URI
    ? new URL(process.env.GOOGLE_REDIRECT_URI).origin
    : process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || url.origin;
  const fail = (message: string) => Response.redirect(new URL(`/founder/content-calendar?googleCalendarError=${encodeURIComponent(message)}`, configuredOrigin));
  if (url.searchParams.has("error")) return fail("Google Calendar connection was cancelled or denied.");
  try {
    const uid = verifyOAuthState(url.searchParams.get("state") || "");
    const user = await adminAuth.getUser(uid);
    const profile = await adminDb.collection("users").doc(uid).get();
    if (!user || profile.data()?.role !== "founder" || profile.data()?.active !== true) return fail("Founder access is required to connect Google Calendar.");
    const code = url.searchParams.get("code");
    if (!code) return fail("Google did not return an authorization code.");
    const token = await exchangeCode(code);
    const identity = await googleRequest<{ email?: string; email_verified?: boolean }>("https://openidconnect.googleapis.com/v1/userinfo", token.access_token);
    if (!identity.email || identity.email_verified !== true) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token.refresh_token || token.access_token)}`, { method: "POST", cache: "no-store" });
      return fail("Google did not return a verified account email. Please try again.");
    }
    const calendars = await googleRequest<{ items?: Array<{ id: string; summary: string; primary?: boolean }> }>("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250", token.access_token);
    const primary = calendars.items?.find(item => item.primary);
    if (!primary) return fail("The authenticated Google account has no writable primary calendar.");
    if (!token.refresh_token) return fail("Google did not issue offline access. Disconnect this app in Google Account permissions, then reconnect.");
    await saveConnection(uid, { email: identity.email!, calendarId: primary.id, calendarName: primary.summary || "Primary calendar", refreshToken: token.refresh_token });
    return Response.redirect(new URL("/founder/content-calendar?googleCalendarConnected=1", configuredOrigin));
  } catch (error) {
    console.error("Google Calendar callback failed:", error instanceof Error ? error.message : "unknown error");
    return fail("Google Calendar could not be connected. Check server configuration and try again.");
  }
}
