"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const CLI = path.join(__dirname, "..", "..", "bin", "yeelight-ai.js");

test("CLI 冒烟流程可生成配置、登录、列出 MCP、生成 Cursor JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-test-"));
  const env = {
    ...process.env,
    YEELIGHT_AI_CONFIG_DIR: dir,
  };

  const init = run(["init", "--json"], env);
  assert.equal(init.status, 0);
  assert.equal(JSON.parse(init.stdout).changed, true);

  const initialList = run(["mcp", "list", "--json"], env);
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "golden", "mcp-list.initial.json"), "utf8"));
  assert.deepEqual(JSON.parse(initialList.stdout).mcp, golden);

  const login = run(["login", "--authorization", "Bearer token-123456", "--house-id", "house-123456", "--json"], env);
  assert.equal(login.status, 0);
  assert.equal(JSON.parse(login.stdout).credentials.authorization.includes("token-123456"), false);
  assert.equal(JSON.parse(login.stdout).credentials.bizType, "0");

  const list = run(["mcp", "list", "--json"], env);
  assert.equal(list.status, 0);
  assert.deepEqual(JSON.parse(list.stdout).mcp.map((item) => item.id), ["cloud", "metadata", "lan"]);

  const doctor = run(["doctor", "--json"], env);
  assert.equal(doctor.status, 0);
  assert.equal(JSON.parse(doctor.stdout).checks.some((item) => item.id === "WRITE_DRY_RUN" && item.status === "pass"), true);

  const cursor = run(["client", "configure", "cursor", "--json"], env);
  assert.equal(cursor.status, 0);
  assert.equal(Boolean(JSON.parse(cursor.stdout).config.mcpServers["yeelight-cloud"]), true);
});

test("help 展示业务快捷命令入口", () => {
  const result = run(["--help"], process.env);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("启动与诊断"), true);
  assert.equal(result.stdout.includes("业务快捷命令"), true);
  assert.equal(result.stdout.includes("高级 MCP 与客户端"), true);
  assert.equal(result.stdout.includes("yeelight-ai status"), true);
  assert.equal(result.stdout.includes("yeelight-ai quick"), true);
  assert.equal(result.stdout.includes("yeelight-ai device list"), true);
  assert.equal(result.stdout.includes("yeelight-ai light brightness"), true);
  assert.equal(result.stdout.includes("--region cn|sg|us|eu"), true);
  assert.equal(result.stdout.includes("--client-id"), false);
  assert.equal(result.stdout.includes("默认使用普通 Pro 家庭"), true);
});

test("status 和 quick 展示工作台摘要并支持 JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-status-test-"));
  const env = {
    ...process.env,
    YEELIGHT_AI_CONFIG_DIR: dir,
  };

  assert.equal(run([
    "login",
    "--authorization",
    "Bearer token-status-123456",
    "--house-id",
    "house-status-123456",
    "--json",
  ], env).status, 0);

  const status = run(["status"], env);
  assert.equal(status.status, 0);
  assert.equal(status.stdout.includes("Yeelight AI CLI 工作台"), true);
  assert.equal(status.stdout.includes("当前家庭：house-status-123456"), true);
  assert.equal(status.stdout.includes("家庭类型：普通家庭（bizType=0）"), true);
  assert.equal(status.stdout.includes("Region：cn"), true);
  assert.equal(status.stdout.includes("Cloud MCP：远端"), true);
  assert.equal(status.stdout.includes("推荐下一步"), true);
  assert.equal(status.stdout.includes("常用动作"), true);
  assert.equal(status.stdout.includes("查看设备（devices）"), true);
  assert.equal(status.stdout.includes("高级入口"), true);

  const json = run(["status", "--json"], env);
  const output = JSON.parse(json.stdout);
  assert.equal(json.status, 0);
  assert.equal(output.ok, true);
  assert.equal(output.loggedIn, true);
  assert.equal(output.houseId, "house-status-123456");
  assert.equal(output.bizType, "0");
  assert.equal(output.region, "cn");
  assert.equal(output.mcp.cloud.summary.includes("远端"), true);
  assert.equal(output.nextSteps.includes("查看设备：yeelight-ai device list"), true);
  assert.equal(output.quickActions.some((item) => item.key === "devices"), true);
  assert.equal(output.advancedActions.some((item) => item.key === "tools"), true);

  const quick = run(["quick"], env);
  assert.equal(quick.status, 0);
  assert.equal(quick.stdout.includes("常用快捷操作"), true);
  assert.equal(quick.stdout.includes("查看设备（devices）"), true);
  assert.equal(quick.stdout.includes("高级入口"), true);

  const quickJson = run(["quick", "--json"], env);
  const quickOutput = JSON.parse(quickJson.stdout);
  assert.equal(quickJson.status, 0);
  assert.equal(quickOutput.ok, true);
  assert.equal(quickOutput.quickActions.some((item) => item.key === "run-scene"), true);
  assert.equal(quickOutput.advancedActions.some((item) => item.key === "status"), true);
});

