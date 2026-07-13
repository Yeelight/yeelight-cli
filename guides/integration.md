# Yeelight AI CLI Integration Guide

[简体中文](integration.zh-CN.md) | [README](../README.md) | [Usage guide](usage.md)

This guide is for developers integrating Yeelight MCP services into local AI
tools, scripts, or development workflows through `yeelight-ai`.

## Choose A Service

| Workload | Service | Start with |
| --- | --- | --- |
| Device state, lighting control, scene execution | `cloud` | `mcp tools cloud` |
| Home, room, group, scene, automation, or configuration management | `metadata` | `mcp groups metadata` |
| Gateway-local discovery and control | `lan` | `doctor --mcp lan --probe` |

The CLI is an MCP client and workflow helper. It does not replace MCP with a
new application API.

## Authenticate

Run the interactive login flow:

```bash
yeelight-ai login
```

For password login, enter the password at the prompt:

```bash
yeelight-ai login --method password --account <phone-or-email>
```

For an existing token, use manual mode:

```bash
yeelight-ai login --authorization <token> --client-id <clientId> --house-id <houseId>
```

Cloud and Metadata calls automatically receive `Authorization`, `Client-Id`,
and `House-Id` from the selected local profile. LAN calls never receive these
cloud headers.

## Discover Before Calling

```bash
yeelight-ai mcp list
yeelight-ai mcp inspect cloud --json
yeelight-ai mcp tools cloud
yeelight-ai mcp describe cloud get_devices --json
```

Tool lists support cursor pagination:

```bash
yeelight-ai mcp tools cloud --json
yeelight-ai mcp tools cloud --cursor '<nextCursor>'
yeelight-ai mcp tools cloud --all
```

## Cloud MCP

Prefer the business commands for routine reads and guarded controls:

```bash
yeelight-ai device list
yeelight-ai light on <deviceId>
yeelight-ai light on <deviceId> --yes
```

Use raw MCP commands for inspection or capabilities without a shortcut:

```bash
yeelight-ai mcp call cloud get_devices --args '{}' --json
```

`--raw` preserves the complete MCP result for diagnostics. `--data-only`
returns only parsed business data for scripts.

## Metadata MCP

The current task-oriented surface contains:

- `yeelight_metadata.list_groups`
- `yeelight_metadata.list_tasks`
- `yeelight_metadata.list_actions`
- `yeelight_metadata.get_action_schema`
- `yeelight_metadata.execute_task`

Browse first, then request one action schema:

```bash
yeelight-ai mcp call metadata yeelight_metadata.list_tasks \
  --args '{"group":"family_space"}' --json
yeelight-ai mcp call metadata yeelight_metadata.get_action_schema \
  --args '{"task":"family_space.manage_room","action":"list"}' --json
```

Metadata writes should be planned before execution:

```bash
yeelight-ai mcp call metadata yeelight_metadata.execute_task \
  --args '{"request":{"task":"family_space.manage_room","action":"create","payload":{"name":"Example room"},"options":{"dryRun":true}}}' \
  --json
```

Only after reviewing the plan should a caller set `dryRun:false` and the
required side-effect confirmation.

## LAN MCP

Enable LAN CONTROL in the Yeelight app, then configure the gateway:

```bash
yeelight-ai mcp configure lan --gateway-ip <gateway-ip>
yeelight-ai doctor --mcp lan --probe
yeelight-ai mcp tools lan --json
```

Do not hard-code LAN tool names or property keys. Read the gateway's runtime
tool list, capability response, node IDs, and schemas before each integration.

## Configure An MCP Client

```bash
yeelight-ai client configure cursor --json
yeelight-ai client configure claude --json
yeelight-ai client configure vscode --json
```

After review, add `--write --yes`. Configuration writes merge the generated
servers and retain unrelated existing servers. LAN is included only after a
gateway has been configured.

## Diagnostics And Errors

```bash
yeelight-ai doctor --json
yeelight-ai doctor --mcp metadata --probe --timeout-ms 30000
```

- Authentication error: log in again, then inspect the redacted profile.
- Home mismatch: repeat login and select or explicitly pass the correct home.
- Metadata discovery delay: use the local definitions; add `--remote` only for
  a live comparison.
- LAN unavailable: verify LAN CONTROL, network reachability, and gateway port.
- Invalid tool arguments: run `mcp describe` or request the Metadata action
  schema instead of guessing.

## Integration Safety

- Keep credentials out of source, logs, prompts, reports, and issue templates.
- Use JSON output for automation and check `ok` before consuming data.
- Preview writes, require user confirmation at the calling layer, and verify the
  resulting state.
- Treat tool and action schemas as runtime contracts; do not rely on stale
  copies in application code.
