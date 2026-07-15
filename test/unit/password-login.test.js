"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runLoginCommand } = require("../../src/commands/login");

test("login --method password 已移除且不会调用网络", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-password-removed-"));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error("账密登录已移除，不应发起网络请求");
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
    /账密登录已移除，请使用扫码登录或手动 token/
  );
  assert.equal(called, false);
});

test("login --account 或 --password 不再隐式进入账密登录", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-password-flags-removed-"));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error("账密登录已移除，不应发起网络请求");
  };
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await assert.rejects(
    () => runLoginCommand(["--account", "user@example.com", "--password", "password-secret", "--json"], output.io),
    /账密登录已移除，请使用扫码登录或手动 token/
  );
  assert.equal(called, false);
});

test("login --method manual 不接收账密参数", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-manual-password-flags-"));
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await assert.rejects(
    () => runLoginCommand(["--method", "manual", "--account", "user@example.com"], output.io),
    /账密登录已移除，请使用扫码登录或手动 token/
  );
});

test("login 拒绝已移除的 --client-id", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-client-id-needs-manual-"));
  const output = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await assert.rejects(
    () => runLoginCommand(["--client-id", "client-123456", "--json"], output.io),
    /Client ID 已从公开认证契约中移除/
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
