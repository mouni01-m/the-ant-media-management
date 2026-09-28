import type { NextRequest } from "next/server";
import { requireFounder } from "@/lib/client-api-auth";
import { connection, eventBody, getRefreshToken, refreshGoogleToken, googleRequest, isOfficialCalendarAccount, isReconnectRequired, markConnectionNeedsReconnect } from "@/lib/founder-google-calendar";

async function context(request: NextRequest) {
  const auth = await requireFounder(request);
  if (auth.error) return { error: auth.error };
  const value = await connection(auth.uid);
  if (!value) return { error: Response.json({ error: "Connect Google Calendar to sync this content." }, { status: 409 }) };
  if (!isOfficialCalendarAccount(value.email)) return { error: Response.json({ error: "Connect the The Ant Media Google account before syncing content." }, { status: 409 }) };
  try {
    console.info("[Google Calendar] credential record found", { operation: "events" });
    console.info("[Google Calendar] credential decryption started", { operation: "events" });
    const refreshToken = getRefreshToken(value);
    console.info("[Google Calendar] credential decryption succeeded", { operation: "events" });
    console.info("[Google Calendar] access token refresh started", { operation: "events" });
    const token = await refreshGoogleToken(refreshToken);
    console.info("[Google Calendar] access token refresh succeeded", { operation: "events" });
    return { value, token, uid: auth.uid };
  } catch (error) {
    if (isReconnectRequired(error)) {
      console.warn("[Google Calendar] event credential rejected", { failure: error.failure });
      await markConnectionNeedsReconnect(auth.uid, error.failure);
      return { error: Response.json({ error: "Google Calendar needs to be reconnected.", code: error.code }, { status: 409 }) };
    }
    throw error;
  }
}

async function writableCalendarId(calendarId: string | undefined, fallback: string, token: string) {
  const id = calendarId || fallback;
  const data = await googleRequest<{ items?: Array<{ id: string; accessRole?: string }> }>("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", token);
  if (!data.items?.some(calendar => calendar.id === id && (calendar.accessRole === "owner" || calendar.accessRole === "writer"))) {
    throw new Error("The saved Google Calendar is no longer writable by this account.");
  }
  return id;
}

export async function GET(request: NextRequest) {
  let stage = "event authorization";
  let uid: string | undefined;
  try {
    const ctx = await context(request); if (ctx.error) return ctx.error;
    uid = ctx.uid;
    stage = "writable calendar lookup";
    const calendarId = await writableCalendarId(undefined, ctx.value!.calendarId, ctx.token!);
    const params = new URL(request.url).searchParams;
    const query = new URLSearchParams({ maxResults: "250", singleEvents: "true", orderBy: "startTime" });
    for (const key of ["timeMin", "timeMax"] as const) {
      const value = params.get(key);
      if (!value) continue;
      if (!Number.isFinite(Date.parse(value))) return Response.json({ error: `Invalid ${key}.` }, { status: 400 });
      query.set(key, value);
    }
    stage = "events.list";
    console.info("[Google Calendar] events.list started");
    const data = await googleRequest<{ items?: Array<{ id?: string; summary?: string; description?: string; status?: string; start?: unknown; end?: unknown }> }>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
      ctx.token!,
    );
    console.info("[Google Calendar] events.list succeeded", { eventCount: data.items?.length || 0 });
    return Response.json({ events: data.items || [] });
  } catch (error) {
    if (isReconnectRequired(error)) {
      console.warn("[Google Calendar] event credential rejected", { stage, failure: error.failure });
      if (uid) await markConnectionNeedsReconnect(uid, error.failure);
      return Response.json({ error: "Google Calendar needs to be reconnected.", code: error.code }, { status: 409 });
    }
    console.error("[Google Calendar] events.list failed", { stage, errorType: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string })?.code || "unknown" });
    return Response.json({ error: "Unable to load Google Calendar events. Please try again." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  let stage = "event authorization";
  let uid: string | undefined;
  try {
    const ctx = await context(request); if (ctx.error) return ctx.error;
    uid = ctx.uid;
    const event = await request.json();
    stage = "writable calendar lookup";
    const calendarId = await writableCalendarId(undefined, ctx.value!.calendarId, ctx.token!);
    stage = "events.insert";
    console.info("[Google Calendar] events.insert started");
    const result = await googleRequest<{ id?: string }>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`, ctx.token!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventBody(event)) });
    if (!result.id) throw new Error("Google Calendar did not return an event ID");
    console.info("[Google Calendar] events.insert succeeded");
    return Response.json({ id: result.id, calendarId: ctx.value!.calendarId, account: ctx.value!.email });
  } catch (error) {
    if (isReconnectRequired(error)) {
      console.warn("[Google Calendar] event credential rejected", { stage, failure: error.failure });
      if (uid) await markConnectionNeedsReconnect(uid, error.failure);
      return Response.json({ error: "Google Calendar needs to be reconnected.", code: error.code }, { status: 409 });
    }
    console.error("[Google Calendar] events.insert failed", { stage, errorType: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string })?.code || "unknown" });
    return Response.json({ error: "Google Calendar event creation failed. Please try again." }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  let uid: string | undefined;
  try {
    const ctx = await context(request); if (ctx.error) return ctx.error;
    uid = ctx.uid;
    const { eventId, event } = await request.json();
    if (typeof eventId !== "string" || !eventId) return Response.json({ error: "Event ID is required." }, { status: 400 });
    const calendarId = await writableCalendarId(event.googleCalendarCalendarId, ctx.value!.calendarId, ctx.token!);
    const result = await googleRequest<{ id?: string }>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, ctx.token!, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventBody(event)) });
    return Response.json({ id: result.id || eventId, calendarId: ctx.value!.calendarId, account: ctx.value!.email });
  } catch (error) {
    if (isReconnectRequired(error)) {
      if (uid) await markConnectionNeedsReconnect(uid, error.failure);
      return Response.json({ error: "Google Calendar needs to be reconnected.", code: error.code }, { status: 409 });
    }
    console.error("[Google Calendar] events.update failed", { errorType: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string })?.code || "unknown" });
    return Response.json({ error: "Google Calendar event update failed. Please try again." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  let uid: string | undefined;
  try {
    const ctx = await context(request); if (ctx.error) return ctx.error;
    uid = ctx.uid;
    const params = new URL(request.url).searchParams;
    const eventId = params.get("eventId");
    if (!eventId) return Response.json({ error: "Event ID is required." }, { status: 400 });
    const calendarId = await writableCalendarId(params.get("calendarId") || undefined, ctx.value!.calendarId, ctx.token!);
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE", headers: { Authorization: `Bearer ${ctx.token}` }, cache: "no-store" });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google Calendar event deletion failed (${response.status})`);
    return Response.json({ deleted: true });
  } catch (error) {
    if (isReconnectRequired(error)) {
      if (uid) await markConnectionNeedsReconnect(uid, error.failure);
      return Response.json({ error: "Google Calendar needs to be reconnected.", code: error.code }, { status: 409 });
    }
    console.error("[Google Calendar] events.delete failed", { errorType: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string })?.code || "unknown" });
    return Response.json({ error: "Google Calendar event deletion failed. Please try again." }, { status: 502 });
  }
}
