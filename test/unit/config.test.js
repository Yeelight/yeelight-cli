"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createDefaultConfig } = require("../../src/config/defaults");
const { redactConfig } = require("../../src/config/redact");
const { migrateConfig } = require("../../src/config/store");

test("默认配置启用 cloud 和 metadata，lan 等待 gateway IP", () => {
  const config = createDefaultConfig();

  assert.equal(config.mcp.cloud.enabled, true);
  assert.equal(config.mcp.metadata.enabled, true);
  assert.equal(config.mcp.lan.enabled, false);
  assert.equal(config.mcp.lan.status, "requires_gateway_ip");
  assert.equal(config.security.defaultDryRun, true);
  assert.equal(config.security.bindHost, "127.0.0.1");
});

test("配置脱敏不会泄露完整凭证", () => {
  const config = createDefaultConfig();
  config.auth.profiles.default.authorization = "Bearer abcdefghijklmnopqrstuvwxyz";
  config.auth.profiles.default.clientId = "client-1234567890";
  config.auth.profiles.default.houseId = "house-1234567890";

  const redacted = redactConfig(config);

  assert.equal(redacted.auth.profiles.default.authorization, "Bear...wxyz");
  assert.equal(redacted.auth.profiles.default.clientId, "clie...7890");
  assert.equal(redacted.auth.profiles.default.houseId, "****");
});

test("旧 metadata endpoint 会迁移到正式 endpoint", () => {
  const config = migrateConfig({
    mcp: {
      metadata: {
        endpoint: "https://api.yeelight.com/apis/app_mcp_server/v1/mcp",
      },
    },
  });

  assert.equal(config.mcp.metadata.endpoint, "https://api.yeelight.com/apis/metadata_mcp_server/v1/mcp");
});
