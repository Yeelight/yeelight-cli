"use strict";

const { getBooleanFlag, getStringFlag, hasFlag, parseArgs } = require("../args");
const { buildConcreteHeaders } = require("../clients/common");
const { loadConfig } = require("../config/store");
const { buildRegionEndpoints } = require("../config/region");
const { assertControlArgumentsAllowed, sanitizeControllablePropertyData, summarizeControllableProperties } = require("../control/properties");
const { CliError } = require("../errors");
const { callMcpTool } = require("../mcp/protocol");
const { resolveMcpRuntime } = require("../mcp/runtime");
const { writeJson } = require("../output/json");
const { formatTable } = require("../output/table");

const DEFAULT_FALLBACK_PAGE_SIZE = 300;

const RESOURCE_COMMANDS = {
  house: {
    defaultAction: "show",
    actions: {
      show: handleHouseShow,
      list: handleHouseShow,
    },
  },
  room: {
    defaultAction: "list",
    actions: {
      list: handleRoomList,
    },
  },
  device: {
    defaultAction: "list",
    actions: {
      list: handleDeviceList,
      show: handleDeviceShow,
    },
  },
  scene: {
    defaultAction: "list",
    actions: {
      list: handleSceneList,
      run: handleSceneRun,
    },
  },
  light: {
    defaultAction: "",
    actions: {
      on: handleLightOn,
      off: handleLightOff,
      brightness: handleLightBrightness,
      "color-temperature": handleLightColorTemperature,
      ct: handleLightColorTemperature,
    },
  },
};

async function runResourceCommand(resource, argv, io) {
  const definition = RESOURCE_COMMANDS[resource];
  if (!definition) {
    throw new CliError(`未知资源命令：${resource}`);
  }
  const { positionals, flags } = parseArgs(argv);
  if (getBooleanFlag(flags, "help", false) || positionals[0] === "help") {
    printResourceHelp(resource, io);
    return 0;
  }
  const action = positionals[0] || definition.defaultAction;
  const handler = definition.actions[action];
  if (!handler) {
    throw new CliError(`未知 ${resource} 子命令：${action || "(空)"}`);
  }
  const context = createResourceContext(resource, flags, io);
  return handler(positionals.slice(1), context);
}

function createResourceContext(resource, flags, io) {
  const mcp = getStringFlag(flags, "mcp", "auto");
  if (!["auto", "cloud"].includes(mcp)) {
    throw new CliError(`${resource} 快捷命令当前仅支持 --mcp auto 或 --mcp cloud。`);
  }
  const loadResult = loadConfig({ env: io.env });
  const format = resolveFormat(flags);
  return {
    asJson: format === "json",
    flags,
    format,
    io,
    config: loadResult.config,
    mcp: "cloud",
    runtime: resolveMcpRuntime(loadResult.config, "cloud"),
    timeoutMs: getTimeoutMs(flags),
  };
}

async function handleHouseShow(_args, context) {
  const result = await callReadTool(context, "get_currnet_house_info", {});
  const data = result.data || {};
  return outputResult(context, result, {
    resource: "house",
    action: "show",
    data,
    rows: [[pickId(data), pickName(data), data.desc || ""]],
    headers: ["House ID", "Name", "Desc"],
  });
}

async function handleRoomList(_args, context) {
  const toolArgs = buildListToolArguments(context, {});
  const result = await callPagedReadTool(context, "get_rooms", toolArgs);
  const rows = getRows(result.data).map((room) => [pickId(room), pickName(room), summarizeProperties(room.properties)]);
  return outputResult(context, result, {
    resource: "room",
    action: "list",
    data: result.data,
    rows,
    headers: ["Room ID", "Name", "Properties"],
    query: buildListQuery(context, {}),
  });
}

