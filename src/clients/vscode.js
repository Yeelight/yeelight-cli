"use strict";

const os = require("os");
const path = require("path");
const { buildConcreteHeaders, buildEnvHeaders, listEnabledMcpServers, mergeMcpServers, readExistingJson, writeJsonFile } = require("./common");

function buildVscodeConfig(config, options = {}) {
  const useEnvPlaceholders = options.useEnvPlaceholders !== false;
  const mcpServers = {};
  for (const server of listEnabledMcpServers(config)) {
    mcpServers[server.name] = {
      url: server.endpoint,
    };
    if (server.requiresHeaders) {
      mcpServers[server.name].headers = useEnvPlaceholders
        ? buildEnvHeaders()
        : buildConcreteHeaders(config, server.authProfile);
    }
  }
  return { mcpServers };
}

function getVscodeConfigPath(env = process.env) {
  if (env.YEELIGHT_AI_VSCODE_CONFIG_PATH) {
    return env.YEELIGHT_AI_VSCODE_CONFIG_PATH;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Code", "User", "mcp.json");
  }
  if (process.platform === "win32") {
    return path.join(env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Code", "User", "mcp.json");
  }
  return path.join(os.homedir(), ".config", "Code", "User", "mcp.json");
}

function writeVscodeConfig(config, env = process.env) {
  const target = getVscodeConfigPath(env);
  const merged = mergeMcpServers(readExistingJson(target), config);
  return writeJsonFile(target, merged);
}

module.exports = {
  buildVscodeConfig,
  getVscodeConfigPath,
  writeVscodeConfig,
};
