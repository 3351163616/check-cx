## Check CX

Check CX 是一套基于 Next.js + shadcn/ui 的 AI 对话健康面板，用于持续监控 OpenAI、Gemini、Anthropic 等模型的 API 可用性、延迟与错误信息，可直接部署为落地页或团队内部状态墙。

### 功能亮点

- 🎯 **多目标配置**：通过 `.env` 声明端点、密钥、类型与模型，支持任意数量的检测组
- ⏱️ **分钟级采样**：Node 侧常驻轮询器按配置频率触发对话请求，并将 1 小时内的状态写入本地缓存
- ⚙️ **可调频率**：`CHECK_POLL_INTERVAL_SECONDS` 支持 15~600 秒自定义检测周期（默认 60 秒）
- 📈 **时间轴视图**：每个配置都会渲染独立时间轴，可快速对比 60 次内的成功/失败/延迟
- 🔒 **安全默认**：密钥仅在服务器侧读取并用于后端请求，不会透传到浏览器

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
- 检测结果会写入 `data/check-history.json`，默认仅保留最近 1 小时（最多 60 条）记录，用于渲染时间轴。
- `data/check-history.json` 已加入 `.gitignore`，不会将历史数据或调试密钥提交到仓库。

## 环境变量格式

使用 `CHECK_GROUPS` 指定需要检测的配置标识（英文逗号分隔）。除默认变量外，每个标识都需要以下字段：

| 变量名                         | 说明                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `CHECK_POLL_INTERVAL_SECONDS` | (可选) 全局检测间隔（单位秒，默认 60，支持 15~600）                                |
| `CHECK_<ID>_NAME`             | (可选) 展示名称，缺省时使用标识本身                                                |
| `CHECK_<ID>_TYPE`             | 提供商类型：`openai` / `gemini` / `anthropic`                                       |
| `CHECK_<ID>_KEY`              | 对应提供商的 API Key                                                                |
| `CHECK_<ID>_MODEL`            | 模型名称，如 `gpt-4o-mini`、`gemini-1.5-flash`、`claude-3-5-sonnet-latest`         |
| `CHECK_<ID>_ENDPOINT`         | (可选) 自定义端点，未配置时使用官方默认地址，可指向代理或企业专线                  |

示例：

```
CHECK_POLL_INTERVAL_SECONDS=60
CHECK_GROUPS=main,backup,gemini,claude

CHECK_MAIN_NAME=主力 OpenAI
CHECK_MAIN_TYPE=openai
CHECK_MAIN_KEY=sk-xxxxx
CHECK_MAIN_MODEL=gpt-4o-mini
CHECK_MAIN_ENDPOINT=https://api.openai.com/v1/chat/completions

CHECK_BACKUP_NAME=备用 OpenAI
CHECK_BACKUP_TYPE=openai
CHECK_BACKUP_KEY=sk-yyyyy
CHECK_BACKUP_MODEL=gpt-4o-mini
CHECK_BACKUP_ENDPOINT=https://api.openai.com/v1/chat/completions

CHECK_GEMINI_NAME=Gemini 备份
CHECK_GEMINI_TYPE=gemini
CHECK_GEMINI_KEY=ya29.xxxxx
CHECK_GEMINI_MODEL=gemini-1.5-flash
CHECK_GEMINI_ENDPOINT=https://generativelanguage.googleapis.com/v1beta

CHECK_CLAUDE_NAME=Claude 回退
CHECK_CLAUDE_TYPE=anthropic
CHECK_CLAUDE_KEY=sk-ant-xxxxx
CHECK_CLAUDE_MODEL=claude-3-5-sonnet-latest
```

保存 `.env.local` 后刷新页面即可看到实时的 API 可用性结果。