async function handleDeviceList(_args, context) {
  const roomId = getStringFlag(context.flags, "room", "") || getStringFlag(context.flags, "room-id", "");
  const baseArgs = roomId ? { roomId } : {};
  const toolArgs = buildListToolArguments(context, baseArgs);
  const result = await callPagedReadTool(context, "get_devices", toolArgs);
  const data = sanitizeControllablePropertyData(result.data);
  const rows = getRows(data).map((device) => [
    pickId(device),
    pickName(device),
    device.roomId || "",
    device.category || "",
    summarizeProperties(device.properties),
  ]);
  return outputResult(context, result, {
    resource: "device",
    action: "list",
    data,
    rows,
    headers: ["Device ID", "Name", "Room", "Category", "Properties"],
    query: buildListQuery(context, baseArgs),
  });
}

async function handleDeviceShow(args, context) {
  const deviceId = args[0];
  if (!deviceId) {
    throw new CliError("device show 需要指定 deviceId。");
  }
  const result = await callReadTool(context, "get_devices", {});
  if (!result.ok) {
    return outputResult(context, result, {
      resource: "device",
      action: "show",
      data: result.data,
      rows: [],
      headers: ["Device ID", "Name", "Room", "Category", "Properties"],
    });
  }
  const device = sanitizeControllablePropertyData(getRows(result.data).find((item) => String(item.id) === String(deviceId)));
  if (!device) {
    return outputPlainError(context, {
      resource: "device",
      action: "show",
      error: `未找到设备：${deviceId}`,
    });
  }
  return outputResult(context, result, {
    resource: "device",
    action: "show",
    data: device,
    rows: [[pickId(device), pickName(device), device.roomId || "", device.category || "", summarizeProperties(device.properties)]],
    headers: ["Device ID", "Name", "Room", "Category", "Properties"],
  });
}

async function handleSceneList(_args, context) {
  const toolArgs = buildListToolArguments(context, {});
  const result = await callPagedReadTool(context, "get_scenes", toolArgs);
  const rows = getRows(result.data).map((scene) => [pickId(scene), pickName(scene)]);
  return outputResult(context, result, {
    resource: "scene",
    action: "list",
    data: result.data,
    rows,
    headers: ["Scene ID", "Name"],
    query: buildListQuery(context, {}),
  });
}

async function handleSceneRun(args, context) {
  const sceneId = args[0];
  if (!sceneId) {
    throw new CliError("scene run 需要指定 sceneId。");
  }
  const request = {
    sceneId,
    ...buildWriteOptions(context, `scene run ${sceneId}`),
  };
  const result = await callCloudTool(context, "execute_scene", { request });
  return outputWriteResult(context, result, {
    resource: "scene",
    action: "run",
    targetId: sceneId,
    data: result.data,
  });
}

async function handleLightOn(args, context) {
  return setLightProperty(args[0], "p", true, context, "on");
}

async function handleLightOff(args, context) {
  return setLightProperty(args[0], "p", false, context, "off");
}

async function handleLightBrightness(args, context) {
  const value = parseInteger(args[1], "亮度");
  if (value < 1 || value > 100) {
    throw new CliError("亮度必须在 1 到 100 之间。");
  }
  return setLightProperty(args[0], "l", value, context, "brightness");
}

async function handleLightColorTemperature(args, context) {
  const value = parseInteger(args[1], "色温");
  if (value < 2700 || value > 6500) {
    throw new CliError("色温必须在 2700 到 6500 之间。");
  }
  return setLightProperty(args[0], "ct", value, context, "color-temperature");
}

async function setLightProperty(nodeId, propName, value, context, action) {
  if (!nodeId) {
    throw new CliError(`light ${action} 需要指定 deviceId。`);
  }
  const normalizedNodeId = parseInteger(nodeId, "deviceId");
  const request = {
    nodeId: normalizedNodeId,
    nodeType: 2,
    command: {
      command: "set",
      params: [{ propName, value }],
    },
    ...buildWriteOptions(context, `light ${action} ${nodeId}`),
  };
  const result = await callCloudTool(context, "control_node", { controlRequest: request });
  return outputWriteResult(context, result, {
    resource: "light",
    action,
    targetId: nodeId,
    data: result.data,
  });
}

