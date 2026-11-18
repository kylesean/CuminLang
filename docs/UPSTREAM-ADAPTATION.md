# 上游适配与体验优化清单（提案）

> **文档定位**：这是一份**待排期的改进提案**，不是已实现能力的说明，也不是硬性约束。
> 每条都写清了「现状证据 → 问题 → 方案 → 判据」，方便逐条评估取舍，未实施前不要当契约引用。

## 0. 背景：为什么需要这份清单

YouTube 侧的上游（播放协议、客户端参数、风控策略）变化频繁，且变化不受我们控制。
同类产品 SubCast 的做法印证了这一点：它把 YouTube 客户端参数做成了**远程可下发**的配置，
并在注释里写明「so a YouTube change can be answered without a release」。

我们的产品定位与它不同——**必须把媒体落到本地**，因为跟读、本地 ASR 重识别、字幕时间轴精修、
学习片段切片、离线学习全部依赖本地文件。这个定位是正确的，不需要改。

但「必须下载」不等于「必须频繁发版」。下面 6 条是从对比中筛出的、**真正契合我们定位**的点。

### 明确不采纳的方向（避免反复讨论）

| 方向 | 不采纳的原因 |
|---|---|
| 改为 YouTube 在线流播放（iframe / HLS 代理） | 学习功能依赖本地文件：帧级 seek、音频喂本地 ASR、切片上传、离线。在线流做不到 |
| 做频道订阅 / 自动追更 | 与「精读一个视频并吃透」的定位冲突；订阅是消费型产品的形态 |
| 学它砍掉后端分层与测试 | 我们已有 2148 条用例与覆盖率门禁，这是护城河，不是负担 |
| 用 Rust/Go 重写 Electron 后端 | 28 个平台接入点后面是约 5 万行与运行时无关的业务逻辑；重写会归零全部测试资产。见第 6 节 |

---

## 1. yt-dlp 参数远程可覆盖（最高优先级）

**现状**：`src/backend/infrastructure/ytdlp/YtDlpProcessGatewayImpl.ts:82` 硬编码
`--extractor-args youtube:player_client=android,default`；
`src/backend/services/models/ytDlpBinary.ts:9` 钉死 `YT_DLP_VERSION = '2026.10.26'`。

**问题**：YouTube 一旦调整客户端校验（历史上一季度内发生过多次），`player_client` 组合就会失效，
表现为「所有导入都失败」，而修复只需要改一个字符串——但用户必须等我们发版。

**方案**：新增一个可选的远程配置层（只影响**参数**，不影响**二进制校验**）：

1. 配置项形如 `{ playerClients: ['android','default'], extraArgs: [], downloadUrls: [] }`。
2. 拉取失败 / 配置非法 / 离线时，**无条件回落到内置默认值**，且不得让导入功能整体不可用。
3. 二进制仍按仓库内钉死的 SHA256 校验；远程配置**不得**下发任意下载地址覆盖校验和——
   那等于把供应链安全交给远端。若确需换镜像，只能扩展候选 URL 列表，SHA256 仍来自本地常量。
4. 配置读取要有超时（建议 3s）与本地缓存，避免启动被远端拖慢。

**判据**：断网启动、远端返回畸形 JSON、远端返回空对象三种情况下，导入功能行为与现在完全一致。

**为什么不做成"自动更新 yt-dlp 二进制"**：那会绕过现有的 SHA256 钉版与 `ModelArchiveInstaller`
的完整性校验链路。参数可远程，二进制不可远程，这是安全边界。

---

## 2. Cookies 从「手填路径」改为「应用内登录」

**现状**：`src/frontend/features/settings/YoutubeImportSetting.tsx:131` 让用户填写
`cookiesFilePath`（`YoutubeImportService.ts:205-216` 原样存盘）。
失败原因已经能识别出 `needCookies`（`YoutubeImportService.ts:74`），但用户拿到这个提示后，
需要自己去找浏览器插件导出 `cookies.txt`、存到某个目录、再回来粘贴绝对路径。

