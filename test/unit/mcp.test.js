"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runMcpCommand, parseArguments } = require("../../src/commands/mcp");
const { createDefaultConfig } = require("../../src/config/defaults");
const { loadConfig, saveConfig } = require("../../src/config/store");
const { inspectCloudSourceGate } = require("../../src/mcp/cloud");
const { getAdapter, listAdapters } = require("../../src/mcp/registry");

test("registry 永远包含三个 MCP", () => {
  assert.deepEqual(listAdapters().map((adapter) => adapter.id), ["cloud", "metadata", "lan"]);
});

test("cloud inspect 标记写操作风险", () => {
  const inspect = getAdapter("cloud").inspect(createDefaultConfig());

  assert.deepEqual(inspect.writeTools, ["control_node", "execute_scene"]);
  assert.equal(inspect.safetyContract.dryRun, "pass");
  assert.equal(inspect.safetyContract.confirmSideEffect, "pass");
});

test("metadata inspect 使用当前正式工具名前缀", () => {
  const inspect = getAdapter("metadata").inspect(createDefaultConfig());

  assert.equal(inspect.tools.includes("yeelight_metadata.execute_task"), true);
  assert.equal(inspect.endpoint, "https://api.yeelight.com/apis/metadata_mcp_server/v1/mcp");
});

test("metadata adapter 提供本地工具参数定义", () => {
  const tools = getAdapter("metadata").getStaticTools();
  const execute = tools.find((tool) => tool.name === "yeelight_metadata.execute_task");
  const listGroups = tools.find((tool) => tool.name === "yeelight_metadata.list_groups");
  const listTasks = tools.find((tool) => tool.name === "yeelight_metadata.list_tasks");
  const getActionSchema = tools.find((tool) => tool.name === "yeelight_metadata.get_action_schema");

  assert.equal(tools.length, 5);
  assert.deepEqual(tools.map((tool) => tool.name), [
    "yeelight_metadata.list_groups",
    "yeelight_metadata.list_tasks",
    "yeelight_metadata.list_actions",
    "yeelight_metadata.get_action_schema",
    "yeelight_metadata.execute_task",
  ]);
  assert.equal(listGroups.inputSchema.properties.limit.default, 20);
  assert.equal(execute.inputSchema.required.includes("request"), true);
  assert.equal(execute.inputSchema.properties.request.properties.options.properties.dryRun.default, true);
  assert.equal(listTasks.inputSchema.properties.group.enum.includes("family_space"), true);
  assert.equal(listTasks.inputSchema.properties.group.description.includes("list_groups"), true);
  assert.equal(listTasks.inputSchema.properties.query.default, null);
  assert.equal(listTasks.inputSchema.properties.task.description.includes("返回该任务详情"), true);
  assert.deepEqual(getActionSchema.inputSchema.required, ["task", "action"]);
});

test("metadata adapter 提供本地任务分组列表", () => {
  const groups = getAdapter("metadata").getGroups();

  assert.equal(groups.length, 7);
  assert.equal(groups[0].id, "family_space");
  assert.equal(groups.some((group) => group.id === "maintenance_account"), true);
});

test("lan inspect 暴露网关 MCP 连接流程", async () => {
  const config = createDefaultConfig();
  const inspect = await getAdapter("lan").inspect(config);

  assert.equal(inspect.protocolVersion, "2025-06-18");
  assert.equal(inspect.connectionFlow.includes("tools/list"), true);
  assert.equal(inspect.discoveryRule.includes("tools/list"), true);
});

test("cloud source gate 能识别当前整改状态", () => {
  const gate = inspectCloudSourceGate();

  assert.equal(gate.ok, true);
  assert.equal(gate.bearerNormalization, true);
  assert.equal(gate.runtimeBindHost, true);
});

test("mcp call 使用本地登录 Header 调用工具", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-call-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-call-123456",
    clientId: "client-call-123456",
    houseId: "house-call-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const calls = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ body, headers: options.headers });
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-call" });
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
          content: [{ type: "text", text: "{\"ok\":true,\"count\":1}" }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["call", "cloud", "get_devices", "--args", "{\"roomId\":\"1\"}", "--json"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { ok: true, count: 1 });
  assert.equal(Object.hasOwn(result, "result"), false);
  assert.equal(calls[0].headers.Authorization, "Bearer token-call-123456");
  assert.equal(calls[2].headers["House-Id"], "house-call-123456");
  assert.deepEqual(calls[2].body.params.arguments, { roomId: "1" });
});

