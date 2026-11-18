# QA：端到端用例

> 用 Playwright 驱动真实 Electron 应用，覆盖跨进程链路。**`qa/` 是端到端测试资产的唯一入口**，已知场景与缺口清单见 [test-cases/](./test-cases/)，通用工程准则见 [AGENTS.md](../AGENTS.md)。

## 1. 定位与分层

- **测什么**：单元测试覆盖不到的跨进程与端到端链路——真实界面交互 → preload IPC → 主进程 → SQLite / 配置文件 / HTTP 服务 / 原生打包产物。
- **不测什么**：纯函数、服务层逻辑、独立组件交互由 Vitest 覆盖，不在此重复。

## 2. 运行与 CI 分层

统一走 `package.json` 脚本：

```bash
pnpm run test:e2e                     # 全部源构建用例（workers: 1，每条独立进程）
pnpm run test:e2e:smoke               # PR 门禁的 @smoke 子集
pnpm run test:e2e:packaged            # 打包（QA fuses）+ 真实打包产物冒烟
pnpm exec playwright test -c qa/playwright.config.ts --list   # 只列用例（不启动应用）
pnpm run qa:check-locators            # 定位器最佳实践检查
pnpm run qa:check-cases               # 已登记场景与缺口的双向一致性校验
pnpm run qa:check-scroll              # 播放器滚动锚定差分检查（JSON + 语义化退出码）
```

- **首次安装**：`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install`（复用 Electron 二进制）；媒体夹具由 `qa/fixtures/make-fixtures.mjs` 生成，需要本机存在 `ffmpeg` / `ffprobe`。
- **自动备料与防伪造**：`qa/support/globalSetup.ts` 校验 `.vite/.qa-build-manifest.json`，按需原子重建 `.vite` 与 `resources/mobile` 并生成媒体夹具；fixture 断言首窗口 URL 为 `file:`，防止本地 dev server 冒充生产入口。
- **CI 分层**：PR 运行 `verify` + `@smoke`（xvfb）；`main` 推送 / `v*` tag / 手动触发运行 `verify` + 全量 E2E；[e2e-nightly.yml](../.github/workflows/e2e-nightly.yml) 覆盖全量与真实打包产物冒烟。失败自动上传截图、JUnit、HTML 报告与脱敏后的 `runtime-evidence.json`（含进程退出、主进程日志尾部与配置快照）。

## 3. 运行隔离与环境差异

- **源构建态 vs 打包态**：正式打包关闭了 `--inspect`；源构建 E2E 用 `electron .` 读取 `.vite/` 生产 bundle 运行（日常交互开发用 `pnpm run start`）；打包态由 `qa/playwright.packaged.config.ts` + `forge.qa.config.ts`（仅开启 `EnableNodeCliInspectArguments` fuse，其余 ASAR / extraResource 与发布一致）单独覆盖。
- **隔离原则**：每个用例独占临时 `--user-data-dir=${dir}` 并于启动后校验隔离生效；设置页与播放页等用例在 fixture 内通过真实 IPC `system/config/set` 写入引导完成标记并刷新，引导界面本身由 `SET-ONB-01` 真实覆盖。

| 目录项 | 打包生产态 | 源构建 E2E（开发态） |
|---|---|---|
| 数据库 | `data/dp_db.sqlite3` | `data-dev/dp_db.sqlite3` |
| 日志 | `logs/` | `logs-dev/` |
| 配置 | `config.json` | `config.dev.json` |

## 4. 基建 API 与公共辅助

### 会话与持久化断言（`qa/support/fixtures.ts`）

| 导出 | 用途 |
|---|---|
| `test` | 扩展后的 `test`，提供 `session` / `openSession` / `userDataDir` |
| `session` | 已越过引导并进入主界面的单会话应用实例 |
| `openSession(opts?)` | 会话工厂，用于引导（`{ skipOnboarding: false }`）或重启/多会话验证 |
| `userDataDir` | 用例独占的临时 `userData` 目录，测试结束后自动清理 |
| `readConfigValue(userDataDir, 'a.b')` | 读取配置文件嵌套 JSON 值（如 `appearance.theme`） |
| `isSecretPersisted(userDataDir, 'a.b', raw)` | 判断敏感凭据是否落盘（兼容 `safeStorage` 密文与明文回退） |

```typescript
// 重启验证：两次 openSession() 共享同一 userDataDir
const first = await openSession();
// ...操作与落盘断言...
await first.close();
const restarted = await openSession();
```

### 页面与夹具辅助

| 模块 | 导出 | 用途 |
|---|---|---|
| `qa/support/settings-page.ts` | `openSettingsSection` / `switchSettingsSection` / `reloadSettingsPage` | 进入设置栏目、跨栏目直接切换（验防抖 flush）、页内重加载回读 |
| `qa/support/settings-page.ts` | `selectInRow` / `chooseInRow` | 按 `SETTING_ROW_TESTIDS` 行键定位下拉控件并选值 |
| `qa/support/player-entry.ts` | `QA_FIXTURE_VIDEO` / `navigateToFixturePlayer` | 通过真实 `watch-history/create` 入口直达双语夹具播放页（支持 `seek` / `lang`） |

> 保留 `openSettingsSection` 与 `switchSettingsSection` 分离，是为了让“改完立刻切走”的时机用例只经历一次直达切换，避免多余导航掩盖未冲刷的缓存。

## 5. 用例设计指南（Playwright 最佳实践）

按场景形态自行组织清晰可读的端到端测试（参考 `qa/specs/` 下的 `settings/`、`app/`、`player/` 现有用例）：

