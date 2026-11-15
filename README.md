# Refrain

> 基于 [solidSpoon/DashPlayer](https://github.com/solidSpoon/DashPlayer) 早期版本派生，现已独立演进与维护的现代音视频播放与 AI 原生沉浸式语言学习桌面应用。

[简体中文](README.md) · [English](README.en.md)

<p>
  <a href="LICENSE" target="_blank">
    <img alt="AGPL-3.0 license" src="https://img.shields.io/github/license/kylesean/Refrain.svg" />
  </a>
  <a href="https://github.com/kylesean/Refrain/releases/latest" target="_blank">
    <img alt="Releases" src="https://img.shields.io/github/v/release/kylesean/Refrain?label=Release" />
  </a>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-087EA4?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
</p>

---

## 核心特性

- **沉浸式视频与双语字幕播放**：支持常见音视频与 `srt` / `vtt` / `ass` 字幕；提供按句跳转、单句循环、句末自动暂停、硬字幕遮挡贴片、时间轴微调，以及文稿逐句/讲稿双视图与全文检索。
- **播客全宽听读与盲听训练**：支持一键切换至播客沉浸视图，默认收起侧栏专注当下句子与句内时间进度条；提供「盲听」防剧透遮罩与按住 `\` 键临时窥视。
- **跟读录音与听写评测工坊**：支持逐句跟读录音对比、节拍流/发音维度反馈与听写练习，结合间隔重复曲线沉淀高频生词与学习片段。
- **AI 整句学习与语境工坊**：围绕当前字幕上下文提供 AI 整句语法拆解对话、内置 ECDICT 离线词典查词，以及语境笔记与词库导出。
- **局域网手机访问**：支持在桌面端开启带令牌鉴权的局域网访问服务（另附冻结维护中的 iOS 客户端工程 [`ios/`](ios/README.md)）。
- **多主题设计家族**：内置 Neutral、Stone、Gothic、Matcha、Y2K、Butter、Chocolate 七套主题，支持浅色/深色/跟随系统与排版尺度调节。

---

## 界面预览

### 视频学习主界面与双语字幕文稿
![Refrain 视频播放与字幕文稿](docs/screenshots/player.png)

### 播客沉浸听读模式
![Refrain 播客沉浸听读模式](docs/screenshots/podcast.png)

### 跟读与听写练习工坊
![Refrain 跟读与听写练习工坊](docs/screenshots/practice.png)

### 设置中心与多主题外观
![Refrain 设置中心与多主题外观](docs/screenshots/settings.png)

---

## 安装说明

前往 [Latest Release](https://github.com/kylesean/Refrain/releases/latest) 下载对应平台安装包（桌面安装包暂未购买商业代码签名证书，如遇系统安全拦截可按以下方式放行）：

- **macOS（`.dmg`，`arm64` / `x64`）**：拖入 `Applications`。若系统提示应用已损坏或无法验证开发者，可在 `系统设置 → 隐私与安全性` 中选择「仍要打开」，或执行：
  ```bash
  xattr -c /Applications/Refrain.app
  ```
- **Windows（`.exe` / `.msi`）**：双击安装；若 SmartScreen 提示未识别应用，点击「更多信息 → 仍要运行」。`.exe` 与 `.msi` 安装格式请勿混用。
- **Linux（`.AppImage` / `.deb` / `.rpm`）**：
  ```bash
  # AppImage
  chmod +x Refrain-*.AppImage && ./Refrain-*.AppImage
  # 若缺少 FUSE，可附加 --appimage-extract-and-run 或安装 libfuse2
  ```

---

## 本地开发

环境要求：`Node.js`（见 [`.nvmrc`](.nvmrc)，支持 `>=22.22.2 <23` 或 `>=24.15.0 <25`）、`pnpm@10.x`、`ffmpeg` / `ffprobe`（运行 E2E 时需要）。

```bash
pnpm install
pnpm start                 # 编译移动网页并启动 Electron 开发环境
pnpm run lint              # ESLint 校验（零 warning 要求）
pnpm run typecheck         # TypeScript 类型检查
pnpm run test:run          # 运行 Vitest 单元测试
pnpm run test:e2e:smoke    # 运行 Playwright 核心冒烟测试
```

更多端到端测试约定与用例文档见 [QA 端到端测试文档（qa/README.md）](qa/README.md)。

---

## 致谢与开源协议

- **[solidSpoon/DashPlayer](https://github.com/solidSpoon/DashPlayer)**：本项目早期派生自 DashPlayer，感谢原作者的开创性工作。
- 随包及按需拉取的第三方开源组件与字体清单见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

本项目遵循 [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE) 开源。