test("CLI 可配置 LAN gateway 并生成 Cursor LAN 配置", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-lan-test-"));
  const env = {
    ...process.env,
    YEELIGHT_AI_CONFIG_DIR: dir,
  };

  assert.equal(run(["init", "--json"], env).status, 0);
  const configure = run(["mcp", "configure", "lan", "--gateway-ip", "192.168.1.2", "--json"], env);
  assert.equal(configure.status, 0);
  assert.equal(JSON.parse(configure.stdout).endpoint, "http://192.168.1.2:18080/mcp");

  const inspect = run(["mcp", "inspect", "lan", "--json"], env);
  assert.equal(inspect.status, 0);
  assert.equal(JSON.parse(inspect.stdout).status, "configured");

  const cursor = run(["client", "configure", "cursor", "--json"], env);
  assert.equal(cursor.status, 0);
  assert.equal(JSON.parse(cursor.stdout).config.mcpServers["yeelight-lan"].url, "http://192.168.1.2:18080/mcp");
});

test("CLI 可生成 Claude 和 VS Code 配置", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-client-test-"));
  const env = {
    ...process.env,
    YEELIGHT_AI_CONFIG_DIR: dir,
  };

  assert.equal(run(["init", "--json"], env).status, 0);
  const claude = run(["client", "configure", "claude", "--json"], env);
  const vscode = run(["client", "configure", "vscode", "--json"], env);

  assert.equal(claude.status, 0);
  assert.equal(vscode.status, 0);
  assert.equal(JSON.parse(claude.stdout).config.mcpServers["yeelight-cloud"].command, "npx");
  assert.equal(JSON.parse(vscode.stdout).config.mcpServers["yeelight-cloud"].url, "https://api.yeelight.com/apis/mcp_server/v1/mcp");
});

test("真实 TTY 主菜单输入 0 后退出进程", { skip: !hasExpect() }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-tty-exit-"));
  const env = {
    ...process.env,
    YEELIGHT_AI_CONFIG_DIR: dir,
  };

  assert.equal(run([
    "login",
    "--authorization",
    "Bearer token-tty-exit-123456",
    "--house-id",
    "house-tty-exit-123456",
    "--json",
  ], env).status, 0);

  const script = [
    "set timeout 5",
    `set env(YEELIGHT_AI_CONFIG_DIR) "${dir}"`,
    `spawn ${process.execPath} ${CLI}`,
    "expect \"是否复用当前登录上下文\"",
    "send \"y\\r\"",
    "expect \"请选择操作:\"",
    "send \"0\\r\"",
    "expect {",
    "  eof {}",
    "  timeout { exit 124 }",
    "}",
  ].join("\n");
  const result = spawnSync("expect", ["-c", script], {
    env,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout.includes("GLOBAL_CONFIG_EXISTS"), false);
});

function run(args, env) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env,
    encoding: "utf8",
  });
}

function hasExpect() {
  return spawnSync("expect", ["-v"], { encoding: "utf8" }).status === 0;
}
