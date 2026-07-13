# Yeelight AI CLI

[English](README.md)

`yeelight-ai` 是 Yeelight Cloud、Metadata 和 LAN 三类 MCP 服务的官方统一命令行工作台。它提供统一安装、本地账号配置、安全的设备快捷命令、MCP 工具发现与调用、诊断，以及 Cursor、Claude Desktop 和 VS Code 客户端配置。

## Yeelight AI 能力矩阵

这些项目组成互补的 Yeelight AI 技术栈。可以根据接入方式选择入口，也可以组合使用。

| 项目 | 定位与核心能力 | 适用场景 | GitHub |
| --- | --- | --- | --- |
| Yeelight Home | 首选本地语义 Runtime，通过统一结构化 `invoke --stdin` 边界提供查询、控制、场景、自动化、灯光设计、诊断、产品知识和生成应用能力。 | 需要稳定、受策略保护的智能家居执行层的 Agent host、本地自动化和应用。 | [Yeelight/yeelight-home](https://github.com/Yeelight/yeelight-home) |
| Yeelight Smart Home Skills | 官方 Agent Skills：Smart Home 把自然语言转换为安全的 Runtime 操作；PRO App Builder 基于已验证能力生成专用本地应用。 | 需要智能家居对话工作流或应用生成能力的 Agent host。 | [Yeelight/yeelight-smart-home-skills](https://github.com/Yeelight/yeelight-smart-home-skills) |
| Yeelight AI CLI | 统一终端工作台和 MCP 客户端，连接 Cloud、Metadata 和 LAN 服务，提供本地 profile、安全快捷命令、诊断、脚本和 AI 客户端配置。 | 希望通过通用 MCP 与自动化命令行入口操作的用户、脚本和 CI。 | [Yeelight/yeelight-cli](https://github.com/Yeelight/yeelight-cli) |
| Yeelight IoT MCP | 官方托管或可自行部署的 Streamable HTTP MCP 服务，提供拓扑、实时状态、设备控制和场景执行。 | 需要直接发现和控制 IoT 设备的 MCP 客户端。 | [Yeelight/yeelight-iot-mcp](https://github.com/Yeelight/yeelight-iot-mcp) |
| Yeelight Metadata MCP | 官方托管或可自行部署的 Streamable HTTP MCP 服务，提供受保护的家庭、房间、组、面板、场景、自动化、收藏和账号元数据工作流。 | 需要检查和管理元数据的 MCP 客户端。 | [Yeelight/yeelight-metadata-mcp](https://github.com/Yeelight/yeelight-metadata-mcp) |

Yeelight Home 还提供系统凭据存储、本地 QR 登录、秘密脱敏诊断、预览与校验、调用方确认和 Runtime 策略/写后读取、本地记忆与推荐、实操经验，以及机器可读的 intent schema 和解释。跨平台二进制通过 GitHub Release、npm 和已支持的包管理器分发。

典型组合：智能家居 Agent 和生成应用 -> Skills -> Yeelight Home；终端用户和脚本 -> Yeelight AI CLI；MCP 客户端 -> IoT MCP 和/或 Metadata MCP。

## 环境要求

- Node.js 20 或更高版本
- Cloud 和 Metadata MCP 需要 Yeelight 账号
- LAN MCP 需要可访问的 Yeelight 网关，并在 APP 中开启 LAN CONTROL

## 安装

```bash
npm install --global yeelight-ai
yeelight-ai --version
yeelight-ai --help
```

从源码运行：

```bash
git clone https://github.com/Yeelight/yeelight-cli.git
cd yeelight-cli
npm install
npm test
node bin/yeelight-ai.js --help
```

## 快速开始

启动交互式工作台：

```bash
yeelight-ai
```

CLI 会检查本地配置，在需要时引导登录和选择家庭，然后进入命令工作台。默认通过交互提示输入密码，避免密码出现在 shell 历史中。

脚本或 CI 应使用明确的子命令和 JSON 输出：

```bash
yeelight-ai doctor --json
yeelight-ai status --json
yeelight-ai mcp list --json
```

## 常用命令

只读家庭命令：

```bash
yeelight-ai house show
yeelight-ai room list
yeelight-ai device list
yeelight-ai device show <deviceId>
yeelight-ai scene list
```

设备和情景写操作默认只生成预览。确认目标和动作无误后才追加 `--yes`：

```bash
yeelight-ai light brightness <deviceId> 80
yeelight-ai light brightness <deviceId> 80 --yes
yeelight-ai scene run <sceneId>
yeelight-ai scene run <sceneId> --yes
```

发现和调用 MCP 工具：

```bash
yeelight-ai mcp tools cloud
yeelight-ai mcp describe cloud get_devices
yeelight-ai mcp call cloud get_devices --args '{}' --json

yeelight-ai mcp groups metadata
yeelight-ai mcp describe metadata yeelight_metadata.execute_task
yeelight-ai mcp call metadata yeelight_metadata.list_tasks --args '{}' --json
```

## MCP 服务

| ID | 用途 | 认证方式 |
| --- | --- | --- |
| `cloud` | 设备和情景查询、控制 | 自动读取本地 Yeelight 账号 Header |
| `metadata` | 家庭、房间、设备组、情景、自动化和配置任务 | 自动读取本地 Yeelight 账号 Header |
| `lan` | 网关本地发现和控制 | 仅访问局域网，不携带云端 Header |

Metadata 工具定义内置于 CLI，日常发现无需等待远端服务；明确需要核对在线服务时再使用 `--remote`。LAN 工具名和 schema 始终以网关运行时返回为准。

## 凭据与安全

- macOS/Linux 默认配置为 `~/.config/yeelight-ai/config.json`，Windows 为 `%APPDATA%/yeelight-ai/config.json`。
- 测试或隔离运行可使用 `YEELIGHT_AI_CONFIG_DIR` 覆盖配置目录。
- `config get` 和 `doctor --json` 默认脱敏。
- 不要把 token、密码、家庭 ID、设备名称或网关地址粘贴到 Issue 或聊天记录。
- 原始 MCP 调用前先执行 `mcp describe`；写操作先预览，确认执行后重新读取状态验收。

## 客户端配置

写入前先预览：

```bash
yeelight-ai client configure cursor --json
yeelight-ai client configure claude --json
yeelight-ai client configure vscode --json
```

追加 `--write --yes` 后，CLI 会把生成的 MCP server 合并进现有客户端配置，不会删除无关 server。

## 文档

- [接入指南](guides/integration.zh-CN.md)
- [使用与源码指南](guides/usage.zh-CN.md)
- [Integration guide](guides/integration.md)
- [Usage and source guide](guides/usage.md)

## 开发验证

```bash
npm test
npm run smoke
npm pack --dry-run --json
```

npm 包仅包含公开运行时、中英文用户文档和许可证。内部发布检查与预览登录实现不属于本仓库公共边界，也不会进入 npm 包。

## 许可证

Apache License 2.0，详见 [LICENSE](LICENSE)。
