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
| Yeelight AI CLI | Unified terminal workspace and MCP client for Cloud, Metadata, and LAN services, with local profiles, safe shortcuts, diagnostics, and client configuration. | People, scripts, and CI that want one command-line entry point. | [Yeelight/yeelight-cli](https://github.com/Yeelight/yeelight-cli) |
| `yeelight-home` | Local semantic Runtime CLI for home queries, control, configuration, diagnostics, product knowledge, and the structured `invoke --stdin` contract. | Skills, generated apps, and local automation that need a stable execution layer. | [Yeelight/yeelight-home](https://github.com/Yeelight/yeelight-home) |
| Yeelight IoT MCP | Hosted or self-hosted Streamable HTTP MCP server for topology, live state, device control, and scene execution. | MCP clients that need direct IoT discovery and control. | [Yeelight/yeelight-iot-mcp](https://github.com/Yeelight/yeelight-iot-mcp) |
| Yeelight Metadata MCP | Hosted or self-hosted Streamable HTTP MCP server for guarded home, room, group, panel, scene, automation, favorite, and account metadata workflows. | MCP clients that need metadata inspection and management. | [Yeelight/yeelight-metadata-mcp](https://github.com/Yeelight/yeelight-metadata-mcp) |
| Yeelight Smart Home Skills | Official Agent Skills: Smart Home translates natural language into safe `yeelight-home` operations, while PRO App Builder generates local smart-home apps from proven Runtime capabilities. | Agent hosts that need conversational smart-home workflows or app generation. | [Yeelight/yeelight-smart-home-skills](https://github.com/Yeelight/yeelight-smart-home-skills) |

Typical paths: terminal users and scripts -> `yeelight-ai`; MCP clients -> IoT MCP
and/or Metadata MCP; agent hosts -> Yeelight Smart Home Skill -> `yeelight-home`.
PRO App Builder also uses proven `yeelight-home` capabilities when generating
local applications.

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

The CLI checks the local profile, guides you through login when required,
selects a home, and opens the command workspace. Password input is interactive
by default so it does not need to appear in shell history.

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

The package contains only the public runtime, bilingual documentation, and the
license. Internal release and preview-only authentication implementations are
not part of this repository boundary or npm tarball.

## License

Apache License 2.0. See [LICENSE](LICENSE).
