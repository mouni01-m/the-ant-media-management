import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import { decryptCredential, encryptCredential } from "@/lib/client-credentials";

export const GOOGLE_CALENDAR_EMAIL = "theantmediaa@gmail.com";
export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

type Connection = {
  email: string;
  calendarId: string;
  calendarName: string;
  refreshTokenCiphertext: string;
  refreshTokenIv: string;
  refreshTokenTag: string;
  connectedAt: string;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function redirectUri() {
  const configuredRedirect = process.env.GOOGLE_REDIRECT_URI;
  if (configuredRedirect) {
    let parsed: URL;
    try {
      parsed = new URL(configuredRedirect);
    } catch {
      throw new Error("GOOGLE_REDIRECT_URI must be an absolute URL");
    }
    if (parsed.pathname !== "/api/google-calendar/callback" || parsed.search || parsed.hash) {
      throw new Error("GOOGLE_REDIRECT_URI must target /api/google-calendar/callback without query or fragment");
    }
    return configuredRedirect;
  }
  if (process.env.VERCEL) {
    throw new Error("GOOGLE_REDIRECT_URI is required on Vercel");
  }
  const origin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (!origin) throw new Error("APP_URL is not configured");
  return `${origin.replace(/\/$/, "")}/api/google-calendar/callback`;
}

function googleClientId() {
  return required("GOOGLE_CLIENT_ID");
}

export function signOAuthState(uid: string) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 10 * 60_000, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  const signature = createHmac("sha256", required("GOOGLE_OAUTH_STATE_SECRET")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Invalid OAuth state");
  const expected = createHmac("sha256", required("GOOGLE_OAUTH_STATE_SECRET")).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid OAuth state");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: string; exp: number };
  if (!decoded.uid || decoded.exp < Date.now()) throw new Error("Expired OAuth state");
  return decoded.uid;
}

export function googleAuthorizationUrl(uid: string) {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "select_account consent",
    login_hint: GOOGLE_CALENDAR_EMAIL,
    include_granted_scopes: "true",
    state: signOAuthState(uid),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: googleClientId(), client_secret: required("GOOGLE_CLIENT_SECRET"), redirect_uri: redirectUri(), grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Google authorization code exchange failed");
  return data as { access_token: string; refresh_token?: string };
}

export async function googleRequest<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) }, cache: "no-store" });
  if (!response.ok) throw new Error(`Google Calendar API request failed (${response.status})`);
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

export async function refreshGoogleToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: googleClientId(), client_secret: required("GOOGLE_CLIENT_SECRET"), refresh_token: refreshToken, grant_type: "refresh_token" }), cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Google Calendar authorization expired. Please reconnect.");
  return data.access_token as string;
}

export async function connection(uid: string): Promise<Connection | null> {
  const snapshot = await adminDb.collection("googleCalendarConnections").doc(uid).get();
  return snapshot.exists ? snapshot.data() as Connection : null;
}

export async function saveConnection(uid: string, values: Omit<Connection, "refreshTokenCiphertext" | "refreshTokenIv" | "refreshTokenTag" | "connectedAt"> & { refreshToken: string }) {
  const encrypted = encryptCredential(values.refreshToken);
  await adminDb.collection("googleCalendarConnections").doc(uid).set({
    email: values.email, calendarId: values.calendarId, calendarName: values.calendarName,
    refreshTokenCiphertext: encrypted.passwordCiphertext, refreshTokenIv: encrypted.passwordIv,
    refreshTokenTag: encrypted.passwordTag, connectedAt: new Date().toISOString(),
  });
}

export function getRefreshToken(value: Connection) {
  return decryptCredential(value.refreshTokenCiphertext, value.refreshTokenIv, value.refreshTokenTag);
}

export async function getAccessToken(value: Connection) {
  return refreshGoogleToken(getRefreshToken(value));
}

export function isOfficialCalendarAccount(email: string) {
  return email.toLowerCase() === GOOGLE_CALENDAR_EMAIL;
}

export async function revokeGoogleToken(refreshToken: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST", cache: "no-store" });
}

export function eventBody(event: { title: string; description?: string; date: string; time: string; reminderMinutes?: number; attendeeEmail?: string }) {
  const start = new Date(`${event.date}T${event.time}:00+05:30`);
  if (!Number.isFinite(start.getTime())) throw new Error("Invalid event date or time");
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const selectedReminder = Math.trunc(event.reminderMinutes ?? 60);
  const reminderMinutes = Math.min(40320, Math.max(0, selectedReminder));
  const body: Record<string, unknown> = {
    summary: event.title,
    description: event.description || "The Ant Media Management content event.",
    start: { dateTime: start.toISOString(), timeZone: "Asia/Kolkata" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Kolkata" },
    reminders: {
      useDefault: false,
      overrides: selectedReminder < 0 ? [] : [{ method: "popup", minutes: reminderMinutes }],
    },
  };
  if (event.attendeeEmail?.trim()) body.attendees = [{ email: event.attendeeEmail.trim() }];
  return body;
}
