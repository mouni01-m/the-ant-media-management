import type { NextRequest } from "next/server";
import { requireFounder } from "@/lib/client-api-auth";
import { connection, isOfficialCalendarAccount } from "@/lib/founder-google-calendar";

export async function GET(request: NextRequest) {
  const auth = await requireFounder(request);
  if (auth.error) return auth.error;
  try {
    const value = await connection(auth.uid);
    return Response.json(value ? { connected: true, email: value.email, accountMatchesTarget: isOfficialCalendarAccount(value.email), calendarId: value.calendarId, calendarName: value.calendarName } : { connected: false });
  } catch { return Response.json({ error: "Unable to read Google Calendar connection." }, { status: 500 }); }
}
