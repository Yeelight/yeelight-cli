"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runLoginCommand } = require("../../src/commands/login");
const { loadConfig } = require("../../src/config/store");
const { encodeQr, renderQrTerminal } = require("../../src/output/qrcode");
const {
  buildQrPayload,
  extractClientId,
  extractHouseId,
  extractQrInfo,
  extractToken,
  normalizeDeviceMac,
} = require("../../src/auth/qrProtocol");

test("扫码登录协议按 DALI 授权二维码格式生成 payload", () => {
  assert.equal(normalizeDeviceMac("f82441000001"), "F8:24:41:00:00:01");
  assert.equal(buildQrPayload("qr-1", "f82441000001"), "dali&F8:24:41:00:00:01&qr-1");
  assert.equal(buildQrPayload("qr-1", "F8:24:41:00:00:01", { houseId: "200084" }), "dali&F8:24:41:00:00:01&qr-1&200084");
});

test("扫码登录响应解析 token、clientId 和 houseId", () => {
  const response = {
    success: true,
    data: {
      status: "LOGIN",
      token: {
        accessToken: "token-qr-123456",
        clientId: "client-qr-123456",
      },
      source: "dali:{\"houseId\":\"house-qr-123456\"}",
    },
  };
  const info = extractQrInfo(response);

  assert.equal(extractToken(info), "token-qr-123456");
  assert.equal(extractClientId(info), "client-qr-123456");
  assert.equal(extractHouseId(info), "house-qr-123456");
});

test("终端二维码生成标准尺寸矩阵并包含定位图案", () => {
  const matrix = encodeQr("dali&F8:24:41:00:00:01&qr-1");
  const rendered = renderQrTerminal("dali&F8:24:41:00:00:01&qr-1");

  assert.equal(matrix.length, 25);
  assert.equal(matrix[0].length, 25);
  assert.equal(matrix[0][0], true);
  assert.equal(matrix[3][3], true);
  assert.equal(matrix[7][7], false);
  assert.equal(rendered.split("\n").length, 29);
});

test("login --method qr 成功后保存扫码返回的 token 且输出脱敏", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-qr-login-"));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (String(url).includes("/query/qrcode/")) {
      return responseJson({
        success: true,
        data: {
          qrCodeId: "qr-login-1",
          status: "CREATED",
          expireAt: Date.now() + 60000,
        },
      });
    }
    if (String(url).includes("/check/qrcode/")) {
      return responseJson({
        success: true,
        data: {
          qrCodeId: "qr-login-1",
          status: "LOGIN",
          token: {
            accessToken: "token-qr-secret-123456",
            clientId: "client-qr-123456",
          },
          source: "dali:{\"houseId\":\"house-qr-123456\"}",
        },
      });
    }
    if (String(url).endsWith("/apis/iot/v1/house/r/list")) {
      return responseJson({
        success: true,
        data: [
          { id: "house-list-123456", name: "默认家庭" },
        ],
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir, YEELIGHT_AI_INTERNAL: "1" });

  const code = await runLoginCommand([
    "--method",
    "qr",
    "--json",
    "--device",
    "F8:24:41:00:00:01",
    "--poll-interval-ms",
    "1",
    "--timeout-ms",
    "1000",
  ], output.io);

  assert.equal(code, 0);
  assert.equal(calls.length, 2);
  const result = JSON.parse(output.stdout());
  assert.equal(result.ok, true);
  assert.equal(result.credentials.authorization.includes("token-qr-secret-123456"), false);
  const saved = loadConfig({ env: output.io.env }).config.auth.profiles.default;
  assert.equal(saved.authorization, "Bearer token-qr-secret-123456");
  assert.equal(saved.clientId, "client-qr-123456");
  assert.equal(saved.houseId, "house-qr-123456");
});

test("login --qr 仍可显式进入扫码流程并支持 no-wait", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-qr-nowait-"));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (url) => {
    if (String(url).includes("/query/qrcode/")) {
      return responseJson({
        success: true,
        data: {
          qrCodeId: "qr-nowait-1",
          status: "CREATED",
          expireAt: Date.now() + 60000,
        },
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir, YEELIGHT_AI_INTERNAL: "1" });

  const code = await runLoginCommand([
    "--qr",
    "--json",
    "--no-wait",
    "--device",
    "F8:24:41:00:00:01",
  ], output.io);

  assert.equal(code, 0);
  const result = JSON.parse(output.stdout());
  assert.equal(result.status, "CREATED");
  assert.equal(result.payload, "dali&F8:24:41:00:00:01&qr-nowait-1");
});

test("login --authorization 继续支持手动 token 保存", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-manual-login-"));
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith("/apis/iot/v1/house/r/list")) {
      return responseJson({
        success: true,
        data: [
          { id: "house-from-manual-list", name: "默认家庭" },
        ],
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };

  try {
    const code = await runLoginCommand([
      "--authorization",
      "token-manual-secret-123456",
      "--client-id",
      "client-manual-123456",
      "--json",
    ], output.io);

    assert.equal(code, 0);
    const result = JSON.parse(output.stdout());
    assert.equal(result.credentials.authorization.includes("token-manual-secret-123456"), false);
    const saved = loadConfig({ env: output.io.env }).config.auth.profiles.default;
    assert.equal(saved.authorization, "Bearer token-manual-secret-123456");
    assert.equal(saved.clientId, "client-manual-123456");
    assert.equal(saved.houseId, "house-from-manual-list");
  } finally {
    global.fetch = originalFetch;
  }
});

test("login --qr 与手动 token 参数互斥", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-login-conflict-"));
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await assert.rejects(
    () => runLoginCommand(["--qr", "--authorization", "token", "--json"], output.io),
    /不能和 --manual、--method、--authorization、--client-id、--account 或 --password 同时使用/
  );
});

test("公开模式默认不开放扫码登录", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-qr-public-disabled-"));
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await assert.rejects(
    () => runLoginCommand(["--method", "qr", "--json"], output.io),
    /扫码登录暂未开放/
  );
});

function captureIo(env) {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdin: process.stdin,
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } },
      env: { ...process.env, ...env },
    },
    stdout() {
      return stdout;
    },
    stderr() {
      return stderr;
    },
  };
}

function responseJson(body) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body);
    },
  };
}
