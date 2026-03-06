/**
 * 数据库配置加载模块
 */

import "server-only";
import {createAdminClient} from "../supabase/admin";
import {getPollingIntervalMs} from "../core/polling-config";
import type {CheckConfigRow, ProviderConfig, ProviderType} from "../types";
import type {CheckRequestTemplateRow} from "../types/database";
import {logError} from "../utils";

interface ConfigCache {
  data: ProviderConfig[];
  lastFetchedAt: number;
}

interface ConfigCacheMetrics {
  hits: number;
  misses: number;
}

type JsonRecord = Record<string, unknown>;
type TemplateProjection = Pick<CheckRequestTemplateRow, "type" | "request_header" | "metadata">;
type ConfigRowWithTemplate = Pick<
  CheckConfigRow,
  "id" | "name" | "type" | "model" | "endpoint" | "api_key" | "is_maintenance" | "template_id" | "request_header" | "metadata" | "group_name"
> & {
  check_request_templates?: TemplateProjection | TemplateProjection[] | null;
};

const cache: ConfigCache = {
  data: [],
  lastFetchedAt: 0,
};

const metrics: ConfigCacheMetrics = {
  hits: 0,
  misses: 0,
};

export function getConfigCacheMetrics(): ConfigCacheMetrics {
  return { ...metrics };
}

export function resetConfigCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
}

function normalizeJsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function mergeTemplateAndConfig(templateValue: unknown, configValue: unknown): JsonRecord | null {
  const templateRecord = normalizeJsonRecord(templateValue);
  const configRecord = normalizeJsonRecord(configValue);

  if (!templateRecord && !configRecord) {
    return null;
  }

  return {
    ...(templateRecord ?? {}),
    ...(configRecord ?? {}),
  };
}

function getTemplate(row: ConfigRowWithTemplate): TemplateProjection | null {
  const template = Array.isArray(row.check_request_templates)
    ? row.check_request_templates[0]
    : row.check_request_templates;

  if (!template || template.type !== row.type) {
    return null;
  }

  return template;
}

/**
 * 从数据库加载启用的 Provider 配置
 * @returns Provider 配置列表
 */
export async function loadProviderConfigsFromDB(options?: {
  forceRefresh?: boolean;
}): Promise<ProviderConfig[]> {
  try {
    const now = Date.now();
    const ttl = getPollingIntervalMs();
    if (!options?.forceRefresh && now - cache.lastFetchedAt < ttl) {
      metrics.hits += 1;
      return cache.data;
    }
    metrics.misses += 1;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("check_configs")
      .select(
        "id, name, type, model, endpoint, api_key, is_maintenance, template_id, request_header, metadata, group_name, check_request_templates(type, request_header, metadata)"
      )
      .eq("enabled", true)
      .order("id");

    if (error) {
      logError("从数据库加载配置失败", error);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn("[check-cx] 数据库中没有找到启用的配置");
      cache.data = [];
      cache.lastFetchedAt = now;
      return [];
    }

    const configs: ProviderConfig[] = data.map(
      (row: ConfigRowWithTemplate) => {
        const template = getTemplate(row);
        const mergedRequestHeaders = mergeTemplateAndConfig(template?.request_header, row.request_header) as Record<string, string> | null;
        const mergedMetadata = mergeTemplateAndConfig(template?.metadata, row.metadata);

        return {
          id: row.id,
          name: row.name,
          type: row.type as ProviderType,
          endpoint: row.endpoint,
          model: row.model,
          apiKey: row.api_key,
          is_maintenance: row.is_maintenance,
          requestHeaders: mergedRequestHeaders,
          metadata: mergedMetadata,
          groupName: row.group_name || null,
        };
      }
    );

    cache.data = configs;
    cache.lastFetchedAt = now;
    return configs;
  } catch (error) {
    logError("加载配置时发生异常", error);
    return [];
  }
}
