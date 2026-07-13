"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { DEFAULT_ENDPOINTS, LEGACY_ENDPOINTS, createDefaultConfig } = require("./defaults");
const { CliError } = require("../errors");

function getConfigDir(env = process.env) {
  if (env.YEELIGHT_AI_CONFIG_DIR) {
    return env.YEELIGHT_AI_CONFIG_DIR;
  }
  if (process.platform === "win32") {
    return path.join(env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "yeelight-ai");
  }
  return path.join(os.homedir(), ".config", "yeelight-ai");
}

function getConfigPath(env = process.env) {
  return path.join(getConfigDir(env), "config.json");
}

function loadConfig(options = {}) {
  const env = options.env || process.env;
  const configPath = getConfigPath(env);
  if (!fs.existsSync(configPath)) {
    return {
      exists: false,
      path: configPath,
      config: createDefaultConfig(),
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new CliError(`配置文件无法解析：${configPath}`);
  }

  return {
    exists: true,
    path: configPath,
    config: migrateConfig(parsed),
  };
}

function saveConfig(config, options = {}) {
  const env = options.env || process.env;
  const configPath = getConfigPath(env);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

function migrateConfig(config) {
  return migrateLegacyEndpoints(deepMerge(createDefaultConfig(), config || {}));
}

function migrateLegacyEndpoints(config) {
  const metadataEndpoint = config && config.mcp && config.mcp.metadata && config.mcp.metadata.endpoint;
  if (LEGACY_ENDPOINTS.metadata.includes(metadataEndpoint)) {
    config.mcp.metadata.endpoint = DEFAULT_ENDPOINTS.metadata;
  }
  return config;
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override === undefined ? base : override;
  }
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const result = { ...base };
  for (const key of Object.keys(override)) {
    result[key] = deepMerge(base[key], override[key]);
  }
  return result;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getConfigValue(config, dottedPath) {
  if (!dottedPath) {
    return config;
  }
  return String(dottedPath)
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => (current === undefined || current === null ? undefined : current[key]), config);
}

module.exports = {
  getConfigDir,
  getConfigPath,
  getConfigValue,
  loadConfig,
  migrateConfig,
  migrateLegacyEndpoints,
  saveConfig,
};