function buildWriteOptions(context, defaultReason) {
  if (hasFlag(context.flags, "dry-run") && (hasFlag(context.flags, "yes") || hasFlag(context.flags, "execute"))) {
    throw new CliError("--dry-run 不能和 --yes 或 --execute 同时使用。");
  }
  const execute = getBooleanFlag(context.flags, "yes", false) || getBooleanFlag(context.flags, "execute", false);
  return {
    dryRun: !execute,
    confirmSideEffect: execute,
    reason: getStringFlag(context.flags, "reason", defaultReason),
  };
}

async function callCloudTool(context, toolName, args) {
  assertControlArgumentsAllowed(toolName, args, CliError);
  return callMcpTool(context.runtime.endpoint, toolName, args, {
    protocolVersion: context.runtime.protocolVersion,
    headers: context.runtime.headers,
    timeoutMs: context.timeoutMs,
  });
}

async function callReadTool(context, toolName, args) {
  const result = await callCloudTool(context, toolName, args);
  if (!shouldFallbackToOpenApi(result)) {
    if (result.ok) {
      return {
        ...result,
        data: normalizePagedData(result.data),
      };
    }
    return result;
  }
  return callOpenApiReadTool(context, toolName, args, result.error);
}

async function callPagedReadTool(context, toolName, args) {
  if (!getBooleanFlag(context.flags, "all", false)) {
    return callReadTool(context, toolName, args);
  }
  let cursor = args.cursor || "";
  const rows = [];
  let finalResult = null;
  for (let guard = 0; guard < 1000; guard += 1) {
    const pageArgs = { ...args };
    if (cursor) {
      pageArgs.cursor = cursor;
    } else {
      delete pageArgs.cursor;
    }
    const result = await callReadTool(context, toolName, pageArgs);
    finalResult = result;
    if (!result.ok) {
      return result;
    }
    rows.push(...getRows(result.data));
    const nextCursor = getNextCursor(result.data);
    if (!nextCursor) {
      return {
        ...result,
        data: {
          ...(result.data || {}),
          rows,
          nextCursor: null,
        },
      };
    }
    cursor = nextCursor;
  }
  return {
    ...finalResult,
    ok: false,
    error: "分页读取超过 1000 页，已停止。",
  };
}

function shouldFallbackToOpenApi(result) {
  return !result.ok && String(result.error || "").includes("initialize 失败：HTTP 421");
}

async function callOpenApiReadTool(context, toolName, args, fallbackReason) {
  const path = buildOpenApiPath(context, toolName, args);
  if (!path) {
    return {
      ok: false,
      data: null,
      error: fallbackReason || "当前工具不支持 OpenAPI fallback。",
    };
  }
  try {
    const data = await requestOpenApi(context, path);
    return {
      ok: true,
      data: normalizePagedData(data),
      fallback: {
        source: "openapi",
        reason: fallbackReason,
      },
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: error && error.message ? error.message : String(error),
      fallback: {
        source: "openapi",
        reason: fallbackReason,
      },
    };
  }
}

function buildOpenApiPath(context, toolName, args) {
  const profileName = context.config.mcp.cloud.authProfile || "default";
  const profile = context.config.auth.profiles[profileName] || {};
  const houseId = profile.houseId;
  if (!houseId) {
    throw new CliError("OpenAPI fallback 需要先登录并绑定家庭。");
  }
  const pageNo = normalizePageNumber(args && args.cursor);
  const pageSize = normalizePageLimit(args && args.limit, DEFAULT_FALLBACK_PAGE_SIZE);
  if (toolName === "get_currnet_house_info") {
    return `/v1/open/node/house/${encodeURIComponent(houseId)}/r/info`;
  }
  if (toolName === "get_rooms") {
    return `/v1/open/node/house/${encodeURIComponent(houseId)}/rooms/r/list/${pageNo}/${pageSize}`;
  }
  if (toolName === "get_devices") {
    const roomId = args && args.roomId ? `?roomId=${encodeURIComponent(args.roomId)}` : "";
    return `/v1/open/node/house/${encodeURIComponent(houseId)}/devices/r/list/${pageNo}/${pageSize}${roomId}`;
  }
  if (toolName === "get_scenes") {
    return `/v1/open/node/house/${encodeURIComponent(houseId)}/scenes/r/list/${pageNo}/${pageSize}`;
  }
  return "";
}

