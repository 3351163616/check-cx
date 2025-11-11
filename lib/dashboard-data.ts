import type { CheckResult } from "@/lib/checks";
import { loadProviderConfigs, runProviderChecks } from "@/lib/checks";
import { appendHistory, loadHistory } from "@/lib/history-store";
import {
  getPollingIntervalLabel,
  getPollingIntervalMs,
} from "@/lib/polling-config";

type RefreshMode = "always" | "missing" | "never";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface TimelineItem extends CheckResult {
  formattedTime: string;
}

export interface ProviderTimeline {
  id: string;
  items: TimelineItem[];
  latest: TimelineItem;
}

export interface DashboardData {
  providerTimelines: ProviderTimeline[];
  lastUpdated: string | null;
  total: number;
  pollIntervalLabel: string;
  pollIntervalMs: number;
}

const formatTime = (iso: string) => timeFormatter.format(new Date(iso));

export async function loadDashboardData(options?: { refreshMode?: RefreshMode }) {
  const configs = loadProviderConfigs();
  const allowedIds = new Set(configs.map((item) => item.id));

  const filterHistory = (history: Awaited<ReturnType<typeof loadHistory>>) => {
    if (allowedIds.size === 0) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(history).filter(([id]) => allowedIds.has(id))
    );
  };

  const readFilteredHistory = async () => filterHistory(await loadHistory());

  const refreshHistory = async () => {
    if (allowedIds.size === 0) {
      return {};
    }
    const results = await runProviderChecks();
    if (results.length > 0) {
      return filterHistory(await appendHistory(results));
    }
    return readFilteredHistory();
  };

  let history = await readFilteredHistory();
  const refreshMode = options?.refreshMode ?? "missing";

  if (refreshMode === "always") {
    history = await refreshHistory();
  } else if (
    refreshMode === "missing" &&
    allowedIds.size > 0 &&
    Object.keys(history).length === 0
  ) {
    history = await refreshHistory();
  }

  const mappedTimelines = Object.entries(history).map<ProviderTimeline | null>(
    ([id, items]) => {
      const sorted = [...items]
        .sort(
          (a, b) =>
            new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
        )
        .map((item) => ({
          ...item,
          formattedTime: formatTime(item.checkedAt),
        }));

      if (sorted.length === 0) {
        return null;
      }

      return {
        id,
        items: sorted,
        latest: sorted[0],
      };
    }
  );

  const providerTimelines = mappedTimelines
    .filter((timeline): timeline is ProviderTimeline => Boolean(timeline))
    .sort((a, b) => a.latest.name.localeCompare(b.latest.name));

  const allEntries = providerTimelines
    .flatMap((timeline) => timeline.items)
    .sort(
      (a, b) =>
        new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
    );

  const lastUpdated = allEntries.length ? formatTime(allEntries[0].checkedAt) : null;

  return {
    providerTimelines,
    lastUpdated,
    total: providerTimelines.length,
    pollIntervalLabel: getPollingIntervalLabel(),
    pollIntervalMs: getPollingIntervalMs(),
  };
}
