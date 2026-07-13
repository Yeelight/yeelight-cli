"use strict";

const { getBooleanFlag, parseArgs } = require("../args");
const { loadConfig } = require("../config/store");
const { writeJson } = require("../output/json");
const { buildWorkspaceSummary } = require("../workspace/summary");

function runStatusCommand(argv, io) {
  const { flags } = parseArgs(argv);
  const asJson = getBooleanFlag(flags, "json", false);
  const summary = buildWorkspaceSummary(loadConfig({ env: io.env }));
  if (asJson) {
    writeJson(io, {
      ok: true,
      ...summary,
    });
    return 0;
  }
  io.stdout.write("Yeelight AI CLI 工作台\n");
  io.stdout.write(`配置文件：${summary.configPath}\n`);
  io.stdout.write(`当前家庭：${summary.houseId || "未绑定"}\n`);
  io.stdout.write(`Cloud MCP：${summary.mcp.cloud.summary}\n`);
  io.stdout.write(`Metadata MCP：${summary.mcp.metadata.summary}\n`);
  io.stdout.write(`LAN MCP：${summary.mcp.lan.summary}\n`);
  io.stdout.write("推荐下一步：\n");
  for (const step of summary.nextSteps) {
    io.stdout.write(`- ${step}\n`);
  }
  io.stdout.write("常用动作：\n");
  for (const action of summary.quickActions) {
    io.stdout.write(`- ${action.label}（${action.key}）：${action.command}\n`);
  }
  io.stdout.write("高级入口：\n");
  for (const action of summary.advancedActions) {
    io.stdout.write(`- ${action.label}（${action.key}）：${action.command}\n`);
  }
  return 0;
}

module.exports = {
  runStatusCommand,
};
