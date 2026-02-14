/**
 * 邮件告警通知模块
 * 当指定模型检测出现错误时，通过 QQ 邮箱发送告警邮件
 * 内置 30 分钟防抖机制，避免重复告警
 */

import * as nodemailer from "nodemailer";
import type { CheckResult } from "../types";

// 需要监控的模型列表
const WATCHED_MODELS = ["claude-opus-4-6", "claude-haiku-4-5-20251001"];

// 需要告警的状态（不包括 operational、degraded、maintenance）
const ALERT_STATUSES = new Set(["failed", "error", "validation_failed"]);

// 防抖冷却时间（毫秒）：30 分钟
const COOLDOWN_MS = 30 * 60 * 1000;

// 记录每个模型上次发送邮件的时间
const lastSentMap = new Map<string, number>();

function getTransporter() {
  const user = process.env.ALERT_EMAIL_USER;
  const pass = process.env.ALERT_EMAIL_PASS;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: "smtp.qq.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

function shouldSend(model: string): boolean {
  const lastSent = lastSentMap.get(model);
  if (!lastSent) return true;
  return Date.now() - lastSent >= COOLDOWN_MS;
}

function markSent(model: string) {
  lastSentMap.set(model, Date.now());
}

async function sendAlertEmail(failedResults: CheckResult[]) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      "[check-cx] 邮件告警跳过：未配置 ALERT_EMAIL_USER 或 ALERT_EMAIL_PASS"
    );
    return;
  }

  const user = process.env.ALERT_EMAIL_USER!;
  const recipient = process.env.ALERT_EMAIL_TO || user;

  const rows = failedResults
    .map(
      (r) =>
        `模型: ${r.model}\n` +
        `名称: ${r.name}\n` +
        `状态: ${r.status}\n` +
        `延迟: ${r.latencyMs !== null ? `${r.latencyMs}ms` : "N/A"}\n` +
        `详情: ${r.message || "无"}\n` +
        `时间: ${r.checkedAt}`
    )
    .join("\n\n---\n\n");

  const modelNames = failedResults.map((r) => r.model).join(", ");

  const mailOptions = {
    from: `"Check CX 告警" <${user}>`,
    to: recipient,
    subject: `[告警] 模型检测异常: ${modelNames}`,
    text:
      `以下模型在本轮检测中出现异常：\n\n${rows}\n\n` +
      `---\n此邮件由 Check CX 监控系统自动发送，30 分钟内同一模型不会重复告警。`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(
      `[check-cx] 告警邮件已发送: ${modelNames} -> ${recipient}`
    );
  } catch (error) {
    console.error("[check-cx] 告警邮件发送失败:", error);
  }
}

/**
 * 检查本轮结果并在需要时发送告警邮件
 * 在轮询器每轮检测完成后调用
 */
export async function checkAndNotify(results: CheckResult[]) {
  // 筛选出需要告警的结果：模型匹配 + 状态异常 + 未在冷却期
  const alertResults = results.filter(
    (r) =>
      WATCHED_MODELS.includes(r.model) &&
      ALERT_STATUSES.has(r.status) &&
      shouldSend(r.model)
  );

  if (alertResults.length === 0) return;

  // 标记已发送
  alertResults.forEach((r) => markSent(r.model));

  await sendAlertEmail(alertResults);
}
