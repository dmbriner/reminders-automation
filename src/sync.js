import { ensureParentDir } from "./config.js";
import { deleteEvent, findEventByNotionPageId, upsertEvent } from "./googleCalendar.js";
import { queryReminders } from "./notion.js";
import { readJsonIfExists, truncate, writeJson } from "./utils.js";

function loadState(config) {
  return readJsonIfExists(config.statePath, {
    reminders: {},
    lastRunAt: null,
  });
}

function saveState(config, state) {
  ensureParentDir(config.statePath);
  writeJson(config.statePath, state);
}

function shouldSyncReminder(config, reminder) {
  if (reminder.archived) {
    return false;
  }

  if (!reminder.date) {
    return false;
  }

  if (!config.syncDoneTasks && reminder.status === "Done") {
    return false;
  }

  return true;
}

export async function runSync(config) {
  const reminders = await queryReminders(config);
  const state = loadState(config);
  const activeReminderIds = new Set();
  const results = {
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
  };

  for (const reminder of reminders) {
    const existingState = state.reminders[reminder.id] || null;
    const syncable = shouldSyncReminder(config, reminder);

    if (!syncable) {
      if (existingState?.eventId) {
        await deleteEvent(config, existingState.eventId);
        delete state.reminders[reminder.id];
        results.deleted += 1;
      } else {
        results.skipped += 1;
      }
      continue;
    }

    activeReminderIds.add(reminder.id);

    let eventId = existingState?.eventId || null;
    if (!eventId) {
      const existingEvent = await findEventByNotionPageId(config, reminder.id);
      eventId = existingEvent?.id || null;
    }

    const syncedEvent = await upsertEvent(config, reminder, eventId);
    state.reminders[reminder.id] = {
      eventId: syncedEvent.id,
      title: truncate(reminder.title, 240),
      lastEditedTime: reminder.lastEditedTime,
      syncedAt: new Date().toISOString(),
    };

    if (eventId) {
      results.updated += 1;
    } else {
      results.created += 1;
    }
  }

  for (const [reminderId, reminderState] of Object.entries(state.reminders)) {
    if (activeReminderIds.has(reminderId)) {
      continue;
    }

    await deleteEvent(config, reminderState.eventId);
    delete state.reminders[reminderId];
    results.deleted += 1;
  }

  state.lastRunAt = new Date().toISOString();
  saveState(config, state);
  return results;
}
