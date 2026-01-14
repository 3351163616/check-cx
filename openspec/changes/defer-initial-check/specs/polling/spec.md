## ADDED Requirements

### Requirement: 推迟首次检测

轮询器初始化时 SHALL NOT 立即执行检测，MUST 等待第一个轮询周期到达后再执行首次检测。

#### Scenario: 应用启动后等待首次检测
- **WHEN** 应用启动且轮询器初始化完成
- **THEN** 不立即执行检测
- **AND** 在第一个轮询周期（`POLL_INTERVAL_MS`）到达后执行首次检测

#### Scenario: 启动日志明确提示
- **WHEN** 轮询器初始化完成
- **THEN** 日志输出 MUST 包含首次检测的预计执行时间
