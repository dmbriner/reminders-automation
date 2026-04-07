import { getValidGoogleTokens } from "./googleAuth.js";

const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";

async function googleFetch(config, pathname, options = {}) {
  const tokens = await getValidGoogleTokens(config);
  const response = await fetch(`${GOOGLE_API_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Calendar API error ${response.status}: ${details}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function encodeCalendarId(calendarId) {
  return encodeURIComponent(calendarId);
}

export async function findEventByNotionPageId(config, notionPageId) {
  const calendarId = encodeCalendarId(config.googleCalendarId);
  const privateExtendedProperty = encodeURIComponent(`notionPageId=${notionPageId}`);
  const response = await googleFetch(
    config,
    `/calendars/${calendarId}/events?maxResults=1&singleEvents=true&privateExtendedProperty=${privateExtendedProperty}`,
  );

  return response.items?.[0] || null;
}

export async function upsertEvent(config, reminder, existingEventId = null) {
  const calendarId = encodeCalendarId(config.googleCalendarId);
  const event = buildGoogleEvent(config, reminder);

  if (existingEventId) {
    return googleFetch(
      config,
      `/calendars/${calendarId}/events/${encodeURIComponent(existingEventId)}`,
      {
        method: "PATCH",
        body: event,
      },
    );
  }

  return googleFetch(config, `/calendars/${calendarId}/events`, {
    method: "POST",
    body: event,
  });
}

export async function deleteEvent(config, eventId) {
  const calendarId = encodeCalendarId(config.googleCalendarId);
  await googleFetch(config, `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
}

function buildDescription(reminder) {
  const lines = [
    `Synced from Notion reminder`,
    `Notion page: ${reminder.url}`,
  ];

  if (reminder.priority) {
    lines.push(`Priority: ${reminder.priority}`);
  }

  if (reminder.status) {
    lines.push(`Status: ${reminder.status}`);
  }

  if (reminder.date?.source) {
    lines.push(`Date source: ${reminder.date.source}`);
  }

  return lines.join("\n");
}

function buildGoogleEvent(config, reminder) {
  const startDate = toIsoDate(reminder.date.start);
  const endDateExclusive = getAllDayEndDate(reminder.date);

  const event = {
    summary: buildSummary(reminder),
    description: buildDescription(reminder),
    colorId: null,
    extendedProperties: {
      private: {
        notionPageId: reminder.id,
        notionLastEditedTime: reminder.lastEditedTime,
      },
    },
    reminders: {
      useDefault: true,
    },
    start: { date: startDate },
    end: { date: endDateExclusive },
  };

  return event;
}

function buildSummary(reminder) {
  const statusIcon = getStatusIcon(reminder.status);
  const priorityPrefix = reminder.priority ? `${reminder.priority} ` : "";
  return `${statusIcon} ${priorityPrefix}${reminder.title}`.trim();
}

function getStatusIcon(status) {
  if (status === "In progress") {
    return "ⴵ";
  }

  if (status === "Done") {
    return "☑";
  }

  return "◯";
}

function toIsoDate(dateInput) {
  return String(dateInput).slice(0, 10);
}

function getAllDayEndDate(reminderDate) {
  const inclusiveEnd = reminderDate.end ? toIsoDate(reminderDate.end) : toIsoDate(reminderDate.start);
  return addOneDay(inclusiveEnd);
}

function addOneDay(isoDate) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