test("mcp configure 支持 cloud 和 metadata 本地远端切换", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-configure-http-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const cloudIo = captureIo(env);

  const cloudCode = await runMcpCommand(["configure", "cloud", "--local", "--port", "19000", "--json"], cloudIo);
  const cloudResult = JSON.parse(cloudIo.stdoutText());
  const afterCloud = loadConfig({ env }).config;

  assert.equal(cloudCode, 0);
  assert.equal(cloudResult.endpoint, "http://127.0.0.1:19000/mcp");
  assert.equal(cloudResult.mode, "local");
  assert.equal(afterCloud.mcp.cloud.endpoint, "http://127.0.0.1:19000/mcp");

  const metadataIo = captureIo(env);
  const metadataCode = await runMcpCommand(["configure", "metadata", "--remote", "--json"], metadataIo);
  const metadataResult = JSON.parse(metadataIo.stdoutText());
  const afterMetadata = loadConfig({ env }).config;

  assert.equal(metadataCode, 0);
  assert.equal(metadataResult.mode, "remote");
  assert.equal(afterMetadata.mcp.metadata.endpoint, "https://api.yeelight.com/apis/metadata_mcp_server/v1/mcp");

  const customIo = captureIo(env);
  await runMcpCommand(["configure", "cloud", "--endpoint", "http://localhost:9000/mcp/", "--json"], customIo);
  const afterCustom = loadConfig({ env }).config;

  assert.equal(afterCustom.mcp.cloud.endpoint, "http://localhost:9000/mcp");
});

test("mcp configure cloud 不允许同时指定多个 endpoint 来源", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-configure-conflict-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const io = captureIo(env);

  await assert.rejects(
    () => runMcpCommand(["configure", "cloud", "--local", "--remote"], io),
    /--endpoint、--local、--remote 只能选择一个/
  );
});

test("mcp call 可按需输出 raw result 或仅输出 data", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-call-output-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-call-output-123456",
    clientId: "client-call-output-123456",
    houseId: "house-call-output-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} });
    }
    if (body.method === "tools/call") {
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          content: [{ type: "text", text: "{\"ok\":true,\"items\":[1,2]}" }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };
  const rawIo = captureIo(env);

  const rawCode = await runMcpCommand(["call", "cloud", "get_devices", "--args", "{}", "--json", "--raw"], rawIo);
  const raw = JSON.parse(rawIo.stdoutText());
  const dataIo = captureIo(env);
  const dataCode = await runMcpCommand(["call", "cloud", "get_devices", "--args", "{}", "--data-only"], dataIo);
  const data = JSON.parse(dataIo.stdoutText());

  assert.equal(rawCode, 0);
  assert.equal(Object.hasOwn(raw, "result"), true);
  assert.equal(raw.result.content[0].type, "text");
  assert.equal(dataCode, 0);
  assert.deepEqual(data, { ok: true, items: [1, 2] });
});

test("mcp call --data-only 失败时输出结构化错误", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-call-data-only-error-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-data-only-error-123456",
    clientId: "client-data-only-error-123456",
    houseId: "house-data-only-error-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    throw new Error("connect failed");
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["call", "metadata", "yeelight_metadata.list_groups", "--args", "{}", "--data-only"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 1);
  assert.equal(result.ok, false);
  assert.equal(result.name, "yeelight_metadata.list_groups");
  assert.equal(result.error, "connect failed");
});

test("mcp call 默认压缩 metadata 浏览型大结果", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-call-compact-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-call-compact-123456",
    clientId: "client-call-compact-123456",
    houseId: "house-call-compact-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} });
    }
    if (body.method === "tools/call") {
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(heavyMetadataListTasksData()) }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };
  const compactIo = captureIo(env);

  const compactCode = await runMcpCommand(["call", "metadata", "yeelight_metadata.list_tasks", "--args", "{\"group\":\"family_space\",\"limit\":1}", "--json"], compactIo);
  const compact = JSON.parse(compactIo.stdoutText());
  const dataIo = captureIo(env);
  const dataCode = await runMcpCommand(["call", "metadata", "yeelight_metadata.list_tasks", "--args", "{\"group\":\"family_space\",\"limit\":1}", "--data-only"], dataIo);
  const dataOnly = JSON.parse(dataIo.stdoutText());

  assert.equal(compactCode, 0);
  assert.equal(compact.output, "compact");
  assert.match(compact.hint, /--data-only/);
  assert.equal(compact.data.result.tasks[0].task, "family_space.manage_house");
  assert.deepEqual(compact.data.result.tasks[0].actions, ["get_house_detail", "create"]);
  assert.equal(Object.hasOwn(compact.data.result.tasks[0], "interfaceRefs"), false);
  assert.equal(compactIo.stdoutText().includes("parameterSchema"), false);
  assert.equal(dataCode, 0);
  assert.equal(Object.hasOwn(dataOnly.result, "groups"), false);
  assert.equal(dataOnly.result.items[0].actions[0].parameterSchema.contextRequired[0], "houseId");
});

