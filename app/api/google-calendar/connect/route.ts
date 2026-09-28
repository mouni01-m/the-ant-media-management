import type { NextRequest } from "next/server";

function diagnostics() {
  return {
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasRedirectUri: Boolean(process.env.GOOGLE_REDIRECT_URI),
    redirectUri: process.env.GOOGLE_REDIRECT_URI || null,
    hasOAuthStateSecret: Boolean(process.env.GOOGLE_OAUTH_STATE_SECRET),
    hasEncryptionKey: Boolean(process.env.CLIENT_CREDENTIALS_ENCRYPTION_KEY),
    hasFirebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    hasFirebaseServiceAccountJson: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    hasGoogleApplicationCredentials: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  };
}

export async function POST(request: NextRequest) {
  const config = diagnostics();
  console.info("[Google Calendar] OAuth configuration", config);

  try {
    // Load Firebase Admin within the request so initialization failures can be
    // logged safely instead of surfacing as an empty platform-level HTTP 500.
    const { requireFounder } = await import("@/lib/client-api-auth");
    const auth = await requireFounder(request);
    if (auth.error) return auth.error;

    const missing = [
      ["GOOGLE_CLIENT_ID", config.hasClientId],
      ["GOOGLE_CLIENT_SECRET", config.hasClientSecret],
      ["GOOGLE_REDIRECT_URI", config.hasRedirectUri],
      ["GOOGLE_OAUTH_STATE_SECRET", config.hasOAuthStateSecret],
    ].filter(([, present]) => !present).map(([name]) => name);
    if (missing.length) {
      console.error("[Google Calendar] connect is missing required configuration", { missing, ...config });
      return Response.json(
        { error: "Google Calendar OAuth is not fully configured. Contact the administrator." },
        { status: 503 },
      );
    }

    const { googleAuthorizationUrl } = await import("@/lib/founder-google-calendar");
    return Response.json({ url: googleAuthorizationUrl(auth.uid) });
  } catch (error) {
    console.error("[Google Calendar] connect failed", {
      error: error instanceof Error ? error.message : String(error),
      ...config,
    });
    return Response.json(
      { error: "Google Calendar could not start. Check the server configuration and try again." },
      { status: 503 },
    );
  }
}
