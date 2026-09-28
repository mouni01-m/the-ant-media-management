import type { NextRequest } from "next/server";
import { requireFounder } from "@/lib/client-api-auth";
import { googleAuthorizationUrl } from "@/lib/founder-google-calendar";

export async function POST(request: NextRequest) {
  const auth = await requireFounder(request);
  if (auth.error) return auth.error;
  try { return Response.json({ url: googleAuthorizationUrl(auth.uid) }); }
  catch { return Response.json({ error: "Google Calendar is not configured yet. Please configure the Google OAuth credentials." }, { status: 503 }); }
}
