import type { NextRequest } from "next/server";
import { requireFounder } from "@/lib/client-api-auth";
import { connection, getRefreshToken, refreshGoogleToken, googleRequest, isReconnectRequired, markConnectionNeedsReconnect } from "@/lib/founder-google-calendar";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  const auth = await requireFounder(request);
  if (auth.error) return auth.error;
  let stage = "credential lookup";
  try {
    const value = await connection(auth.uid);
    if (!value) return Response.json({ error: "Google Calendar is not connected." }, { status: 409 });
    console.info("[Google Calendar] credential record found", { operation: "calendars.list" });
    stage = "credential decryption and token refresh";
    console.info("[Google Calendar] credential decryption started", { operation: "calendars.list" });
    const refreshToken = getRefreshToken(value);
    console.info("[Google Calendar] credential decryption succeeded", { operation: "calendars.list" });
    console.info("[Google Calendar] access token refresh started", { operation: "calendars.list" });
    const token = await refreshGoogleToken(refreshToken);
    console.info("[Google Calendar] access token refresh succeeded", { operation: "calendars.list" });
    stage = "calendars.list";
    console.info("[Google Calendar] calendars.list started");
    const data = await googleRequest<{ items?: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string }> }>("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", token);
    console.info("[Google Calendar] calendars.list succeeded", { calendarCount: data.items?.length || 0 });
    return Response.json({ calendars: (data.items || []).filter(c => c.accessRole === "owner" || c.accessRole === "writer").map(c => ({ id: c.id, name: c.summary, primary: c.primary === true })) });
  } catch (error) {
    if (isReconnectRequired(error)) {
      console.warn("[Google Calendar] calendar credential rejected", { stage, failure: error.failure });
      await markConnectionNeedsReconnect(auth.uid, error.failure);
      return Response.json({ error: "Google Calendar needs to be reconnected.", code: error.code }, { status: 409 });
    }
    console.error("[Google Calendar] calendars request failed", { stage, errorType: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string })?.code || "unknown" });
    return Response.json({ error: "Unable to load Google calendars. Please try again." }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireFounder(request);
  if (auth.error) return auth.error;
  try {
    const { calendarId } = await request.json() as { calendarId?: string };
    if (!calendarId) return Response.json({ error: "Select a calendar." }, { status: 400 });
    const value = await connection(auth.uid);
    if (!value) return Response.json({ error: "Google Calendar is not connected." }, { status: 409 });
    const token = await refreshGoogleToken(getRefreshToken(value));
    const data = await googleRequest<{ items?: Array<{ id: string; summary: string; accessRole?: string }> }>("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", token);
    const selected = data.items?.find(c => c.id === calendarId && (c.accessRole === "owner" || c.accessRole === "writer"));
    if (!selected) return Response.json({ error: "That calendar is not writable by the connected account." }, { status: 403 });
    await adminDb.collection("googleCalendarConnections").doc(auth.uid).update({ calendarId: selected.id, calendarName: selected.summary || "Calendar" });
    return Response.json({ calendarId: selected.id, calendarName: selected.summary || "Calendar" });
  } catch (error) {
    if (isReconnectRequired(error)) {
      console.warn("[Google Calendar] calendar credential rejected", { failure: error.failure });
      await markConnectionNeedsReconnect(auth.uid, error.failure);
      return Response.json({ error: "Google Calendar needs to be reconnected.", code: error.code }, { status: 409 });
    }
    console.error("[Google Calendar] calendar selection failed", { errorType: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string })?.code || "unknown" });
    return Response.json({ error: "Unable to select that calendar." }, { status: 502 });
  }
}
