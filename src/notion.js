const NOTION_BASE_URL = "https://api.notion.com/v1";

async function notionFetch(config, pathname, options = {}) {
  const response = await fetch(`${NOTION_BASE_URL}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${config.notionApiKey}`,
      "Notion-Version": config.notionVersion,
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Notion API error ${response.status}: ${details}`);
  }

  return response.json();
}

function getTitleValue(property) {
  if (!property?.title?.length) {
    return "Untitled reminder";
  }

  return property.title.map((segment) => segment.plain_text).join("").trim() || "Untitled reminder";
}

function getSelectLikeName(property) {
  if (!property) {
    return null;
  }

  if (property.status?.name) {
    return property.status.name;
  }

  if (property.select?.name) {
    return property.select.name;
  }

  return null;
}

function isUsableDate(dateValue) {
  return Boolean(dateValue?.start) && !String(dateValue.start).startsWith("1970-01-01");
}

function getReminderDate(props) {
  const dueDateFormula = props["Due Date"]?.formula;
  if (dueDateFormula?.type === "date" && isUsableDate(dueDateFormula.date)) {
    return {
      start: dueDateFormula.date.start,
      end: dueDateFormula.date.end,
      timezone: dueDateFormula.date.time_zone,
      source: "Due Date",
    };
  }

  const dateProperty = props.Date?.date;
  if (isUsableDate(dateProperty)) {
    return {
      start: dateProperty.start,
      end: dateProperty.end,
      timezone: dateProperty.time_zone,
      source: "Date",
    };
  }

  return null;
}

function normalizeReminder(page) {
  const props = page.properties || {};
  const reminderDate = getReminderDate(props);

  return {
    id: page.id,
    url: page.url,
    title: getTitleValue(props.Name),
    status: getSelectLikeName(props.Status),
    priority: getSelectLikeName(props.Priority),
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
    archived: Boolean(page.archived || page.in_trash),
    date: reminderDate,
  };
}

export async function queryReminders(config) {
  const reminders = [];
  let nextCursor = undefined;

  do {
    const payload = {
      page_size: 100,
      sorts: [
        {
          timestamp: "last_edited_time",
          direction: "descending",
        },
      ],
    };

    if (!config.syncDoneTasks) {
      payload.filter = {
        and: [
          {
            property: "Status",
            status: {
              does_not_equal: "Done",
            },
          },
        ],
      };
    }

    if (nextCursor) {
      payload.start_cursor = nextCursor;
    }

    const response = await notionFetch(
      config,
      `/data_sources/${config.notionDataSourceId}/query`,
      {
        method: "POST",
        body: payload,
      },
    );

    for (const result of response.results || []) {
      if (result.object === "page") {
        reminders.push(normalizeReminder(result));
      }
    }

    nextCursor = response.has_more ? response.next_cursor : undefined;
  } while (nextCursor);

  return reminders;
}
