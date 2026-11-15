# CuminLang 移动端（Flutter + Forui）独立开发计划

> 本文档是 CuminLang 原生移动端（Android + iOS）的独立重构与开发总规划。目标是用 **Flutter 3.50.0+** 与社区 UI 组件库 **[Forui](https://forui.dev/)（`forui ^0.28.0`）** 从零构建一款交互优雅、编解码兼容、与 CuminLang 桌面端（Electron）学习闭环深度协同的跨平台局域网/离线学习伴侣应用，彻底取代上游遗留的纯 Swift iOS 工程。

---

## 1. 背景与为什么重写

### 1.1 上游遗留 iOS 端的核心问题

CuminLang 此前随上游（DashPlayer）继承了一个纯 SwiftUI iOS 客户端（原 `ios/` 目录，已彻底清理）。结合真机实测与源码评审，继续在旧工程上修补性价比极低，原因如下：

1. **单平台绑定与三端逻辑割裂**：仅支持 iOS（依赖 XcodeGen + macOS Xcode 环境），缺少 Android 版本；播放器状态机、字幕时间索引、查词逻辑在桌面端、内置移动网页版（`src/mobile/`）与原生 iOS 之间各写了一套，维护成本成倍放大。
2. **原生 `AVPlayer` 解码兼容性致命短板**：
   - 真机实测桌面端通过 YouTube 下载的 `.mp4`（视频轨普遍为 **AV1 / VP9**，音轨为 **AAC**）在非 A17 Pro 及以上 iPhone（例如 A16 设备）上播放时，由于系统能解码 AAC 音轨但无法解码 AV1/VP9 视频轨，**表现为“有声无画黑屏”且不会触发任何错误提示**。
   - `.mkv`、`.avi` 等桌面端常见容器完全无法直连播放，必须提前在桌面端人工逐个转码。
3. **连接、视觉与交互体验简陋**：
   - **配对门槛高**：只能手动输入带长串令牌的 URL（`http://IP:27182/?t=xxxx`），缺少扫码、局域网自动发现与防火墙/令牌自检提示。
   - **视觉与桌面端割裂**：未继承 [`docs/DESIGN.md`](DESIGN.md) 的中性暖纸（Warm Paper）/ 深墨炭黑（Dark Charcoal）设计语言；播放页底部堆砌了一块高达 `88pt` 的大胶囊 Dock，持续遮挡文稿底部。
   - **学习交互单一**：缺少手势微调、长按倍速、按句练习闭环与生词收藏回写能力，移动端的语言学习价值几乎退化为“局域网看视频播放器”。

---

## 2. 技术栈选型与版本基线

| 领域 | 选型方案 | 版本 / 来源 | 选型理由 |
| --- | --- | --- | --- |
| 跨平台框架 | **Flutter（Stable）+ Dart** | `Flutter 3.50.0` / `Dart 3.14.0`（本机 mise 已安装） | 单套代码同时交付 Android 与 iOS；3.50 已解耦 Core Material/Cupertino 依赖，配合 Impeller 与 SwiftPM 生态成熟 |
| UI 组件库 | **`forui`** + `forui_hooks` | `forui ^0.28.0`（[forui.dev](https://forui.dev/)） | 受 `shadcn/ui` 启发，内置 `FLucideIcons`、完整 `FThemeData` token 体系与 `touch` / `desktop` 双尺度，天然契合 [`docs/DESIGN.md`](DESIGN.md) |
| 音视频内核 | **`media_kit`** + `media_kit_video` + `media_kit_native_event_loop` | `libmpv` + FFmpeg 内核 | 原生直解 MKV / MP4 / AVI、**AV1 / VP9 / H.264 / HEVC**，彻底消灭“有声无画”；支持无变调倍速、毫秒级 seek 与播放器实例复用 |
| 状态与路由 | `flutter_riverpod` + `forui_hooks` + `go_router` | 社区稳定版 | Riverpod 管理连接会话、播放器同步状态与异步缓存；`forui_hooks` 零样板绑定 `FPopover` / `FTabs` / `FAccordion` 等控制器 |
| 网络与发现 | `dio` + `bonsoir`（mDNS） | 社区稳定版 | `dio` 统一处理 Token 注入、Range 断点下载、超时与错误结构化；`bonsoir` 支持扫描桌面端广播的 `_cuminlang._tcp` 服务 |
| 扫码与存储 | `mobile_scanner` + `flutter_secure_storage` + `drift` / SQLite | 社区稳定版 | `mobile_scanner` 扫码读取桌面端配对二维码；Token 安全落盘；本地缓存历史、词汇与离线下载索引 |
| 后台音频 | `audio_service` | 社区稳定版 | 支持锁屏媒体控制（Play/Pause/上一句/下一句）与熄屏播客听读模式 |

> **关于 `media_kit` 包体积与线程风险的工程约束**：
> - Android 打包强制使用 `--split-per-abi`（或 App Bundle），避免将 `arm64-v8a` / `armeabi-v7a` / `x86_64` 的 `libmpv` 打进同一个 APK。
> - 引入 `media_kit_native_event_loop` 并对高频时间回调与横竖屏切换加节流（例如 100~200ms 采样），防止 MPV 事件拥塞主线程引发 ANR / App Hang。

---

## 3. 设计系统对齐：CuminLang × Forui

严格遵循 [`docs/DESIGN.md`](DESIGN.md) 的三条核心约束迁移到 Forui：

1. **主题只改变风格，不改变尺度**：字号、行高、间距、圆角统一收敛到 `FThemeData` / `FStyle` / `FTypography`，禁止页面内部手写 `fontSize: 13` 或随意改动控件高度。
2. **双主题色彩体系**：使用 Forui CLI / Forui Create 生成主题骨架并定制为 CuminLang 品牌调色板：
   - **浅色（Warm Paper）**：画布 `#F5F4F0`、卡片 `#FFFFFF`、边框 `rgba(20,20,20,0.10)`、主文字 `#1C1C1C`、次文字 `#6F6C66`、品牌强调金 `#B07A00`。
   - **深色（Dark Charcoal）**：画布 `#0B0B0B`、表面 `#151515`、边框 `rgba(255,255,255,0.08)`、主文字 `#EDEDED`、次文字 `#8F8F8F`、品牌强调金 `#F5C518`。
   - **媒体画面叠加层例外**：压在视频画面上的控制栏、返回键、倍速胶囊无论浅色/深色主题统一保持深底白字高对比度，不接入主题背景切换。
3. **Forui 组件选型映射表**：

| 场景 | Forui 组件 | 替代旧版做法 / 注意事项 |
| --- | --- | --- |
| 页面骨架与顶栏 | `FScaffold` + `FHeader` / `FHeader.nested` | 统一安全区与返回导航，不再自己垫状态栏黑条与手搓返回手势 |
| 底部主导航 | `FBottomNavigationBar` | 连接后主框架：媒体库（最近/目录）、生词复习、连接与设置 |
| 设置行与分组列表 | `FTileGroup` + `FTile` / `FSwitch` / `FSelectMenuTile` | 替代碎片化原生 Form，统一内边距与右对齐开关基线 |
| 卡片与媒体列表项 | `FCard` + `FBadge` + `FDeterminateProgress` | 列表卡片展示封面、断点续播进度条、媒体编码/字幕角标 |
| 查词与播放设置面板 | `FPersistentSheet` / `FPopover` | 查词默认半屏 `FPersistentSheet`（第 1 层即时释义 + 第 2 层收藏/语境展开），不打断视频画面 |
| 句级切换与过滤 | `FTabs` / `FButton`（variant: outline/secondary） | 替代自绘玻璃条；操作一步可达，避免把高频项塞进「⋯」二级菜单 |
| 状态与错误反馈 | `FAlert` + `FToast` | 连接失败直接区分「超时（防火墙未放行）」「401（令牌失效）」「格式风险」，附操作按钮 |

---

## 4. 核心功能与交互重构（五大模块）

### M1：零门槛连接与配对中心（解决“连不上、不会填”）

- **扫码一扫即连（主力路径）**：桌面端「设置 → 手机访问」展示包含局域网候选 IP 列表、端口与访问令牌的二维码（JSON Payload，如 `{"urls":["http://192.168.6.211:27182"],"token":"...","v":1}`）。手机端打开扫码框，自动依次探测哪个 IP 可达并完成鉴权握手。
- **局域网 mDNS 自动发现**：扫描 `_cuminlang._tcp.local`，自动列出同网段内开启了服务的电脑主机名与端口，点击后仅需校验/扫码注入令牌。
- **多主机历史管理 & 网络诊断**：保存常用桌面端（办公室电脑 / 家里台式机），一键切换；连接失败时给出明确排查引导（例如：`连接超时` → 提示检查同一 Wi-Fi 及桌面端系统防火墙如 Linux `ufw` 放行端口；`401` → 一键重扫更新令牌）。

### M2：媒体库与继续学习首页（Home / Library）

- **顶部续播推荐卡片**：聚焦桌面端最近正在学习的一部视频，展示已学进度、上次停留句子预览，一键直达播放。
- **最近播放 & 目录浏览**：支持下拉刷新、关键词过滤、仅看含双语字幕项；卡片以 `FBadge` 标示「纯音频 / 视频编码（H.264 / VP9 / AV1）/ 双语字幕」。
- **健康状态指示**：顶栏或状态徽章实时反映与桌面端的局域网连通性。

### M3：沉浸式学习播放器（核心重构）

彻底抛弃旧版 iOS “大玻璃胶囊遮挡正文 + 纯点击按钮 + 无手势”的设计，重构竖屏学习布局与横屏沉浸布局：

1. **视频画面区（顶部 16:9，上限 38% 屏高；纯音频/播客态自动切换精致黑胶/声波卡片）**：
   - **手势体系**：
     - 单击画面：切换悬浮 HUD（返回、标题、设置、全屏、进度条），播放状态下 3.5s 无操作自动渐隐。
     - 双击左/右半区：跳回上一句 / 跳到下一句（比盲目 ±5 秒更贴合精听学英语节奏）。
     - 长按画面右侧/任意空白处：临时 `2.0x`（可配置）倍速播放，松手即恢复原速并轻震动提示。
     - 左右滑动亮度/音量或横向微拖：精细时间轴拖拽 + 实时预览目标句子。
   - **横屏全屏模式**：支持顶部/底部浮动双语主字幕叠层，仍支持在全屏下点词查释义（暂停并弹出轻量化底部/侧边词卡）。
2. **主字幕句卡（精听核心视区）**：
   - 英文分词高亮渲染，点词即暂停（可选开关）并触发轻震动反馈 + `FPersistentSheet` 查词。
   - 一键切换：显示/隐藏英文（盲听模式，可按住临时窥视）、显示/隐藏中文译文。
   - 紧贴句卡下方设置**紧凑单行学习微操条**（替代 88pt 巨型 Dock）：
     - `上一句` | `重播当前句` | `下一句` | `单句循环` | `句末暂停` | `倍速`
     - 高度控制紧凑，不再遮挡下方字幕文稿。
3. **全文文稿列表与“被动跟随 / 显式归位”状态机**：
   - **严格分离状态机**（对齐 [`docs/DESIGN.md`](DESIGN.md#L328-L339)）：用户手动滑动列表时立刻进入浏览态，暂停自动滚动；列表右下角按需浮出**纯图标「回到当前句」按钮**，点击后强制归位并恢复跟随。
   - 点击任意一句立即跳转并起播（提前 `0.15~0.2s` preroll 防止吞首音）。

### M4：即时查词、收藏与碎片复习闭环

- **第一层（即时查词 Sheet）**：点词瞬间先走 `/api/dictionary` 展示本地 ECDICT 音标、词性与中文释义 + 发音试听按钮，并在标注来源的同时不阻塞交互。
- **第二层（语境深挖 & 收藏写回）**：Sheet 下方可展开当前句上下文 AI 解析，并提供平铺操作按钮（收藏生词 / 标为已掌握），状态直接写回桌面端数据库。
- **生词本 / 碎片复习 Tab**：利用桌面端间隔重复数据，在手机通勤场景下提供轻量闪卡/例句回顾（回忆释义 → 播放对应原声例句片段）。

### M5：离线缓存与编解码兼容兜底

- **为什么不能只靠 `media_kit` 软解**：虽然 `media_kit` 能解码 4K AV1，但在旧手机上长时间软解 4K AV1 仍会发热掉电、且局域网受限于 Wi-Fi 带宽。
- **分级兼容策略**：
  1. **直连直放（默认）**：`H.264` / `HEVC` / `1080p VP9` 由 `media_kit` 硬件/轻量加速直接流式播放。
  2. **按需兼容转流（桌面端协助）**：当检测到视频为高码率 AV1 / 超大 MKV 时，弹窗/角标提供「兼容流畅模式」开关，桌面端调用 `ffmpeg` 转封装或实时转为 720p/1080p H.264 流输出。
  3. **单集离线缓存**：支持将视频（可选同时转码为轻量 H.264 MP4）+ `.srt` 字幕 + 已翻译中文缓存至手机本地目录，地铁/无网环境直接打开离线学习，重连桌面端后再增量同步观看进度与新收藏生词。

---

## 5. 桌面端 `MobileWebServer` 协议演进清单

当前 [`MobileWebServer.ts`](../src/backend/infrastructure/mobile/MobileWebServer.ts) 与 [`MobileAccessService.ts`](../src/backend/services/MobileAccessService.ts) 已具备以下可直接复用的基础接口：

- `GET /api/recent` — 最近播放列表
- `GET /api/videos/:id` — 视频详情与双语字幕行
- `GET /api/videos/:id/stream` — HTTP Range 视频流
- `GET /api/videos/:id/thumb` — 缩略图
- `POST /api/videos/:id/progress` — 播放进度写回
- `GET /api/dictionary?word=...` — 单词释义查询
- `POST /api/translate` — 字幕批量翻译（最多 50 行）

**为支撑上述 Flutter 新版体验，桌面端需按阶段增量扩展：**

| 阶段 | 新增/扩展能力 | 接口或改动说明 |
| --- | --- | --- |
| P0 | 健康检查与版本协商 | `GET /api/health`（返回服务版本、主机名、是否支持转码、可用能力位） |
| P0 | 扫码配对与 mDNS 广播 | 桌面端「手机访问」设置页渲染完整 JSON Payload 二维码；可选广播 `_cuminlang._tcp` |
| P1 | 媒体编码元信息透出 | `/api/recent` 与 `/api/videos/:id` 补充 `vcodec`、`acodec`、`width`、`height`、`duration` |
| P1 | 下载源格式偏好 | 桌面端 YouTube 下载设置增加「优先移动端兼容编码（H.264 / avc1）」选项 |
| P2 | 词汇收藏与复习同步 | `POST /api/vocabulary/mark`、`GET /api/review/due`、`POST /api/review/submit` |
| P2 | 按需转码流与离线包导出 | `GET /api/videos/:id/stream?profile=mobile_720p`（或离线预处理下载接口） |

> 现有内置移动网页版（[`src/mobile/`](../src/mobile/MobileApp.tsx)）在 Flutter App 达到 P1 可用验收前继续作为局域网浏览器零安装保底入口保留，待 Flutter 稳定交付后再评估下线或极简化。

---

## 6. 仓库组织与 Omarchy (Linux) 跨平台开发工作流

### 6.1 工程目录建议

- 保持桌面端 Electron 仓库与移动端代码边界清晰：建议放在独立仓库 `cuminlang-mobile`（或在适当时机作为本仓库平级工程引入，不污染 Electron `package.json` / `forge.config.ts` / `vitest` 流水线）。
- 内部采用 **Feature-First** 结构：
  ```text
  lib/
    app/            # 路由 (go_router)、全局 Theme (Forui WarmPaper/DarkCharcoal)、Bootstrap
    core/
      network/      # Dio 客户端、Token 拦截器、多主机管理、mDNS 发现
      media/        # media_kit 封装、字幕时间二分索引、后台音频会话
      storage/      # 安全凭据存储、本地离线数据库
    features/
      connect/      # 扫码配对、局域网扫描、网络诊断
      library/      # 最近播放、续播卡片、筛选搜索
      player/       # 竖/横屏播放页、手势层、句子微操条、文稿跟随状态机
      vocabulary/   # 查词 Sheet、生词收藏、碎片复习闪卡
      settings/     # 主题切换、手势偏好、离线缓存管理
  ```

### 6.2 Omarchy（Linux）双端开发与构建现实边界

已结合本机 `Flutter 3.50.0` 环境核实两端的真实工具链路径：

- **日常主力开发与真机调试（Android + Linux Desktop）**：
  - 本机已通过 `mise` 安装 `Flutter 3.50.0` / `Dart 3.14.0`。
  - 日常 95% 的 UI 排版（Forui）、手势交互、播放器与桌面端联调，直接在 Omarchy 本机连接 **Android 真机（ADB USB / Wi-Fi 无线调试）** 或跑 **Flutter Linux Desktop** 目标实时 Hot Reload，开发效率最高。
- **iOS 构建与分发（不能强依赖 Linux 本地直编）**：
  - 需注意工具链边界：此前本机用于纯 Swift 工程的 `omarchy-apple-dev`（`xtool`）仅覆盖 SwiftPM 原生工程，无法驱动 Flutter Engine + CocoaPods/SwiftPM 插件矩阵在 Linux 上直接完成 `flutter build ios`。
  - iOS 端标准方案为：**在 GitHub Actions `macos-15`（或 Codemagic）按发版 tag 执行 `flutter build ipa`**，产出测试/分发包后通过 TestFlight 或侧载安装到 iPhone 真机回归验证（注意：`Forui` 与 `media_kit` 均提供跨平台一致的逻辑渲染，Android / Linux Desktop 验证通过后，iOS 仅需验证权限弹窗、后台音频中断、手势安全区与硬件解码表现）。

---

## 7. 分阶段交付路线图与验收标准

### Phase 0：工程脚手架与“一扫即连”（预计 1 周）
- **交付物**：
  - 初始化 Flutter 3.50 + Forui 0.28.0 工程，完成 Warm Paper / Dark Charcoal 两套 `FThemeData` 定义与基础组件封装。
  - 桌面端补齐 `GET /api/health` 与设置页配对二维码；手机端实现扫码配对、手填兜底、多主机记录及防火墙/令牌错误诊断页。
- **验收标准**：Android 真机通过扫码 3 秒内连上本机运行中的 CuminLang 桌面端并展示媒体库首屏。

### Phase 1：媒体库与沉浸式学习播放器（预计 2 周）
- **交付物**：
  - 最近播放列表 + 续播进度条 + 编码徽章；
  - 基于 `media_kit` 的核心播放页（**验证直接播放本机 AV1 / VP9 / MKV 视频正常出画面与声音**）；
  - 手势体系（单击显隐、双击跳句、长按 2x）、紧凑学习控制条、双语主字幕卡与“被动跟随/显式归位”文稿列表、断点进度回写与锁屏控制。
- **验收标准**：之前在旧 Swift 端黑屏无画面的 YouTube AV1/VP9 视频在 Android & iOS 上均流畅音画同步；连续拖动与跳句无卡顿或 ANR。

### Phase 2：即时查词闭环、生词复习与离线缓存（预计 2 周）
- **交付物**：
  - 主字幕点击查词弹出 `FPersistentSheet`（词典秒开 + 语境展开 + 收藏/掌握回写）；
  - 移动端生词闪卡复习页；
  - 单视频 + 字幕离线下载，桌面端增加下载 H.264 兼容选项或按需兼容转流。
- **验收标准**：断开 Wi-Fi 后可正常播放已缓存视频、点词查本地缓存释义；恢复连接后学习进度自动回传桌面端。

### Phase 3：iOS 构建流水线、真机打磨与首发（预计 1 周）
- **交付物**：
  - 接入 GitHub Actions（`macos-15` 构建 iOS，Ubuntu 构建 Android ABI-split APK/AAB）；
  - 真机验证 iOS 后台播放、来电中断恢复、横竖屏布局、刘海/灵动岛安全区与权限引导。
- **验收标准**：双端 `v0.1.0` 发布包就绪，核心学习链路无 P0/P1 缺陷。
