"use strict";

const { getBooleanFlag, parseArgs } = require("../args");
const { loadConfig } = require("../config/store");
const { CliError } = require("../errors");
const { writeJson } = require("../output/json");
const { formatTable } = require("../output/table");
const { runReleaseGate } = require("../security/releaseGate");

async function runReleaseCommand(argv, io) {
  const { positionals, flags } = parseArgs(argv);
  const action = positionals[0] || "check";
  if (action !== "check") {
    throw new CliError("release 仅支持 check。");
  }
  const asJson = getBooleanFlag(flags, "json", false);
  const loadResult = loadConfig({ env: io.env });
  const result = runReleaseGate(loadResult.config);
  if (asJson) {
    writeJson(io, result);
  } else {
    io.stdout.write(
      `${formatTable(
        ["Status", "Scope", "Gate", "Message", "Suggestion"],
        result.checks.map((check) => [check.status, check.scope, check.id, check.message, check.suggestion || "-"])
      )}\n`
    );
  }
  return result.ok ? 0 : 2;
}

module.exports = {
  runReleaseCommand,
};
