"use client";

import { auth } from "@/lib/firebase";

async function api(path: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Your session has expired. Please log in again.");
  const send = async (token: string) => fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  let response = await send(await user.getIdToken());
  if (response.status === 401 && auth.currentUser?.uid === user.uid) {
    response = await send(await user.getIdToken(true));
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!response.ok) throw new Error(data.error || "Google Calendar request failed.");
  return data;
}

export type FounderCalendarConnection = { connected: boolean; email?: string; accountMatchesTarget?: boolean; calendarId?: string; calendarName?: string };
export async function getFounderCalendarConnection() { return api("/api/google-calendar/status") as Promise<FounderCalendarConnection>; }
export async function startFounderCalendarConnection() {
  const result = await api("/api/google-calendar/connect", { method: "POST" });
  window.location.assign(result.url);
}
export async function disconnectFounderCalendar() { return api("/api/google-calendar/disconnect", { method: "POST" }); }
export async function listFounderCalendars() { return api("/api/google-calendar/calendars") as Promise<{ calendars: Array<{ id: string; name: string; primary: boolean }> }>; }
export async function selectFounderCalendar(calendarId: string) { return api("/api/google-calendar/calendars", { method: "PATCH", body: JSON.stringify({ calendarId }) }); }
export async function createFounderCalendarEvent(event: object) { return api("/api/google-calendar/events", { method: "POST", body: JSON.stringify(event) }) as Promise<{ id: string; calendarId: string; account: string }>; }
export async function updateFounderCalendarEvent(eventId: string, event: object) { return api("/api/google-calendar/events", { method: "PUT", body: JSON.stringify({ eventId, event }) }); }
export async function deleteFounderCalendarEvent(eventId: string, calendarId?: string) { return api(`/api/google-calendar/events?eventId=${encodeURIComponent(eventId)}${calendarId ? `&calendarId=${encodeURIComponent(calendarId)}` : ""}`, { method: "DELETE" }); }
