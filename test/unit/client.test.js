"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { buildClaudeConfig } = require("../../src/clients/claude");
const { buildVscodeConfig } = require("../../src/clients/vscode");
const { buildConcreteHeaders, buildEnvHeaders } = require("../../src/clients/common");
const { createDefaultConfig } = require("../../src/config/defaults");

test("Claude 配置匹配 cloud+metadata golden", () => {
  const actual = buildClaudeConfig(createDefaultConfig());
  const expected = readGolden("claude-config.cloud-metadata.json");

  assert.deepEqual(actual, expected);
});

test("VS Code 配置匹配 cloud+metadata golden", () => {
  const actual = buildVscodeConfig(createDefaultConfig());
  const expected = readGolden("vscode-config.cloud-metadata.json");

  assert.deepEqual(actual, expected);
});

test("云端 Header 只包含 Authorization、Region 和非空业务上下文", () => {
  const config = createDefaultConfig();
  config.auth.profiles.default.authorization = "Bearer token";

  assert.deepEqual(buildConcreteHeaders(config, "default"), {
    Authorization: "Bearer token",
    "Yeelight-Region": "cn",
    bizType: "0",
  });
  assert.equal(Object.hasOwn(buildEnvHeaders(), "Client-Id"), false);
  assert.equal(buildEnvHeaders()["Yeelight-Region"], "${YEELIGHT_REGION}");
});

test("Claude 配置在 LAN 已配置时使用 mcp-remote allow-http 且不加认证 Header", () => {
  const config = createDefaultConfig({ enabledMcp: ["cloud", "metadata", "lan"] });
  config.mcp.lan.enabled = true;
  config.mcp.lan.endpoint = "http://192.168.1.93:18080/mcp";
  config.mcp.lan.status = "configured";

  const actual = buildClaudeConfig(config);
  const lan = actual.mcpServers["yeelight-lan"];

  assert.equal(lan.command, "npx");
  assert.deepEqual(lan.args, ["mcp-remote", "http://192.168.1.93:18080/mcp", "--allow-http", "true"]);
  assert.equal(lan.env, undefined);
});

test("VS Code 配置在 LAN 已配置时包含 yeelight-lan", () => {
  const config = createDefaultConfig({ enabledMcp: ["cloud", "metadata", "lan"] });
  config.mcp.lan.enabled = true;
  config.mcp.lan.endpoint = "http://192.168.1.93:18080/mcp";
  config.mcp.lan.status = "configured";

  const actual = buildVscodeConfig(config);

  assert.equal(actual.mcpServers["yeelight-lan"].url, "http://192.168.1.93:18080/mcp");
  assert.equal(actual.mcpServers["yeelight-lan"].headers, undefined);
});

function readGolden(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "golden", name), "utf8"));
}
