<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Check CX 是一个基于 Next.js 的 AI 模型健康监控面板，用于实时监控 OpenAI、Gemini、Anthropic 等 AI 模型的 API 可用性、延迟和错误信息。通过后台轮询持续采集健康结果，提供可视化 Dashboard 与只读状态 API。

**技术栈**: Next.js 16 + React 19 + Tailwind CSS 4 + Supabase + Vercel AI SDK 5

## 常用命令

```bash
pnpm install                   # 安装依赖
pnpm dev                       # 本地开发（轮询器日志输出到终端）
pnpm build                     # 生产构建
pnpm start                     # 运行生产服务器
pnpm lint                      # ESLint 检查
./deploy.sh                    # Docker 构建并运行
docker-compose up -d           # docker-compose 启动
```

项目当前无自动化测试。

## 环境配置

```bash
cp .env.example .env.local
```

必需变量：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_OR_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`

可选变量：`CHECK_NODE_ID`（多节点选主，默认 `local`）、`CHECK_POLL_INTERVAL_SECONDS`（检测间隔 15–600 秒，默认 60）

## 核心架构

### 分层结构

```
lib/
├── types/              # 统一类型定义（从 index.ts 统一导出）
├── providers/          # Provider 检查逻辑（统一使用 Vercel AI SDK）
│   ├── index.ts       # 入口：runProviderChecks() 批量执行
│   ├── ai-sdk-check.ts # 核心：统一的 AI SDK 检查实现（支持所有 Provider）
│   ├── challenge.ts   # 数学挑战验证
│   └── endpoint-ping.ts # Ping 延迟测量
├── database/           # 数据库操作（Supabase）
│   ├── config-loader.ts # 配置加载
│   ├── history.ts     # 历史记录写入与清理
│   ├── availability.ts # 可用性统计查询
│   ├── group-info.ts  # 分组元数据
│   ├── notifications.ts # 系统通知
│   └── poller-lease.ts # 轮询器租约管理
├── core/               # 核心协调模块
│   ├── poller.ts      # 后台轮询器（模块加载时自动启动）
│   ├── poller-leadership.ts # 多节点数据库租约选主
│   ├── global-state.ts # 全局状态（防 Next.js 热重载重复定时器）
│   ├── health-snapshot-service.ts # 快照缓存服务
│   ├── dashboard-data.ts # Dashboard 数据聚合
│   ├── group-data.ts  # 分组数据处理
│   ├── official-status-poller.ts # OpenAI/Anthropic 官方状态轮询
│   ├── status.ts      # 状态元数据与 Provider 标签
│   ├── polling-config.ts # 轮询配置
│   ├── frontend-cache.ts # 前端缓存逻辑
│   └── group-frontend-cache.ts # 分组前端缓存
├── official-status/    # 官方状态抓取（openai.ts、anthropic.ts）
├── utils/              # 工具函数
│   ├── error-handler.ts # 统一错误处理：logError()
│   ├── url-helpers.ts # URL 处理
│   ├── cn.ts          # Tailwind className 合并
│   ├── cache-key.ts   # 缓存键生成
│   ├── client-cache.ts # 客户端缓存
│   └── time.ts        # 时间工具
└── supabase/          # Supabase 客户端
    ├── client.ts      # 浏览器端
    ├── server.ts      # 服务器端（SSR + cookies）
    ├── admin.ts       # 管理员（绕过 RLS）
    └── middleware.ts  # 会话中间件
```

### 关键设计：统一 AI SDK 检查

所有 Provider 检查通过 `lib/providers/ai-sdk-check.ts` 统一处理，使用 Vercel AI SDK 的适配器模式（`createOpenAI`、`createAnthropic`、`createOpenAICompatible`），而非为每个 Provider 编写独立文件。该模块处理：
- 流式响应（首 token 即判定可用）
- 超时控制（45 秒）
- 性能阈值（≤6000ms operational，>6000ms degraded）
- 推理模型特殊处理（o1/o3/deepseek-r1 的 `reasoning_effort` 参数）
- 自定义请求头和 metadata 注入

### 后台轮询系统

- **入口**: `lib/core/poller.ts` 模块加载时立即启动轮询
- **全局状态**: `lib/core/global-state.ts` 管理定时器，防 Next.js 热重载重复创建
- **并发控制**: `__checkCxPollerRunning` 标志位防重叠执行
- **选主**: `lib/core/poller-leadership.ts` 数据库租约，多节点仅单节点执行
- **官方状态**: `lib/core/official-status-poller.ts` 定时抓取 OpenAI/Anthropic 状态

### API 路由

- `/api/dashboard` - Dashboard 数据（ETag + CDN 缓存）
- `/api/group/[groupName]` - 分组数据
- `/api/v1/status` - 对外只读状态 API
- `/api/notifications` - 系统通知
- `/api/internal/cache-metrics` - 缓存性能指标

### 数据流

```
后台轮询: poller.ts → providers/ai-sdk-check.ts → database/history.ts → Supabase
前端展示: Supabase → dashboard-data.ts → app/page.tsx → dashboard-view.tsx
实时刷新: 前端定时器 → /api/dashboard → health-snapshot-service.ts
```

### 前端页面

- `app/page.tsx` - 主 Dashboard（SSR，`refreshMode: "missing"`）
- `app/group/[groupName]/page.tsx` - 分组详情页
- `components/dashboard-view.tsx` - 客户端定时轮询 `/api/dashboard`
- `components/dashboard-bootstrap.tsx` / `group-dashboard-bootstrap.tsx` - 引导组件

### 数据库表

核心表：`check_configs`（配置）、`check_history`（历史记录）、`group_info`（分组信息）、`system_notifications`（系统通知）、`check_poller_leases`（轮询器租约，单行表）

关键视图/RPC：`availability_stats`（7/15/30 天可用性）、`get_recent_check_history`、`prune_check_history`（每配置最多保留 60 条）

配置通过 SQL 在 Supabase 中管理，不使用环境变量。参见 `docs/OPERATIONS.md` 获取完整 SQL 示例。

## 添加新的 AI Provider

由于使用统一的 Vercel AI SDK 架构，添加新 Provider 的步骤：

1. 在 `lib/types/provider.ts` 中添加 `ProviderType` 类型值
2. 在 `lib/providers/ai-sdk-check.ts` 的 provider 创建逻辑中添加新的 SDK 适配器分支
3. 在 `lib/providers/index.ts` 的 `checkProvider()` switch 中添加分支
4. 在 `lib/core/status.ts` 的 `PROVIDER_LABEL` 中添加显示名称
5. 在 `components/provider-icon.tsx` 中添加对应图标

## 开发约定

- 默认使用 Server Components，仅在需要时添加 `"use client"`
- 所有类型从 `lib/types/index.ts` 统一导出
- 遵循 Conventional Commits：`feat:`、`fix:`、`chore:`、`refactor:`、`docs:`
- 统一错误处理使用 `lib/utils/error-handler.ts` 的 `logError()`
- 配置变更通过数据库操作，无需重启应用

## 扩展文档

- `docs/ARCHITECTURE.md` - 架构设计说明
- `docs/OPERATIONS.md` - 运维手册（含完整 SQL 配置示例）
- `docs/EXTENDING_PROVIDERS.md` - Provider 扩展指南
- `openspec/AGENTS.md` - OpenSpec 规范与提案流程