async function requestOpenApi(context, path) {
  if (typeof fetch !== "function") {
    throw new CliError("当前 Node.js 不支持 fetch，无法执行 OpenAPI fallback。");
  }
  const profileName = context.config.mcp.cloud.authProfile || "default";
  const headers = buildConcreteHeaders(context.config, profileName);
  const profile = context.config.auth.profiles[profileName] || {};
  const accountBaseUrl = buildRegionEndpoints(profile.region || "cn").account;
  const controller = new AbortController();
  const timeoutMs = context.timeoutMs || 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${accountBaseUrl}${path}`, {
      method: "GET",
      headers: {
        authorization: headers.Authorization,
        bizType: headers.bizType,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text ? parseJson(text) : {};
    if (!response.ok) {
      throw new CliError(`OpenAPI fallback 返回 HTTP ${response.status}。`);
    }
    if (body && body.code && body.code !== "200") {
      throw new CliError(body.msg || body.message || `OpenAPI fallback 返回 code=${body.code}。`);
    }
    if (body && body.success === false) {
      throw new CliError(body.msg || body.message || "OpenAPI fallback 返回失败。");
    }
    return body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    if (error && error.name === "AbortError") {
      throw new CliError(`OpenAPI fallback 请求超时（${timeoutMs}ms）。`);
    }
    throw new CliError(`OpenAPI fallback 请求失败：${error && error.message ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

function outputResult(context, result, details) {
  const suggestions = buildSuggestions(details.resource, details.action, result, details.data);
  const pagination = getPagination(details.data, details.query || {});
  const output = {
    ok: result.ok,
    mcp: context.mcp,
    resource: details.resource,
    action: details.action,
    data: details.data,
    source: result.fallback ? result.fallback.source : "mcp",
    fallbackReason: result.fallback ? result.fallback.reason : "",
    query: details.query || {},
    pagination,
    nextCursor: pagination.nextCursor,
    error: result.error,
    suggestions,
  };
  notifyResourceOutput(context.io, output);
  if (context.asJson) {
    writeJson(context.io, output);
  } else if (!result.ok) {
    context.io.stderr.write(`操作失败：${result.error}\n`);
    writeSuggestions(context.io, suggestions);
  } else {
    context.io.stdout.write(`${formatTable(details.headers, details.rows)}\n`);
    if (result.fallback) {
      context.io.stdout.write("数据来源：OpenAPI fallback（cloud MCP initialize 返回 HTTP 421）。\n");
      context.io.stdout.write(`当前 cloud MCP：${context.runtime.endpoint}\n`);
      context.io.stdout.write("切换本地或远端：yeelight-ai mcp configure cloud --local|--remote。\n");
    } else {
      context.io.stdout.write(`数据来源：cloud MCP（${context.runtime.endpoint}）。\n`);
    }
    if (details.hint) {
      context.io.stdout.write(`${details.hint}\n`);
    }
    if (pagination.nextCursor) {
      context.io.stdout.write(`下一页：${buildNextPageCommand(details.resource, details.action, details.query || {}, pagination.nextCursor)}\n`);
    }
    writeNextSteps(context.io, suggestions);
  }
  return result.ok ? 0 : 1;
}

function outputWriteResult(context, result, details) {
  const data = details.data || {};
  const suggestions = buildSuggestions(details.resource, details.action, result, data);
  const output = {
    ok: result.ok,
    mcp: context.mcp,
    resource: details.resource,
    action: details.action,
    targetId: details.targetId,
    dryRun: Boolean(data.dryRun),
    code: data.code || "",
    message: data.message || "",
    data,
    error: result.error,
    suggestions,
  };
  if (context.asJson) {
    writeJson(context.io, output);
  } else if (!result.ok) {
    context.io.stderr.write(`操作失败：${result.error}\n`);
    writeSuggestions(context.io, suggestions);
  } else {
    context.io.stdout.write(`${output.dryRun ? "已生成执行计划" : "已执行"}：${output.message || output.code || "ok"}\n`);
    if (output.dryRun) {
      context.io.stdout.write("真实执行请追加 --yes。\n");
    }
  }
  return result.ok ? 0 : 1;
}

function buildListToolArguments(context, baseArgs) {
  const args = { ...baseArgs };
  const cursor = getStringFlag(context.flags, "cursor", "");
  const limit = getStringFlag(context.flags, "limit", "");
  if (cursor) {
    args.cursor = cursor;
  }
  if (limit) {
    args.limit = parsePositiveInteger(limit, "limit");
  }
  return args;
}

function buildListQuery(context, baseArgs) {
  const query = { ...baseArgs };
  const cursor = getStringFlag(context.flags, "cursor", "");
  const limit = getStringFlag(context.flags, "limit", "");
  if (cursor) {
    query.cursor = cursor;
  }
  if (limit) {
    query.limit = parsePositiveInteger(limit, "limit");
  }
  if (getBooleanFlag(context.flags, "all", false)) {
    query.all = true;
  }
  return query;
}

function normalizePagedData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }
  if (Object.prototype.hasOwnProperty.call(data, "nextCursor")) {
    return data;
  }
  const total = normalizeNumber(data.total, 0);
  const pageNum = normalizeNumber(data.pageNum, 1);
  const pageSize = normalizeNumber(data.pageSize, getRows(data).length);
  return {
    ...data,
    nextCursor: pageSize > 0 && pageNum * pageSize < total ? String(pageNum + 1) : null,
  };
}

