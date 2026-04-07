import fs from "node:fs";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function truncate(value, max = 1024) {
  if (!value) {
    return "";
  }

  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
