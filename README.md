## Check CX

Check CX 是一套基于 Next.js + shadcn/ui 的 AI 对话健康面板，用于持续监控 OpenAI、Gemini、Anthropic 等模型的 API 可用性、延迟与错误信息，可直接部署为落地页或团队内部状态墙。

### 功能亮点

- 🎯 **多目标配置**:通过数据库管理端点、密钥、类型与模型,支持任意数量的检测组
- ⏱️ **分钟级采样**:Node 侧常驻轮询器按配置频率触发对话请求,并将 1 小时内的状态写入 Supabase
- ⚙️ **可调频率**:`CHECK_POLL_INTERVAL_SECONDS` 支持 15~600 秒自定义检测周期(默认 60 秒)
- 📈 **时间轴视图**:每个配置都会渲染独立时间轴,可快速对比 60 次内的成功/失败/延迟
- 🔒 **安全默认**:密钥仅在服务器侧读取并用于后端请求,不会透传到浏览器

## 快速开始

1. 安装依赖

   ```bash
   pnpm install
   ```

2. 复制并修改环境变量

   ```bash
   cp .env.example .env.local
   ```

3. 启动本地开发

   ```bash
   pnpm dev
   ```

4. 访问 [http://localhost:3000](http://localhost:3000) 查看状态面板。

## 数据采集与存储

- 所有检测均由服务器发起：`lib/poller.ts` 会在进程启动后立即检测一次，并按 `CHECK_POLL_INTERVAL_SECONDS` 间隔持续轮询（默认 60 秒，可自定义）。
- 历史记录由 `lib/history-store.ts` 负责写入 Supabase 的 `check_history` 表，并只查询最近 1 小时内的数据用于渲染时间轴。
- 每个提供商最多保留 60 条记录，写入时会自动清理更旧的条目，因此历史数据始终维持在 60 份以内。

## 环境变量配置

在 `.env` 中配置 Supabase 连接参数和轮询间隔:

| 变量名 | 说明 |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL,负责读取/写入历史记录 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` | Supabase publishable/anon key,用于访问数据库 |
| `CHECK_POLL_INTERVAL_SECONDS` | (可选) 全局检测间隔(单位秒,默认 60,支持 15~600) |

示例 `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-public-or-anon-key
CHECK_POLL_INTERVAL_SECONDS=60
```

## 数据库配置管理

CHECK 配置已从环境变量迁移到 Supabase 数据库的 `check_configs` 表。通过数据库管理配置可以动态启用/禁用检测,无需重启应用。

### 配置表结构

`check_configs` 表包含以下字段:

| 字段 | 类型 | 说明 |
| ---------- | ------- | -------------------------------------------- |
| `id` | UUID | 配置 UUID,自动生成的唯一标识符 |
| `name` | TEXT | 显示名称(如"主力 OpenAI") |
| `type` | TEXT | 提供商类型:`openai` / `gemini` / `anthropic` |
| `model` | TEXT | 模型名称(如 `gpt-4o-mini`) |
| `endpoint` | TEXT | API 端点 URL |
| `api_key` | TEXT | API 密钥 |
| `enabled` | BOOLEAN | 是否启用该配置 |

### 添加配置

在 Supabase SQL Editor 中执行以下命令添加新配置:

```sql
-- OpenAI 配置 (id 会自动生成 UUID)
INSERT INTO check_configs (name, type, model, endpoint, api_key, enabled)
VALUES (
  '主力 OpenAI',
  'openai',
  'gpt-4o-mini',
  'https://api.openai.com/v1/chat/completions',
  'sk-your-openai-key',
  true
);

-- Gemini 配置
INSERT INTO check_configs (name, type, model, endpoint, api_key, enabled)
VALUES (
  'Gemini 备份',
  'gemini',
  'gemini-1.5-flash',
  'https://generativelanguage.googleapis.com/v1beta',
  'your-gemini-key',
  true
);

-- Anthropic Claude 配置
INSERT INTO check_configs (name, type, model, endpoint, api_key, enabled)
VALUES (
  'Claude 回退',
  'anthropic',
  'claude-3-5-sonnet-latest',
  'https://api.anthropic.com/v1/messages',
  'your-anthropic-key',
  true
);
```

### 管理配置

```sql
-- 查看所有配置
SELECT id, name, type, model, enabled FROM check_configs;

-- 禁用某个配置 (使用 UUID)
UPDATE check_configs SET enabled = false WHERE id = 'your-uuid-here';

-- 启用某个配置 (使用名称更方便)
UPDATE check_configs SET enabled = true WHERE name = '主力 OpenAI';

-- 更新配置
UPDATE check_configs
SET model = 'gpt-4o', endpoint = 'https://new-endpoint.com/v1/chat/completions'
WHERE name = '主力 OpenAI';

-- 删除配置 (使用名称)
DELETE FROM check_configs WHERE name = '旧配置';
```
