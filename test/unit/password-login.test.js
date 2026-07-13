"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runLoginCommand } = require("../../src/commands/login");
const { loadConfig } = require("../../src/config/store");
const { extractPasswordLoginCredentials } = require("../../src/auth/passwordProtocol");

test("账密登录响应解析 access token、clientId 和 houseId", () => {
  const credentials = extractPasswordLoginCredentials({
    access_token: "token-password-123456",
    client_id: "client-password-123456",
    house_id: "house-password-123456",
  });

  assert.equal(credentials.authorization, "Bearer token-password-123456");
  assert.equal(credentials.clientId, "client-password-123456");
  assert.equal(credentials.houseId, "house-password-123456");
});

test("login --method password 调用 OAuth 账密登录并保存 token", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-password-login-"));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).endsWith("/apis/iot/v1/house/r/list")) {
      return responseJson({
        success: true,
        data: [
          { id: "house-from-list", name: "默认家庭" },
        ],
      });
    }
    return responseJson({
      success: true,
      data: {
        access_token: "token-password-secret-123456",
        clientId: "client-from-response",
      },
    });
  };
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  const code = await runLoginCommand([
    "--method",
    "password",
    "--account",
    "user@example.com",
    "--password",
    "password-secret",
    "--client-id",
    "client-cli-123456",
    "--json",
  ], output.io);

  assert.equal(code, 0);
  assert.equal(calls.length, 2);
  assert.equal(String(calls[0].url).endsWith("/apis/iot/v1/oauth/login"), true);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.bizType, "1");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    username: "user@example.com",
    password: "password-secret",
  });
  const result = JSON.parse(output.stdout());
  assert.equal(result.method, "password");
  assert.equal(result.credentials.authorization.includes("token-password-secret-123456"), false);
  const saved = loadConfig({ env: output.io.env }).config.auth.profiles.default;
  assert.equal(saved.authorization, "Bearer token-password-secret-123456");
  assert.equal(saved.clientId, "client-cli-123456");
  assert.equal(saved.houseId, "house-from-list");
});

test("login --method password 在多个家庭且 JSON 模式下要求显式 houseId", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-password-multi-house-"));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (url) => {
    if (String(url).endsWith("/apis/iot/v1/oauth/login")) {
      return responseJson({
        success: true,
        data: {
          access_token: "token-password-secret-123456",
        },
      });
    }
    if (String(url).endsWith("/apis/iot/v1/house/r/list")) {
      return responseJson({
        success: true,
        data: [
          { id: "house-1", name: "家庭一" },
          { id: "house-2", name: "家庭二" },
        ],
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await assert.rejects(
    () => runLoginCommand([
      "--method",
      "password",
      "--account",
      "user@example.com",
      "--password",
      "password-secret",
      "--json",
    ], output.io),
    /账号有 2 个家庭/
  );
});

test("login --json 无交互时必须显式选择登录方式", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-login-json-method-"));
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await assert.rejects(
    () => runLoginCommand(["--json"], output.io),
    /请通过 --method password 或 --authorization 指定登录方式/
  );
});

test("login --method password 不允许混用 authorization", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-password-conflict-"));
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await assert.rejects(
    () => runLoginCommand(["--method", "password", "--authorization", "token"], output.io),
    /--authorization 只能用于 manual 登录方式/
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
