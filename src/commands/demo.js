"use strict";

const { getBooleanFlag, parseArgs } = require("../args");
const { loadConfig } = require("../config/store");
const { getAdapter } = require("../mcp/registry");
const { callMcpTool, initializeMcpSession, listMcpTools } = require("../mcp/protocol");
const { CliError } = require("../errors");
const { writeJson } = require("../output/json");

async function runDemoCommand(argv, io) {
  const { positionals, flags } = parseArgs(argv);
  const id = positionals[0];
  const asJson = getBooleanFlag(flags, "json", false);
  const probe = getBooleanFlag(flags, "probe", false);
  if (!id) {
    throw new CliError("demo 需要指定 cloud、metadata 或 lan。");
  }
  const adapter = getAdapter(id);
  if (!adapter) {
    throw new CliError(`不支持的 MCP ID：${id}`);
  }
  const loadResult = loadConfig({ env: io.env });
  const result = await buildDemo(id, loadResult.config, { probe });
  if (asJson) {
    writeJson(io, result);
  } else {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  return 0;
}

async function buildDemo(id, config, options = {}) {
  if (id === "cloud") {
    const safetyContract = getAdapter("cloud").inspect(config).safetyContract;
    return {
      id,
      mode: "dry-run-plan",
      endpoint: config.mcp.cloud.endpoint,
      safetyContract,
      steps: ["查询家庭信息", "查询房间和设备列表", "控制类工具默认 dryRun=true，仅生成执行计划"],
      sampleDryRun: {
        tool: "control_node",
        arguments: {
          controlRequest: {
            nodeId: 1,
            nodeType: 2,
            command: { command: "set", params: [{ propName: "p", value: true }] },
            dryRun: true,
            confirmSideEffect: false,
          },
        },
      },
      notes: "Cloud demo 不调用真实控制接口；真实执行必须显式 dryRun=false 且 confirmSideEffect=true。",
    };
  }
  if (id === "metadata") {
    return {
      id,
      mode: "safe-metadata-flow",
      endpoint: config.mcp.metadata.endpoint,
      steps: ["list_tasks(query)", "list_tasks(task)", "get_action_schema", "execute_task(dryRun=true)"],
      sampleDryRun: {
        tool: "yeelight_metadata.execute_task",
        arguments: {
          task: "family_space.manage_house",
          action: "get_house_detail",
          context: {},
          payload: {},
          options: { dryRun: true },
        },
      },
      notes: "Metadata MCP 默认只生成 dryRun 计划。",
    };
  }
  const result = {
    id,
    mode: options.probe ? "lan-readonly-probe" : "lan-plan",
    endpoint: config.mcp.lan.endpoint,
    steps: ["tools/list", "get_provider_info", "list_nodes"],
    notes: "LAN demo 只调用只读工具，不执行 execute_actions。",
  };
  if (!options.probe) {
    result.notes = "传 --probe 后才会访问 LAN 网关并调用只读工具。";
    return result;
  }
  if (!config.mcp.lan.endpoint) {
    result.ok = false;
    result.error = "LAN MCP endpoint 未配置，请先运行 mcp configure lan --gateway-ip <ip>。";
    return result;
  }
  const protocolVersion = config.mcp.lan.protocolVersion || "2025-06-18";
  const session = await initializeMcpSession(config.mcp.lan.endpoint, { protocolVersion });
  result.session = {
    ok: session.ok,
    protocolVersion: session.protocolVersion,
    sessionId: session.sessionId,
    error: session.error,
  };
  if (!session.ok) {
    result.ok = false;
    return result;
  }
  const tools = await listMcpTools(config.mcp.lan.endpoint, { protocolVersion, session });
  result.tools = tools.tools.map((tool) => tool.name);
  const provider = await callMcpTool(config.mcp.lan.endpoint, "get_provider_info", {}, { protocolVersion, session, id: 3 });
  const nodes = await callMcpTool(config.mcp.lan.endpoint, "list_nodes", {}, { protocolVersion, session, id: 4 });
  result.readonlyCalls = [
    summarizeToolCall(provider),
    summarizeToolCall(nodes),
  ];
  result.ok = tools.ok && provider.ok && nodes.ok;
  return result;
}

function summarizeToolCall(call) {
  return {
    name: call.name,
    ok: call.ok,
    error: call.error,
    data: summarizeData(call.data),
  };
}

function summarizeData(data) {
  if (Array.isArray(data)) {
    return { type: "array", count: data.length, sample: data.slice(0, 3) };
  }
  if (data && typeof data === "object") {
    const result = { ...data };
    for (const key of Object.keys(result)) {
      if (Array.isArray(result[key])) {
        result[key] = { type: "array", count: result[key].length, sample: result[key].slice(0, 3) };
      }
    }
    return result;
  }
  return data;
}

module.exports = {
  buildDemo,
  runDemoCommand,
};
