"use strict";

const { getBooleanFlag, parseArgs } = require("../args");
const { getStringFlag } = require("../args");
const { DEFAULT_ENDPOINTS } = require("../config/defaults");
const { loadConfig, saveConfig } = require("../config/store");
const { assertControlArgumentsAllowed } = require("../control/properties");
const { CliError } = require("../errors");
const { getAdapter, listAdapters } = require("../mcp/registry");
const { buildLanEndpoint } = require("../mcp/lan");
const { compactMetadataCallData } = require("../mcp/metadata/compact");
const { callMcpTool, listAllMcpTools, listMcpTools } = require("../mcp/protocol");
const { resolveMcpRuntime } = require("../mcp/runtime");
const { findTool, formatToolDetails, formatToolListDescription, formatToolParameterSummary } = require("../mcp/schema");
const { writeJson } = require("../output/json");
const { formatTable } = require("../output/table");

const MCP_ARGUMENT_OBJECT_HINT = "MCP tools/call 的 arguments 外层必须是 JSON object；属性值可以使用布尔值，例如 {\"value\":false}，但不能直接传 false。";

async function runMcpCommand(argv, io) {
  const { positionals, flags } = parseArgs(argv);
  const action = positionals[0] || "list";
  if (action === "list") {
    return runMcpList(flags, io);
  }
  if (action === "inspect") {
    return runMcpInspect(positionals[1], flags, io);
  }
  if (action === "tools") {
    return runMcpTools(positionals[1], flags, io);
  }
  if (action === "groups") {
    return runMcpGroups(positionals[1], flags, io);
  }
  if (action === "describe" || action === "schema") {
    return runMcpDescribe(positionals[1], positionals[2], flags, io);
  }
  if (action === "call") {
    return runMcpCall(positionals[1], positionals[2], flags, io);
  }
  if (action === "configure") {
    return runMcpConfigure(positionals[1], flags, io);
  }
  throw new CliError(`未知 mcp 子命令：${action}`);
}

function runMcpList(flags, io) {
  const asJson = getBooleanFlag(flags, "json", false);
  const loadResult = loadConfig({ env: io.env });
  const rows = listAdapters().map((adapter) => buildMcpSummary(adapter, loadResult.config));
  if (asJson) {
    writeJson(io, {
      ok: true,
      configPath: loadResult.path,
      mcp: rows,
    });
  } else {
    io.stdout.write(
      `${formatTable(
        ["MCP", "Enabled", "Configured", "Reachable", "Notes"],
        rows.map((row) => [row.id, row.enabled, row.configured, row.reachable, row.notes])
      )}\n`
    );
  }
  return 0;
}