**问题**：这是全流程里体验最差的一步，也是「确认你不是机器人」类失败唯一的手动解法。
SubCast 的实践说明了痛点：它原本也想借用浏览器 cookie（`yt-dlp --cookies-from-browser`），
但在 Chrome 127+ / Windows 上因 DPAPI 加密失败，最后改成**在应用内开一个登录窗口**，
把 cookie 存进自己的会话，每个下载任务前导出临时 cookie 文件、任务结束立即删除。

**方案（分两步，第二步可选）**：

1. **先降低门槛**：保留手填路径作为兜底，但增加「从浏览器导入」的引导，
   并在 `needCookies` 失败时直接给出可点击的跳转（现在是纯文案）。
2. **再做应用内登录**：Electron 下用 `BrowserWindow` 开一个受限登录窗口，
   用 `session.cookies.get()` 读取，导出为临时 cookie 文件传给 yt-dlp，任务结束即删。
   注意：Electron 的 `session` API 比 Tauri 的 webview API 更好用，这是我们的优势。

**安全约束（必须遵守）**：

- 登录窗口必须与主窗口**隔离 session**，不得共享 cookie 存储。
- 导出的 cookie 文件写在临时目录，权限 `0o600`，在 `finally` 里删除；异常路径也必须删。
- cookie 内容**禁止**进日志、禁止进 `runtime-evidence`。现有 `mask.ts` 的 `?t=`/`token` 规则要扩展。
- 登录窗口同样要过 `RendererSecurityGuard` 的导航白名单，只允许 `youtube.com` / `google.com`。

**判据**：`needCookies` 失败后，用户从提示到重试成功的操作步数 ≤ 3 步（现在是 5+ 步）。

---

## 3. 失败结果记忆，避免用户反复踩同一个坑

**现状**：失败原因已归一为稳定 code（`classifyImportFailure`，`YoutubeImportService.ts:72-80`：
`rateLimited` / `needCookies` / `regionBlocked` / `unavailable` / `diskFull` / `ffmpegMissing` / `generic`），
但**没有任何持久化记忆**。同一个会员专属/地区限制的视频，用户重试 N 次，每次都跑完整下载流程再失败。

**问题**：`regionBlocked` 与 `unavailable` 属于**确定性失败**——重试一百次结果一样，
但每次都要等 yt-dlp 探测、超时、失败，用户体感是「这软件坏了」。

**方案**：

1. 对 `regionBlocked` / `unavailable` 两类，把 `videoId → reason` 记入本地表（可复用现有 SQLite，
   或直接用 `electron-store` 的轻量键值），带过期时间（建议 7 天，避免视频后来解禁）。
2. 用户再次粘贴同一链接时，**先查记忆**，直接给出原因与建议，不再发起下载；
   但提供「仍要重试」按钮，允许用户强制忽略记忆。
3. `rateLimited` / `diskFull` / `ffmpegMissing` 属于**环境性失败**，不记忆——环境修好后应立即可用。

**判据**：同一 `unavailable` 视频第二次粘贴时，不发 yt-dlp 进程，直接出提示。

---

## 4. 「边下边播」——下载完成前即可开始学习

**现状**：导入必须等 yt-dlp 完整下载 + 合并 + 字幕转换全部结束，任务才进入 `done`，
播放器才可打开。长视频（1-3 小时）用户要干等。

**问题**：这是「必须下载」定位下**唯一**值得向在线流借鉴的体验点。
SubCast 用 `hlsproxy.rs`（140 行）代理 HLS 分片，本质是「按需取分片 + 本地缓存」。

**方案（需先验证可行性，不要直接排期）**：

1. yt-dlp 支持 `--download-sections` 与分片下载，可先只下「前 N 分钟 + 完整字幕」。
2. 字幕先于视频就绪（字幕体积小、转换快），因此**字幕可用即可先进入精读/跟读**，
   视频流式补齐。
3. 风险点：`--download-sections` 对部分站点无效；合并阶段仍需要完整文件。
   **必须先做技术验证**（用 3-5 个真实长视频跑通），再决定是否投入。

**判据**：探针阶段先回答「能否在视频未下载完时得到可用的完整 SRT」——如果不能，此条直接放弃。

**优先级说明**：这条收益大但风险也大，建议排在 1-3 之后，且必须先做技术探针。

---

## 5. 上游变更的可观测性

