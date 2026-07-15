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
  assert.equal(config.auth.qrLogin.clientDeviceId, "");
  assert.equal(config.auth.profiles.default.region, "cn");
  assert.equal(Object.hasOwn(config.auth.profiles.default, "clientId"), false);
  assert.equal(config.auth.profiles.default.bizType, "0");
  assert.equal(config.security.defaultDryRun, true);
  assert.equal(config.security.bindHost, "127.0.0.1");
});

test("配置脱敏不会泄露完整凭证", () => {
  const config = createDefaultConfig();
  config.auth.profiles.default.authorization = "Bearer abcdefghijklmnopqrstuvwxyz";
  config.auth.profiles.default.houseId = "house-1234567890";
  config.auth.profiles.default.bizType = "0";

  const redacted = redactConfig(config);

  assert.equal(redacted.auth.profiles.default.authorization, "Bear...wxyz");
  assert.equal(Object.hasOwn(redacted.auth.profiles.default, "clientId"), false);
  assert.equal(redacted.auth.profiles.default.houseId, "****");
  assert.equal(redacted.auth.profiles.default.bizType, "0");
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

test("旧 profile 迁移时删除 clientId 并按 Region 更新官方 endpoint", () => {
  const config = migrateConfig({
    auth: {
      profiles: {
        default: {
          authorization: "Bearer token",
          clientId: "legacy-client",
          houseId: "1001",
          region: "sg",
        },
      },
    },
  });

  assert.equal(config.auth.profiles.default.region, "sg");
  assert.equal(Object.hasOwn(config.auth.profiles.default, "clientId"), false);
  assert.equal(config.mcp.cloud.endpoint, "https://api-sg.yeelight.com/apis/mcp_server/v1/mcp");
  assert.equal(config.mcp.metadata.endpoint, "https://api-sg.yeelight.com/apis/metadata_mcp_server/v1/mcp");
});
