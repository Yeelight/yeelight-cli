# Yeelight AI CLI Usage And Source Guide

[简体中文](usage.zh-CN.md) | [README](../README.md) | [Integration guide](integration.md)

## Install From npm

```bash
npm install --global yeelight-ai
yeelight-ai --help
```

Use npm installation for normal use. A source checkout is intended for
development, unreleased fixes, and reproducible issue investigation.

## Run From Source

```bash
git clone https://github.com/Yeelight/yeelight-cli.git
cd yeelight-cli
npm install
npm test
node bin/yeelight-ai.js --help
```

Register the checkout as a global command when needed:

```bash
npm link
yeelight-ai --version
```

Remove the link with `npm unlink --global yeelight-ai`.

## Isolate Development Configuration

```bash
export YEELIGHT_AI_CONFIG_DIR="$HOME/.config/yeelight-ai-development"
node bin/yeelight-ai.js doctor --json
```

This keeps a development checkout separate from the default user profile.

## Login And Select A Home

```bash
yeelight-ai login
yeelight-ai login --method qr --region cn
```

In Yeelight Pro APP, tap Home's top-right `+`, choose **MCP Authorization**, and
scan the terminal QR code. When an account has multiple homes, select one
interactively or provide `--house-id` in a controlled script. Use `--region`
for `cn`, `sg`, `us`, or `eu`; the default is `cn`.

## Validate A New Installation

```bash
yeelight-ai doctor
yeelight-ai mcp list
yeelight-ai mcp tools metadata
yeelight-ai mcp tools cloud
```

For LAN, configure a gateway and run only a read probe first:

```bash
yeelight-ai mcp configure lan --gateway-ip <gateway-ip>
yeelight-ai doctor --mcp lan --probe
```

## Scripted Usage

Prefer `--json` for stable machine-readable output:

```bash
yeelight-ai status --json
yeelight-ai device list --json
yeelight-ai mcp call cloud get_devices --args '{}' --data-only
```

List commands accept `--limit`, `--cursor`, and `--all`. Do not combine
`--cursor` with assumptions about the cursor format; pass `nextCursor` back
unchanged.

## Safe Writes

Shortcut writes are previews unless `--yes` is present:

```bash
yeelight-ai light color-temperature <deviceId> 4000
yeelight-ai light color-temperature <deviceId> 4000 --yes
```

For raw Metadata writes, start with `options.dryRun=true`, review the returned
plan, obtain user confirmation, then send the confirmed request. Re-read the
target state after execution.

## Client Setup

```bash
yeelight-ai client configure cursor --json
yeelight-ai client configure cursor --write --yes
```

The same flow supports `claude` and `vscode`. Back up client configuration as
required by your environment before the write step.

## Update A Source Checkout

```bash
git pull --ff-only
npm install
npm test
npm run smoke
```

Use a fixed tag or commit when reproducing an issue. Report the CLI version,
Node.js version, operating system, sanitized command, and sanitized error. Do
not attach configuration files or credential-bearing output.

## Troubleshooting

- Non-interactive terminal: use explicit subcommands such as `doctor --json`.
- No home returned: verify Region and Pro home membership. Consumer mode never
  falls back to commercial projects; select `bizType=1` explicitly when needed.
- Cloud or Metadata unavailable: run the corresponding `doctor --mcp ...
  --probe` command and verify network access.
- LAN unavailable: verify LAN CONTROL, local routing, gateway address, and port.
- Unknown arguments: use `mcp describe` or Metadata `get_action_schema`.

## Development Checks

```bash
npm test
npm run smoke
npm pack --dry-run --json
```

Review the pack file list before publishing. It must contain only `bin/`, the
public `src/` runtime, bilingual README and guides, `LICENSE`, and package
metadata.