test("mcp describe 输出工具参数说明", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-describe-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-describe-123456",
    clientId: "client-describe-123456",
    houseId: "house-describe-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-describe" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [controlNodeTool()],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["describe", "cloud", "control_node"], io);

  assert.equal(code, 0);
  assert.equal(io.stdoutText().includes("工具: control_node"), true);
  assert.equal(io.stdoutText().includes("controlRequest (object, 必填)"), true);
  assert.equal(io.stdoutText().includes("controlRequest.nodeId (string, 必填)"), true);
  assert.equal(io.stdoutText().includes("controlRequest.command.params (object, 可选)"), true);
  assert.equal(io.stdoutText().includes("\"controlRequest\""), true);
});

test("mcp tools 普通输出包含顶层参数摘要和 describe 提示", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-tools-params-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-tools-params-123456",
    clientId: "client-tools-params-123456",
    houseId: "house-tools-params-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-tools-params" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [controlNodeTool()],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["tools", "cloud"], io);

  assert.equal(code, 0);
  assert.equal(io.stdoutText().includes("Params"), true);
  assert.equal(io.stdoutText().includes("controlRequest(必填)"), true);
  assert.equal(io.stdoutText().includes("yeelight-ai mcp describe cloud <tool>"), true);
});

test("mcp tools metadata 默认使用本地工具定义", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-metadata-static-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-metadata-static-123456",
    clientId: "client-metadata-static-123456",
    houseId: "house-metadata-static-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    throw new Error("不应触发远端 tools/list");
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["tools", "metadata", "--json"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.equal(result.source, "static");
  assert.equal(result.tools.some((tool) => tool.name === "yeelight_metadata.list_tasks"), true);
  assert.equal(Object.hasOwn(result.tools[0], "inputSchema"), false);
  assert.equal(Object.hasOwn(result.tools[0], "params"), true);
});

test("mcp tools --json --raw 保留完整 inputSchema", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-tools-raw-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-tools-raw-123456",
    clientId: "client-tools-raw-123456",
    houseId: "house-tools-raw-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    throw new Error("不应触发远端 metadata tools");
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["tools", "metadata", "--json", "--raw", "--limit", "1"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.equal(Object.hasOwn(result.tools[0], "inputSchema"), true);
  assert.equal(result.tools[0].inputSchema.properties.limit.minimum, 1);
});

test("mcp tools metadata 静态工具支持 cursor 分页", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-metadata-page-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-metadata-page-123456",
    clientId: "client-metadata-page-123456",
    houseId: "house-metadata-page-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    throw new Error("不应触发远端 metadata tools");
  };
  const firstIo = captureIo(env);

  const firstCode = await runMcpCommand(["tools", "metadata", "--json", "--limit", "2"], firstIo);
  const first = JSON.parse(firstIo.stdoutText());
  const secondIo = captureIo(env);
  const secondCode = await runMcpCommand(["tools", "metadata", "--json", "--limit", "2", "--cursor", first.nextCursor], secondIo);
  const second = JSON.parse(secondIo.stdoutText());

  assert.equal(firstCode, 0);
  assert.equal(secondCode, 0);
  assert.equal(first.tools.length, 2);
  assert.equal(Boolean(first.nextCursor), true);
  assert.equal(second.tools.length, 2);
  assert.notEqual(first.tools[0].name, second.tools[0].name);
});

