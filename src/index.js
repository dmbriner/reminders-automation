import { getConfig } from "./config.js";
import { runSync } from "./sync.js";
import { sleep } from "./utils.js";

async function runOnce(config) {
  const startedAt = new Date().toISOString();
  const results = await runSync(config);
  console.log(
    `[${startedAt}] sync complete: created=${results.created} updated=${results.updated} deleted=${results.deleted} skipped=${results.skipped}`,
  );
}

async function main() {
  const config = getConfig();
  const once = process.argv.includes("--once");

  if (once) {
    await runOnce(config);
    return;
  }

  console.log(`Watching Notion reminders and syncing to Google Calendar every ${config.syncIntervalSeconds}s`);
  while (true) {
    try {
      await runOnce(config);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] sync failed: ${error.message}`);
    }

    await sleep(config.syncIntervalSeconds * 1000);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
