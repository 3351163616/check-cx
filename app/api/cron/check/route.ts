/**
 * Vercel Cron Job 触发检测
 *
 * 由于 Vercel Serverless 无法运行后台定时器，
 * 通过 Cron Job 定期调用此路由触发 Provider 检测并写入历史
 */

import { NextResponse } from "next/server";
import { loadProviderConfigsFromDB } from "@/lib/database/config-loader";
import { runProviderChecks } from "@/lib/providers";
import { historySnapshotStore } from "@/lib/database/history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // 验证 Vercel Cron 请求的合法性
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allConfigs = await loadProviderConfigsFromDB({ forceRefresh: true });
    const activeConfigs = allConfigs.filter((cfg) => !cfg.is_maintenance);

    if (activeConfigs.length === 0) {
      return NextResponse.json({ message: "无活跃配置", checked: 0 });
    }

    console.log(`[cron] 开始检测 ${activeConfigs.length} 个配置...`);
    const results = await runProviderChecks(activeConfigs);
    await historySnapshotStore.append(results);

    const summary = results.map((r) => ({
      name: r.name,
      status: r.status,
      latencyMs: r.latencyMs,
    }));

    console.log(`[cron] 检测完成，写入 ${results.length} 条记录`);
    return NextResponse.json({
      message: "检测完成",
      checked: results.length,
      results: summary,
    });
  } catch (error) {
    console.error("[cron] 检测失败", error);
    return NextResponse.json(
      { error: "检测失败", detail: String(error) },
      { status: 500 }
    );
  }
}
