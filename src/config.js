import fs from "node:fs";
import path from "node:path";

const REQUIRED_KEYS = [
  "NOTION_API_KEY",
  "NOTION_DATA_SOURCE_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALENDAR_ID",
];

export function loadEnv(envPath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getConfig() {
  loadEnv();

  for (const key of REQUIRED_KEYS) {
    requireEnv(key);
  }

  return {
    notionApiKey: process.env.NOTION_API_KEY,
    notionDataSourceId: process.env.NOTION_DATA_SOURCE_ID,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID,
    syncIntervalSeconds: Number.parseInt(process.env.SYNC_INTERVAL_SECONDS ?? "60", 10),
    timezone: process.env.TIMEZONE || "America/New_York",
    syncDoneTasks: String(process.env.SYNC_DONE_TASKS || "false").toLowerCase() === "true",
    notionVersion: "2025-09-03",
    googleScopes: ["https://www.googleapis.com/auth/calendar"],
    tokensPath: path.resolve(process.cwd(), ".tokens/google-oauth.json"),
    statePath: path.resolve(process.cwd(), ".state/sync-state.json"),
  };
}

export function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
