"use strict";

const { getBooleanFlag, getStringFlag, parseArgs } = require("../args");
const { getConfigValue, loadConfig, saveConfig } = require("../config/store");
const { redactConfig } = require("../config/redact");
const { CliError } = require("../errors");
const { writeJson } = require("../output/json");
const { normalizeAuthorization } = require("../security/bearer");

async function runConfigCommand(argv, io) {
  const { positionals, flags } = parseArgs(argv);
  const action = positionals[0] || "get";
  if (action === "get") {
    return runConfigGet(positionals.slice(1), flags, io);
  }
  if (action === "set") {
    return runConfigSet(positionals.slice(1), flags, io);
  }
  throw new CliError(`未知 config 子命令：${action}`);
}

function runConfigGet(positionals, flags, io) {
  const asJson = getBooleanFlag(flags, "json", false);
  const showSecrets = getBooleanFlag(flags, "show-secrets", false);
  const path = positionals[0] || getStringFlag(flags, "path", "");
  const loadResult = loadConfig({ env: io.env });
  const config = showSecrets ? loadResult.config : redactConfig(loadResult.config);
  const value = getConfigValue(config, path);

  if (asJson) {
    writeJson(io, {
      ok: true,
      path: loadResult.path,
      value,
    });
  } else if (typeof value === "object") {
    io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } else {
    io.stdout.write(`${value === undefined ? "" : value}\n`);
  }
  return 0;
}

function runConfigSet(positionals, flags, io) {
  const asJson = getBooleanFlag(flags, "json", false);
  const key = positionals[0] || getStringFlag(flags, "key", "");
  const rawValue = positionals[1] || getStringFlag(flags, "value", "");
  if (!key) {
    throw new CliError("config set 需要 key。");
  }
  const loadResult = loadConfig({ env: io.env });
  const value = key.endsWith("authorization") ? normalizeAuthorization(rawValue) : parseConfigValue(rawValue);
  setConfigValue(loadResult.config, key, value);
  saveConfig(loadResult.config, { env: io.env });

  const result = {
    ok: true,
    path: loadResult.path,
    key,
  };
  if (asJson) {
    writeJson(io, result);
  } else {
    io.stdout.write(`已更新：${key}\n`);
  }
  return 0;
}

function parseConfigValue(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

function setConfigValue(config, dottedPath, value) {
  const parts = dottedPath.split(".").filter(Boolean);
  if (parts.length === 0) {
    throw new CliError("config set 的 key 不能为空。");
  }
  let current = config;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

module.exports = {
  runConfigCommand,
};
