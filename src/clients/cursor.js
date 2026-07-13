"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildConcreteHeaders,
  buildEnvHeaders,
  listEnabledMcpServers,
  mergeMcpServers,
  readExistingJson,
  writeJsonFile,
} = require("./common");

function buildCursorConfig(config, options = {}) {
  const useEnvPlaceholders = options.useEnvPlaceholders !== false;
  const servers = {};

  for (const server of listEnabledMcpServers(config)) {
    servers[server.name] = {
      url: server.endpoint,
    };
    const headers = buildHeadersForMcp(server, config, useEnvPlaceholders);
    if (headers) {
      servers[server.name].headers = headers;
    }
  }

  return { mcpServers: servers };
}

function buildHeadersForMcp(server, config, useEnvPlaceholders) {
  if (!server.requiresHeaders) {
    return null;
  }
  return useEnvPlaceholders
    ? buildEnvHeaders()
    : buildConcreteHeaders(config, server.authProfile);
}

function getCursorConfigPath(env = process.env) {
  if (env.YEELIGHT_AI_CURSOR_CONFIG_PATH) {
    return env.YEELIGHT_AI_CURSOR_CONFIG_PATH;
  }
  if (process.platform === "win32") {
    return path.join(env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Cursor", "User", "mcp.json");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), ".cursor", "mcp.json");
  }
  return path.join(os.homedir(), ".cursor", "mcp.json");
}

function writeCursorConfig(cursorConfig, env = process.env) {
  const target = getCursorConfigPath(env);
  const merged = mergeMcpServers(readExistingJson(target), cursorConfig);
  return writeJsonFile(target, merged);
}

module.exports = {
  buildHeadersForMcp,
  buildCursorConfig,
  getCursorConfigPath,
  mergeCursorConfig: mergeMcpServers,
  writeCursorConfig,
};
