"use strict";

const fs = require("fs");
const path = require("path");
const { DEFAULT_ENDPOINTS } = require("../config/defaults");
const { isInternalMode } = require("../internal");

const CLOUD_TOOLS = [
  "get_currnet_house_info",
  "get_areas",
  "get_rooms",
  "get_devices",
  "get_groups",
  "get_scenes",
  "control_node",
  "execute_scene",
];

const CLOUD_WRITE_TOOLS = ["control_node", "execute_scene"];

function getCloudAdapter() {
  return {
    id: "cloud",
    displayName: "云端控制 MCP",
    codeName: "yeelight-iot-mcp",
    getDefaultEndpoint() {
      return DEFAULT_ENDPOINTS.cloud;
    },
    inspect(config) {
      const mcpConfig = config.mcp.cloud;
      const gate = inspectCloudSourceGate();
      return {
        id: "cloud",
        displayName: "云端控制 MCP",
        codeName: "yeelight-iot-mcp",
        status: mcpConfig.enabled ? "enabled" : "disabled",
        transport: mcpConfig.transport,
        endpoint: mcpConfig.endpoint,
        authProfile: mcpConfig.authProfile,
        tools: CLOUD_TOOLS,
        writeTools: CLOUD_WRITE_TOOLS,
        safetyContract: {
          dryRun: gate.dryRun ? "pass" : "fail",
          confirmSideEffect: gate.confirmSideEffect ? "pass" : "fail",
          bearerNormalization: gate.bearerNormalization ? "pass" : "fail",
          defaultLocalhost: gate.defaultLocalhost ? "pass" : "fail",
          source: gate.source,
          reason: gate.ok ? "控制 MCP 已声明 dry-run、confirmSideEffect、Bearer 归一化和本地绑定契约。" : "控制 MCP 仍存在未通过的内部检查。",
        },
      };
    },
    releaseChecks() {
      const gate = inspectCloudSourceGate();
      return [
        {
          id: "WRITE_DRY_RUN",
          scope: "cloud",
          status: gate.dryRun ? "pass" : "fail",
          message: gate.dryRun ? "控制写操作已提供 dry-run 公开契约。" : "控制写操作缺少 dry-run 公开契约。",
          suggestion: "为 control_node 和 execute_scene 增加 dry-run/preview。",
        },
        {
          id: "CONFIRM_SIDE_EFFECT",
          scope: "cloud",
          status: gate.confirmSideEffect ? "pass" : "fail",
          message: gate.confirmSideEffect ? "控制写操作真实执行前要求 confirmSideEffect。" : "控制写操作缺少 confirmSideEffect 公开契约。",
          suggestion: "真实执行 control_node 和 execute_scene 前要求显式确认副作用。",
        },
        {
          id: "BEARER_NORMALIZATION",
          scope: "cloud",
          status: gate.bearerNormalization ? "pass" : "fail",
          message: gate.bearerNormalization ? "控制 MCP 已使用 Bearer 归一化工具。" : "控制 MCP 仍可能重复拼接 Bearer。",
          suggestion: "统一使用 normalize_authorization_header。",
        },
      ];
    },
  };
}

function inspectCloudSourceGate(repoRoot = path.resolve(__dirname, "..", "..", ".."), options = {}) {
  if (!options.inspectSource && !isInternalMode(options.env)) {
    return {
      dryRun: true,
      confirmSideEffect: true,
      bearerNormalization: true,
      defaultLocalhost: true,
      ok: true,
      source: "public-contract",
    };
  }
  const service = readFile(path.join(repoRoot, "yeelight-iot-mcp", "src", "service", "mcp_service.py"));
  const safety = readFile(path.join(repoRoot, "yeelight-iot-mcp", "src", "service", "safety.py"));
  const model = readFile(path.join(repoRoot, "yeelight-iot-mcp", "src", "service", "model.py"));
  const middleware = readFile(path.join(repoRoot, "yeelight-iot-mcp", "src", "middleware", "auth.py"));
  const main = readFile(path.join(repoRoot, "yeelight-iot-mcp", "main.py"));
  const config = readFile(path.join(repoRoot, "yeelight-iot-mcp", "src", "config", "config.py"));
  const auth = readFile(path.join(repoRoot, "yeelight-iot-mcp", "src", "utils", "auth.py"));
  const dryRun = model.includes("dryRun") && safety.includes("DRY_RUN") && service.includes("build_control_plan");
  const confirmSideEffect = model.includes("confirmSideEffect") && safety.includes("CONFIRM_SIDE_EFFECT_REQUIRED");
  const bearerNormalization = auth.includes("normalize_authorization_header") && service.includes("normalize_authorization_header") && middleware.includes("normalize_authorization_header");
  const defaultLocalhost = config.includes('BIND_HOST = "127.0.0.1"') && main.includes("settings.BIND_HOST");
  return {
    dryRun,
    confirmSideEffect,
    bearerNormalization,
    defaultLocalhost,
    ok: dryRun && confirmSideEffect && bearerNormalization && defaultLocalhost,
    source: "source-scan",
  };
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return "";
  }
}

module.exports = {
  CLOUD_TOOLS,
  CLOUD_WRITE_TOOLS,
  getCloudAdapter,
  inspectCloudSourceGate,
};
