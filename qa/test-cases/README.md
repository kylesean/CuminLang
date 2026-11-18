# 测试用例文档

> 本目录维护产品级 **E2E 场景清单与已知覆盖缺口**，重点盘点容易被忽略的跨字段、跨页与边界组合，便于产品与工程评审。
> 「怎么写」详见 [qa/README.md](../README.md)，用例代码位于 `qa/specs/`。

## 定位与组织原则

- 重点记录**跨进程链路**（界面 → IPC → 主进程 → 数据库 / 配置文件 / HTTP 服务），纯函数与组件交互留在 Vitest。
- 场景清单面向评审与缺口盘点：页面级文档可拆在 `qa/test-cases/<scope>.md`，跨页面用户旅程也可独立成篇，无需硬塞进单一页面文档。
- 自包含或探索性 E2E（如跨页旅程、实验回归）**可直接编写 spec**，不必强制先挂 ID；只有显式登记了场景 ID 的条目，才由工具校验文档与代码双向同步。

## 场景评估维度

判断一个核心功能是否覆盖充分，可按以下维度检视：

| 维度 | 关注点 |
|---|---|
| 成功路径 | 操作是否真正在主进程生效并持久化（重载 / 重启仍有效）？ |
| 失败路径 | 后端拒绝时前端是否明确提示，且旧状态未被坏值覆盖？ |
| 时机边界 | 防抖窗口内切走、连续修改、并发取消会怎样？ |
| 跨页联动 | A 页改动是否实时影响 B 页入口或状态展示？ |
| 外部依赖 | 依赖真实外网 / 付费模型 / 系统弹窗的行为，明确标记为 `手动` 缺口 |

## 用例 ID 与双向校验

- 页面或旅程文档顶部声明对应的 `用例文件`（尚未自动化的纯手动文档写 `用例文件：无`）：
  `` 用例文件：`qa/specs/.../xxx.spec.ts` ``
- 场景 ID 格式为 `<领域>-<范围>-<序号>`（匹配 `[A-Z]{2,6}-[A-Z]{2,6}-\d{2}`），如历史设置用例 `SET-PRX-01` 或按域命名的 `PLY-*`、`STD-*`、`MOB-*`、`JRN-*`。ID 一旦分配不复用。
- 文档里的登记写法只有两种：

```markdown
- 用例：**[SET-PRX-01]** 切到自定义并填写代理地址与直连规则后落盘，重进页面仍回显
- 编号：**[SET-PRX-03]**（未覆盖）产品规则还没定：切回「跟随系统」时地址是保留还是清掉
```

- 标为 `- 用例：` 的 ID 需出现在对应 spec 的 `test()` 标题中；标为 `（未覆盖）` 或 `（手动）` 的缺口不应出现在自动化 spec 中（只登记跨页面机制缺口在本文件文末，不写 `- 用例：`）。

```bash
pnpm run qa:check-cases   # 校验已登记 ID 的文档 ↔ spec 双向一致，并实时打印概览
```

**各页自动化与缺口统计不手写进文档**，统一由脚本运行时输出，避免清单与统计漂移。

## 已登记文档

| 文档 | 页面 / 范围 | 用例文件 |
|---|---|---|
| [proxy.md](./proxy.md) | 网络代理 | `qa/specs/settings/proxy-settings.spec.ts` |
| [storage.md](./storage.md) | 存储管理 | `qa/specs/settings/storage-settings.spec.ts` |
| [service-resource.md](./service-resource.md) | 服务与资源 | `qa/specs/settings/service-resource-settings.spec.ts` |
| [shortcut.md](./shortcut.md) | 快捷键 | `qa/specs/settings/shortcut-settings.spec.ts` |
| [appearance.md](./appearance.md) | 外观 | `qa/specs/settings/appearance-settings.spec.ts` |
| [mobile-access.md](./mobile-access.md) | 手机访问 | `qa/specs/settings/mobile-access-settings.spec.ts` |
| [about.md](./about.md) | 关于与更新 | `qa/specs/settings/about-settings.spec.ts` |
| [youtube-import.md](./youtube-import.md) | YouTube 链接导入（手动登记） | `无` |
| [renderer-security.md](./renderer-security.md) | 渲染层安全策略（应用外壳） | `qa/specs/app/renderer-security.spec.ts` |
| [onboarding.md](./onboarding.md) | 首次使用引导（应用外壳） | `qa/specs/app/onboarding.spec.ts` |
| [navigation-history.md](./navigation-history.md) | 全局历史导航（应用外壳） | `qa/specs/app/navigation-history.spec.ts` |
| [playback.md](./playback.md) | 播放核心链路（播放器） | `qa/specs/player/playback-golden-path.spec.ts` |
| [playback-layout.md](./playback-layout.md) | 播放器分栏与重置（播放器） | `qa/specs/player/layout-split-reset.spec.ts` |
| [podcast-mode.md](./podcast-mode.md) | 播客视图模式（播放器） | `qa/specs/player/podcast-mode.spec.ts` |
| [vocabulary-annotation.md](./vocabulary-annotation.md) | 播放器词汇注释（播放器） | `qa/specs/player/vocabulary-annotation.spec.ts` |
| [packaged.md](./packaged.md) | 真实打包产物冒烟（nightly / 手工） | `qa/specs/packaged/packaged-smoke.spec.ts` |

## 跨页面的机制性缺口

- 编号：**[SET-AUTO-02]**（未覆盖）保存还没发出就关窗/退出应用：改动随卸载时的 flush 提交，若进程先退出可能来不及往返。要自动化需验证真实关窗生命周期，暂缓。
- 编号：**[SET-AUTO-03]**（未覆盖）保存失败后立刻切走：失败提示挂在原页面会一闪而过，回来只见旧值；待确定拦截或跨页延续策略。
