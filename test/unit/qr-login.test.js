"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { promptForLoginMethod, runLoginCommand, selectBizType } = require("../../src/commands/login");
const { loadConfig, saveConfig } = require("../../src/config/store");
const { encodeQr, renderQrTerminal } = require("../../src/output/qrcode");
const {
  buildQrPayload,
  extractClientId,
  extractHouseId,
  extractQrInfo,
  extractToken,
  normalizeClientDeviceId,
} = require("../../src/auth/qrProtocol");

test("扫码登录协议按 CLI 授权二维码格式生成 payload", () => {
  assert.equal(normalizeClientDeviceId(" cli-device-1 "), "cli-device-1");
  assert.equal(buildQrPayload("qr-1", "cli-device-1"), "cli&cli-device-1&qr-1");
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
      source: "cli:{\"houseId\":\"house-qr-123456\"}",
    },
  };
  const info = extractQrInfo(response);

  assert.equal(extractToken(info), "token-qr-123456");
  assert.equal(extractClientId(info), "client-qr-123456");
  assert.equal(extractHouseId(info), "house-qr-123456");
});

test("终端二维码生成标准尺寸矩阵并包含定位图案", () => {
  const matrix = encodeQr("cli&cli-device-1&qr-1");
  const rendered = renderQrTerminal("cli&cli-device-1&qr-1", { ansi: false });
  const fullRendered = renderQrTerminal("cli&cli-device-1&qr-1", { ansi: false, compact: false });

  assert.equal(matrix.length, 25);
  assert.equal(matrix[0].length, 25);
  assert.equal(matrix[0][0], true);
  assert.equal(matrix[3][3], true);
  assert.equal(matrix[7][7], false);
  assert.equal(rendered.split("\n").length, 14);
  assert.equal(fullRendered.split("\n").length, 27);
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
          source: "cli:{\"houseId\":\"house-qr-123456\"}",
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
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  const code = await runLoginCommand([
    "--method",
    "qr",
    "--json",
    "--client-device-id",
    "cli-device-1",
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
  assert.equal(saved.bizType, "1");
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
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  const code = await runLoginCommand([
    "--qr",
    "--json",
    "--no-wait",
    "--client-device-id",
    "cli-device-1",
  ], output.io);

  assert.equal(code, 0);
  const result = JSON.parse(output.stdout());
  assert.equal(result.status, "CREATED");
  assert.equal(result.clientDeviceId, "cli-device-1");
  assert.equal(result.payload, "cli&cli-device-1&qr-nowait-1");
});

test("login 默认进入扫码流程并支持 no-wait", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-qr-default-nowait-"));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (url) => {
    if (String(url).includes("/query/qrcode/")) {
      return responseJson({
        success: true,
        data: {
          qrCodeId: "qr-default-1",
          status: "CREATED",
          expireAt: Date.now() + 60000,
        },
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  const code = await runLoginCommand([
    "--json",
    "--no-wait",
    "--client-device-id",
    "cli-default-1",
  ], output.io);

  assert.equal(code, 0);
  const result = JSON.parse(output.stdout());
  assert.equal(result.status, "CREATED");
  assert.equal(result.clientDeviceId, "cli-default-1");
  assert.equal(result.payload, "cli&cli-default-1&qr-default-1");
});

test("login 默认扫码会持久化并复用 clientDeviceId", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-qr-stable-device-"));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const devices = [];
  let index = 0;
  global.fetch = async (url) => {
    if (String(url).includes("/query/qrcode/")) {
      const device = decodeURIComponent(String(url).split("/query/qrcode/")[1]);
      devices.push(device);
      index += 1;
      return responseJson({
        success: true,
        data: {
          qrCodeId: `qr-stable-${index}`,
          status: "CREATED",
          expireAt: Date.now() + 60000,
        },
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await runLoginCommand(["--json", "--no-wait"], output.io);
  await runLoginCommand(["--json", "--no-wait"], captureIo({ YEELIGHT_AI_CONFIG_DIR: dir }).io);

  assert.equal(devices.length, 2);
  assert.match(devices[0], /^cli_[A-Za-z0-9_-]{8}$/);
  assert.equal(devices[1], devices[0]);
  const saved = loadConfig({ env: output.io.env }).config.auth.qrLogin.clientDeviceId;
  assert.equal(saved, devices[0]);
});

test("login 默认扫码会将旧自动 clientDeviceId 压缩为短格式", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-qr-legacy-device-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.qrLogin.clientDeviceId = "cli_0123456789abcdef";
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const devices = [];
  global.fetch = async (url) => {
    if (String(url).includes("/query/qrcode/")) {
      const device = decodeURIComponent(String(url).split("/query/qrcode/")[1]);
      devices.push(device);
      return responseJson({
        success: true,
        data: {
          qrCodeId: "qr-legacy-1",
          status: "CREATED",
          expireAt: Date.now() + 60000,
        },
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };

  await runLoginCommand(["--json", "--no-wait"], captureIo({ YEELIGHT_AI_CONFIG_DIR: dir }).io);

  assert.match(devices[0], /^cli_[A-Za-z0-9_-]{8}$/);
  assert.notEqual(devices[0], "cli_0123456789abcdef");
  assert.equal(loadConfig({ env }).config.auth.qrLogin.clientDeviceId, devices[0]);
});

test("显式 clientDeviceId 只覆盖本次扫码且不改写持久化默认值", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-qr-device-override-"));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const devices = [];
  let index = 0;
  global.fetch = async (url) => {
    if (String(url).includes("/query/qrcode/")) {
      const device = decodeURIComponent(String(url).split("/query/qrcode/")[1]);
      devices.push(device);
      index += 1;
      return responseJson({
        success: true,
        data: {
          qrCodeId: `qr-override-${index}`,
          status: "CREATED",
          expireAt: Date.now() + 60000,
        },
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };
  const env = { YEELIGHT_AI_CONFIG_DIR: dir };

  await runLoginCommand(["--json", "--no-wait"], captureIo(env).io);
  const stored = loadConfig({ env: { ...process.env, ...env } }).config.auth.qrLogin.clientDeviceId;
  await runLoginCommand(["--json", "--no-wait", "--client-device-id", "cli-explicit-1"], captureIo(env).io);

  assert.equal(devices[0], stored);
  assert.equal(devices[1], "cli-explicit-1");
  assert.equal(loadConfig({ env: { ...process.env, ...env } }).config.auth.qrLogin.clientDeviceId, stored);
});

test("login --authorization 继续支持手动 token 保存", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-manual-login-"));
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).endsWith("/apis/iot/v1/house/r/list")) {
      assert.equal(options.headers.bizType, "0");
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
      "--biz-type",
      "0",
      "--json",
    ], output.io);

    assert.equal(code, 0);
    const result = JSON.parse(output.stdout());
    assert.equal(result.credentials.authorization.includes("token-manual-secret-123456"), false);
    const saved = loadConfig({ env: output.io.env }).config.auth.profiles.default;
    assert.equal(saved.authorization, "Bearer token-manual-secret-123456");
    assert.equal(saved.clientId, "client-manual-123456");
    assert.equal(saved.houseId, "house-from-manual-list");
    assert.equal(saved.bizType, "0");
  } finally {
    global.fetch = originalFetch;
  }
});

test("交互式业务类型选择使用真实 bizType 值", () => {
  assert.equal(selectBizType("0", "1"), "0");
  assert.equal(selectBizType("1", "0"), "1");
  assert.equal(selectBizType("普通家庭", "1"), "0");
  assert.equal(selectBizType("", "0"), "0");
});

test("交互式 login 可选择手动 token 入口", async () => {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  const output = captureIo({}, stdin);
  const pending = promptForLoginMethod(output.io);

  stdin.end("2\n");
  const method = await pending;

  assert.equal(method, "manual");
  assert.equal(output.stderr().includes("请选择登录方式"), true);
  assert.equal(output.stderr().includes("手动粘贴 token"), true);
});

test("login --qr 与手动 token 参数互斥", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-login-conflict-"));
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await assert.rejects(
    () => runLoginCommand(["--qr", "--authorization", "token", "--json"], output.io),
    /不能和 --manual、--method、--authorization、--client-id、--account 或 --password 同时使用/
  );
});

test("公开模式默认开放扫码登录", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-qr-public-enabled-"));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (url) => {
    if (String(url).includes("/query/qrcode/")) {
      return responseJson({
        success: true,
        data: {
          qrCodeId: "qr-public-1",
          status: "CREATED",
          expireAt: Date.now() + 60000,
        },
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  const code = await runLoginCommand(["--method", "qr", "--json", "--no-wait", "--client-device-id", "cli-public-1"], output.io);

  assert.equal(code, 0);
  assert.equal(JSON.parse(output.stdout()).payload, "cli&cli-public-1&qr-public-1");
});

function captureIo(env, stdin = process.stdin) {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdin,
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