test("mcp tools metadata 普通输出会附带 group 可选值", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-metadata-tools-groups-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-metadata-tools-groups-123456",
    clientId: "client-metadata-tools-groups-123456",
    houseId: "house-metadata-tools-groups-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    throw new Error("不应触发远端 metadata tools");
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["tools", "metadata"], io);

  assert.equal(code, 0);
  assert.equal(io.stdoutText().includes("Metadata group 可选值"), true);
  assert.equal(io.stdoutText().includes("family_space"), true);
  assert.equal(io.stdoutText().includes("maintenance_account"), true);
  assert.equal(io.stdoutText().includes("yeelight-ai mcp groups metadata"), true);
});

test("mcp groups metadata 输出本地分组列表", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-metadata-groups-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-metadata-groups-123456",
    clientId: "client-metadata-groups-123456",
    houseId: "house-metadata-groups-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    throw new Error("不应触发远端 groups");
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["groups", "metadata", "--json"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.equal(result.source, "static");
  assert.equal(result.groups.length, 7);
  assert.equal(result.groups[0].id, "family_space");
});

test("mcp groups 仅支持 metadata", async () => {
  const io = captureIo(process.env);

  await assert.rejects(
    () => runMcpCommand(["groups", "cloud"], io),
    /仅支持 metadata/
  );
});

test("mcp describe metadata 默认使用本地工具参数定义", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-metadata-describe-static-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-metadata-describe-static-123456",
    clientId: "client-metadata-describe-static-123456",
    houseId: "house-metadata-describe-static-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    throw new Error("不应触发远端 describe");
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["describe", "metadata", "yeelight_metadata.execute_task"], io);

  assert.equal(code, 0);
  assert.equal(io.stdoutText().includes("工具: yeelight_metadata.execute_task"), true);
  assert.equal(io.stdoutText().includes("request.options.dryRun (boolean, 可选)"), true);
  assert.equal(io.stdoutText().includes("\"dryRun\": true"), true);
  assert.equal(io.stdoutText().includes("\"payload\": {}"), true);
});

test("mcp describe 的示例优先使用默认值和最小值", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-describe-example-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-describe-example-123456",
    clientId: "client-describe-example-123456",
    houseId: "house-describe-example-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    throw new Error("不应触发远端 describe");
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["describe", "metadata", "yeelight_metadata.list_tasks"], io);

  assert.equal(code, 0);
  assert.equal(io.stdoutText().includes("浏览、搜索或查看 Metadata 任务"), true);
  assert.equal(io.stdoutText().includes("query (string | null, 可选)"), true);
  assert.equal(io.stdoutText().includes("task (string | null, 可选)"), true);
  assert.equal(io.stdoutText().includes("\"limit\": 50"), true);
  assert.equal(io.stdoutText().includes("\"limit\": 0"), false);
});

test("mcp tools metadata --remote 仍探测远端 tools/list", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-metadata-remote-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-metadata-remote-123456",
    clientId: "client-metadata-remote-123456",
    houseId: "house-metadata-remote-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const calls = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.method);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} });
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "remote.metadata.tool",
              description: "远端工具",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["tools", "metadata", "--remote", "--json"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.equal(result.source, "remote");
  assert.deepEqual(calls, ["initialize", "tools/list"]);
  assert.equal(result.tools[0].name, "remote.metadata.tool");
});

test("mcp tools 远端支持 cursor 和 all 翻页", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-tools-remote-page-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-remote-page-123456",
    clientId: "client-remote-page-123456",
    houseId: "house-remote-page-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const cursors = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} });
    }
    if (body.method === "tools/list") {
      cursors.push(body.params.cursor || "");
      if (!body.params.cursor) {
        return responseJson({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [{ name: "remote.page.one", inputSchema: { type: "object", properties: {} } }],
            nextCursor: "cursor-2",
          },
        });
      }
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [{ name: "remote.page.two", inputSchema: { type: "object", properties: {} } }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };
  const pageIo = captureIo(env);

  const pageCode = await runMcpCommand(["tools", "cloud", "--json"], pageIo);
  const page = JSON.parse(pageIo.stdoutText());
  const allIo = captureIo(env);
  const allCode = await runMcpCommand(["tools", "cloud", "--json", "--all"], allIo);
  const all = JSON.parse(allIo.stdoutText());

  assert.equal(pageCode, 0);
  assert.equal(page.nextCursor, "cursor-2");
  assert.equal(allCode, 0);
  assert.deepEqual(all.tools.map((tool) => tool.name), ["remote.page.one", "remote.page.two"]);
  assert.deepEqual(cursors, ["", "", "cursor-2"]);
});