function getPagination(data, query) {
  const pageNum = normalizeNumber(data && data.pageNum, normalizePageNumber(query.cursor));
  const pageSize = normalizeNumber(data && data.pageSize, query.limit || 0);
  return {
    cursor: query.cursor || "",
    limit: query.limit || "",
    pageNum,
    pageSize,
    total: normalizeNumber(data && data.total, getRows(data).length),
    nextCursor: getNextCursor(data),
  };
}

function getNextCursor(data) {
  if (!data || data.nextCursor === undefined || data.nextCursor === null || data.nextCursor === "") {
    return "";
  }
  return String(data.nextCursor);
}

function buildNextPageCommand(resource, action, query, nextCursor) {
  const command = [`yeelight-ai ${resource} ${action}`];
  if (query.roomId) {
    command.push(`--room ${query.roomId}`);
  }
  if (query.limit) {
    command.push(`--limit ${query.limit}`);
  }
  command.push(`--cursor ${nextCursor}`);
  return command.join(" ");
}

function normalizePageNumber(value) {
  return parsePositiveInteger(value || "1", "cursor");
}

function normalizePageLimit(value, fallback) {
  return value ? parsePositiveInteger(value, "limit") : fallback;
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError(`${label} 必须是正整数。`);
  }
  return parsed;
}

function notifyResourceOutput(io, output) {
  if (io && typeof io.onResourceOutput === "function") {
    io.onResourceOutput(output);
  }
}

function outputPlainError(context, details) {
  const suggestions = buildSuggestions(details.resource, details.action, { ok: false, error: details.error });
  const output = {
    ok: false,
    resource: details.resource,
    action: details.action,
    error: details.error,
    suggestions,
  };
  if (context.asJson) {
    writeJson(context.io, output);
  } else {
    context.io.stderr.write(`${details.error}\n`);
    writeSuggestions(context.io, suggestions);
  }
  return 1;
}

function getRows(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.rows)) {
    return data.rows;
  }
  if (data && Array.isArray(data.items)) {
    return data.items;
  }
  return [];
}

function pickId(item) {
  return item && item.id !== undefined && item.id !== null ? String(item.id) : "";
}

function pickName(item) {
  return item && item.name !== undefined && item.name !== null ? String(item.name) : "";
}

function summarizeProperties(properties) {
  return summarizeControllableProperties(properties);
}

function parseInteger(value, label) {
  if (value === undefined) {
    throw new CliError(`${label}不能为空。`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new CliError(`${label}必须是整数。`);
  }
  return parsed;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError("OpenAPI fallback 返回内容不是合法 JSON。");
  }
}

function getTimeoutMs(flags) {
  const value = getStringFlag(flags, "timeout-ms", "");
  return value ? Number(value) : undefined;
}

