"use strict";

const { getBooleanFlag, getStringFlag, parseArgs } = require("../args");
const { createDefaultConfig, parseMcpSelection } = require("../config/defaults");
const { loadConfig, saveConfig } = require("../config/store");
const { CliError } = require("../errors");
const { writeJson } = require("../output/json");

async function runInitCommand(argv, io) {
  const { flags } = parseArgs(argv);
  const force = getBooleanFlag(flags, "force", false);
  const asJson = getBooleanFlag(flags, "json", false);
  const enabledMcp = parseMcpSelection(getStringFlag(flags, "mcp", ""), getBooleanFlag(flags, "all", false));
  const loadResult = loadConfig({ env: io.env });

  if (loadResult.exists && !force) {
    const result = {
      ok: true,
      changed: false,
      path: loadResult.path,
      message: "配置文件已存在，未覆盖。",
    };
    if (asJson) {
      writeJson(io, result);
    } else {
      io.stdout.write(`${result.message}\n路径：${result.path}\n`);
    }
    return 0;
  }

  const config = createDefaultConfig({ enabledMcp });
  const path = saveConfig(config, { env: io.env });
  const result = {
    ok: true,
    changed: true,
    path,
    enabledMcp,
    message: "已生成 Yeelight AI CLI 配置。",
  };

  if (asJson) {
    writeJson(io, result);
  } else {
    io.stdout.write(`${result.message}\n路径：${path}\n启用 MCP：${enabledMcp.join(", ")}\n`);
  }
  return 0;
}

module.exports = {
  runInitCommand,
};
