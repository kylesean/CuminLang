# QA：端到端用例

> 用 Playwright 驱动真实 Electron 应用，覆盖跨进程链路。**`qa/` 是端到端测试资产的唯一入口**：规范、代码、夹具与场景清单均收口在此。
> **测什么（场景清单与缺口）见 [test-cases/](./test-cases/)**；通用工程规则见根目录 [AGENTS.md](../AGENTS.md)。

## 1. 定位

- **测什么**：单元测试覆盖不到的跨进程链路——真实界面操作 → preload IPC → 主进程 → 数据库 / 配置文件 / 原生打包边界。
- **不测什么**：纯函数、服务层逻辑、独立组件交互由 Vitest 覆盖；不重复编写 E2E，也不测第三方库本身。

## 2. 运行与 CI 分层

统一走 `package.json` 脚本：

```bash
pnpm run test:e2e                     # 全部源构建用例（workers: 1，每条独立进程）
pnpm run test:e2e:smoke               # PR 门禁的 @smoke 子集
pnpm run test:e2e:packaged            # 打包（QA fuses）+ 真实打包产物冒烟
pnpm exec playwright test -c qa/playwright.config.ts --list   # 只列用例（不启动应用）
pnpm run qa:check-locators            # 禁止 CSS/tag 定位器的静态检查
pnpm run qa:check-cases               # 用例文档 ↔ spec 用例 ID 双向校验
pnpm run qa:check-scroll              # 播放器滚动锚定差分检查（JSON + 语义化退出码）
```

- **首次安装**：`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install`（复用 Electron 二进制，无需 Playwright 自带 Chromium）；首次启动缺二进制时会自动下载。媒体夹具由 `qa/fixtures/make-fixtures.mjs` 生成，需要本机存在 `ffmpeg` / `ffprobe`。
- **全自动备料与防伪造**：`qa/support/globalSetup.ts` 校验 `.vite/.qa-build-manifest.json`（含 `mode`、输入摘要与产物摘要）、按需原子重建 `.vite` 与 `resources/mobile`、并生成媒体夹具；fixture 再断言首窗口 URL 为 `file:`，防止本地 dev server 冒充生产入口。
- **CI 分层**：PR 运行 `verify` + `@smoke`（xvfb）；`main` 推送 / `v*` tag / 手动触发运行 `verify` + 全量 E2E；[e2e-nightly.yml](../.github/workflows/e2e-nightly.yml) 手动触发全量 + 真实打包产物冒烟。失败自动上传截图、JUnit、HTML 报告与 `runtime-evidence.json`（含进程退出、主进程日志尾部与脱敏配置快照）。

## 3. 工作原理

- **源构建态 vs 打包态**：正式打包产物关闭了 `--inspect`，日常开发用 `electron .` 读取 `.vite/` 生产 bundle 运行；打包产物由 `qa/playwright.packaged.config.ts` + `forge.qa.config.ts`（仅开启 `EnableNodeCliInspectArguments` fuse，其余 ASAR/extraResource 与发布一致）单独覆盖。
- **数据隔离与唯一 bootstrap 例外**：每个用例独占临时 `--user-data-dir=${dir}` 并于启动后校验隔离生效；设置页/播放器用例通过真实 IPC `system/config/set` 写入引导完成标记并 `page.reload()` 跳过引导（引导 UI 本身由 `SET-ONB-01` 真实覆盖）。

| 目录项 | 打包生产态 | 源构建 E2E（开发态） |
|---|---|---|
| 数据库 | `data/dp_db.sqlite3` | `data-dev/dp_db.sqlite3` |
| 日志 | `logs/` | `logs-dev/` |
| 配置 | `config.json` | `config.dev.json` |

## 4. 基建 API 与公共辅助

### 会话与配置断言（`qa/support/fixtures.ts`）

| 导出 | 用途 |
|---|---|
| `test` | 扩展后的 test，提供 `session` / `openSession` / `userDataDir` 三个 fixture |
| `session` | 已越过引导并进入主界面的应用会话（单会话用例直接使用） |
| `openSession(opts?)` | 会话工厂，用于引导（`{ skipOnboarding: false }`）或重启/多会话场景，同样受进程崩溃与证据采集监控 |
| `userDataDir` | 用例独占的临时 userData 目录，测试结束后自动清理 |
| `readConfigValue(userDataDir, 'a.b')` | 按点号路径读取配置文件中的嵌套 JSON 值（如 `appearance.theme`） |
| `isSecretPersisted(userDataDir, 'a.b', raw)` | 判断敏感凭据是否已落盘（兼容 `safeStorage` 密文或明文降级） |

