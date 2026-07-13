"use strict";

const { getBooleanFlag, getStringFlag, parseArgs } = require("../args");
const { loadConfig } = require("../config/store");
const { runDoctor } = require("../doctor/runner");
const { CliError } = require("../errors");
const { writeJson } = require("../output/json");
const { formatTable } = require("../output/table");

async function runDoctorCommand(argv, io) {
  const { flags } = parseArgs(argv);
  const asJson = getBooleanFlag(flags, "json", false);
  const probe = getBooleanFlag(flags, "probe", false);
  const timeoutMs = Number(getStringFlag(flags, "timeout-ms", "") || 0) || undefined;
  const mcp = getStringFlag(flags, "mcp", "");
  if (mcp && !["cloud", "metadata", "lan"].includes(mcp)) {
    throw new CliError(`不支持的 MCP ID：${mcp}`);
  }
  const loadResult = loadConfig({ env: io.env });
  const result = await runDoctor(loadResult, { mcp, probe, timeoutMs });
  if (asJson) {
    writeJson(io, result);
  } else {
    io.stdout.write(`配置：${result.configPath}\n`);
    io.stdout.write(
      `${formatTable(
        ["Status", "Scope", "Rule", "Message", "Suggestion"],
        result.checks.map((check) => [check.status, check.scope, check.id, check.message, check.suggestion || "-"])
      )}\n`
    );
  }
  return result.ok ? 0 : 2;
}

module.exports = {
  runDoctorCommand,
};
