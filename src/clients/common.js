"use strict";

const fs = require("fs");
const path = require("path");
const { DEFAULT_BIZ_TYPE, normalizeBizType } = require("../config/bizType");
const { DEFAULT_REGION, normalizeRegion } = require("../config/region");
const { listAdapters } = require("../mcp/registry");

function listEnabledMcpServers(config) {
  const servers = [];
  for (const adapter of listAdapters()) {
    const mcpConfig = config.mcp[adapter.id];
    if (!isClientConfigurableMcp(mcpConfig)) {
      continue;
    }
    servers.push({
      id: adapter.id,
      name: `yeelight-${adapter.id}`,
      endpoint: mcpConfig.endpoint,
      authProfile: mcpConfig.authProfile || "default",
      requiresHeaders: adapter.id !== "lan",
    });
  }
  return servers;
}

function isClientConfigurableMcp(mcpConfig) {
  return Boolean(
    mcpConfig &&
    mcpConfig.enabled &&
    mcpConfig.endpoint &&
    mcpConfig.status !== "pending" &&
    mcpConfig.status !== "requires_gateway_ip"
  );
}

function buildEnvHeaders() {
  return {
    Authorization: "${YEELIGHT_AUTHORIZATION}",
    "House-Id": "${YEELIGHT_HOUSE_ID}",
    "Yeelight-Region": "${YEELIGHT_REGION}",
    bizType: "${YEELIGHT_BIZ_TYPE}",
  };
}

function buildConcreteHeaders(config, profileName) {
  const profile = config.auth.profiles[profileName || "default"] || {};
  return filterEmptyHeaders({
    Authorization: profile.authorization || "",
    "House-Id": profile.houseId || "",
    "Yeelight-Region": normalizeRegion(profile.region || DEFAULT_REGION),
    bizType: normalizeBizType(profile.bizType, DEFAULT_BIZ_TYPE),
  });
}

function filterEmptyHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined && value !== null && String(value) !== ""));
}

function readExistingJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {};
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return filePath;
}

function mergeMcpServers(existing, generated) {
  return {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers || {}),
      ...(generated.mcpServers || {}),
    },
  };
}

module.exports = {
  buildConcreteHeaders,
  buildEnvHeaders,
  listEnabledMcpServers,
  mergeMcpServers,
  readExistingJson,
  writeJsonFile,
};
