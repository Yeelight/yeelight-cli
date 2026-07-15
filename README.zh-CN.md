# Yeelight AI CLI

[English](README.md)

Yeelight AI CLI 是 Yeelight `cloud`、`metadata`、`lan` 三类 MCP 的统一入口。用户通常只需要运行 `yeelight-ai`：CLI 会自动检查本地登录上下文，引导登录并选择家庭，然后进入工作台。日常查看和控制优先使用业务快捷命令，高级排障时再进入原始 MCP 工具层。

## Yeelight AI 能力矩阵

这些项目组成互补的 Yeelight AI 技术栈。可以根据接入方式选择入口，也可以组合使用。

| 项目 | 定位与核心能力 | 适用场景 | GitHub |
| --- | --- | --- | --- |
| Yeelight Home | 首选本地语义 Runtime，通过统一结构化 `invoke --stdin` 边界提供查询、控制、场景、自动化、灯光设计、诊断、产品知识和生成应用能力。 | 需要稳定、受策略保护的智能家居执行层的 Agent host、本地自动化和应用。 | [Yeelight/yeelight-home](https://github.com/Yeelight/yeelight-home) |
| Yeelight Smart Home Skills | 官方 Agent Skills：Smart Home 把自然语言转换为安全的 Runtime 操作；PRO App Builder 基于已验证能力生成专用本地应用。 | 需要智能家居对话工作流或应用生成能力的 Agent host。 | [Yeelight/yeelight-smart-home-skills](https://github.com/Yeelight/yeelight-smart-home-skills) |
| Yeelight AI CLI | 统一终端工作台和 MCP 客户端，连接 Cloud、Metadata 和 LAN 服务，提供本地 profile、安全快捷命令、诊断、脚本和 AI 客户端配置。 | 希望通过通用 MCP 与自动化命令行入口操作的用户、脚本和 CI。 | [Yeelight/yeelight-cli](https://github.com/Yeelight/yeelight-cli) |
| Yeelight Metadata MCP | 新 MCP 用户推荐的统一云端入口，提供受保护的家庭、房间、设备、设备组、面板、情景、自动化、收藏、维护和账号工作流，并支持多 Region 授权和请求级家庭选择。 | 需要广泛发现、检查和管理工作流的新 MCP 集成与 AI 客户端。 | [Yeelight/yeelight-metadata-mcp](https://github.com/Yeelight/yeelight-metadata-mcp) |
| Yeelight IoT MCP | 面向特定直接控制场景的专业补充，提供 Metadata MCP 尚未完全覆盖的拓扑与实时状态访问、设备控制和情景执行。 | 依赖 `control_node`、`execute_scene` 或特定实时控制的既有集成与客户端。 | [Yeelight/yeelight-iot-mcp](https://github.com/Yeelight/yeelight-iot-mcp) |

Yeelight Home 还提供系统凭据存储、本地 QR 登录、秘密脱敏诊断、预览与校验、调用方确认和 Runtime 策略/写后读取、本地记忆与推荐、实操经验，以及机器可读的 intent schema 和解释。跨平台二进制通过 GitHub Release、npm 和已支持的包管理器分发。

典型组合：智能家居 Agent 和生成应用 -> Skills -> Yeelight Home；终端用户和脚本 -> Yeelight AI CLI；新 MCP 集成 -> Metadata MCP；仅在 Metadata MCP 尚未覆盖的特定直接控制或情景执行场景下增加 IoT MCP。


## 安装要求

- Node.js 20 或更高版本。
- Yeelight 账号。
- 使用 LAN MCP 时，需要网关 IP，并在 APP 中开启 LAN CONTROL。

发布到 npm 后，可全局安装：

```bash
npm install -g yeelight-ai
yeelight-ai --help
```

从源码目录运行：

```bash
cd yeelight-cli
npm install
npm link
yeelight-ai --help
```

不安装全局命令时，也可以使用：

```bash
node bin/yeelight-ai.js --help
```

需要在非交互环境查看同一份工作台摘要或快捷动作时，可运行：

```bash
yeelight-ai status
yeelight-ai status --json
yeelight-ai quick
yeelight-ai quick --json
```

## 快速开始

首次使用直接启动交互式 CLI：

```bash
yeelight-ai
```

CLI 会自动完成以下准备工作：

1. 检查本地是否已有登录上下文。
2. 如果已有缓存，询问是否复用。
3. 如果缺少凭证，进入登录流程。
4. 选择账号 Region；默认使用 `cn`，也支持 `sg`、`us`、`eu`。
5. 登录成功后只从所选业务域拉取家庭列表，并引导选择一个家庭。
6. 保存 MCP 调用所需的 `Authorization`、`Yeelight-Region` 和 `House-Id`。
7. 进入工作台。

工作台会先展示当前家庭、Cloud MCP、Metadata MCP 和推荐下一步，然后把入口分成常用和高级两组：

```text
Yeelight AI CLI 工作台
状态
当前家庭：<houseId>
Cloud MCP：远端 https://api.yeelight.com/apis/mcp_server/v1/mcp
Metadata MCP：远端 https://api.yeelight.com/apis/metadata_mcp_server/v1/mcp
推荐下一步：查设备输入 devices，排障输入 doctor，高级 MCP 调用输入 tools。

常用
  7. 常用快捷操作  rooms / devices / light / run-scene
  1. 诊断当前配置  doctor
  6. 重新登录/切换家庭  login

高级
  2. 查看 MCP 列表  mcp
  3. 调用 MCP 工具  tools
  4. 配置客户端  client
  5. 运行 demo  demo
  0. 退出
```

菜单支持数字和语义别名。比如在工作台输入 `devices` 会直接查看设备，输入 `doctor` 会执行诊断；需要浏览全部常用动作时输入 `shortcut`。

## 5 分钟完成第一次调用

如果只想最快确认 CLI 可用，按下面的菜单路径执行即可。

1. 启动 CLI：

```bash
yeelight-ai
```

首次启动时，按提示用 Yeelight / 易来 APP 扫码确认，然后选择家庭。登录上下文保存后会进入工作台。

2. 在工作台选择 `1. 诊断当前配置`，也可以直接输入 `doctor`。

看到 `GLOBAL_CONFIG_EXISTS`、`AUTH_TOKEN_PRESENT`、`METADATA_ENDPOINT_CONFIGURED` 等关键项通过后，可以继续调用 MCP。

3. 日常查看设备时，优先选择 `7. 常用快捷操作`，再选择 `3. 查看设备列表`，也可以直接输入 `device` 后输入 `devices`。

4. 如果需要原始 MCP 调用，再在工作台选择 `3. 调用 MCP 工具`，调用 cloud 的设备列表：

- MCP 选择默认 `cloud`，直接回车。
- 选择先查看工具列表。
- 工具名输入 `get_devices`。
- 参数 JSON 使用默认 `{}`。
- 调用完成后会留在 `cloud` MCP 内，可以直接继续输入下一个工具名；输入 `0` 可返回工作台。

5. 切换到 metadata 并调用任务列表：

- 在 `cloud` 工具名提示处输入 `switch`。
- MCP 输入 `metadata`。
- 工具名输入 `yeelight_metadata.list_tasks`。
- 参数 JSON 输入 `{"group":"family_space"}`。

6. 如果需要接入 LAN MCP，再选择 `3. 调用 MCP 工具` 并输入 `lan`。如果尚未配置 gateway IP，CLI 会提示你现场配置。

完成以上步骤后，用户已经具备调用 cloud、metadata 和 LAN MCP 的基本路径。后续可以继续在菜单中查看工具列表、查看工具参数、调用工具、配置客户端和运行 demo。

工作台中的 `调用 MCP 工具` 会先选择一个 MCP，然后停留在该 MCP 的工具会话中，便于连续调用和分页；输入 `tools` 可重新查看工具列表，输入 `switch` 可切换 MCP，输入 `0`、`返回` 或 `back` 可回到工作台。`配置客户端` 和 `运行 demo` 也会停留在各自流程中，输入 `0` 可返回工作台。

等熟悉 CLI 后，也可以使用子命令完成同样的动作：

```bash
yeelight-ai doctor
yeelight-ai status
yeelight-ai device list
yeelight-ai light on <deviceId>
yeelight-ai mcp call cloud get_devices --args '{}' --json
yeelight-ai mcp call metadata yeelight_metadata.list_tasks --args '{"group":"family_space"}' --json
```

## 业务快捷命令

日常查看和控制优先使用业务快捷命令；它们会自动复用本地登录上下文，并在底层调用 cloud MCP。`mcp` 子命令仍保留给高级排障和原始工具调用。

```bash
yeelight-ai house show
yeelight-ai room list
yeelight-ai device list
yeelight-ai device list --room <roomId>
yeelight-ai device show <deviceId>
yeelight-ai scene list
```

控制类命令默认只生成 dry-run 执行计划，不调用真实控制接口。确认要执行时追加 `--yes`：

```bash
yeelight-ai light on <deviceId>
yeelight-ai light off <deviceId>
yeelight-ai light brightness <deviceId> 80
yeelight-ai light color-temperature <deviceId> 4000
yeelight-ai scene run <sceneId>

yeelight-ai light on <deviceId> --yes
yeelight-ai scene run <sceneId> --yes
```

脚本场景可追加 `--json` 或 `--format json` 获取结构化输出。需要查看某类快捷命令的详细用法时，可运行：

```bash
yeelight-ai device help
yeelight-ai light help
```

如果 cloud MCP 初始化失败且返回 HTTP 421，读类快捷命令会自动使用 Yeelight OpenAPI 查询，并在普通输出中标明数据来源。需要切换本地或远端 cloud MCP 时可运行：

```bash
yeelight-ai mcp configure cloud --local
yeelight-ai mcp configure cloud --remote
yeelight-ai mcp configure cloud --endpoint http://127.0.0.1:9000/mcp
```

Metadata MCP 也支持同样的本地和远端切换：

```bash
yeelight-ai mcp configure metadata --local
yeelight-ai mcp configure metadata --remote
```

## 登录与家庭选择

正常情况下不需要单独执行 `login`。直接运行 `yeelight-ai` 时，如果本地没有可用凭证，CLI 会自动进入登录流程；如果本地已有凭证，CLI 会询问是否复用。

当前可用登录方式：

- 扫码登录：推荐方式。CLI 生成二维码后，在 Yeelight Pro APP 首页点击右上角 `+`，选择 **MCP 授权**，扫描终端二维码并确认。
- 手动 token：适合已有 token 或排障场景。

交互式运行 `yeelight-ai login` 时会先展示“扫码登录”和“手动粘贴 token”两个入口，直接回车默认使用扫码登录。拉取家庭列表前还会选择家庭类型：

- `bizType=0`：普通 Pro 家庭，也是默认值；列表为空时不会回退商照项目。
- `bizType=1`：商照项目，只有本次显式选择时才查询。

需要重新登录或切换家庭时，优先在工作台选择 `6. 重新登录/切换家庭`。

脚本或非交互场景才建议直接调用 `login` 子命令：

```bash
yeelight-ai login
yeelight-ai login --method qr --region cn
yeelight-ai login --method qr --region eu --biz-type 0
```

和 APP 联调时，可以固定 CLI 设备标识并只生成二维码，不等待确认：

```bash
yeelight-ai login --method qr --client-device-id cli-debug-1 --no-wait --json
```

不显式传 `--client-device-id` 时，CLI 会首次生成一个 `cli_...` 设备标识并保存到本地配置，后续扫码默认复用；显式传入的值只覆盖当次扫码。

已有 token 时可手动保存：

```bash
yeelight-ai login --authorization <token> --region cn --house-id <houseId>
yeelight-ai login --authorization <token> --region cn --biz-type 1
```

Region 优先级为 `--region` -> `YEELIGHT_CLOUD_REGION` -> 当前 profile -> `cn`。
用户不需要配置 Client ID；可信 Yeelight 上游会从 Authorization 上下文中解析。

也可以进入交互式手动录入：

```bash
yeelight-ai login --manual
```

## 配置文件

默认配置路径：

- macOS/Linux：`~/.config/yeelight-ai/config.json`
- Windows：`%APPDATA%/yeelight-ai/config.json`

正常使用不需要手动执行 `init`。配置文件不存在时，CLI 会在首次启动、登录或保存配置时自动按默认结构创建。测试或临时环境可通过 `YEELIGHT_AI_CONFIG_DIR` 指定独立配置目录：

```bash
YEELIGHT_AI_CONFIG_DIR=/tmp/yeelight-ai-cli yeelight-ai
```

查看当前配置：

```bash
yeelight-ai config get --json
```

默认输出会脱敏凭证。确需查看完整配置时使用 `--show-secrets`。

## MCP 概览

CLI 固定管理三个 MCP：

| MCP | 用途 | 认证 |
| --- | --- | --- |
| `cloud` | 云端控制、设备查询、情景执行 | 自动携带登录 Header |
| `metadata` | 家庭、房间、设备组、场景、自动化等元数据管理任务 | 自动携带登录 Header |
| `lan` | 网关局域网 MCP，本地发现与控制 | 不携带云端认证 Header |

查看 MCP 列表：

```bash
yeelight-ai mcp list
```

查看单个 MCP 配置和能力：

```bash
yeelight-ai mcp inspect cloud
yeelight-ai mcp inspect metadata
yeelight-ai mcp inspect lan
```

## 调用 Cloud MCP

查看工具列表：

```bash
yeelight-ai mcp tools cloud
```

查看工具参数：

```bash
yeelight-ai mcp describe cloud get_devices
yeelight-ai mcp describe cloud control_node
```

调用工具：

```bash
yeelight-ai mcp call cloud get_devices --args '{}' --json
```

`mcp call` 默认输出会去重：展示解析后的业务结果和少量调用元信息，不再同时展开完整 MCP `result.content`。对于 `metadata` 的任务浏览型工具，CLI 还会默认隐藏较大的 action 详情、schema 和接口映射，只保留摘要。排障时可追加 `--raw` 查看原始 MCP 返回；脚本需要完整业务数据时可用 `--data-only`：

```bash
yeelight-ai mcp call cloud get_devices --args '{}' --json --raw
yeelight-ai mcp call cloud get_devices --args '{}' --data-only
```

控制类工具调用前，建议先通过 `describe` 查看参数结构，并确认目标节点 ID、节点类型和可控属性。

## 调用 Metadata MCP

Metadata MCP 使用统一任务模型，日常查看工具列表和参数说明时，CLI 默认使用内置工具定义，不依赖远端 `tools/list`：

```bash
yeelight-ai mcp tools metadata
yeelight-ai mcp describe metadata yeelight_metadata.list_groups
yeelight-ai mcp describe metadata yeelight_metadata.list_tasks
```

工具列表遵循 MCP cursor 分页模型。远端返回 `nextCursor` 时，CLI 会在普通输出里提示下一页命令；脚本场景可以从 `--json` 输出读取 `nextCursor` 并原样传回：

```bash
yeelight-ai mcp tools cloud --json
yeelight-ai mcp tools cloud --cursor '<nextCursor>'
yeelight-ai mcp tools cloud --all
```

metadata 的内置工具定义也支持同样的分页参数，便于后续工具数量增长时保持一致：

```bash
yeelight-ai mcp tools metadata --limit 20 --json
yeelight-ai mcp tools metadata --cursor '<nextCursor>' --limit 20
```

`mcp tools --json` 默认只输出工具摘要和参数摘要；需要完整 `inputSchema` 时追加 `--raw`：

```bash
yeelight-ai mcp tools metadata --json --raw
```

查看 metadata 任务分组：

```bash
yeelight-ai mcp groups metadata
```

常用流程：

```bash
yeelight-ai mcp call metadata yeelight_metadata.list_groups --args '{}' --json
yeelight-ai mcp call metadata yeelight_metadata.list_tasks --args '{"group":"family_space"}' --json
yeelight-ai mcp call metadata yeelight_metadata.list_tasks --args '{"task":"family_space.manage_room"}' --json
yeelight-ai mcp call metadata yeelight_metadata.get_action_schema --args '{"task":"family_space.manage_room","action":"list"}' --json
```

如果远端返回内容较大，CLI 默认会对 `list_tasks` 这类浏览型结果做摘要展示，避免一次展开完整 action schema 和接口映射。需要完整业务数据时用 `--data-only`，只有排障时再用 `--raw` 展开完整 MCP result。

执行任务时使用 `yeelight_metadata.execute_task`。写入、删除、解绑、转移等有副作用的动作默认应先 dry run，确认后再执行：

```bash
yeelight-ai mcp call metadata yeelight_metadata.execute_task --args '{
  "request": {
    "task": "family_space.manage_room",
    "action": "list",
    "context": {},
    "payload": {},
    "options": { "dryRun": true }
  }
}' --json
```

需要验证远端工具发现结果时追加 `--remote`：

```bash
yeelight-ai mcp tools metadata --remote --timeout-ms 30000
```

## 配置和调用 LAN MCP

LAN MCP endpoint 形态：

```text
http://<gateway-ip>:18080/mcp
```

先在 APP 中开启 LAN CONTROL。首次在菜单中选择 `lan` 时，如果尚未配置 gateway IP，CLI 会提示输入网关 IP 或 endpoint。也可以用子命令提前配置：

```bash
yeelight-ai mcp configure lan --gateway-ip 192.168.1.93
```

探测网关 MCP：

```bash
yeelight-ai mcp inspect lan --probe --json
yeelight-ai doctor --mcp lan --probe
```

查看并调用 LAN 工具：

```bash
yeelight-ai mcp tools lan
yeelight-ai mcp describe lan get_provider_info
yeelight-ai mcp call lan get_provider_info --args '{}' --json
```

LAN 工具名、描述和参数 schema 以网关运行时 `tools/list` 返回为准，CLI 不固化具体工具契约。

## 客户端配置

CLI 可以生成 Cursor、Claude Desktop 和 VS Code 的 MCP 配置。

预览 Cursor 配置：

```bash
yeelight-ai client configure cursor --json
```

写入 Cursor 配置：

```bash
yeelight-ai client configure cursor --write --yes
```

生成 Claude Desktop 配置：

```bash
yeelight-ai client configure claude --json
```

生成 VS Code 配置：

```bash
yeelight-ai client configure vscode --json
```

写入真实配置文件时传 `--write --yes`。写入会合并现有 `mcpServers`，不会删除其他 MCP server。LAN MCP 只有在配置 gateway IP 后才会写入客户端配置。

## 诊断

检查当前配置：

```bash
yeelight-ai doctor
```

只诊断指定 MCP：

```bash
yeelight-ai doctor --mcp cloud
yeelight-ai doctor --mcp metadata
yeelight-ai doctor --mcp lan
```

执行真实 MCP 探测：

```bash
yeelight-ai doctor --probe
yeelight-ai doctor --mcp metadata --probe --timeout-ms 30000
```

`doctor --json` 适合接入发布检查或自动化脚本。

## Demo 验收

Cloud demo 输出安全示例：

```bash
yeelight-ai demo cloud --json
```

Metadata demo 输出任务模型 dry-run 示例：

```bash
yeelight-ai demo metadata --json
```

LAN demo 默认只输出计划；显式 `--probe` 时会调用只读工具，不执行控制动作：

```bash
yeelight-ai demo lan --probe --json
```

## 常用命令

```bash
yeelight-ai
yeelight-ai status
yeelight-ai quick
yeelight-ai mcp list
yeelight-ai mcp tools cloud
yeelight-ai mcp tools cloud --all
yeelight-ai mcp tools metadata
yeelight-ai mcp groups metadata
yeelight-ai mcp tools lan
yeelight-ai doctor --probe
yeelight-ai client configure cursor --json
```

## 发布前验证

```bash
npm test
npm run smoke
npm pack --dry-run
```

当前测试覆盖配置生成、登录凭证脱敏、业务快捷命令、三 MCP registry、工具发现、参数说明、工具调用、LAN 配置、客户端配置、诊断和 demo 流程。

`npm pack --dry-run` 用于确认发布包只包含公开运行时文件、二维码登录实现、中英文 README、公开指南、许可证和 `package.json`，不包含内部发布与安全工具。

## 输出与凭证约定

- `config get` 默认脱敏，不输出完整 token。
- `doctor --json` 不包含完整凭证。
- 登录流程支持裸 token 和 `Bearer xxx`，保存时统一为单个 `Bearer xxx`。
- cloud 和 metadata 调用会自动使用登录后保存的 `Authorization`、`Yeelight-Region`、可选 `House-Id` 和 `bizType`。
- lan 调用只访问本地网关 MCP，不携带云端认证 Header。

## 常见问题

### 运行 `yeelight-ai` 提示非交互终端

无参数启动需要交互式终端。脚本或 CI 环境请使用具体子命令：

```bash
yeelight-ai --help
yeelight-ai doctor --json
yeelight-ai mcp list --json
```

### 登录成功后没有家庭可选

默认普通家庭模式只读取 Yeelight Pro 家庭，不会跨业务域回退到商照项目。请先确认账号 Region 正确，并在 Yeelight Pro APP 中确认账号已加入家庭；商照账号需在登录时显式选择 `bizType=1`。

```bash
yeelight-ai
```

如果你已经知道家庭 ID，并且已有可用 token，也可以用手动写入方式恢复配置：

```bash
yeelight-ai login --authorization <token> --region cn --house-id <houseId>
```

### Cloud 或 Metadata 调用提示需要先登录

cloud 和 metadata 会自动读取本地保存的 `Authorization`、`Yeelight-Region` 和可选 `House-Id`。如果缺失或切换了账号，重新运行：

```bash
yeelight-ai
```

也可以在工作台选择 `6. 重新登录/切换家庭`。

### Metadata 或 Cloud initialize 超时

先确认本地配置和 Header：

```bash
yeelight-ai doctor --mcp metadata --probe --timeout-ms 30000
yeelight-ai doctor --mcp cloud --probe --timeout-ms 30000
```

如果诊断显示配置和认证通过，但 `initialize` 超时，通常是网络、远端网关路由或 MCP 服务状态问题。可以稍后重试，或联系服务端确认对应 endpoint 是否可用。

### LAN MCP 连接不上

请按顺序检查：

1. APP 已开启 LAN CONTROL。
2. 电脑和网关在同一局域网。
3. gateway IP 正确。
4. 网关 `http://<gateway-ip>:18080/mcp` 可访问。

重新配置并探测：

```bash
yeelight-ai mcp configure lan --gateway-ip <gateway-ip>
yeelight-ai doctor --mcp lan --probe
```

### 不知道工具需要什么参数

先看工具列表，再看单个工具参数说明：

```bash
yeelight-ai mcp tools cloud
yeelight-ai mcp describe cloud get_devices
yeelight-ai mcp tools metadata
yeelight-ai mcp describe metadata yeelight_metadata.execute_task
yeelight-ai mcp tools lan
yeelight-ai mcp describe lan <tool>
```

metadata 还可以先查看 group 和 task：

```bash
yeelight-ai mcp groups metadata
yeelight-ai mcp call metadata yeelight_metadata.list_groups --args '{}' --json
yeelight-ai mcp call metadata yeelight_metadata.list_tasks --args '{"group":"family_space"}' --json
```

### 客户端配置写入后没有看到 LAN MCP

LAN MCP 只有在配置 gateway IP 后才会写入客户端配置。先运行：

```bash
yeelight-ai mcp configure lan --gateway-ip <gateway-ip>
yeelight-ai client configure cursor --write --yes
```

Claude Desktop 和 VS Code 同理，写入时会保留已有 `mcpServers`，不会删除其他 MCP server。

## 文档

- [接入指南](guides/integration.zh-CN.md)
- [使用与源码指南](guides/usage.zh-CN.md)
- [Integration guide](guides/integration.md)
- [Usage and source guide](guides/usage.md)

## 许可证

Apache License 2.0，详见 [LICENSE](LICENSE)。
