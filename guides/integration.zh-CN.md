# Yeelight AI CLI 接入指南

[English](integration.md) | [README](../README.zh-CN.md) | [使用指南](usage.zh-CN.md)

仓库入口：[GitHub](https://github.com/Yeelight/yeelight-cli) 是规范源；无法访问
GitHub 时可使用只读的 [Gitee](https://gitee.com/yeelight/yeelight-cli) 或
[GitCode](https://gitcode.com/Yeelight/yeelight-cli) 国内镜像，
[GitLab.com](https://gitlab.com/Yeelight/yeelight-cli) 是全球备用源。

本文面向通过 `yeelight-ai` 将 Yeelight MCP 服务接入本地 AI 工具、脚本或开发流程的开发者。

## 选择服务

| 任务 | 服务 | 起始命令 |
| --- | --- | --- |
| 设备状态、灯光控制、执行情景 | `cloud` | `mcp tools cloud` |
| 家庭、房间、设备组、情景、自动化或配置管理 | `metadata` | `mcp groups metadata` |
| 网关本地发现和控制 | `lan` | `doctor --mcp lan --probe` |

CLI 是 MCP 客户端和工作流辅助工具，不会把 MCP 替换成另一套业务 API。

## 登录认证

运行交互式登录：

```bash
yeelight-ai login
```

按提示选择账号 Region，然后在 Yeelight Pro APP 首页点击右上角 `+`，选择 **MCP 授权**，扫描终端二维码。

账密登录时通过提示输入密码：

```bash
yeelight-ai login --method password --account <手机号或邮箱>
```

已有 token 时使用手动方式：

```bash
yeelight-ai login --authorization <token> --region cn --house-id <houseId>
```

Cloud 和 Metadata 调用会自动读取当前 profile 的 `Authorization`、`Yeelight-Region` 和可选 `House-Id`。Region 优先级是 `--region` -> `YEELIGHT_CLOUD_REGION` -> profile -> `cn`。LAN 调用不会携带云端 Header，用户无需配置 Client ID。

## 调用前先发现

```bash
yeelight-ai mcp list
yeelight-ai mcp inspect cloud --json
yeelight-ai mcp tools cloud
yeelight-ai mcp describe cloud get_devices --json
```

工具列表支持 cursor 分页：

```bash
yeelight-ai mcp tools cloud --json
yeelight-ai mcp tools cloud --cursor '<nextCursor>'
yeelight-ai mcp tools cloud --all
```

## Cloud MCP

日常读取和受保护控制优先使用业务命令：

```bash
yeelight-ai device list
yeelight-ai light on <deviceId>
yeelight-ai light on <deviceId> --yes
```

没有快捷命令或需要排障时再调用原始 MCP：

```bash
yeelight-ai mcp call cloud get_devices --args '{}' --json
```

`--raw` 保留完整 MCP result，适合排障；`--data-only` 只返回解析后的业务数据，适合脚本。

## Metadata MCP

当前任务化工具面包括：

- `yeelight_metadata.list_groups`
- `yeelight_metadata.list_houses`
- `yeelight_metadata.list_tasks`
- `yeelight_metadata.list_actions`
- `yeelight_metadata.get_action_schema`
- `yeelight_metadata.execute_task`

先浏览任务，再读取一个 action 的 schema：

```bash
yeelight-ai mcp call metadata yeelight_metadata.list_tasks \
  --args '{"group":"family_space"}' --json
yeelight-ai mcp call metadata yeelight_metadata.get_action_schema \
  --args '{"task":"family_space.manage_room","action":"list"}' --json
```

Metadata 写操作应先生成计划：

```bash
yeelight-ai mcp call metadata yeelight_metadata.execute_task \
  --args '{"request":{"task":"family_space.manage_room","action":"create","payload":{"name":"示例房间"},"options":{"dryRun":true}}}' \
  --json
```

检查计划无误后，调用方才应设置 `dryRun:false` 并提供所需的副作用确认。

## LAN MCP

先在 Yeelight APP 中开启 LAN CONTROL，再配置网关：

```bash
yeelight-ai mcp configure lan --gateway-ip <gateway-ip>
yeelight-ai doctor --mcp lan --probe
yeelight-ai mcp tools lan --json
```

不要硬编码 LAN 工具名或属性 key。接入前读取网关实时返回的工具列表、能力、节点 ID 和 schema。

## 配置 MCP 客户端

```bash
yeelight-ai client configure cursor --json
yeelight-ai client configure claude --json
yeelight-ai client configure vscode --json
```

检查预览后追加 `--write --yes`。写入时会合并生成的 server，并保留无关的已有 server；只有配置网关后才会加入 LAN MCP。

## 诊断与错误

```bash
yeelight-ai doctor --json
yeelight-ai doctor --mcp metadata --probe --timeout-ms 30000
```

- 认证失败：重新登录，再查看脱敏后的 profile。
- 家庭不匹配：重新登录并选择家庭，或显式传入正确家庭。
- Metadata 发现较慢：日常使用本地定义，只有核对在线服务时才追加 `--remote`。
- LAN 不可用：检查 LAN CONTROL、网络可达性和网关端口。
- 工具参数错误：执行 `mcp describe` 或读取 Metadata action schema，不要猜测。

## 接入安全

- 凭据不得进入源码、日志、prompt、报告或 Issue 模板。
- 自动化使用 JSON 输出，并在消费数据前检查 `ok`。
- 写操作先预览，在调用层完成用户确认，执行后重新读取状态。
- 工具和 action schema 是运行时契约，不要在业务代码中长期保存过期副本。
