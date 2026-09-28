import type { NextRequest } from "next/server";
import { requireFounder } from "@/lib/client-api-auth";
import { connection, getRefreshToken, revokeGoogleToken } from "@/lib/founder-google-calendar";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  const auth = await requireFounder(request);
  if (auth.error) return auth.error;
  try {
    const value = await connection(auth.uid);
    if (value) { try { await revokeGoogleToken(getRefreshToken(value)); } catch { /* Remove local authorization even if Google's revoke endpoint is unavailable. */ } }
    await adminDb.collection("googleCalendarConnections").doc(auth.uid).delete();
    return Response.json({ disconnected: true });
  } catch { return Response.json({ error: "Unable to disconnect Google Calendar." }, { status: 500 }); }
}
