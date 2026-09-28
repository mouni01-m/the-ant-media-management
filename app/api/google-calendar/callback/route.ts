export async function GET(request: Request) {
  const url = new URL(request.url);
  let configuredOrigin = url.origin;
  if (process.env.GOOGLE_REDIRECT_URI) {
    try {
      configuredOrigin = new URL(process.env.GOOGLE_REDIRECT_URI).origin;
    } catch (error) {
      console.error("[Google Calendar] invalid callback redirect configuration", {
        error: error instanceof Error ? error.message : String(error),
        hasRedirectUri: true,
      });
    }
  } else if (!process.env.VERCEL) {
    configuredOrigin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || url.origin;
  }
  const fail = (message: string) => Response.redirect(new URL(`/founder/content-calendar?googleCalendarError=${encodeURIComponent(message)}`, configuredOrigin));
  if (url.searchParams.has("error")) return fail("Google Calendar connection was cancelled or denied.");

  let stage = "Firebase Admin initialization";
  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase-admin");
    const { exchangeCode, googleRequest, saveConnection, verifyOAuthState } = await import("@/lib/founder-google-calendar");
    stage = "OAuth state validation";
    const uid = verifyOAuthState(url.searchParams.get("state") || "");
    stage = "Founder profile verification";
    const user = await adminAuth.getUser(uid);
    const profile = await adminDb.collection("users").doc(uid).get();
    if (!user || profile.data()?.role !== "founder" || profile.data()?.active !== true) return fail("Founder access is required to connect Google Calendar.");
    const code = url.searchParams.get("code");
    if (!code) return fail("Google did not return an authorization code.");
    stage = "Google authorization code exchange";
    console.info("[Google Calendar] authorization code exchange started");
    const token = await exchangeCode(code);
    console.info("[Google Calendar] authorization code exchange succeeded");
    stage = "Google account verification";
    const identity = await googleRequest<{ email?: string; email_verified?: boolean }>("https://openidconnect.googleapis.com/v1/userinfo", token.access_token);
    if (!identity.email || identity.email_verified !== true) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token.refresh_token || token.access_token)}`, { method: "POST", cache: "no-store" });
      return fail("Google did not return a verified account email. Please try again.");
    }
    stage = "Writable calendar lookup";
    console.info("[Google Calendar] calendars.list started", { operation: "oauth_callback" });
    const calendars = await googleRequest<{ items?: Array<{ id: string; summary: string; primary?: boolean }> }>("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250", token.access_token);
    console.info("[Google Calendar] calendars.list succeeded", { calendarCount: calendars.items?.length || 0 });
    const primary = calendars.items?.find(item => item.primary);
    if (!primary) return fail("The authenticated Google account has no writable primary calendar.");
    if (!token.refresh_token) return fail("Google did not issue offline access. Disconnect this app in Google Account permissions, then reconnect.");
    stage = "Encrypted credential storage";
    await saveConnection(uid, { email: identity.email, calendarId: primary.id, calendarName: primary.summary || "Primary calendar", refreshToken: token.refresh_token });
    console.info("[Google Calendar] encrypted credential storage succeeded");
    return Response.redirect(new URL("/founder/content-calendar?googleCalendarConnected=1", configuredOrigin));
  } catch (error) {
    console.error("[Google Calendar] callback failed", {
      stage,
      error: error instanceof Error ? error.message : String(error),
      hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      hasRedirectUri: Boolean(process.env.GOOGLE_REDIRECT_URI),
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
    return fail("Google Calendar could not be connected. Check server configuration and try again.");
  }
}
