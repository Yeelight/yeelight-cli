# Yeelight AI CLI

[简体中文](README.zh-CN.md)

`yeelight-ai` is the official command-line workspace for Yeelight Cloud,
Metadata, and LAN MCP services. It provides one installation, one local profile,
safe device shortcuts, MCP discovery and invocation, diagnostics, and client
configuration for Cursor, Claude Desktop, and VS Code.

## Yeelight AI Capability Matrix

These projects form a complementary stack. Choose the entry point that matches
how you integrate with Yeelight; they can also be combined.

| Project | Role and capabilities | Best for | GitHub |
| --- | --- | --- | --- |
| Yeelight Home | Recommended local semantic Runtime with one structured `invoke --stdin` boundary for queries, control, scenes, automations, lighting design, diagnostics, product knowledge, and generated apps. | Agent hosts, local automation, and applications that need a stable and policy-aware smart-home execution layer. | [Yeelight/yeelight-home](https://github.com/Yeelight/yeelight-home) |
| Yeelight Smart Home Skills | Official Agent Skills: Smart Home turns natural language into safe Runtime operations; PRO App Builder generates focused local apps from proven Runtime capabilities. | Agent hosts that need conversational smart-home workflows or app generation. | [Yeelight/yeelight-smart-home-skills](https://github.com/Yeelight/yeelight-smart-home-skills) |
| Yeelight AI CLI | Unified terminal workspace and MCP client for Cloud, Metadata, and LAN services, with local profiles, safe shortcuts, diagnostics, scripting, and AI client configuration. | People, scripts, and CI that want one general MCP and automation entry point. | [Yeelight/yeelight-cli](https://github.com/Yeelight/yeelight-cli) |
| Yeelight IoT MCP | Hosted or self-hosted Streamable HTTP MCP server for topology, live state, device control, and scene execution. | MCP clients that need direct IoT discovery and control. | [Yeelight/yeelight-iot-mcp](https://github.com/Yeelight/yeelight-iot-mcp) |
| Yeelight Metadata MCP | Hosted or self-hosted Streamable HTTP MCP server for guarded home, room, group, panel, scene, automation, favorite, and account metadata workflows. | MCP clients that need metadata inspection and management. | [Yeelight/yeelight-metadata-mcp](https://github.com/Yeelight/yeelight-metadata-mcp) |

Yeelight Home also provides system credential storage, local QR login, secret-redacted diagnostics, preview and validation, caller confirmation and Runtime policy/readback behavior, local memory and recommendation support, operation lessons, and machine-readable intent schema/explanations. Cross-platform binaries are distributed through GitHub Releases, npm, and supported package managers.

Typical paths: smart-home agents and generated apps -> Skills -> Yeelight Home; terminal users and scripts -> Yeelight AI CLI; MCP clients -> IoT MCP and/or Metadata MCP.

## Requirements

- Node.js 20 or later
- A Yeelight account for Cloud and Metadata MCP
- A reachable Yeelight gateway with LAN CONTROL enabled for LAN MCP

## Install

```bash
npm install --global yeelight-ai
yeelight-ai --version
yeelight-ai --help
```

To run from a source checkout:

```bash
git clone https://github.com/Yeelight/yeelight-cli.git
cd yeelight-cli
npm install
npm test
node bin/yeelight-ai.js --help
```

## Quick Start

Start the interactive workspace:

```bash
yeelight-ai
```

The CLI checks the local profile, reuses cached credentials when approved,
guides you through QR login when required, asks whether to use a consumer home
(`bizType=0`) or commercial-lighting project (`bizType=1`), selects a home,
and opens the command workspace. Use the Yeelight app to scan and approve the
terminal QR code; manual token entry remains available for recovery and
non-interactive environments.

The workspace shows the selected home, Cloud and Metadata endpoints, and a
recommended next action. Its menus accept both numbers and semantic aliases
such as `devices`, `doctor`, `tools`, `switch`, and `back`.

For scripts and CI, use explicit commands and JSON output:

```bash
yeelight-ai doctor --json
yeelight-ai status --json
yeelight-ai mcp list --json
```

## Common Commands

Read-only home commands:

```bash
yeelight-ai house show
yeelight-ai room list
yeelight-ai device list
yeelight-ai device show <deviceId>
yeelight-ai scene list
```

Device and scene writes are previews by default. Add `--yes` only after the
target and action have been reviewed:

```bash
yeelight-ai light brightness <deviceId> 80
yeelight-ai light brightness <deviceId> 80 --yes
yeelight-ai scene run <sceneId>
yeelight-ai scene run <sceneId> --yes
```

If Cloud MCP initialization returns HTTP 421, read-only shortcuts
automatically fall back to the Yeelight OpenAPI and identify the data source.
Cloud and Metadata MCP can be switched between local, remote, or explicit
endpoints:

```bash
yeelight-ai mcp configure cloud --local
yeelight-ai mcp configure cloud --remote
yeelight-ai mcp configure cloud --endpoint http://127.0.0.1:9000/mcp
yeelight-ai mcp configure metadata --local
yeelight-ai mcp configure metadata --remote
```

## Login And Home Selection

Running `yeelight-ai` is normally enough. To explicitly log in, switch home,
select a business type, or support app integration, use:

```bash
yeelight-ai login
yeelight-ai login --method qr --biz-type 0
yeelight-ai login --method qr --client-device-id cli-debug-1 --no-wait --json
yeelight-ai login --authorization <token> --client-id <clientId> --house-id <houseId>
yeelight-ai login --authorization <token> --client-id <clientId> --biz-type 1
yeelight-ai login --manual
```

The QR payload has the form `cli&clientDeviceId&qrCodeId`. When no device ID
is supplied, the CLI generates and persists a `cli_...` identifier for later
logins; an explicit value applies only to that invocation. Cloud and Metadata
requests automatically receive the saved `Authorization`, `Client-Id`,
`House-Id`, and `bizType` headers.

## MCP Tool Invocation

Discover and invoke MCP tools:

```bash
yeelight-ai mcp tools cloud
yeelight-ai mcp describe cloud get_devices
yeelight-ai mcp call cloud get_devices --args '{}' --json

yeelight-ai mcp groups metadata
yeelight-ai mcp describe metadata yeelight_metadata.execute_task
yeelight-ai mcp call metadata yeelight_metadata.list_tasks --args '{}' --json
```

## MCP Services

| ID | Purpose | Authentication |
| --- | --- | --- |
| `cloud` | Device and scene reads and controls | Local Yeelight profile headers |
| `metadata` | Home, room, group, scene, automation, and configuration tasks | Local Yeelight profile headers |
| `lan` | Gateway-local discovery and control | Local network; no cloud headers |

Metadata tool definitions are available locally for fast discovery. Use
`--remote` when you explicitly need to compare them with the live service.
LAN tool names and schemas always come from the gateway at runtime.

Tool listings support MCP cursor pagination through `--cursor`, `--limit`,
and `--all`. JSON listings are compact by default; add `--raw` for complete
schemas. Tool calls similarly support `--data-only` for full business data
without the MCP envelope and `--raw` for protocol diagnostics. Interactive
tool sessions stay on the selected MCP so multiple calls can be made; use
`switch` to change services and `back` or `0` to return.

## Credentials And Safety

- Configuration is stored under `~/.config/yeelight-ai/config.json` on
  macOS/Linux or `%APPDATA%/yeelight-ai/config.json` on Windows.
- Override the directory with `YEELIGHT_AI_CONFIG_DIR` for tests or isolation.
- `config get` and `doctor --json` redact credentials by default.
- Do not paste tokens, passwords, home IDs, device names, or gateway addresses
  into issues or chat transcripts.
- Use `mcp describe` before raw tool calls. Preview writes first and verify state
  after any confirmed write.

## Client Configuration

Preview a client configuration before writing it:

```bash
yeelight-ai client configure cursor --json
yeelight-ai client configure claude --json
yeelight-ai client configure vscode --json
```

Use `--write --yes` to merge the generated MCP servers into an existing client
configuration. Existing unrelated servers are preserved.

## Documentation

- [Integration guide](guides/integration.md)
- [Usage and source guide](guides/usage.md)
- [中文接入指南](guides/integration.zh-CN.md)
- [中文使用与源码指南](guides/usage.zh-CN.md)

## Development

```bash
npm test
npm run smoke
npm pack --dry-run --json
```

The package contains only the public runtime, QR login implementation,
bilingual documentation, guides, and license. Internal release and security
tooling remain outside the npm tarball.

## License

Apache License 2.0. See [LICENSE](LICENSE).
