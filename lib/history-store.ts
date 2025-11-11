import { promises as fs } from "node:fs";
import path from "node:path";

import type { CheckResult } from "@/lib/checks";

const HISTORY_DIR = path.join(process.cwd(), "data");
const HISTORY_FILE = path.join(HISTORY_DIR, "check-history.json");
const HISTORY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_POINTS_PER_PROVIDER = 60; // roughly 1 point/minute

export type HistoryMap = Record<string, CheckResult[]>;

async function ensureHistoryFile() {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  try {
    await fs.access(HISTORY_FILE);
  } catch {
    await fs.writeFile(HISTORY_FILE, JSON.stringify({}), "utf-8");
  }
}

export async function loadHistory(): Promise<HistoryMap> {
  await ensureHistoryFile();
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf-8");
    const parsed = raw ? (JSON.parse(raw) as HistoryMap) : {};
    for (const key of Object.keys(parsed)) {
      parsed[key] = parsed[key]
        .filter((item) => item?.checkedAt)
        .sort(
          (a, b) =>
            new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
        );
      if (parsed[key].length === 0) {
        delete parsed[key];
      }
    }
    return parsed;
  } catch (error) {
    console.error("[check-cx] 读取历史记录失败", error);
    return {};
  }
}

export async function appendHistory(results: CheckResult[]): Promise<HistoryMap> {
  if (results.length === 0) {
    return loadHistory();
  }

  const history = await loadHistory();
  const cutoff = Date.now() - HISTORY_WINDOW_MS;

  for (const result of results) {
    const items = history[result.id] ?? [];
    items.unshift(result);
    history[result.id] = items;
  }

  for (const key of Object.keys(history)) {
    const filtered = history[key]
      .filter(
        (item) => new Date(item.checkedAt).getTime() >= cutoff && item.status
      )
      .sort(
        (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
      )
      .slice(0, MAX_POINTS_PER_PROVIDER);

    if (filtered.length === 0) {
      delete history[key];
    } else {
      history[key] = filtered;
    }
  }

  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
  return history;
}
