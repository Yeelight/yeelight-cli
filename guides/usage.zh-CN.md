# Yeelight AI CLI 使用与源码指南

[English](usage.md) | [README](../README.zh-CN.md) | [接入指南](integration.zh-CN.md)

## 从 npm 安装

```bash
npm install --global yeelight-ai
yeelight-ai --help
```

日常使用应优先选择 npm 安装。源码方式适合开发、验证未发布修复和复现问题。

## 从源码运行

```bash
git clone https://github.com/Yeelight/yeelight-cli.git
cd yeelight-cli
npm install
npm test
node bin/yeelight-ai.js --help
```

需要注册全局命令时：

```bash
npm link
yeelight-ai --version
```

使用 `npm unlink --global yeelight-ai` 取消 link。

## 隔离开发配置

```bash
export YEELIGHT_AI_CONFIG_DIR="$HOME/.config/yeelight-ai-development"
node bin/yeelight-ai.js doctor --json
```

这样可以避免源码开发配置与默认用户配置相互影响。

## 登录和选择家庭

```bash
yeelight-ai login
yeelight-ai login --method qr --region cn
```

在 Yeelight Pro APP 首页点击右上角 `+`，选择 **MCP 授权**，扫描终端二维码。账号包含多个家庭时应交互选择；受控脚本中可以明确传入 `--house-id`。`--region` 支持 `cn`、`sg`、`us`、`eu`，默认 `cn`。

## 验证新安装

```bash
yeelight-ai doctor
yeelight-ai mcp list
yeelight-ai mcp tools metadata
yeelight-ai mcp tools cloud
```

LAN 应先配置网关并执行只读探测：

```bash
yeelight-ai mcp configure lan --gateway-ip <gateway-ip>
yeelight-ai doctor --mcp lan --probe
```

## 脚本调用

使用 `--json` 获取稳定的机器可读输出：

```bash
yeelight-ai status --json
yeelight-ai device list --json
yeelight-ai mcp call cloud get_devices --args '{}' --data-only
```

列表命令支持 `--limit`、`--cursor` 和 `--all`。不要解析或构造 cursor，应把返回的 `nextCursor` 原样传回。

## 安全写操作

快捷写命令没有 `--yes` 时只生成预览：

```bash
yeelight-ai light color-temperature <deviceId> 4000
yeelight-ai light color-temperature <deviceId> 4000 --yes
```

原始 Metadata 写操作先设置 `options.dryRun=true`，检查计划并完成用户确认后再发送确认请求；执行后重新读取目标状态。

## 客户端配置

```bash
yeelight-ai client configure cursor --json
yeelight-ai client configure cursor --write --yes
```

同一流程支持 `claude` 和 `vscode`。写入前按所在环境要求备份客户端配置。

## 更新源码

```bash
git pull --ff-only
npm install
npm test
npm run smoke
```

复现问题时使用固定 tag 或 commit。反馈时提供 CLI 版本、Node.js 版本、操作系统、脱敏命令和脱敏错误，不要附带配置文件或含凭据的输出。

## 常见问题

- 非交互终端：使用 `doctor --json` 等明确子命令。
- 没有家庭：检查 Region 和 Yeelight Pro 家庭归属。普通家庭模式不会回退商照项目；需要商照项目时显式选择 `bizType=1`。
- Cloud 或 Metadata 不可用：运行对应的 `doctor --mcp ... --probe` 并检查网络。
- LAN 不可用：检查 LAN CONTROL、本地路由、网关地址和端口。
- 参数未知：使用 `mcp describe` 或 Metadata `get_action_schema`。

## 开发验证

```bash
npm test
npm run smoke
npm pack --dry-run --json
```

发布前检查 pack 文件列表，只应包含 `bin/`、公开 `src/` 运行时、中英文 README 和指南、`LICENSE` 与包元数据。
