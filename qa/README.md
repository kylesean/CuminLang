# QA：端到端测试（Playwright + Electron）

> 覆盖单元测试触达不到的跨进程链路：真实 UI → preload IPC → 主进程 → SQLite / 配置文件 / HTTP 服务 / 原生打包边界。
> 通用工程原则见 [AGENTS.md](../AGENTS.md)；尚未自动化或需人工验证的缺口见 [BACKLOG.md](./BACKLOG.md)。

## 目录结构

```text
qa/
├── fixtures/   # 媒体夹具与生成脚本（make-fixtures.mjs，需本机 ffmpeg / ffprobe）
├── pages/      # Page Objects（SettingsPage / PlayerPage）：只封装语义定位与交互，断言留在 spec
├── specs/      # 可执行活规格（app/、settings/、player/、packaged/，支持按需新增跨页旅程目录）
├── support/    # Electron 进程启停、userData 隔离、配置读断言、globalSetup、runtime-evidence
└── tools/      # 播放器滚动锚定差分协议验证（check-player-scroll.mjs）
```

## 常用命令

```bash
pnpm run test:e2e                     # 全量源构建 E2E（workers: 1，每条独立进程）
pnpm run test:e2e:smoke               # PR 门禁的 @smoke 核心冒烟
pnpm run test:e2e:packaged            # 打包（QA fuses）+ 真实打包产物冒烟
pnpm exec playwright test -c qa/playwright.config.ts --list   # 列出全部真实用例
pnpm run qa:check-scroll              # 播放器滚动锚定差分实验（0 通过 / 1 失败 / 3 空观测 / 4 缺埋点）
```

## 运行隔离与基建 API（`qa/support/fixtures.ts`）

* **自动备料与防伪造**：`globalSetup.ts` 校验 `.vite/.qa-build-manifest.json` 并按需原子重建 `.vite` 与 `resources/mobile`；fixture 校验首窗口为 `file:` 协议、每条用例独占临时 `--user-data-dir`，并自动跳过首次引导（引导本身由 [onboarding.spec.ts](./specs/app/onboarding.spec.ts) 覆盖）。
* **Fixtures 注入**：`test` 自动提供 `{ session, openSession, settingsPage, playerPage, userDataDir }`；打包态 [packaged-fixtures.ts](./support/packaged-fixtures.ts) 提供 `{ session, settingsPage, userDataDir }`。
* **持久化读取**：`readConfigValue(userDataDir, 'a.b')`、`isSecretPersisted(userDataDir, 'a.b', raw)`、`readProviderProfile(userDataDir, id)`。
* **多会话重启**：共享同一个 `userDataDir` 多次调用 `await openSession()`，再对比落盘与回显。

| 运行目录 | 打包生产态 | 源构建 E2E（开发态） |
|---|---|---|
| 数据库 | `data/dp_db.sqlite3` | `data-dev/dp_db.sqlite3` |
| 日志 | `logs/` | `logs-dev/` |
| 配置 | `config.json` | `config.dev.json` |

## 编写原则与标杆范例

静态检查与边界规则直接由 [eslint.config.mjs](../eslint.config.mjs)（`eslint-plugin-playwright` + `no-restricted-imports`）和 `tsconfig.json` 强制保障。只需守住三条工程底线：**零内部 Mock（不 mock IPC/仓储/服务）、零状态复用、不往业务代码塞 test-only 假逻辑**（调试入口严格受 `devMode` 约束）。

* **配置持久化与失败路径**：[proxy-settings.spec.ts](./specs/settings/proxy-settings.spec.ts)
* **跨页播放器流转（POM 用法）**：[playback-golden-path.spec.ts](./specs/player/playback-golden-path.spec.ts)
* **多语言与定位提示**：应用支持 `zh-CN` / `en-US` 且默认跟随系统语言，优先使用 `data-testid`（[qa-testids.ts](../src/common/constants/qa-testids.ts)）或双语正则定位；对 `<video>` / `<canvas>` / `input[type="file"]` 等无 ARIA 元素，先锚定语义父容器再局部 `.locator(...)`。

## 已知 Electron 运行时陷阱

* **`NODE_ENV` 不能解锁 dev 能力**：`runtimeEnv.isDevelopmentMode()` 只认 `!app.isPackaged || Boolean(process.defaultApp)`（见 [packaged-smoke.spec.ts](./specs/packaged/packaged-smoke.spec.ts)）。
* **Chromium 开关必须 `--flag=value`**：拆成两个 token 会导致 `--user-data-dir` 静默失效并污染本机目录。
* **GPU 默认关闭（`--disable-gpu`）**：规避 Linux/Wayland NVIDIA 上游崩溃，需要验证 GPU 路径时设 `QA_DISABLE_GPU=0`；`launch()` 超时已留足 120s（全局 180s）。
* **同值配置不写盘**：`storeSet` 在写入值等于当前或默认值时跳过写盘，默认值在 `config.dev.json` 中不存在，需先改非默认再断言持久化（快捷键支持空串解绑）。
* **自动保存表单需传 `detailKey`**：`useAutoSaveSettingsForm` 依赖 `detailKey` 刷新 SWR 缓存，漏传会导致切走切回显示过期值。
* **存储路径自动追加 `-dev` 后缀**：`resolveStorageRootPath` 校验前追加环境后缀，测写入失败须设只读父目录（`chmod 0o500`，见 [storage-settings.spec.ts](./specs/settings/storage-settings.spec.ts)）。