async function runMcpInspect(id, flags, io) {
  const asJson = getBooleanFlag(flags, "json", false);
  const probe = getBooleanFlag(flags, "probe", false);
  if (!id) {
    throw new CliError("mcp inspect 需要指定 cloud、metadata 或 lan。");
  }
  const adapter = getAdapter(id);
  if (!adapter) {
    throw new CliError(`不支持的 MCP ID：${id}`);
  }
  const loadResult = loadConfig({ env: io.env });
  const result = await adapter.inspect(loadResult.config, { probe });
  if (asJson) {
    writeJson(io, result);
  } else {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  return 0;
}

async function runMcpTools(id, flags, io) {
  const asJson = getBooleanFlag(flags, "json", false);
  if (!id) {
    throw new CliError("mcp tools 需要指定 cloud、metadata 或 lan。");
  }
  const loadResult = loadConfig({ env: io.env });
  const runtime = resolveMcpRuntime(loadResult.config, id);
  const result = shouldUseStaticTools(id, flags)
    ? {
      ok: true,
      protocolVersion: runtime.protocolVersion,
      sessionId: "",
      ...paginateStaticTools(runtime.adapter.getStaticTools(), flags),
      source: "static",
    }
    : await listMcpToolsCommand(runtime, flags);
  const output = {
    ok: result.ok,
    mcp: id,
    endpoint: runtime.endpoint,
    sessionId: result.sessionId,
    source: result.source || "remote",
    tools: getBooleanFlag(flags, "raw", false) ? result.tools : result.tools.map(summarizeToolForList),
    nextCursor: result.nextCursor || null,
    error: result.error,
  };
  if (asJson) {
    writeJson(io, output);
  } else if (!result.ok) {
    io.stderr.write(`tools/list 失败：${result.error}\n`);
  } else {
    io.stdout.write(
      `${formatTable(
        ["Tool", "Params", "Description"],
        result.tools.map((tool) => [
          tool.name,
          formatToolParameterSummary(tool),
          formatToolListDescription(tool.description || ""),
        ])
      )}\n`
    );
    io.stdout.write(`\n查看参数：yeelight-ai mcp describe ${id} <tool>\n`);
    if (result.source === "static") {
      io.stdout.write("提示：metadata 默认使用 CLI 内置工具定义；如需探测远端 tools/list，可追加 --remote。\n");
      printMetadataGroups(runtime.adapter, io);
    }
    if (output.nextCursor) {
      io.stdout.write(`下一页：yeelight-ai mcp tools ${id} --cursor ${output.nextCursor}\n`);
    }
  }
  return result.ok ? 0 : 1;
}

function summarizeToolForList(tool) {
  return {
    name: tool.name,
    description: tool.description || "",
    params: formatToolParameterSummary(tool),
  };
}

function runMcpGroups(id, flags, io) {
  const asJson = getBooleanFlag(flags, "json", false);
  if (id !== "metadata") {
    throw new CliError("mcp groups 目前仅支持 metadata。");
  }
  const loadResult = loadConfig({ env: io.env });
  const runtime = resolveMcpRuntime(loadResult.config, id);
  const groups = runtime.adapter.getGroups();
  const output = {
    ok: true,
    mcp: id,
    endpoint: runtime.endpoint,
    source: "static",
    groups,
  };
  if (asJson) {
    writeJson(io, output);
  } else {
    io.stdout.write(
      `${formatTable(
        ["Group", "Title", "Summary"],
        groups.map((group) => [group.id, group.title, group.summary])
      )}\n`
    );
    io.stdout.write("\n可用于：yeelight-ai mcp call metadata yeelight_metadata.list_tasks --args '{\"group\":\"family_space\"}'\n");
  }
  return 0;
}

function printMetadataGroups(adapter, io) {
  const groups = typeof adapter.getGroups === "function" ? adapter.getGroups() : [];
  if (groups.length === 0) {
    return;
  }
  io.stdout.write("\nMetadata group 可选值：\n");
  io.stdout.write(
    `${formatTable(
      ["Group", "Title"],
      groups.map((group) => [group.id, group.title])
    )}\n`
  );
  io.stdout.write("完整说明：yeelight-ai mcp groups metadata\n");
}

async function runMcpDescribe(id, toolName, flags, io) {
  const asJson = getBooleanFlag(flags, "json", false);
  if (!id) {
    throw new CliError("mcp describe 需要指定 cloud、metadata 或 lan。");
  }
  if (!toolName) {
    throw new CliError("mcp describe 需要指定工具名。");
  }
  const loadResult = loadConfig({ env: io.env });
  const runtime = resolveMcpRuntime(loadResult.config, id);
  const result = shouldUseStaticTools(id, flags)
    ? {
      ok: true,
      protocolVersion: runtime.protocolVersion,
      sessionId: "",
      tools: runtime.adapter.getStaticTools(),
      source: "static",
    }
    : await listMcpTools(runtime.endpoint, {
      protocolVersion: runtime.protocolVersion,
      headers: runtime.headers,
      timeoutMs: getMcpTimeoutMs(flags),
      cursor: getStringFlag(flags, "cursor", ""),
    });
  if (!result.ok) {
    const output = {
      ok: false,
      mcp: id,
      endpoint: runtime.endpoint,
      sessionId: result.sessionId,
      name: toolName,
      error: result.error,
    };
    if (asJson) {
      writeJson(io, output);
    } else {
      io.stderr.write(`tools/list 失败：${result.error}\n`);
    }
    return 1;
  }

  const tool = findTool(result.tools, toolName);
  if (!tool) {
    const output = {
      ok: false,
      mcp: id,
      endpoint: runtime.endpoint,
      sessionId: result.sessionId,
      name: toolName,
      error: `未找到工具：${toolName}`,
      availableTools: result.tools.map((item) => item.name).filter(Boolean),
    };
    if (asJson) {
      writeJson(io, output);
    } else {
      io.stderr.write(`${output.error}\n`);
      if (output.availableTools.length > 0) {
        io.stderr.write(`可用工具：${output.availableTools.join(", ")}\n`);
      }
    }
    return 1;
  }

  const output = {
    ok: true,
    mcp: id,
    endpoint: runtime.endpoint,
    sessionId: result.sessionId,
    source: result.source || "remote",
    tool,
  };
  if (asJson) {
    writeJson(io, output);
  } else {
    io.stdout.write(formatToolDetails(tool));
  }
  return 0;
}

async function runMcpCall(id, toolName, flags, io) {
  const asJson = getBooleanFlag(flags, "json", false);
  const raw = getBooleanFlag(flags, "raw", false);
  const dataOnly = getBooleanFlag(flags, "data-only", false);
  if (!id) {
    throw new CliError("mcp call 需要指定 cloud、metadata 或 lan。");
  }
  if (!toolName) {
    throw new CliError("mcp call 需要指定工具名。");
  }
  const args = parseArguments(getStringFlag(flags, "args", "{}"));
  assertControlArgumentsAllowed(toolName, args, CliError);
  const loadResult = loadConfig({ env: io.env });
  const runtime = resolveMcpRuntime(loadResult.config, id);
  const result = await callMcpTool(runtime.endpoint, toolName, args, {
    protocolVersion: runtime.protocolVersion,
    headers: runtime.headers,
    timeoutMs: getMcpTimeoutMs(flags),
  });
  const compacted = raw || dataOnly ? { data: result.data, compacted: false, hint: "" } : compactMetadataCallData(toolName, result.data, args);
  const output = {
    ok: result.ok,
    mcp: id,
    endpoint: runtime.endpoint,
    sessionId: result.sessionId,
    name: result.name || toolName,
    data: compacted.data,
    error: result.error,
  };
  if (compacted.compacted) {
    output.output = "compact";
    output.hint = compacted.hint;
  }
  if (raw) {
    output.result = result.result;
  }
  const finalOutput = dataOnly && result.ok ? result.data : output;
  if (asJson || dataOnly) {
    writeJson(io, finalOutput);
  } else {
    io.stdout.write(`${JSON.stringify(finalOutput, null, 2)}\n`);
  }
  return result.ok ? 0 : 1;
}

function runMcpConfigure(id, flags, io) {
  const asJson = getBooleanFlag(flags, "json", false);
  if (!id) {
    throw new CliError("mcp configure 需要指定 cloud、metadata 或 lan。");
  }
  if (id === "lan") {
    return runMcpConfigureLan(flags, io, asJson);
  }
  if (id === "cloud" || id === "metadata") {
    return runMcpConfigureHttp(id, flags, io, asJson);
  }
  throw new CliError(`不支持的 MCP ID：${id}`);
}

function runMcpConfigureLan(flags, io, asJson) {
  const gatewayIp = getStringFlag(flags, "gateway-ip", "");
  const endpoint = getStringFlag(flags, "endpoint", "") || buildLanEndpoint(gatewayIp);
  const enable = getBooleanFlag(flags, "enable", true);
  if (!endpoint) {
    throw new CliError("配置 LAN MCP 需要 --gateway-ip <ip> 或 --endpoint <url>。");
  }
  const loadResult = loadConfig({ env: io.env });
  loadResult.config.mcp.lan = {
    ...loadResult.config.mcp.lan,
    enabled: enable,
    transport: "streamable-http",
    endpoint,
    gatewayIp,
    status: "configured",
    protocolVersion: loadResult.config.mcp.lan.protocolVersion || "2025-06-18",
    requiresAppLanControl: true,
  };
  saveConfig(loadResult.config, { env: io.env });

  const result = {
    ok: true,
    path: loadResult.path,
    mcp: "lan",
    enabled: enable,
    endpoint,
    gatewayIp,
    protocolVersion: loadResult.config.mcp.lan.protocolVersion,
  };
  if (asJson) {
    writeJson(io, result);
  } else {
    io.stdout.write(`已配置 LAN MCP：${endpoint}\n`);
    io.stdout.write("请确认 APP 已开启 LAN CONTROL，再运行 yeelight-ai mcp inspect lan --probe。\n");
  }
  return 0;
}

function runMcpConfigureHttp(id, flags, io, asJson) {
  const { endpoint, mode } = resolveConfiguredEndpoint(id, flags);
  const enable = getBooleanFlag(flags, "enable", true);
  const loadResult = loadConfig({ env: io.env });
  loadResult.config.mcp[id] = {
    ...loadResult.config.mcp[id],
    enabled: enable,
    transport: "streamable-http",
    endpoint,
    authProfile: loadResult.config.mcp[id].authProfile || "default",
  };
  saveConfig(loadResult.config, { env: io.env });

  const result = {
    ok: true,
    path: loadResult.path,
    mcp: id,
    enabled: enable,
    endpoint,
    mode,
  };
  if (asJson) {
    writeJson(io, result);
  } else {
    io.stdout.write(`已配置 ${id} MCP：${endpoint}\n`);
    io.stdout.write(`验证连接：yeelight-ai mcp tools ${id}${id === "metadata" ? " --remote" : ""}\n`);
  }
  return 0;
}

function resolveConfiguredEndpoint(id, flags) {
  const endpoint = getStringFlag(flags, "endpoint", "");
  const local = getBooleanFlag(flags, "local", false);
  const remote = getBooleanFlag(flags, "remote", false);
  if ([Boolean(endpoint), local, remote].filter(Boolean).length > 1) {
    throw new CliError("--endpoint、--local、--remote 只能选择一个。");
  }
  if (endpoint) {
    return {
      endpoint: normalizeConfiguredEndpoint(endpoint),
      mode: "custom",
    };
  }
  if (local) {
    const defaultPort = id === "cloud" ? "9000" : "9010";
    const host = getStringFlag(flags, "host", "127.0.0.1");
    const port = getStringFlag(flags, "port", defaultPort);
    const path = getStringFlag(flags, "path", "/mcp");
    return {
      endpoint: normalizeConfiguredEndpoint(`http://${host}:${port}${path.startsWith("/") ? path : `/${path}`}`),
      mode: "local",
    };
  }
  return {
    endpoint: DEFAULT_ENDPOINTS[id],
    mode: "remote",
  };
}

function normalizeConfiguredEndpoint(endpoint) {
  return String(endpoint || "").trim().replace(/\/+$/, "");
}

function parseArguments(raw) {
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(MCP_ARGUMENT_OBJECT_HINT);
    }
    return value;
  } catch (error) {
    throw new CliError(`--args 必须是合法 JSON object：${error.message}\n示例：--args '{"dryRun":true}'，关闭灯时 value 应写成对象内的布尔值 false。`);
  }
}