```typescript
// 重启场景示例：两次调用 openSession() 共享同一个 userDataDir
const first = await openSession();
// ...操作与落盘断言...
await first.close();
const restarted = await openSession();
```

### 设置页与播放页公共工具

| 模块 | 导出 | 用途 |
|---|---|---|
| `qa/support/settings-page.ts` | `openSettingsSection` / `switchSettingsSection` / `reloadSettingsPage` | 进入设置栏目、跨栏目直接切换（验防抖 flush）、页内重加载回读 |
| `qa/support/settings-page.ts` | `selectInRow` / `chooseInRow` | 按 `SETTING_ROW_TESTIDS` 行键定位下拉框并选值 |
| `qa/support/player-entry.ts` | `QA_FIXTURE_VIDEO` / `navigateToFixturePlayer` | 通过真实 `watch-history/create` 入口直达双语夹具播放页（支持 `seek` / `lang`） |

> 保留 `openSettingsSection` 与 `switchSettingsSection` 分离，是为了让“改完立刻切走”的时机用例只经历一次直达切换，避免多余导航掩盖未冲刷的缓存问题。

## 5. 新增 / 修改用例指南

**按页面形态挑最近的示例直接参考：**

- 按钮 / 档位与切走时机：[appearance-settings.spec.ts](./specs/settings/appearance-settings.spec.ts)（如 `SET-APP-09`）
- 文本输入与权限失败路径：[proxy-settings.spec.ts](./specs/settings/proxy-settings.spec.ts)、[storage-settings.spec.ts](./specs/settings/storage-settings.spec.ts)
- 下拉框 / 模型管理：[service-resource-settings.spec.ts](./specs/settings/service-resource-settings.spec.ts)
- 弹窗录制 / 搜索过滤：[shortcut-settings.spec.ts](./specs/settings/shortcut-settings.spec.ts)
- 服务开关 + 跨端 HTTP：[mobile-access-settings.spec.ts](./specs/settings/mobile-access-settings.spec.ts)
- 应用外壳与播放链路：[renderer-security.spec.ts](./specs/app/renderer-security.spec.ts)、[playback-golden-path.spec.ts](./specs/player/playback-golden-path.spec.ts)

**编写套路：**

1. **三段式持久化断言**（防“页面改了但没保存”）：① 操作控件 → ② `expect.poll(() => readConfigValue(...))` 断言真写盘 → ③ `reloadSettingsPage`（或 `switchSettingsSection` 切走切回）断言来自后端回读的回显。
2. **失败路径必填两条断言**：先构造后端必然拒绝的输入，断言 `page.getByRole('main').getByRole('alert')` 可见并包含拒绝原因，**同时断言配置文件旧值未被覆盖**（限定 `main` 是为了避开 `@astryxdesign/core` 全局隐藏的 live-region `alert`）。
3. **语义定位优先**：容器/行/导航卡片用集中定义的 `data-testid`（[qa-testids.ts](../src/common/constants/qa-testids.ts)）；输入框、按钮、开关、tab、dialog 用 `getByLabel` / `getByRole(..., { name })`；状态判断认 `aria-pressed` / `aria-checked` 等语义属性，不用 class。

新设置页用例最小骨架（先在 `qa/test-cases/<page>.md` 写场景并挂 `- 用例：**[SET-XXX-01]**`）：

```typescript
import { expect, type Page } from '@playwright/test';
import { readConfigValue, test } from '../../support/fixtures';
import { openSettingsSection, reloadSettingsPage } from '../../support/settings-page';

async function openXxxSetting(page: Page): Promise<void> {
    await openSettingsSection(page, 'xxx', page.getByRole('heading', { name: 'xxx' }));
}

test.describe('xxx 设置', () => {
    test('[SET-XXX-01] 填完 xxx 后落盘，重进页面仍回显', async ({ session, userDataDir }) => {
        const page = session.page;
        await openXxxSetting(page);

        const field = page.getByRole('textbox', { name: '字段名称' });
        await field.fill('要保存的值');

        await expect.poll(() => readConfigValue(userDataDir, 'xxx.yyy')).toBe('要保存的值');

        await reloadSettingsPage(page, page.getByRole('heading', { name: 'xxx' }));
        await expect(page.getByRole('textbox', { name: '字段名称' })).toHaveValue('要保存的值');
    });
});
```

### 播放器页：确定性入口与滚动埋点（`qa/specs/player/`）

播放页 dev/qa 专属入口与埋点均仅在 `system/info.devMode` 为真时生效（`!app.isPackaged || Boolean(process.defaultApp)`）：

