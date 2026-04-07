# Notion Reminders -> Google Calendar Sync

This project polls your Notion reminders data source and keeps a Google Calendar in sync with it.

It is preconfigured for your `Reminders` data source:

- Notion data source: `32ce75b3-9f30-8050-94a9-000b4befc5cb`
- Title property: `Name`
- Status property: `Status`
- Date property: `Date`

The sync behavior is:

- Notion pages with a real `Due Date` formula value are synced to Google Calendar.
- The sync falls back to the `Date` property if needed.
- Events are all-day events.
- Priority (`!`, `!!`, `!!!`) is added to the calendar event title and description.
- Priority also drives a soft low-to-high color progression using the closest Google Calendar pastel colors.
- Completed reminders are removed from Google Calendar.
- Pages with no real due date are removed from Google Calendar if they were synced before.
- The sync uses the Notion page ID as hidden Google Calendar metadata, so updates do not create duplicates.

## 1. Create your environment file

```bash
cp .env.example .env
```

Then fill in:

- `NOTION_API_KEY`: a Notion integration token with access to the `Reminders` database.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: from a Google Cloud OAuth Desktop App client.
- `GOOGLE_CALENDAR_ID`: `primary` or a specific calendar ID.

## 2. Prepare Notion access

Share the `Reminders` database with your integration in Notion, or the API will return `404`.

## 3. Prepare Google Calendar access

1. In Google Cloud, enable the Google Calendar API.
2. Configure the OAuth consent screen.
3. Create an OAuth client of type `Desktop app`.
4. Put the client ID and secret into `.env`.

Then run:

```bash
npm run auth:google
```

That opens a local loopback auth flow and stores tokens in `.tokens/google-oauth.json`.

## 4. Run the sync

One sync pass:

```bash
npm run sync:once
```

Continuous polling sync:

```bash
npm run sync:watch
```

Default polling is every 60 seconds. Change that with `SYNC_INTERVAL_SECONDS`.

## Notes

- `SYNC_DONE_TASKS=false` means completed reminders are deleted from Google Calendar on the next sync.
- The sync polls Notion on an interval, so adds and property edits are reflected automatically on the next pass.

## References

- Notion Query a data source: https://developers.notion.com/reference/query-a-data-source
- Google OAuth for desktop apps: https://developers.google.com/identity/protocols/oauth2/native-app
- Google Calendar extended properties: https://developers.google.com/workspace/calendar/api/guides/extended-properties