function resolveFormat(flags) {
  if (getBooleanFlag(flags, "json", false)) {
    return "json";
  }
  const format = getStringFlag(flags, "format", "table").toLowerCase();
  if (!["table", "json"].includes(format)) {
    throw new CliError("--format 当前支持 table 或 json。");
  }
  return format;
}

function buildSuggestions(resource, action, result, data = {}) {
  if (result && result.ok) {
    if (data && data.dryRun) {
      return [`真实执行请追加：yeelight-ai ${resource} ${action} <目标ID> --yes`];
    }
    if (resource === "house") {
      return ["查看房间：yeelight-ai room list", "查看设备：yeelight-ai device list"];
    }
    if (resource === "room") {
      return ["查看设备：yeelight-ai device list", "按房间查看设备：yeelight-ai device list --room <roomId>"];
    }
    if (resource === "device" && action === "list") {
      return ["查看设备详情：yeelight-ai device show <deviceId>", "控制灯默认 dry-run：yeelight-ai light on <deviceId>"];
    }
    if (resource === "device" && action === "show") {
      return ["控制灯默认 dry-run：yeelight-ai light on <deviceId>"];
    }
    if (resource === "scene" && action === "list") {
      return ["执行场景默认 dry-run：yeelight-ai scene run <sceneId>"];
    }
    return [];
  }
  if (resource === "device" && action === "show") {
    return ["先运行：yeelight-ai device list"];
  }
  if (resource === "scene" && action === "run") {
    return ["先运行：yeelight-ai scene list"];
  }
  if (resource === "light") {
    return ["先运行：yeelight-ai device list", "确认设备 ID 后重试，写操作默认 dry-run。"];
  }
  return ["可运行 yeelight-ai doctor 检查登录和 MCP 配置。"];
}

function writeSuggestions(io, suggestions) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return;
  }
  io.stderr.write("建议：\n");
  for (const suggestion of suggestions) {
    io.stderr.write(`- ${suggestion}\n`);
  }
}

function writeNextSteps(io, suggestions) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return;
  }
  io.stdout.write("下一步：\n");
  for (const suggestion of suggestions) {
    io.stdout.write(`- ${suggestion}\n`);
  }
}

function printResourceHelp(resource, io) {
  const lines = {
    house: [
      "用法：",
      "  yeelight-ai house show [--json|--format json]",
      "",
      "说明：查看当前家庭或项目信息。",
    ],
    room: [
      "用法：",
      "  yeelight-ai room list [--limit <n>] [--cursor <cursor>] [--all] [--json|--format json]",
      "",
      "说明：列出当前家庭或项目下的房间。",
    ],
    device: [
      "用法：",
      "  yeelight-ai device list [--room <roomId>] [--limit <n>] [--cursor <cursor>] [--all] [--json|--format json]",
      "  yeelight-ai device show <deviceId> [--json|--format json]",
      "",
      "说明：列出或查看设备。可先用 room list 获取 roomId。",
    ],
    scene: [
      "用法：",
      "  yeelight-ai scene list [--limit <n>] [--cursor <cursor>] [--all] [--json|--format json]",
      "  yeelight-ai scene run <sceneId> [--dry-run] [--yes] [--json|--format json]",
      "",
      "说明：运行场景默认只生成 dry-run 执行计划；真实执行需追加 --yes。",
    ],
    light: [
      "用法：",
      "  yeelight-ai light on <deviceId> [--dry-run] [--yes] [--json|--format json]",
      "  yeelight-ai light off <deviceId> [--dry-run] [--yes] [--json|--format json]",
      "  yeelight-ai light brightness <deviceId> <1-100> [--dry-run] [--yes] [--json|--format json]",
      "  yeelight-ai light color-temperature <deviceId> <2700-6500> [--dry-run] [--yes] [--json|--format json]",
      "",
      "说明：控制灯默认只生成 dry-run 执行计划；真实执行需追加 --yes。",
    ],
  };
  io.stdout.write(`${(lines[resource] || []).join("\n")}\n`);
}

module.exports = {
  runResourceCommand,
};
