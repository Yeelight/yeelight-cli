"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { main } = require("../../src/index");
const { loadConfig, saveConfig } = require("../../src/config/store");

test("无参数非交互启动会提示使用子命令", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-nontty-"));
  const io = captureIo({ YEELIGHT_AI_CONFIG_DIR: dir });

  await assert.rejects(
    () => main([], io),
    /无参数启动需要交互式终端/
  );
});

test("无参数交互启动可复用本地 token 和 houseId 并进入菜单", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-reuse-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n0\n", true);

  const code = await main([], io);

  assert.equal(code, 0);
  assert.equal(io.stdoutText().includes("检测到本地登录上下文"), true);
  assert.equal(io.stdoutText().includes("token-home-secret-123456"), false);
  assert.equal(io.stdoutText().includes("Yeelight AI CLI"), true);
  assert.equal(io.stdoutText().includes("Yeelight AI CLI 工作台"), true);
  assert.equal(io.stdoutText().includes("当前家庭：house-home-123456"), true);
  assert.equal(io.stdoutText().includes("Cloud MCP：远端"), true);
  assert.equal(io.stdoutText().includes("Metadata MCP：远端"), true);
  assert.equal(io.stdoutText().includes("推荐下一步：查设备输入 devices"), true);
});

test("主菜单编号按常用和高级连续排列", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-menu-order-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n0\n", true);

  const code = await main([], io);
  const output = io.stdoutText();

  assert.equal(code, 0);
  assert.equal(output.includes("  1. 常用快捷操作  rooms / devices / light / run-scene"), true);
  assert.equal(output.includes("  2. 诊断当前配置  doctor"), true);
  assert.equal(output.includes("  3. 重新登录/切换家庭  login"), true);
  assert.equal(output.includes("  4. 查看 MCP 列表  mcp"), true);
  assert.equal(output.includes("  5. 调用 MCP 工具  tools"), true);
  assert.equal(output.includes("  6. 配置客户端  client"), true);
  assert.equal(output.includes("  7. 运行 demo  demo"), true);
  assert.equal(output.includes("  7. 常用快捷操作"), false);
});

test("菜单操作失败后不会退出 CLI", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-recover-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\nlan\nn\n0\n0\n", true);

  const code = await main([], io);

  assert.equal(code, 0);
  assert.equal(io.stderrText().includes("LAN MCP 未启用或未配置 gateway IP"), true);
  assert.equal(io.stdoutText().split("Yeelight AI CLI").length >= 3, true);
});

test("主菜单支持中文退出", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-exit-cn-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n退出\n", true);

  const code = await main([], io);

  assert.equal(code, 0);
  assert.equal(io.stderrText().includes("未知选项"), false);
});

test("主菜单支持语义别名直达设备和诊断", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-alias-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\ndevices\n\ndoctor\n0\n", true);
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: body.id, result: {} }, { "mcp-session-id": "session-home-alias" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      assert.equal(body.params.name, "get_devices");
      return responseJson({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ rows: [{ id: "101", name: "餐厅灯" }] }) }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.equal(io.stdoutText().includes("Device ID"), true);
    assert.equal(io.stdoutText().includes("餐厅灯"), true);
    assert.equal(io.stdoutText().includes("GLOBAL_CONFIG_EXISTS"), true);
    assert.equal(io.stderrText().includes("未知选项"), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("主菜单支持 shortcut 别名进入常用操作台", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-shortcut-alias-main-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\nshortcut\n0\n0\n", true);

  const code = await main([], io);

  assert.equal(code, 0);
  assert.equal(io.stdoutText().includes("常用快捷操作"), true);
  assert.equal(io.stderrText().includes("未知选项"), false);
});

