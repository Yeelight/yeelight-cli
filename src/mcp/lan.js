"use strict";

const { DEFAULT_ENDPOINTS } = require("../config/defaults");
const { listMcpTools } = require("./protocol");

const LAN_CONTRACT = [
  "transport",
  "endpoint",
  "protocolVersion",
  "sessionHeader",
  "toolsList",
  "capabilityDiscovery",
  "gatewayIp",
  "appLanControlEnabled",
];

function getLanAdapter() {
  return {
    id: "lan",
    displayName: "网关 LAN MCP",
    codeName: "gateway-mcp",
    getDefaultEndpoint() {
      return DEFAULT_ENDPOINTS.lan;
    },
    async inspect(config, options = {}) {
      const mcpConfig = config.mcp.lan;
      const result = {
        id: "lan",
        displayName: "网关 LAN MCP",
        codeName: "gateway-mcp",
        status: getLanStatus(mcpConfig),
        enabled: Boolean(mcpConfig.enabled),
        transport: mcpConfig.transport,
        endpoint: mcpConfig.endpoint,
        gatewayIp: mcpConfig.gatewayIp || "",
        protocolVersion: mcpConfig.protocolVersion || "2025-06-18",
        requiresAppLanControl: mcpConfig.requiresAppLanControl !== false,
        connectionFlow: [
          "initialize",
          "读取 Mcp-Session-Id",
          "notifications/initialized",
          "tools/list",
          "tools/call",
        ],
        requiredContract: LAN_CONTRACT,
        discoveryRule: "工具名、描述、参数和 schema 以运行时 tools/list 为准。",
        notes: mcpConfig.endpoint ? "已具备 LAN MCP 接入配置，可通过 --probe 发现运行时工具。" : "请先配置 gateway IP，并确认 APP 已开启 LAN CONTROL。",
      };
      if (options.probe && mcpConfig.endpoint) {
        result.runtime = await listMcpTools(mcpConfig.endpoint, { protocolVersion: result.protocolVersion });
        result.tools = result.runtime.tools.map((tool) => ({
          name: tool.name,
          description: tool.description || "",
          inputSchema: tool.inputSchema || {},
        }));
      }
      return result;
    },
    releaseChecks() {
      return [
        {
          id: "LAN_CONTRACT_PRESENT",
          scope: "lan",
          status: "pass",
          message: "LAN MCP 文档已提供 Streamable HTTP endpoint、协议版本和工具发现流程。",
          suggestion: "通过 mcp configure lan --gateway-ip <ip> 配置实际网关地址。",
        },
        {
          id: "LAN_RUNTIME_DISCOVERY",
          scope: "lan",
          status: "warn",
          message: "LAN 工具清单必须运行时通过 tools/list 获取，当前未固化工具名。",
          suggestion: "运行 yeelight-ai mcp inspect lan --probe 验证网关返回的工具元数据。",
        },
        {
          id: "LAN_APP_SWITCH",
          scope: "lan",
          status: "warn",
          message: "使用 LAN MCP 前需要在 APP 开启 LAN CONTROL。",
          suggestion: "在 APP 开启 LAN CONTROL 后再执行 LAN demo 或工具发现。",
        },
      ];
    },
  };
}

function buildLanEndpoint(gatewayIp) {
  const ip = String(gatewayIp || "").trim();
  return ip ? `http://${ip}:18080/mcp` : "";
}

function getLanStatus(mcpConfig) {
  if (!mcpConfig.enabled) {
    return "disabled";
  }
  if (!mcpConfig.endpoint) {
    return "requires_gateway_ip";
  }
  return "configured";
}

module.exports = {
  LAN_CONTRACT,
  buildLanEndpoint,
  getLanAdapter,
};