- `#/player/<任意>?file=<绝对路径>&seek=<秒>&lang=<en|zh>`：经 `watch-history/create` 跳过入库建片；
- `window.__dpDebug`（`scrollWrites` / `snapshot()` / `lastHold()`）与 `window.__dpPolicy`（仅用例注入的 `a` 对照 / `b` 关闭补偿）。

写滚动用例（参考 [player-scroll-anchor.spec.ts](./specs/player/player-scroll-anchor.spec.ts)）时注意：
1. 必须用真实滚轮输入（`page.mouse.wheel`）触发 `USER_BROWSING` 状态切换，不能直接写 `scrollTop`；
2. 点击顶部工具栏开关后注意指针位置，`wheel` 需落在可滚动列表区域内（或使用 DOM `click` 避免移动鼠标到标题栏）；
3. 虚拟列表会回收节点，锚点需按 `SENTENCE_CARD_TESTID` 对应元素的 `data-index` 判定，构造“锚点回收”时应滚至底部而非写死偏移像素；
4. 规格常量集中于 `qa/support/scroll-anchor-protocol.ts`，共享 `testid` 与前缀在 [player-scroll-protocol.ts](../src/common/constants/player-scroll-protocol.ts)。

`pnpm run qa:check-scroll` 退出码约定：**0 通过 / 1 断言失败 / 3 空观测 / 4 Node 与 `.nvmrc` 不一致或埋点缺失**。

## 6. 门禁与评审红线

### 机器强制（CI 拦截）
- **模块边界**（`eslint.config.mjs`）：`qa/**` 只允许 import `@/common/**`，禁止直接依赖 `@/frontend/**` 或 `@/backend/**`；`src/**` 禁止 import `qa/**`。
- **定位器静态检查**（`pnpm run qa:check-locators`）：禁止 `page.locator()` / `page.$()`、CSS 类名与标签选择器。
- **用例与文档双向绑定**（`pnpm run qa:check-cases`）：`- 用例：**[SET-XXX-NN]**` 与 `test('[SET-XXX-NN] ...')` 必须一一对应；禁止顶层 `test.only`/`test.skip`/`test.fixme` 声明，并校验文档声明的 `用例文件` 存在。

### 人工评审红线
1. **零内部 Mock、零状态复用**：不 mock IPC / 仓储 / 服务；每条用例独占进程与 `userDataDir`。
2. **禁止掩盖信号**：不放宽断言、不写 `if (...)` 跳过真实动作（如曾掩盖默认态切换问题）、不用裸 `waitForTimeout` / `sleep` 赌时序。
3. **非必要不跳过**：仅保留明确跨平台权限守卫（如 `SET-STO-02` 在 Windows 与 Linux `root` 下无法靠 `chmod 0o500` 拦截写入），其余环境守卫不成立必须判红。
4. **禁止 test-only 业务分支**：不往产品逻辑塞假数据或测试开关；所有可测试调试入口必须严格受 `devMode` 约束，打包态零暴露。

## 7. 已知运行时陷阱

- **`NODE_ENV` 不能解锁 dev 能力**：`runtimeEnv.isDevelopmentMode()` 只认 `!app.isPackaged || Boolean(process.defaultApp)`（`SET-PKG-01` 守卫）。
- **Chromium 开关必须 `--flag=value`**：写成分离两个 token 会导致 `--user-data-dir` 静默失效并回落污染本地目录；fixture 另配 `assertUserDataIsolated` 兜底。
- **GPU 默认关闭（`--disable-gpu`）**：规避 Linux/Wayland NVIDIA 上游崩溃，需要验证 GPU 硬件路径时设 `QA_DISABLE_GPU=0`。若 `launch()` 长时间卡在 `Debugger listening`（外设切换器 / GPU 进程未 fork 等环境原因），全局用例超时 180s / launch 上限 120s 已留余量，先查系统显示与外设事件。
- **配置为嵌套 JSON 且同值不落盘**：`appearance.theme` 存为 `{"appearance":{"theme":"dark"}}`；`storeSet` 在写入值等于当前/默认值时跳过写盘，故默认档位的键在 `config.dev.json` 中不存在，需改回默认测重进回显，或先改非默认再断言落盘（快捷键支持空字符串解绑）。
- **自动保存表单需传 `detailKey`**：`useAutoSaveSettingsForm` 通过 `detailKey` 刷新 SWR 详情缓存，接新设置页时漏传会导致短时间切走切回显示过期缓存（以及新模型无法即时出现在下拉中）。
- **存储路径自动追加 `-dev` 后缀**：`resolveStorageRootPath` 校验前追加环境后缀，故测试写入失败必须设只读父目录（`chmod 0o500`），不能靠写不存在的路径名。