test("首页常用快捷操作可查看设备列表", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-shortcut-device-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n1\n3\n\n0\n0\n", true);
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-shortcut-device" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      assert.equal(body.params.name, "get_devices");
      assert.deepEqual(body.params.arguments, { limit: 20 });
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ rows: [{ id: "101", name: "餐厅灯" }] }) }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.equal(io.stdoutText().includes("常用快捷操作"), true);
    assert.equal(io.stdoutText().includes("查询"), true);
    assert.equal(io.stdoutText().includes("控制"), true);
    assert.equal(io.stdoutText().includes("Device ID"), true);
    assert.equal(io.stdoutText().includes("餐厅灯"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("首页常用快捷操作设备列表支持 MCP cursor 翻页", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-shortcut-device-page-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n1\n3\n\nn\n0\n0\n", true);
  const originalFetch = global.fetch;
  const toolArgs = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: body.id, result: {} }, { "mcp-session-id": "session-shortcut-device-page" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      assert.equal(body.params.name, "get_devices");
      toolArgs.push(body.params.arguments);
      const pageTwo = body.params.arguments.cursor === "2";
      return responseJson({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          isError: false,
          content: [{
            type: "text",
            text: JSON.stringify(pageTwo
              ? { total: 21, pageNum: 2, pageSize: 20, nextCursor: null, rows: [{ id: "121", name: "第二页灯" }] }
              : { total: 21, pageNum: 1, pageSize: 20, nextCursor: "2", rows: [{ id: "101", name: "第一页灯" }] }),
          }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.deepEqual(toolArgs, [{ limit: 20 }, { limit: 20, cursor: "2" }]);
    assert.equal(io.stdoutText().includes("第一页灯"), true);
    assert.equal(io.stdoutText().includes("第二页灯"), true);
    assert.equal(io.stderrText().includes("翻页 [n 下一页，直接回车继续，0 返回]:"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("首页常用快捷操作支持语义别名查看房间", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-shortcut-alias-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n1\nrooms\n0\n0\n", true);
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: body.id, result: {} }, { "mcp-session-id": "session-shortcut-alias" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      assert.deepEqual(body.params.arguments, { limit: 20 });
      assert.equal(body.params.name, "get_rooms");
      return responseJson({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ rows: [{ id: "room-1", name: "客厅" }] }) }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.equal(io.stdoutText().includes("Room ID"), true);
    assert.equal(io.stdoutText().includes("客厅"), true);
    assert.equal(io.stderrText().includes("未知选项"), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("首页常用快捷操作会忽略终端回显污染行", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-shortcut-echo-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const input = [
    "y",
    "1",
    "1",
    "House ID  Name    Desc",
    "--------  ----    ----",
    "54674     14楼办公区",
    "提示：MCP initialize 返回 HTTP 421，已自动使用 OpenAPI 查询。",
    "Yeelight AI CLI 工作台",
    "状态",
    "当前家庭：house-home-123456",
    "Cloud MCP：本地 http://127.0.0.1:9000/mcp",
    "Metadata MCP：远端 https://api.yeelight.com/apis/metadata_mcp_server/v1/mcp",
    "推荐下一步：查设备输入 devices，排障输入 doctor，高级 MCP 调用输入 tools。",
    "常用",
    "  1. 常用快捷操作  rooms / devices / light / run-scene",
    "高级",
    "请选择快捷操作: 2",
    "Room ID  Name    Properties",
    "-------  ----    ----------",
    "25990    办公区一    p",
    "常用快捷操作",
    "查询",
    "  1. 查看当前家庭",
    "控制",
    "请选择快捷操作: 0",
    "请选择操作: 0",
  ].join("\n");
  const io = captureIo(env, `${input}\n`, true);
  const originalFetch = global.fetch;
  const toolNames = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: body.id, result: {} }, { "mcp-session-id": "session-shortcut-echo" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      toolNames.push(body.params.name);
      if (body.params.name === "get_currnet_house_info") {
        return responseJson({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            isError: false,
            content: [{ type: "text", text: JSON.stringify({ id: "54674", name: "14楼办公区" }) }],
          },
        });
      }
      if (body.params.name === "get_rooms") {
        return responseJson({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            isError: false,
            content: [{ type: "text", text: JSON.stringify({ rows: [{ id: "25990", name: "办公区一", properties: [{ propId: "p" }] }] }) }],
          },
        });
      }
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.deepEqual(toolNames, ["get_currnet_house_info", "get_rooms"]);
    assert.equal(io.stderrText().includes("未知选项：House ID"), false);
    assert.equal(io.stderrText().includes("未知选项：25990"), false);
    assert.equal(io.stderrText().includes("未知选项：常用快捷操作"), false);
    assert.equal(io.stderrText().includes("未知选项：Yeelight AI CLI 工作台"), false);
    assert.equal(io.stderrText().includes("未知选项：Cloud MCP"), false);
    assert.equal(io.stderrText().includes("未知选项：查询"), false);
    assert.equal(io.stdoutText().includes("14楼办公区"), true);
    assert.equal(io.stdoutText().includes("办公区一"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("首页常用快捷操作控制灯默认 dry-run", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-shortcut-light-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n1\n5\nbrightness\ny\n101\n80\nn\n0\n0\n", true);
  const originalFetch = global.fetch;
  let controlRequest = null;
  let listedDevices = false;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-shortcut-light" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      if (body.params.name === "get_devices") {
        assert.deepEqual(body.params.arguments, { limit: 20 });
        listedDevices = true;
        return responseJson({
          jsonrpc: "2.0",
          id: 3,
          result: {
            isError: false,
            content: [{ type: "text", text: JSON.stringify({ rows: [{ id: "101", name: "餐厅灯" }] }) }],
          },
        });
      }
      if (body.params.name === "control_node") {
        controlRequest = body.params.arguments.controlRequest;
        return responseJson({
          jsonrpc: "2.0",
          id: 4,
          result: {
            isError: false,
            content: [{ type: "text", text: JSON.stringify({ ok: true, dryRun: true, code: "DRY_RUN", message: "仅生成执行计划", plan: {} }) }],
          },
        });
      }
      throw new Error(`未预期的工具：${body.params.name}`);
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.equal(listedDevices, true);
    assert.equal(controlRequest.nodeId, 101);
    assert.equal(controlRequest.command.params[0].propName, "l");
    assert.equal(controlRequest.command.params[0].value, 80);
    assert.equal(controlRequest.dryRun, true);
    assert.equal(controlRequest.confirmSideEffect, false);
    assert.equal(io.stdoutText().includes("真实执行请追加 --yes"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("首页常用快捷操作执行场景前默认展示场景列表", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-shortcut-scene-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n1\n6\ny\nscene-1\nn\n0\n0\n", true);
  const originalFetch = global.fetch;
  const toolNames = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: body.id, result: {} }, { "mcp-session-id": "session-shortcut-scene" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      toolNames.push(body.params.name);
      if (body.params.name === "get_scenes") {
        assert.deepEqual(body.params.arguments, { limit: 20 });
        return responseJson({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            isError: false,
            content: [{ type: "text", text: JSON.stringify({ rows: [{ id: "scene-1", name: "晚安" }] }) }],
          },
        });
      }
      if (body.params.name === "execute_scene") {
        assert.equal(body.params.arguments.request.sceneId, "scene-1");
        assert.equal(body.params.arguments.request.dryRun, true);
        return responseJson({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            isError: false,
            content: [{ type: "text", text: JSON.stringify({ ok: true, dryRun: true, code: "DRY_RUN", message: "仅生成执行计划" }) }],
          },
        });
      }
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.deepEqual(toolNames, ["get_scenes", "execute_scene"]);
    assert.equal(io.stdoutText().includes("晚安"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("首页常用快捷操作控制灯可跳过设备列表", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-shortcut-light-skip-list-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n1\n5\non\nn\n101\nn\n0\n0\n", true);
  const originalFetch = global.fetch;
  const toolNames = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: body.id, result: {} }, { "mcp-session-id": "session-shortcut-light-skip" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      toolNames.push(body.params.name);
      assert.equal(body.params.name, "control_node");
      return responseJson({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ ok: true, dryRun: true, code: "DRY_RUN", message: "仅生成执行计划", plan: {} }) }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.deepEqual(toolNames, ["control_node"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("选择 LAN 调用时可引导配置 gateway IP", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-lan-config-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\nlan\ny\n192.168.1.93\nn\nget_provider_info\n{}\n0\n0\n", true);
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-lan-home" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          content: [{ type: "text", text: "{\"ok\":true}" }],
        },
      });
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "get_provider_info",
              description: "获取网关信息",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);
    const saved = loadConfig({ env }).config.mcp.lan;

    assert.equal(code, 0);
    assert.equal(saved.enabled, true);
    assert.equal(saved.endpoint, "http://192.168.1.93:18080/mcp");
    assert.equal(io.stdoutText().includes("工具: get_provider_info"), true);
    assert.equal(io.stdoutText().includes("\"ok\": true"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("菜单调用工具时会在输入参数前展示工具参数说明", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-tool-schema-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\ncloud\ny\nget_devices\ny\n{\"roomId\":\"1\"}\n0\n0\n", true);
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-schema-home" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "get_devices",
              description: "获取设备列表",
              inputSchema: {
                type: "object",
                properties: {
                  roomId: {
                    type: "string",
                    description: "房间 ID",
                  },
                },
              },
            },
          ],
        },
      });
    }
    if (body.method === "tools/call") {
      assert.deepEqual(body.params.arguments, { roomId: "1" });
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          content: [{ type: "text", text: "{\"ok\":true,\"devices\":[]}" }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.equal(io.stdoutText().includes("get_devices"), true);
    assert.equal(io.stdoutText().includes("roomId (string, 可选): 房间 ID"), true);
    assert.equal(io.stderrText().includes("参数 JSON object [默认 {}，支持多行粘贴]:"), true);
    assert.equal(io.stdoutText().includes("\"devices\": []"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("菜单调用 MCP 默认选择 cloud", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-default-cloud-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\n\ny\n?get_devices\n0\n0\n", true);
  const originalFetch = global.fetch;
  const endpoints = [];
  global.fetch = async (url, options) => {
    endpoints.push(String(url));
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-default-cloud" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "get_devices",
              description: "获取设备列表",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.equal(endpoints.every((endpoint) => endpoint.includes("/apis/mcp_server/v1/mcp")), true);
    assert.equal(io.stderrText().includes("MCP [cloud/metadata/lan，默认 cloud，0 返回主菜单]:"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("菜单调用工具支持多行 JSON 参数粘贴", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-multiline-json-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const multilineArgs = [
    "{",
    "  \"controlRequest\": {",
    "    \"nodeId\": 228136,",
    "    \"nodeType\": 2,",
    "    \"command\": {",
    "      \"command\": \"set\",",
    "      \"params\": [",
    "        {",
    "          \"propName\": \"p\",",
    "          \"value\": false",
    "        }",
    "      ],",
    "      \"duration\": 1000,",
    "      \"delay\": 0",
    "    }",
    "  }",
    "}",
  ].join("\n");
  const io = captureIo(env, `y\n5\ncloud\ny\ncontrol_node\ny\n${multilineArgs}\n0\n0\n`, true);
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-multiline-home" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "control_node",
              description: "控制节点",
              inputSchema: {
                type: "object",
                required: ["controlRequest"],
                properties: {
                  controlRequest: { type: "object" },
                },
              },
            },
          ],
        },
      });
    }
    if (body.method === "tools/call") {
      called = true;
      assert.deepEqual(body.params.arguments, {
        controlRequest: {
          nodeId: 228136,
          nodeType: 2,
          command: {
            command: "set",
            params: [{ propName: "p", value: false }],
            duration: 1000,
            delay: 0,
          },
        },
      });
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          content: [{ type: "text", text: "{\"ok\":true}" }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.equal(called, true);
    assert.equal(io.stderrText().includes("... "), true);
    assert.equal(io.stdoutText().includes("\"ok\": true"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("菜单调用工具输入裸 false 时提示外层必须是对象", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-json-false-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\ncloud\nn\ncontrol_node\nfalse\n0\n0\n", true);
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-false-home" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "control_node",
              description: "控制节点",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
    }
    if (body.method === "tools/call") {
      callCount += 1;
      return responseJson({ jsonrpc: "2.0", id: 3, result: {} });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);
    const toolPromptOccurrences = io.stderrText().split("cloud 工具名（?工具名看参数，tools 看列表，switch 切换 MCP，0 返回主菜单）:").length - 1;

    assert.equal(code, 0);
    assert.equal(callCount, 0);
    assert.equal(toolPromptOccurrences, 2);
    assert.equal(io.stderrText().includes("操作失败：--args 必须是合法 JSON object"), true);
    assert.equal(io.stderrText().includes("属性值可以使用布尔值"), true);
    assert.equal(io.stderrText().includes("不能直接传 false"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("菜单连续调用 MCP 工具时停留在已选择 MCP 内", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-mcp-loop-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\ncloud\nn\nget_devices\n{}\nget_devices\n{}\n0\n0\n", true);
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": `session-loop-${callCount}` });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "get_devices",
              description: "获取设备列表",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
    }
    if (body.method === "tools/call") {
      callCount += 1;
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ ok: true, index: callCount }) }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);
    const mainMenuOccurrences = io.stdoutText().split("Yeelight AI CLI").length - 1;
    const mcpPromptOccurrences = io.stderrText().split("MCP [cloud/metadata/lan，默认 cloud，0 返回主菜单]:").length - 1;
    const toolPromptOccurrences = io.stderrText().split("cloud 工具名（?工具名看参数，tools 看列表，switch 切换 MCP，0 返回主菜单）:").length - 1;

    assert.equal(code, 0);
    assert.equal(callCount, 2);
    assert.equal(mainMenuOccurrences, 2);
    assert.equal(mcpPromptOccurrences, 1);
    assert.equal(toolPromptOccurrences, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test("菜单把工具列表确认处误输入的工具名作为工具名继续", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-tool-at-confirm-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\ncloud\ncontrol_node\ny\n{}\n0\n0\n", true);
  const originalFetch = global.fetch;
  let calledName = "";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-tool-at-confirm" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "control_node",
              description: "控制节点",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
    }
    if (body.method === "tools/call") {
      calledName = body.params.name;
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          content: [{ type: "text", text: "{\"ok\":true}" }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.equal(calledName, "control_node");
    assert.equal(io.stderrText().includes("cloud 工具名（?工具名看参数，tools 看列表，switch 切换 MCP，0 返回主菜单）:"), true);
    assert.equal(io.stderrText().split("MCP [cloud/metadata/lan，默认 cloud，0 返回主菜单]:").length - 1, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("MCP 子流程操作失败后仍停留在子流程", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-mcp-sub-recover-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\ninvalid\n0\n0\n", true);

  const code = await main([], io);
  const mainMenuOccurrences = io.stdoutText().split("Yeelight AI CLI").length - 1;
  const mcpPromptOccurrences = io.stderrText().split("MCP [cloud/metadata/lan，默认 cloud，0 返回主菜单]:").length - 1;

  assert.equal(code, 0);
  assert.equal(io.stderrText().includes("操作失败：不支持的选项：invalid"), true);
  assert.equal(mainMenuOccurrences, 2);
  assert.equal(mcpPromptOccurrences, 2);
});

test("MCP 工具会话支持显式切换 MCP", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-mcp-switch-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\ncloud\nn\nswitch\nmetadata\nn\n?yeelight_metadata.list_tasks\n0\n0\n", true);
  const originalFetch = global.fetch;
  const endpoints = [];
  global.fetch = async (url, options) => {
    endpoints.push(String(url));
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-switch-home" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "yeelight_metadata.list_tasks",
              description: "分页返回 Metadata 任务摘要",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);
    const mcpPromptOccurrences = io.stderrText().split("MCP [cloud/metadata/lan，默认 cloud，0 返回主菜单]:").length - 1;

    assert.equal(code, 0);
    assert.equal(mcpPromptOccurrences, 2);
    assert.equal(io.stdoutText().includes("已进入 cloud MCP"), true);
    assert.equal(io.stdoutText().includes("已进入 metadata MCP"), true);
    assert.equal(endpoints.every((endpoint) => endpoint.includes("/apis/metadata_mcp_server/v1/mcp")), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("菜单支持输入问号工具名只查看参数并返回菜单", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-describe-only-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\ncloud\ny\n?get_devices\n0\n0\n", true);
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-describe-only-home" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "get_devices",
              description: "获取设备列表",
              inputSchema: {
                type: "object",
                properties: {
                  roomId: {
                    type: "string",
                    description: "房间 ID",
                  },
                },
              },
            },
          ],
        },
      });
    }
    if (body.method === "tools/call") {
      callCount += 1;
      return responseJson({ jsonrpc: "2.0", id: 3, result: {} });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.equal(callCount, 0);
    assert.equal(io.stdoutText().includes("提示：输入工具名会先展示参数说明；只想看参数不调用，可输入 ?工具名。"), true);
    assert.equal(io.stderrText().includes("cloud 工具名（?工具名看参数，tools 看列表，switch 切换 MCP，0 返回主菜单）:"), true);
    assert.equal(io.stdoutText().includes("roomId (string, 可选): 房间 ID"), true);
    assert.equal(io.stderrText().includes("参数 JSON [默认 {}]:"), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("工具列表失败时可取消手动调用并返回菜单", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-home-tools-fail-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-home-secret-123456",
    clientId: "client-home-123456",
    houseId: "house-home-123456",
  };
  saveConfig(loadResult.config, { env });
  const io = captureIo(env, "y\n5\ncloud\ny\nn\n0\n0\n", true);
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("cloud list failed");
  };

  try {
    const code = await main([], io);

    assert.equal(code, 0);
    assert.equal(io.stderrText().includes("tools/list 失败：cloud list failed"), true);
    assert.equal(io.stderrText().includes("工具列表获取失败，是否仍手动输入工具名继续"), true);
    assert.equal(io.stderrText().includes("工具名:"), false);
    assert.equal(io.stdoutText().split("Yeelight AI CLI").length >= 3, true);
  } finally {
    global.fetch = originalFetch;
  }
});

function captureIo(env, input = "", isTTY = false) {
  let stdoutText = "";
  let stderrText = "";
  const stdin = new PassThrough();
  stdin.isTTY = isTTY;
  if (input) {
    setImmediate(() => stdin.write(input));
  }
  return {
    stdin,
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

function responseJson(body, headers = {}) {
  return {
    ok: true,
    status: 200,
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
