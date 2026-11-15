# Security Policy

## 支持的版本

当前仓库处于 `0.1.x` 早期发布阶段，仅对最新发布的版本及 `main` 分支提供安全修复。

## 报告安全漏洞

如果您发现了潜在的安全隐患，请**不要**直接在公开 GitHub Issue 中披露细节，以便我们有时间在攻击窗口形成前完成修复与发版。

建议通过以下方式私密反馈：

- **GitHub Security Advisories**：前往 [kylesean/Refrain/security/advisories](https://github.com/kylesean/Refrain/security/advisories) 点击 **Report a vulnerability**。
- **邮件联系**：发送至 `jkxsai@gmail.com`（标题请注明 `[Refrain Security]`）。

请尽可能提供：

- 影响模块与复现步骤（或概念验证代码/配置）
- 受影响的平台与版本号
- 潜在影响评估

我们会在收到报告后尽快确认受理状态并跟进修复节奏。

## 安全边界说明

Refrain 在桌面端设计中采取以下纵深防御措施：

- 开启 Electron Fuses（禁用 `RunAsNode`、`NODE_OPTIONS` 与生产态 Node CLI 调试参数，默认仅从 `asar` 加载源码）。
- 构建期注入严格桌面 CSP（Content Security Policy），并通过自定义授权的 `media://` 协议访问本地媒体库。
- 所有从上游或 CI 下载的运行时二进制（`ffmpeg` / `ffprobe` / `whisper.cpp`）及部分离线模型均执行 SHA-256 校验。
- 「手机访问」局域网服务默认关闭，开启后通过访问令牌鉴权（URL 参数或 `X-Refrain-Token` 请求头）；请勿在不受信任的公共网络中长时间暴露服务地址。
- 用户本地填写的云端 API 凭据保存在本机应用配置目录中，不会上传至任何 Refrain 服务端。
