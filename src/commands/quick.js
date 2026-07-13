"use strict";

const { getBooleanFlag, parseArgs } = require("../args");
const { loadConfig } = require("../config/store");
const { writeJson } = require("../output/json");
const { buildWorkspaceSummary } = require("../workspace/summary");

function runQuickCommand(argv, io) {
  const { flags } = parseArgs(argv);
  const asJson = getBooleanFlag(flags, "json", false);
  const summary = buildWorkspaceSummary(loadConfig({ env: io.env }));
  const output = {
    ok: true,
    quickActions: summary.quickActions,
    advancedActions: summary.advancedActions,
    nextSteps: summary.nextSteps,
  };
  if (asJson) {
    writeJson(io, output);
    return 0;
  }
  io.stdout.write("常用快捷操作\n");
  for (const action of summary.quickActions) {
    io.stdout.write(`- ${action.label}（${action.key}）：${action.command}\n`);
  }
  io.stdout.write("高级入口\n");
  for (const action of summary.advancedActions) {
    io.stdout.write(`- ${action.label}（${action.key}）：${action.command}\n`);
  }
  io.stdout.write("推荐下一步\n");
  for (const step of summary.nextSteps) {
    io.stdout.write(`- ${step}\n`);
  }
  return 0;
}

module.exports = {
  runQuickCommand,
};
