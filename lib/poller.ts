import { appendHistory } from "@/lib/history-store";
import { runProviderChecks } from "@/lib/checks";
import { getPollingIntervalMs } from "@/lib/polling-config";

const POLL_INTERVAL_MS = getPollingIntervalMs();

const globalWithPoller = globalThis as typeof globalThis & {
  __checkCxPoller?: NodeJS.Timeout;
  __checkCxPollerRunning?: boolean;
};

async function tick() {
  if (globalWithPoller.__checkCxPollerRunning) {
    return;
  }

  globalWithPoller.__checkCxPollerRunning = true;
  try {
    const results = await runProviderChecks();
    if (results.length > 0) {
      await appendHistory(results);
    }
  } catch (error) {
    console.error("[check-cx] 轮询检测失败", error);
  } finally {
    globalWithPoller.__checkCxPollerRunning = false;
  }
}

if (!globalWithPoller.__checkCxPoller) {
  tick().catch((error) => console.error("[check-cx] 初次检测失败", error));
  globalWithPoller.__checkCxPoller = setInterval(() => {
    tick().catch((error) => console.error("[check-cx] 定时检测失败", error));
  }, POLL_INTERVAL_MS);
}
