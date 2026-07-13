"use strict";

const { buildConcreteHeaders } = require("../clients/common");
const { CliError } = require("../errors");
const { getAdapter } = require("./registry");

function resolveMcpRuntime(config, id) {
  const adapter = getAdapter(id);
  if (!adapter) {
    throw new CliError(`不支持的 MCP ID：${id}`);
  }
  const mcpConfig = config.mcp[id] || {};
  if (!mcpConfig.enabled) {
    throw new CliError(`${id} MCP 未启用。`);
  }
  if (!mcpConfig.endpoint) {
    throw new CliError(`${id} MCP endpoint 未配置。`);
  }
  const headers = id === "lan" ? {} : buildConcreteHeaders(config, mcpConfig.authProfile || "default");
  if (id !== "lan") {
    assertAuthHeaders(headers, id);
  }
  return {
    id,
    adapter,
    endpoint: normalizeMcpEndpoint(mcpConfig.endpoint, id),
    protocolVersion: mcpConfig.protocolVersion || "2025-06-18",
    headers,
  };
}

function assertAuthHeaders(headers, id) {
  if (!headers.Authorization || !headers["House-Id"]) {
    throw new CliError(`${id} MCP 需要先登录并绑定家庭，请运行 yeelight-ai。`);
  }
}

function normalizeMcpEndpoint(endpoint, id) {
  const value = String(endpoint || "");
  if (id === "cloud") {
    return value.replace(/\/+$/, "");
  }
  return value;
}

module.exports = {
  normalizeMcpEndpoint,
  resolveMcpRuntime,
};
