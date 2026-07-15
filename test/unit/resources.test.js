"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runResourceCommand } = require("../../src/commands/resources");
const { loadConfig, saveConfig } = require("../../src/config/store");

test("device list 通过 cloud MCP 查询设备并支持 room 过滤", async (t) => {
  const env = createLoggedInEnv();
  const calls = mockCloudMcp(t, {
    get_devices: {
      total: 1,
      rows: [
        {
          id: "101",
          name: "餐厅灯",
          roomId: "room-1",
          category: "light",
          properties: [{ propId: "p" }, { propId: "l" }],
        },
      ],
    },
  });
  const io = captureIo(env);

  const code = await runResourceCommand("device", ["list", "--room", "room-1", "--json"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.equal(result.resource, "device");
  assert.equal(result.action, "list");
  assert.equal(result.data.rows[0].name, "餐厅灯");
  assert.deepEqual(calls.toolsCall("get_devices").params.arguments, { roomId: "room-1" });
});

test("device list 普通输出只展示可控制属性", async (t) => {
  const env = createLoggedInEnv();
  mockCloudMcp(t, {
    get_devices: {
      total: 2,
      rows: [
        {
          id: "228661",
          name: "南窗帘10",
          roomId: "25990",
          category: "curtain",
          properties: [{ propId: "rs" }, { propId: "cp" }, { propId: "o" }, { propId: "tp" }],
        },
      ],
    },
  });
  const io = captureIo(env);

  const code = await runResourceCommand("device", ["list"], io);
  const output = io.stdoutText();
  const deviceRow = output.split("\n").find((line) => line.includes("南窗帘10")) || "";

  assert.equal(code, 0);
  assert.equal(output.includes("南窗帘10"), true);
  assert.equal(deviceRow.includes("tp"), true);
  assert.equal(deviceRow.includes("rs"), false);
  assert.equal(deviceRow.includes("cp"), false);
  assert.equal(deviceRow.includes(" o"), false);
});

test("device list JSON 输出会过滤不可控属性", async (t) => {
  const env = createLoggedInEnv();
  mockCloudMcp(t, {
    get_devices: {
      total: 1,
      rows: [
        {
          id: "228662",
          name: "南窗帘4",
          roomId: "25990",
          category: "curtain",
          properties: [{ propId: "rs" }, { propId: "cp" }, { propId: "o" }, { propId: "tp" }],
        },
      ],
    },
  });
  const io = captureIo(env);

  const code = await runResourceCommand("device", ["list", "--json"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.deepEqual(result.data.rows[0].properties.map((property) => property.propId), ["tp"]);
});

test("资源列表支持通过 MCP 透传 cursor 和 limit", async (t) => {
  const env = createLoggedInEnv();
  const calls = mockCloudMcp(t, {
    get_devices: {
      total: 3,
      pageNum: 2,
      pageSize: 1,
      nextCursor: "3",
      rows: [{ id: "102", name: "走廊灯", roomId: "room-1", category: "light" }],
    },
  });
  const io = captureIo(env);

  const code = await runResourceCommand("device", ["list", "--room", "room-1", "--limit", "1", "--cursor", "2", "--json"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.deepEqual(calls.toolsCall("get_devices").params.arguments, { roomId: "room-1", limit: 1, cursor: "2" });
  assert.equal(result.pagination.pageNum, 2);
  assert.equal(result.pagination.nextCursor, "3");
  assert.equal(result.nextCursor, "3");
});

test("资源列表普通输出提示下一页命令", async (t) => {
  const env = createLoggedInEnv();
  mockCloudMcp(t, {
    get_rooms: {
      total: 2,
      pageNum: 1,
      pageSize: 1,
      nextCursor: "2",
      rows: [{ id: "room-1", name: "客厅" }],
    },
  });
  const io = captureIo(env);

  const code = await runResourceCommand("room", ["list", "--limit", "1"], io);

  assert.equal(code, 0);
  assert.equal(io.stdoutText().includes("下一页：yeelight-ai room list --limit 1 --cursor 2"), true);
});

test("room list 普通输出使用资源表格", async (t) => {
  const env = createLoggedInEnv();
  mockCloudMcp(t, {
    get_rooms: {
      total: 1,
      rows: [{ id: "room-1", name: "客厅", properties: [{ propId: "p" }] }],
    },
  });
  const io = captureIo(env);

  const code = await runResourceCommand("room", ["list"], io);

  assert.equal(code, 0);
  assert.equal(io.stdoutText().includes("Room ID"), true);
  assert.equal(io.stdoutText().includes("客厅"), true);
  assert.equal(io.stdoutText().includes("数据来源：cloud MCP"), true);
  assert.equal(io.stdoutText().includes("下一步："), true);
  assert.equal(io.stdoutText().includes("按房间查看设备：yeelight-ai device list --room <roomId>"), true);
});

test("资源命令支持独立 help 和 format json", async (t) => {
  const helpIo = captureIo(process.env);

  const helpCode = await runResourceCommand("light", ["help"], helpIo);

  assert.equal(helpCode, 0);
  assert.equal(helpIo.stdoutText().includes("yeelight-ai light brightness"), true);

  const env = createLoggedInEnv();
  mockCloudMcp(t, {
    get_scenes: {
      total: 1,
      rows: [{ id: "scene-1", name: "晚安" }],
    },
  });
  const jsonIo = captureIo(env);

  const code = await runResourceCommand("scene", ["list", "--format", "json"], jsonIo);
  const result = JSON.parse(jsonIo.stdoutText());

  assert.equal(code, 0);
  assert.equal(result.resource, "scene");
  assert.equal(result.data.rows[0].name, "晚安");
});

test("device show 未找到时输出下一步建议", async (t) => {
  const env = createLoggedInEnv();
  mockCloudMcp(t, {
    get_devices: {
      total: 0,
      rows: [],
    },
  });
  const io = captureIo(env);

  const code = await runResourceCommand("device", ["show", "missing"], io);

  assert.equal(code, 1);
  assert.equal(io.stderrText().includes("未找到设备：missing"), true);
  assert.equal(io.stderrText().includes("yeelight-ai device list"), true);
});

test("读类快捷命令遇到 MCP initialize 421 时自动使用 OpenAPI fallback", async (t) => {
  const env = createLoggedInEnv();
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const urls = [];
  global.fetch = async (url, options) => {
    urls.push(String(url));
    if (String(url).includes("/apis/mcp_server/v1/mcp")) {
      const body = JSON.parse(options.body);
      assert.equal(body.method, "initialize");
      return responseJson({ jsonrpc: "2.0", id: 1, error: { message: "stale route" } }, {}, { ok: false, status: 421 });
    }
    if (String(url).includes("/v1/open/node/house/house-resources-123456/rooms/r/list/1/300")) {
      assert.equal(options.headers.authorization, "Bearer token-resources-123456");
      assert.equal(Object.hasOwn(options.headers, "clientId"), false);
      assert.equal(options.headers.bizType, "1");
      return responseJson({
        code: "200",
        data: {
          total: 1,
          rows: [{ id: "room-1", name: "客厅" }],
        },
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };
  const io = captureIo(env);

  const code = await runResourceCommand("room", ["list", "--json"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.equal(result.source, "openapi");
  assert.equal(result.data.rows[0].name, "客厅");
  assert.equal(urls.filter((url) => url.includes("/apis/mcp_server/v1/mcp")).length, 3);
});

test("读类快捷命令 fallback 普通输出说明来源和切换命令", async (t) => {
  const env = createLoggedInEnv();
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (url, options) => {
    if (String(url).includes("/apis/mcp_server/v1/mcp")) {
      const body = JSON.parse(options.body);
      assert.equal(body.method, "initialize");
      return responseJson({ jsonrpc: "2.0", id: 1, error: { message: "stale route" } }, {}, { ok: false, status: 421 });
    }
    if (String(url).includes("/v1/open/node/house/house-resources-123456/r/info")) {
      return responseJson({
        code: "200",
        data: { id: "house-1", name: "办公室" },
      });
    }
    throw new Error(`未预期的 URL：${url}`);
  };
  const io = captureIo(env);

  const code = await runResourceCommand("house", ["show"], io);

  assert.equal(code, 0);
  assert.equal(io.stdoutText().includes("数据来源：OpenAPI fallback"), true);
  assert.equal(io.stdoutText().includes("yeelight-ai mcp configure cloud --local|--remote"), true);
  assert.equal(io.stdoutText().includes("查看设备：yeelight-ai device list"), true);
});

test("light color-temperature 会校验范围", async () => {
  const env = createLoggedInEnv();
  const io = captureIo(env);

  await assert.rejects(
    () => runResourceCommand("light", ["color-temperature", "101", "1000"], io),
    /色温必须在 2700 到 6500 之间/
  );
});

test("light on 默认 dry-run，不真实执行控制", async (t) => {
  const env = createLoggedInEnv();
  const calls = mockCloudMcp(t, {
    control_node: {
      ok: true,
      dryRun: true,
      code: "DRY_RUN",
      message: "仅生成执行计划",
      plan: {},
    },
  });
  const io = captureIo(env);

  const code = await runResourceCommand("light", ["on", "101", "--json"], io);
  const request = calls.toolsCall("control_node").params.arguments.controlRequest;
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.equal(request.nodeId, 101);
  assert.equal(request.nodeType, 2);
  assert.equal(request.command.params[0].propName, "p");
  assert.equal(request.command.params[0].value, true);
  assert.equal(request.dryRun, true);
  assert.equal(request.confirmSideEffect, false);
  assert.equal(result.dryRun, true);
});

test("light brightness 传 --yes 后显式确认真实执行", async (t) => {
  const env = createLoggedInEnv();
  const calls = mockCloudMcp(t, {
    control_node: {
      ok: true,
      dryRun: false,
      code: "EXECUTED",
      message: "真实控制接口已调用",
      plan: {},
    },
  });
  const io = captureIo(env);

  const code = await runResourceCommand("light", ["brightness", "101", "80", "--yes", "--json"], io);
  const request = calls.toolsCall("control_node").params.arguments.controlRequest;
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.equal(request.command.params[0].propName, "l");
  assert.equal(request.command.params[0].value, 80);
  assert.equal(request.dryRun, false);
  assert.equal(request.confirmSideEffect, true);
  assert.equal(result.dryRun, false);
});

test("scene run 复用 execute_scene 并默认 dry-run", async (t) => {
  const env = createLoggedInEnv();
  const calls = mockCloudMcp(t, {
    execute_scene: {
      ok: true,
      dryRun: true,
      code: "DRY_RUN",
      message: "仅生成执行计划",
      plan: {},
    },
  });
  const io = captureIo(env);

  const code = await runResourceCommand("scene", ["run", "scene-1", "--json"], io);
  const request = calls.toolsCall("execute_scene").params.arguments.request;

  assert.equal(code, 0);
  assert.equal(request.sceneId, "scene-1");
  assert.equal(request.dryRun, true);
  assert.equal(request.confirmSideEffect, false);
});

test("写命令不允许同时传 dry-run 和 yes", async () => {
  const env = createLoggedInEnv();
  const io = captureIo(env);

  await assert.rejects(
    () => runResourceCommand("light", ["off", "101", "--dry-run", "--yes"], io),
    /--dry-run 不能和 --yes/
  );
});

function createLoggedInEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-resources-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-resources-123456",
    clientId: "client-resources-123456",
    houseId: "house-resources-123456",
    bizType: "1",
  };
  saveConfig(loadResult.config, { env });
  return env;
}

function mockCloudMcp(t, toolResponses) {
  const originalFetch = global.fetch;
  const calls = [];
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-resources" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      const payload = toolResponses[body.params.name];
      if (payload === undefined) {
        throw new Error(`未预期的工具：${body.params.name}`);
      }
      return responseJson({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(payload) }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };
  return {
    toolsCall(name) {
      return calls.find((call) => call.method === "tools/call" && call.params.name === name);
    },
  };
}

function captureIo(env) {
  let stdoutText = "";
  let stderrText = "";
  return {
    stdin: process.stdin,
    stdout: { write(value) { stdoutText += value; } },
    stderr: { write(value) { stderrText += value; } },
    env,
    stdoutText() {
      return stdoutText;
    },
    stderrText() {
      return stderrText;
    },
  };
}

function responseJson(body, headers = {}, options = {}) {
  return {
    ok: options.ok !== undefined ? options.ok : true,
    status: options.status || 200,
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
