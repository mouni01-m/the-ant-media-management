import type { NextRequest } from "next/server";
import { requireFounder } from "@/lib/client-api-auth";
import { connection, getAccessToken, googleRequest } from "@/lib/founder-google-calendar";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  const auth = await requireFounder(request);
  if (auth.error) return auth.error;
  try {
    const value = await connection(auth.uid);
    if (!value) return Response.json({ error: "Google Calendar is not connected." }, { status: 409 });
    const token = await getAccessToken(value);
    const data = await googleRequest<{ items?: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string }> }>("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", token);
    return Response.json({ calendars: (data.items || []).filter(c => c.accessRole === "owner" || c.accessRole === "writer").map(c => ({ id: c.id, name: c.summary, primary: c.primary === true })) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to list calendars." }, { status: 502 }); }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireFounder(request);
  if (auth.error) return auth.error;
  try {
    const { calendarId } = await request.json() as { calendarId?: string };
    if (!calendarId) return Response.json({ error: "Select a calendar." }, { status: 400 });
    const value = await connection(auth.uid);
    if (!value) return Response.json({ error: "Google Calendar is not connected." }, { status: 409 });
    const token = await getAccessToken(value);
    const data = await googleRequest<{ items?: Array<{ id: string; summary: string; accessRole?: string }> }>("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", token);
    const selected = data.items?.find(c => c.id === calendarId && (c.accessRole === "owner" || c.accessRole === "writer"));
    if (!selected) return Response.json({ error: "That calendar is not writable by the connected account." }, { status: 403 });
    await adminDb.collection("googleCalendarConnections").doc(auth.uid).update({ calendarId: selected.id, calendarName: selected.summary || "Calendar" });
    return Response.json({ calendarId: selected.id, calendarName: selected.summary || "Calendar" });
  } catch { return Response.json({ error: "Unable to select that calendar." }, { status: 502 }); }
}
