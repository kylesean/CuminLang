# Contributing to Refrain

感谢关注并参与 Refrain 的共建！本文档说明本地开发环境搭建、代码规范与提交流程。

## 环境准备

- **Node.js**：见 [`.nvmrc`](.nvmrc)（兼容 `package.json#engines`：`>=22.22.2 <23` 或 `>=24.15.0 <25`）
- **包管理器**：`pnpm@10.x`（推荐 `corepack enable`）
- **系统工具**（运行 E2E 时需要）：本机可用的 `ffmpeg` / `ffprobe`

```bash
git clone https://github.com/kylesean/Refrain.git
cd Refrain
pnpm install
```

## 常用脚本

```bash
pnpm start                # 编译移动页、下载依赖二进制并启动 Electron 开发态
pnpm run lint             # ESLint 检查（零 warning 门禁）
pnpm run typecheck        # TypeScript 类型检查
pnpm run test:run         # 运行全部 Vitest 单元测试
pnpm run test:coverage    # 带覆盖率阈值校验运行单元测试
pnpm run qa:check-locators # 检查 Playwright E2E 语义定位器规范
node qa/tools/check-test-cases.mjs # 校验 QA 用例文档与 spec 一致性
pnpm run test:e2e:smoke   # 运行 Playwright 核心冒烟测试
pnpm run test:e2e         # 运行全部 Playwright E2E 测试
```

> 首次安装依赖后如不需要 Playwright 自带的 Chromium，可使用 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install`（E2E 直接驱动 Electron）。

## 开发与提交规范

1. **设计规范**：任何前端 UI 改动请先阅读 [`docs/DESIGN.md`](docs/DESIGN.md)，优先使用语义化样式 Token。
2. **提交信息**：仓库通过 `simple-git-hooks` + `commitlint` 强制执行 [Conventional Commits](https://www.conventionalcommits.org/)（例如 `feat(player): ...`、`fix(settings): ...`）。
3. **测试规范**：
   - 新增后端 IPC 路由需在 `src/common/api/api-def.ts` 定义契约，并通过 `routeContract` 与补丁覆盖率校验。
   - 新增或修改 `qa/specs/` 下的 E2E 用例时，必须同步维护 `qa/test-cases/` 中对应的场景文档与稳定 ID。
   - 推送前请确认 `lint`、`typecheck` 与 `test:run` 全部通过。

## 提交 Pull Request

- 请在 PR 描述中写明变更动机、关联 Issue 以及已执行的验证命令结果。
- 涉及界面或交互改动的 PR 建议附带前后对比截图。
- 参与贡献即表示您同意您的代码按仓库的 [AGPL-3.0 协议](LICENSE) 发布。
