import type { NextRequest } from "next/server";
import { requireFounder } from "@/lib/client-api-auth";
import { connection, eventBody, getAccessToken, googleRequest, isOfficialCalendarAccount } from "@/lib/founder-google-calendar";

async function context(request: NextRequest) {
  const auth = await requireFounder(request);
  if (auth.error) return { error: auth.error };
  const value = await connection(auth.uid);
  if (!value) return { error: Response.json({ error: "Connect Google Calendar to sync this content." }, { status: 409 }) };
  if (!isOfficialCalendarAccount(value.email)) return { error: Response.json({ error: "Connect the The Ant Media Google account before syncing content." }, { status: 409 }) };
  return { value, token: await getAccessToken(value) };
}

async function writableCalendarId(calendarId: string | undefined, fallback: string, token: string) {
  const id = calendarId || fallback;
  const data = await googleRequest<{ items?: Array<{ id: string; accessRole?: string }> }>("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", token);
  if (!data.items?.some(calendar => calendar.id === id && (calendar.accessRole === "owner" || calendar.accessRole === "writer"))) {
    throw new Error("The saved Google Calendar is no longer writable by this account.");
  }
  return id;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await context(request); if (ctx.error) return ctx.error;
    const event = await request.json();
    const calendarId = await writableCalendarId(undefined, ctx.value!.calendarId, ctx.token!);
    const result = await googleRequest<{ id?: string }>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`, ctx.token!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventBody(event)) });
    if (!result.id) throw new Error("Google Calendar did not return an event ID");
    return Response.json({ id: result.id, calendarId: ctx.value!.calendarId, account: ctx.value!.email });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Google Calendar event creation failed." }, { status: 502 }); }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await context(request); if (ctx.error) return ctx.error;
    const { eventId, event } = await request.json();
    if (typeof eventId !== "string" || !eventId) return Response.json({ error: "Event ID is required." }, { status: 400 });
    const calendarId = await writableCalendarId(event.googleCalendarCalendarId, ctx.value!.calendarId, ctx.token!);
    const result = await googleRequest<{ id?: string }>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, ctx.token!, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventBody(event)) });
    return Response.json({ id: result.id || eventId, calendarId: ctx.value!.calendarId, account: ctx.value!.email });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Google Calendar event update failed." }, { status: 502 }); }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await context(request); if (ctx.error) return ctx.error;
    const params = new URL(request.url).searchParams;
    const eventId = params.get("eventId");
    if (!eventId) return Response.json({ error: "Event ID is required." }, { status: 400 });
    const calendarId = await writableCalendarId(params.get("calendarId") || undefined, ctx.value!.calendarId, ctx.token!);
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE", headers: { Authorization: `Bearer ${ctx.token}` }, cache: "no-store" });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google Calendar event deletion failed (${response.status})`);
    return Response.json({ deleted: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Google Calendar event deletion failed." }, { status: 502 }); }
}
