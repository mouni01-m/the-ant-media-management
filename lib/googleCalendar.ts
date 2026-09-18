"use client";

/* =========================================================
   GOOGLE CALENDAR INTEGRATION
   The Ant Media Management
========================================================= */

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

const GOOGLE_GIS_SCRIPT =
  "https://accounts.google.com/gsi/client";

const GOOGLE_CALENDAR_API =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: {
    prompt?: string;
  }) => void;
};

type GoogleAccountsOAuth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: unknown) => void;
  }) => GoogleTokenClient;

  revoke: (
    token: string,
    callback?: () => void
  ) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleAccountsOAuth2;
      };
    };
  }
}

export function loadGoogleIdentityScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(
        new Error(
          "Google Identity Services requires a browser."
        )
      );
      return;
    }

    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existingScript = document.querySelector(
      `script[src="${GOOGLE_GIS_SCRIPT}"]`
    );

    if (existingScript) {
      const waitForGoogle = () => {
        if (window.google?.accounts?.oauth2) {
          resolve();
          return;
        }

        setTimeout(waitForGoogle, 100);
      };

      waitForGoogle();
      return;
    }

    const script = document.createElement("script");

    script.src = GOOGLE_GIS_SCRIPT;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      const waitForGoogle = () => {
        if (window.google?.accounts?.oauth2) {
          resolve();
          return;
        }

        setTimeout(waitForGoogle, 100);
      };

      waitForGoogle();
    };

    script.onerror = () => {
      reject(
        new Error(
          "Unable to load Google Identity Services."
        )
      );
    };

    document.head.appendChild(script);
  });
}

export function getGoogleClientId(): string {
  const clientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing from .env.local"
    );
  }

  return clientId;
}

export async function getGoogleAccessToken(): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error(
      "Google Calendar can only be connected from the browser."
    );
  }

  await loadGoogleIdentityScript();

  const clientId = getGoogleClientId();

  const oauth2 =
    window.google?.accounts?.oauth2;

  if (!oauth2) {
    throw new Error(
      "Google Identity Services is not available."
    );
  }

  return new Promise<string>((resolve, reject) => {
    let completed = false;

    const tokenClient =
      oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_CALENDAR_SCOPE,
        callback: (response) => {
          if (completed) {
            return;
          }

          completed = true;

          if (
            response.error ||
            !response.access_token
          ) {
            reject(
              new Error(
                response.error_description ||
                  response.error ||
                  "Google Calendar authorization failed."
              )
            );

            return;
          }

          resolve(response.access_token);
        },
        error_callback: (error) => {
          if (completed) {
            return;
          }

          completed = true;

          console.error(
            "Google OAuth error:",
            error
          );

          reject(
            new Error(
              "Google authorization window could not be opened."
            )
          );
        },
      });

    try {
      tokenClient.requestAccessToken({
        prompt: "consent",
      });
    } catch (error) {
      if (!completed) {
        completed = true;

        reject(
          error instanceof Error
            ? error
            : new Error(
                "Unable to request Google Calendar access."
              )
        );
      }
    }
  });
}

export type CalendarEventInput = {
  title: string;
  description?: string;
  date: string;
  time: string;
  reminderMinutes?: number;
  attendeeEmail?: string;
};

function getDateTime(
  date: string,
  time: string
): string {
  return `${date}T${time}:00+05:30`;
}

function buildCalendarEventBody(
  event: CalendarEventInput
) {
  const startDateTime = getDateTime(
    event.date,
    event.time
  );

  const start = new Date(startDateTime);

  const end = new Date(
    start.getTime() + 60 * 60 * 1000
  );

  const reminderMinutes =
    event.reminderMinutes ?? 60;

  const body: Record<string, unknown> = {
    summary: event.title,
    description:
      event.description ||
      "The Ant Media Management content event.",
    start: {
      dateTime: start.toISOString(),
      timeZone: "Asia/Kolkata",
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: "Asia/Kolkata",
    },
    reminders: {
      useDefault: false,
      overrides: [
        {
          method: "popup",
          minutes: reminderMinutes,
        },
      ],
    },
  };

  if (event.attendeeEmail?.trim()) {
    body.attendees = [
      {
        email: event.attendeeEmail.trim(),
      },
    ];
  }

  return body;
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  event: CalendarEventInput
) {
  const body =
    buildCalendarEventBody(event);

  const response = await fetch(
    `${GOOGLE_CALENDAR_API}?sendUpdates=all`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    console.error(
      "Google Calendar create error:",
      errorText
    );

    throw new Error(
      "Unable to create Google Calendar event."
    );
  }

  return response.json();
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEventInput
) {
  const body =
    buildCalendarEventBody(event);

  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/${encodeURIComponent(
      eventId
    )}?sendUpdates=all`,
    {
      method: "PUT",
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    console.error(
      "Google Calendar update error:",
      errorText
    );

    throw new Error(
      "Unable to update Google Calendar event."
    );
  }

  return response.json();
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string
) {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/${encodeURIComponent(
      eventId
    )}?sendUpdates=all`,
    {
      method: "DELETE",
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },
    }
  );

  if (
    !response.ok &&
    response.status !== 404
  ) {
    const errorText =
      await response.text();

    console.error(
      "Google Calendar delete error:",
      errorText
    );

    throw new Error(
      "Unable to delete Google Calendar event."
    );
  }

  return true;
}

export function getGoogleCalendarEventUrl(
  eventId: string
): string {
  return `https://calendar.google.com/calendar/u/0/r/eventedit/${encodeURIComponent(
    eventId
  )}`;
}

export async function revokeGoogleCalendarAccess(
  accessToken: string
) {
  await loadGoogleIdentityScript();

  const oauth2 =
    window.google?.accounts?.oauth2;

  if (!oauth2) {
    return;
  }

  return new Promise<void>((resolve) => {
    oauth2.revoke(
      accessToken,
      () => {
        resolve();
      }
    );
  });
}
