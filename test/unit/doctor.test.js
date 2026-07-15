"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createDefaultConfig } = require("../../src/config/defaults");
const { runDoctor } = require("../../src/doctor/runner");

test("无认证配置时 doctor 输出失败项和 LAN gateway 提示", async () => {
  const config = createDefaultConfig();
  const result = await runDoctor({ exists: true, path: "/tmp/config.json", config }, {});

  assert.equal(result.ok, false);
  assert.equal(result.checks.some((item) => item.id === "AUTH_TOKEN_PRESENT" && item.status === "fail"), true);
  assert.equal(result.checks.some((item) => item.id === "LAN_ENDPOINT_CONFIGURED" && item.status === "pending"), true);
  assert.equal(result.checks.some((item) => item.id === "WRITE_DRY_RUN" && item.status === "pass"), true);
});

test("带 token 的配置通过 Bearer 归一化检查", async () => {
  const config = createDefaultConfig();
  config.auth.profiles.default.authorization = "Bearer token";
  const result = await runDoctor({ exists: true, path: "/tmp/config.json", config }, { mcp: "metadata" });

  assert.equal(result.checks.some((item) => item.id === "AUTH_BEARER_NORMALIZED" && item.status === "pass"), true);
  assert.equal(result.checks.some((item) => item.id === "CLOUD_REGION" && item.status === "pass" && item.message.includes("cn")), true);
});

test("LAN 单项诊断不要求云端 Authorization", async () => {
  const config = createDefaultConfig();
  config.mcp.lan.enabled = true;
  config.mcp.lan.endpoint = "http://192.168.1.93:18080/mcp";
  config.mcp.lan.status = "configured";
  const result = await runDoctor({ exists: true, path: "/tmp/config.json", config }, { mcp: "lan" });

  assert.equal(result.checks.some((item) => item.id === "AUTH_TOKEN_PRESENT"), false);
  assert.equal(result.checks.some((item) => item.status === "fail"), false);
  assert.equal(result.ok, true);
});

test("metadata probe 使用 MCP initialize 并检查旧 endpoint 候选", async (t) => {
  const config = createDefaultConfig();
  config.auth.profiles.default.authorization = "Bearer token-doctor-metadata-123456";
  config.auth.profiles.default.clientId = "client-doctor-metadata-123456";
  config.auth.profiles.default.houseId = "house-doctor-metadata-123456";
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const urls = [];
  global.fetch = async (url, options) => {
    urls.push(url);
    const body = JSON.parse(options.body);
    assert.equal(body.method, "initialize");
    assert.equal(options.headers.Authorization, "Bearer token-doctor-metadata-123456");
    if (String(url).includes("/metadata_mcp_server/")) {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} });
    }
    return responseJson({ error: "Payload Too Large" }, {}, 413);
  };

  const result = await runDoctor({ exists: true, path: "/tmp/config.json", config }, { mcp: "metadata", probe: true });

  assert.equal(result.checks.some((item) => item.id === "METADATA_INITIALIZE_CURRENT" && item.status === "pass"), true);
  assert.equal(result.checks.some((item) => item.id === "METADATA_INITIALIZE_LEGACY" && item.status === "warn"), true);
  assert.equal(urls.some((url) => String(url).includes("/metadata_mcp_server/")), true);
  assert.equal(urls.some((url) => String(url).includes("/app_mcp_server/")), true);
  assert.equal(urls.some((url) => String(url).includes("/apis/mcp_server/")), false);
});

function responseJson(body, headers = {}, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name] || headers[name.toLowerCase()] || "";
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}