function getMcpTimeoutMs(flags) {
  const value = getStringFlag(flags, "timeout-ms", "");
  return value ? Number(value) : undefined;
}

async function listMcpToolsCommand(runtime, flags) {
  const options = {
    protocolVersion: runtime.protocolVersion,
    headers: runtime.headers,
    timeoutMs: getMcpTimeoutMs(flags),
    cursor: getStringFlag(flags, "cursor", ""),
  };
  if (getBooleanFlag(flags, "all", false)) {
    return listAllMcpTools(runtime.endpoint, options);
  }
  return listMcpTools(runtime.endpoint, options);
}

function paginateStaticTools(tools, flags) {
  const limitValue = getStringFlag(flags, "limit", "");
  const limit = limitValue ? Number(limitValue) : 0;
  const cursor = getStringFlag(flags, "cursor", "");
  if (!limit || !Number.isFinite(limit) || limit <= 0 || getBooleanFlag(flags, "all", false)) {
    return {
      tools,
      nextCursor: null,
    };
  }
  const offset = decodeOffsetCursor(cursor);
  const page = tools.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    tools: page,
    nextCursor: nextOffset < tools.length ? encodeOffsetCursor(nextOffset) : null,
  };
}

function encodeOffsetCursor(offset) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodeOffsetCursor(cursor) {
  if (!cursor) {
    return 0;
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const offset = Number(parsed.offset);
    return Number.isFinite(offset) && offset > 0 ? offset : 0;
  } catch (error) {
    throw new CliError("--cursor 不是合法分页游标。");
  }
}

function shouldUseStaticTools(id, flags) {
  return id === "metadata" && !getBooleanFlag(flags, "remote", false);
}

function buildMcpSummary(adapter, config) {
  const mcpConfig = config.mcp[adapter.id] || {};
  const profile = config.auth.profiles[mcpConfig.authProfile || "default"] || {};
  if (adapter.id === "lan") {
    const configured = mcpConfig.endpoint ? "yes" : "pending";
    return {
      id: "lan",
      enabled: mcpConfig.enabled ? "yes" : "no",
      configured,
      reachable: "unknown",
      notes: configured === "yes" ? "等待运行时探测" : "需要配置 gateway IP",
    };
  }
  return {
    id: adapter.id,
    enabled: mcpConfig.enabled ? "yes" : "no",
    configured: mcpConfig.endpoint && profile.authorization ? "yes" : "no",
    reachable: "unknown",
    notes: adapter.id === "cloud" ? "控制和查询工具" : "任务模型工具",
  };
}

module.exports = {
  getMcpTimeoutMs,
  parseArguments,
  runMcpCommand,
  runMcpDescribe,
};
