"use strict";

const { DEFAULT_BIZ_TYPE } = require("./bizType");

const MCP_IDS = ["cloud", "metadata", "lan"];

const DEFAULT_ENDPOINTS = {
  cloud: "https://api.yeelight.com/apis/mcp_server/v1/mcp",
  metadata: "https://api.yeelight.com/apis/metadata_mcp_server/v1/mcp",
  lan: "http://<gateway-ip>:18080/mcp",
};

const LEGACY_ENDPOINTS = {
  metadata: [
    "https://api.yeelight.com/apis/app_mcp_server/v1/mcp",
  ],
};

function createDefaultConfig(options = {}) {
  const enabledMcp = new Set(options.enabledMcp || ["cloud", "metadata"]);
  return {
    version: "1",
    auth: {
      qrLogin: {
        clientDeviceId: "",
      },
      profiles: {
        default: {
          authorization: "",
          clientId: "",
          houseId: "",
          bizType: DEFAULT_BIZ_TYPE,
        },
      },
    },
    mcp: {
      cloud: {
        enabled: enabledMcp.has("cloud"),
        transport: "streamable-http",
        endpoint: DEFAULT_ENDPOINTS.cloud,
        authProfile: "default",
      },
      metadata: {
        enabled: enabledMcp.has("metadata"),
        transport: "streamable-http",
        endpoint: DEFAULT_ENDPOINTS.metadata,
        authProfile: "default",
      },
      lan: {
        enabled: enabledMcp.has("lan"),
        transport: "streamable-http",
        endpoint: "",
        authProfile: "default",
        status: "requires_gateway_ip",
        protocolVersion: "2025-06-18",
        gatewayIp: "",
        requiresAppLanControl: true,
      },
    },
    security: {
      defaultDryRun: true,
      bindHost: "127.0.0.1",
      redaction: true,
    },
  };
}

function parseMcpSelection(value, includeAll) {
  if (includeAll) {
    return [...MCP_IDS];
  }
  if (!value) {
    return ["cloud", "metadata"];
  }
  const selected = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = selected.filter((item) => !MCP_IDS.includes(item));
  if (invalid.length > 0) {
    throw new Error(`不支持的 MCP ID：${invalid.join(", ")}`);
  }
  return selected;
}

module.exports = {
  DEFAULT_ENDPOINTS,
  LEGACY_ENDPOINTS,
  MCP_IDS,
  createDefaultConfig,
  parseMcpSelection,
};