1. **配置持久化场景**：建议包含**操作控件 → 落盘断言（`expect.poll`）→ 重载或切走切回回读**，确保不是“界面假改”；失败路径应同时断言页面可见错误提示（设置页通常定位 `page.getByRole('main').getByRole('alert')`，避开全局 live-region）且旧配置未被覆盖。
2. **业务流转与跨页旅程**：直接验证跨模块可观测行为（如入库 → 播放推进与字幕渲染、跨路由联动、移动端 Web 页面状态与响应），按业务目标设计断言，不必硬套设置页模板。
3. **定位策略与多语言环境**：
   - 优先使用 `getByRole` / `getByLabel` / `getByTestId`（集中定义见 [qa-testids.ts](../src/common/constants/qa-testids.ts)），以及 `aria-pressed` / `aria-checked` 等语义属性。
   - 当原生无 ARIA 元素（如 `<video>`、`<canvas>`、`<svg>`、`input[type="file"]`）确需标签定位时，先用语义父定位器锚定容器，再链式局部收窄（如 `container.locator('video')`），保留 Playwright 自动等待与重试能力。
   - 应用支持 `zh-CN` / `en-US` 且默认跟随系统语言；涉及多语言环境运行的新用例，优先使用稳定的 `data-testid` / 正则双语匹配，或在会话内显式固定界面语言。
4. **播放器确定性入口与滚动埋点（`qa/specs/player/`）**：
   - 仅在 `system/info.devMode` 为真时生效：`#/player/<任意>?file=<绝对路径>&seek=<秒>&lang=<en|zh>`；`window.__dpDebug` 与 `window.__dpPolicy` 详见 `qa/support/scroll-anchor-protocol.ts` 与 [player-scroll-protocol.ts](../src/common/constants/player-scroll-protocol.ts)。
   - 真实滚轮交互请使用 `page.mouse.wheel`（而非直接改 `scrollTop`），虚拟列表锚点请基于节点 `data-index` 判断而非写死像素偏移。
   - `pnpm run qa:check-scroll` 退出码约定：**0 通过 / 1 断言失败 / 3 空观测 / 4 Node 与 `.nvmrc` 不一致或埋点缺失**。

## 6. 工程约束与评审原则

### 自动化门禁（CI 拦截）
- **模块边界**（[eslint.config.mjs](../eslint.config.mjs)）：`qa/**` 只允许 import `@/common/**`，禁止直接耦合 `@/frontend/**` 或 `@/backend/**`；`src/**` 禁止 import `qa/**`。
- **定位器检查**（`pnpm run qa:check-locators`）：禁止已废弃的 `$()` / `$$()`、直接从 `page` / `frame` 根节点调用 `.locator()`，以及 `.locator('.class')` / `.locator('#id')` 脆弱选择器；放行先经语义定位器锚定后的局部子元素收窄。
- **场景一致性校验**（`pnpm run qa:check-cases`）：禁止提交顶层 `test.only`/`test.skip`/`test.fixme` 或 `test.describe.skip`（合法的运行时环境守卫请使用 `test.skip(condition, reason)`）；凡在 `qa/test-cases/` 登记或标题标注了 `[DOMAIN-SCOPE-NN]` 场景 ID 的用例，必须与文档双向一致。

### 评审原则（防假绿，不限发挥）
1. **零内部 Mock、零状态复用**：不 mock IPC / 仓储 / 服务；每条用例独占进程与 `userDataDir`。
2. **禁止掩盖信号**：不用 `if (...)` 跳过真实操作或吞掉失败断言，不用固定 `waitForTimeout` / `sleep` 赌时序；需要轮询或步骤重试时用 `expect.poll(...)` / `toPass()` 显式收口。
3. **非必要不跳过**：仅保留明确跨平台限制的条件跳过（如 `SET-STO-02` 在 Windows 与 Linux `root` 下无法靠 `chmod 0o500` 拦截写入）。
4. **禁止 test-only 业务分支**：不往产品逻辑塞测试假数据；调试入口严格受 `devMode` 约束，打包态零暴露。

## 7. 已知运行时陷阱

- **`NODE_ENV` 不能解锁 dev 能力**：`runtimeEnv.isDevelopmentMode()` 只认 `!app.isPackaged || Boolean(process.defaultApp)`（`SET-PKG-01` 守卫）。
- **Chromium 开关必须 `--flag=value`**：写成分离两个 token 会导致 `--user-data-dir` 静默失效并污染本机目录；fixture 另配 `assertUserDataIsolated` 兜底。
- **GPU 默认关闭（`--disable-gpu`）**：规避 Linux/Wayland NVIDIA 上游崩溃，需要验证 GPU 硬件路径时设 `QA_DISABLE_GPU=0`。若 `launch()` 卡在 `Debugger listening`（外设或 GPU 进程原因），全局超时 180s / launch 上限 120s 已留余量。
- **配置为嵌套 JSON 且同值不落盘**：`appearance.theme` 存为 `{"appearance":{"theme":"dark"}}`；`storeSet` 在写入值等于当前或默认值时跳过写盘，故默认值键在 `config.dev.json` 中不存在，需先改非默认再断言落盘（快捷键支持空字符串解绑）。
- **自动保存表单需传 `detailKey`**：`useAutoSaveSettingsForm` 通过 `detailKey` 刷新 SWR 缓存，漏传会导致短时间切走切回显示旧缓存。
- **存储路径自动追加 `-dev` 后缀**：`resolveStorageRootPath` 校验前追加环境后缀，故测试写入失败必须设只读父目录（`chmod 0o500`），不能靠写不存在的路径名。
