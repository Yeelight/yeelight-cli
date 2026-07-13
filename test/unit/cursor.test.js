"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { buildCursorConfig, mergeCursorConfig } = require("../../src/clients/cursor");
const { createDefaultConfig } = require("../../src/config/defaults");

test("Cursor 配置匹配 cloud+metadata golden", () => {
  const config = createDefaultConfig();
  const actual = buildCursorConfig(config);
  const goldenPath = path.join(__dirname, "..", "golden", "cursor-config.cloud-metadata.json");
  const expected = JSON.parse(fs.readFileSync(goldenPath, "utf8"));

  assert.deepEqual(actual, expected);
});

test("Cursor 配置不会写入 pending 的 LAN MCP", () => {
  const config = createDefaultConfig({ enabledMcp: ["cloud", "metadata", "lan"] });
  config.mcp.lan.enabled = true;
  const actual = buildCursorConfig(config);

  assert.equal(actual.mcpServers["yeelight-lan"], undefined);
});

test("LAN 配置完成后 Cursor 会包含 LAN 且不写认证 Header", () => {
  const config = createDefaultConfig({ enabledMcp: ["cloud", "metadata", "lan"] });
  config.mcp.lan.enabled = true;
  config.mcp.lan.endpoint = "http://192.168.1.2:18080/mcp";
  config.mcp.lan.status = "configured";

  const actual = buildCursorConfig(config);

  assert.equal(actual.mcpServers["yeelight-lan"].url, "http://192.168.1.2:18080/mcp");
  assert.equal(actual.mcpServers["yeelight-lan"].headers, undefined);
});

test("写入 Cursor 配置时保留已有 MCP Server", () => {
  const merged = mergeCursorConfig(
    { mcpServers: { "other-server": { url: "http://127.0.0.1:3000/mcp" } } },
    buildCursorConfig(createDefaultConfig())
  );

  assert.equal(merged.mcpServers["other-server"].url, "http://127.0.0.1:3000/mcp");
  assert.equal(Boolean(merged.mcpServers["yeelight-cloud"]), true);
});