test("mcp describe --json 保留完整 inputSchema", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-describe-json-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-describe-json-123456",
    clientId: "client-describe-json-123456",
    houseId: "house-describe-json-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-describe-json" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [controlNodeTool()],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };
  const io = captureIo(env);

  const code = await runMcpCommand(["schema", "cloud", "control_node", "--json"], io);
  const result = JSON.parse(io.stdoutText());

  assert.equal(code, 0);
  assert.equal(result.ok, true);
  assert.equal(result.tool.name, "control_node");
  assert.equal(result.tool.inputSchema.$defs.ControlCommand.properties.command.type, "string");
});

test("mcp call cloud control_node 拦截不可控属性", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yeelight-cli-mcp-control-blocked-"));
  const env = { ...process.env, YEELIGHT_AI_CONFIG_DIR: dir };
  const loadResult = loadConfig({ env });
  loadResult.config.auth.profiles.default = {
    authorization: "Bearer token-control-blocked-123456",
    clientId: "client-control-blocked-123456",
    houseId: "house-control-blocked-123456",
  };
  saveConfig(loadResult.config, { env });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    throw new Error("不可控属性应在发起 MCP 请求前被拦截");
  };
  const args = JSON.stringify({
    controlRequest: {
      nodeId: 228661,
      nodeType: 2,
      command: {
        command: "set",
        params: [{ propName: "o", value: false }],
      },
    },
  });
  const io = captureIo(env);

  await assert.rejects(
    () => runMcpCommand(["call", "cloud", "control_node", "--args", args], io),
    /属性 o 是只读\/状态属性/
  );
});

test("mcp call 参数必须是 JSON object", () => {
  assert.deepEqual(parseArguments("{\"dryRun\":true}"), { dryRun: true });
  assert.throws(() => parseArguments("[]"), /JSON object/);
  assert.throws(() => parseArguments("false"), /属性值可以使用布尔值/);
  assert.throws(() => parseArguments("false"), /不能直接传 false/);
});

function controlNodeTool() {
  return {
    name: "control_node",
    description: "控制指定节点",
    inputSchema: {
      type: "object",
      required: ["controlRequest"],
      properties: {
        controlRequest: {
          type: "object",
          description: "控制请求",
          required: ["nodeId", "nodeType", "command"],
          properties: {
            nodeId: {
              type: "string",
              description: "节点 ID",
            },
            nodeType: {
              enum: ["device", "group"],
              description: "节点类型",
            },
            command: {
              $ref: "#/$defs/ControlCommand",
            },
          },
        },
      },
      $defs: {
        ControlCommand: {
          type: "object",
          required: ["command"],
          properties: {
            command: {
              type: "string",
              description: "命令名",
            },
            params: {
              type: "object",
              additionalProperties: true,
              description: "命令参数",
            },
          },
        },
      },
    },
  };
}

function heavyMetadataListTasksData() {
  return {
    result: {
      count: 1,
      total: 4,
      nextCursor: "cursor-2",
      items: [
        {
          id: "family_space.manage_house",
          group: "family_space",
          title: "管理家庭",
          summary: "查询、创建、编辑、删除家庭。",
          userPhrases: ["查看我的家庭"],
          priority: "P0",
          maxSideEffect: "S3",
          requiredContext: ["userId 或登录态"],
          commonInputs: ["houseId", "name"],
          interfaceRefs: ["candidate:house.core.get_detail"],
          actions: [
            {
              id: "get_house_detail",
              title: "查询家庭详情",
              description: "查询家庭详情",
              executionMode: "cloud_api",
              sideEffect: "S0",
              status: "confirmed",
              interfaceRefs: [{ runtimePath: "/apis/iot/v1/house/{id}/r/detail" }],
              parameterSchema: {
                contextRequired: ["houseId"],
                payloadRequired: [],
                payloadProperties: {
                  name: { type: "string", description: "家庭名称" },
                },
              },
            },
            {
              id: "create",
              title: "新建家庭",
              description: "新建家庭",
              executionMode: "cloud_api",
              sideEffect: "S2",
              status: "confirmed",
              interfaceRefs: [{ runtimePath: "/apis/iot/v2/thing/manage/house/w/create" }],
              parameterSchema: {
                contextRequired: [],
                payloadRequired: ["name"],
                payloadProperties: {
                  name: { type: "string", description: "家庭名称" },
                },
              },
            },
          ],
        },
      ],
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
