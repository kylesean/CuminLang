# Third-Party Notices

CuminLang 基于 [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE) 开源，并在仓库内包含、使用或按需拉取以下开源项目与数据资源。

## 上游派生致谢

- **[solidSpoon/DashPlayer](https://github.com/solidSpoon/DashPlayer)**（AGPL-3.0）：CuminLang 基于 DashPlayer 提交 `2cf57c694b0015b51730c0c03abdfbc141feaf8b`（2026-11-07）派生，并从提交 `0bd93e61bcf70fbe94b2ae1a9ce28d25f3224e5e` 起独立重构、扩展并持续维护。

## 随包资源与数据

- **[ECDICT](https://github.com/skywind3000/ECDICT)**（MIT License）：内置英语词典基础词汇库（`resources/dictionary.sqlite`）。
- **开源字体（OFL-1.1）**：随应用内嵌用于各设计主题（位于 `src/frontend/styles/fonts/`，各自目录内附完整 `OFL.txt` 声明），包括 Figtree、Montserrat、DM Sans、Poppins、Outfit、Fraunces、Albert Sans、Crimson Text、Fustat、JetBrains Mono、Playwrite US Trad、Manufacturing Consent、Sarina、UnifrakturMaguntia。

## 运行时二进制与按需下载组件

在构建打包或用户按需启用离线能力时，CuminLang 会引用以下上游组件：

- **[FFmpeg](https://ffmpeg.org/)**（GPL / LGPL；Windows 构建使用 [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) `win64-gpl` / `winarm64-gpl`，macOS / Linux 构建来自 `ffmpeg.martin-riedl.de` 快照）：媒体转码与音视频处理。完整对应源代码与许可证说明可参见各构建发布方仓库。
- **[whisper.cpp](https://github.com/ggml-org/whisper.cpp)**（MIT License）：本地离线语音识别运行时及对应模型（含 Vulkan SDK 运行时分发库，遵循 Apache-2.0 / MIT 相关条款）。
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)**（Apache-2.0 License）：本地语音识别（Parakeet / SenseVoice）、说话人分离与离线 TTS 语音合成。
- **[ONNX Runtime](https://github.com/microsoft/onnxruntime)**（MIT License）：本地发音评测与语义嵌入模型推理。
- **[llama.cpp](https://github.com/ggml-org/llama.cpp)**（MIT License）：内置本地 AI 推理运行时。
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)**（The Unlicense）：可选的在线视频与字幕导入能力。

## 主要前端 / Node 依赖

项目依赖的 npm 开源包（如 Electron、React、Vite、Tailwind CSS、Drizzle ORM、better-sqlite3、Vercel AI SDK、Lucide 等）均保留其各自包内原有的 `LICENSE` 声明，可通过 `package.json` 与 `pnpm-lock.yaml` 查阅完整清单。