**现状**：`classifyImportFailure` 把错误归一为 code，原始错误写入 `result` 供展开查看。
但 `generic` 这一类没有进一步拆分，且没有统计上报（本地或远端）。

**问题**：如果 YouTube 改版导致大面积失败，用户侧看到的是零散的 `generic`，
我们侧没有信号——只能等用户来报。SubCast 的远程配置能生效，前提是它**知道**需要改。

**方案（轻量）**：

1. 在本地日志里对 `generic` 失败额外记录 yt-dlp 的 stderr 首行（已脱敏），
   便于用户反馈时定位。
2. 可选：在用户明确同意的前提下，上报「失败原因 code 的聚合计数」（不含 URL、不含内容）。
   这属于新增遥测，**必须先有隐私说明与开关**，默认关闭。

**判据**：不引入遥测也能落地第 1 条；第 2 条单独评估。

---

## 6. 关于「用 Rust/Go 重写 Electron」的结论（暂不做）

记录结论，避免反复讨论。

**现状数据**：

- `from 'electron'` 的引用共 **28 处**，集中在托盘、多窗口（含桌面歌词）、`safeStorage`、
  自定义协议 `media://`、权限守卫、自动更新。
- 这 28 个接入点后面是约 **5 万行与运行时无关的业务逻辑**（`src/backend` 51,879 行）。
- 现有测试资产 **46,408 行 / 2148 条用例**，全部绑定在 Node 运行时上。

**结论**：全量重写投入产出比为负。真正的收益（包体积、内存）不是学习工具的决定性因素；
而安全收益接近于零——我们的攻击面是 renderer 的 XSS，不是原生层的内存错误，
且 IPC origin 守卫、CSP、fuses、`contextIsolation` 已经覆盖。

**如果未来确实要做，唯一推荐路径是「换壳不换芯」**：

1. Tauri 只承担窗口/托盘/协议/keyring（约 3k 行 Rust）；
2. 业务后端仍以 Node sidecar 运行，保留 5 万行 TS 与全部测试；
3. 验证通过后，再把 CPU 密集热点（ASR 后处理、字幕对齐、音频处理）单独抽成 Rust 模块。

**Astryx 不受影响**：`@astryxdesign/core` 的依赖是
`intl-messageformat` + peer `@stylexjs/stylex` / `react` / `react-dom`，
是**纯 React + StyleX 的 DOM 组件库**，与运行时无关。
换 Tauri 时 `src/frontend` 的 65,287 行 React 代码一行都不用改。

---

## 优先级建议

| 序号 | 条目 | 收益 | 成本 | 建议 |
|---|---|---|---|---|
| 1 | yt-dlp 参数远程可覆盖 | 高（免发版修复） | 低（约 100-200 行） | **先做** |
| 2 | Cookies 应用内登录 | 高（最大体验痛点） | 中 | 先做第 1 步引导，第 2 步单独评估 |
| 3 | 失败结果记忆 | 中 | 低 | 可与前两条一起做 |
| 4 | 边下边播 | 高 | 高（需探针） | 先探针，再决定 |
| 5 | 上游变更可观测性 | 中 | 低 | 随第 1 条一起做 |
| 6 | Rust/Go 重写 | 低 | 极高 | 不做（结论已记录） |

---

## 附：本文档的证据来源

所有「现状」描述均基于以下位置的实测，改动前请重新核对：

| 引用 | 位置 |
|---|---|
| yt-dlp 客户端参数硬编码 | `src/backend/infrastructure/ytdlp/YtDlpProcessGatewayImpl.ts:82` |
| yt-dlp 版本与 SHA256 钉版 | `src/backend/services/models/ytDlpBinary.ts:9`（版本）、`:19-23`（SHA256） |
| cookies 路径手填 | `src/frontend/features/settings/YoutubeImportSetting.tsx:131` |
| 失败原因分类 | `src/backend/services/YoutubeImportService.ts:72-80` |
| 导入任务进度阶段 | `src/backend/services/YoutubeImportService.ts:184-320` |
| Electron 接入点 | `src/main.ts`、`src/backend/startup/appTray.ts`、`src/backend/infrastructure/settings/store.ts` |
