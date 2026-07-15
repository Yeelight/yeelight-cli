"use strict";

const os = require("os");
const path = require("path");
const { listEnabledMcpServers, mergeMcpServers, readExistingJson, writeJsonFile } = require("./common");

function buildClaudeConfig(config) {
  const mcpServers = {};
  for (const server of listEnabledMcpServers(config)) {
    const args = ["mcp-remote", server.endpoint];
    const env = {};
    if (server.requiresHeaders) {
      args.push("--header", "Authorization:${YEELIGHT_AUTHORIZATION}");
      args.push("--header", "House-Id:${YEELIGHT_HOUSE_ID}");
      args.push("--header", "Yeelight-Region:${YEELIGHT_REGION}");
      args.push("--header", "bizType:${YEELIGHT_BIZ_TYPE}");
      env.YEELIGHT_AUTHORIZATION = "${YEELIGHT_AUTHORIZATION}";
      env.YEELIGHT_HOUSE_ID = "${YEELIGHT_HOUSE_ID}";
      env.YEELIGHT_REGION = "${YEELIGHT_REGION}";
      env.YEELIGHT_BIZ_TYPE = "${YEELIGHT_BIZ_TYPE}";
    }
    if (server.endpoint.startsWith("http://")) {
      args.push("--allow-http", "true");
    }
    mcpServers[server.name] = {
      command: "npx",
      args,
    };
    if (Object.keys(env).length > 0) {
      mcpServers[server.name].env = env;
    }
  }
  return { mcpServers };
}

function getClaudeConfigPath(env = process.env) {
  if (env.YEELIGHT_AI_CLAUDE_CONFIG_PATH) {
    return env.YEELIGHT_AI_CLAUDE_CONFIG_PATH;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "win32") {
    return path.join(env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  }
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function writeClaudeConfig(config, env = process.env) {
  const target = getClaudeConfigPath(env);
  const merged = mergeMcpServers(readExistingJson(target), config);
  return writeJsonFile(target, merged);
}

module.exports = {
  buildClaudeConfig,
  getClaudeConfigPath,
  writeClaudeConfig,
};
