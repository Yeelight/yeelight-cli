"use strict";

const { DEFAULT_ENDPOINTS } = require("../config/defaults");

function buildWorkspaceSummary(loadResult) {
  const config = loadResult.config;
  const profile = getDefaultProfile(config);
  const mcp = {
    cloud: buildMcpSummary("cloud", config.mcp && config.mcp.cloud),
    metadata: buildMcpSummary("metadata", config.mcp && config.mcp.metadata),
    lan: buildMcpSummary("lan", config.mcp && config.mcp.lan),
  };
  return {
    configPath: loadResult.path,
    loggedIn: Boolean(profile.authorization && profile.houseId),
    houseId: profile.houseId || "",
    mcp,
    nextSteps: buildNextSteps(profile, mcp),
    quickActions: buildQuickActions(),
    advancedActions: buildAdvancedActions(),
  };
}

function buildMcpSummary(id, config) {
  const enabled = Boolean(config && config.enabled);
  const endpoint = config && config.endpoint ? config.endpoint : "";
  return {
    id,
    enabled,
    endpoint,
    summary: enabled ? formatEndpointSummary(id, endpoint) : "未启用",
  };
}

function buildNextSteps(profile, mcp) {
  if (!profile.authorization || !profile.houseId) {
    return ["运行 yeelight-ai login 或直接运行 yeelight-ai 完成登录和家庭绑定。"];
  }
  if (!mcp.cloud.enabled || !mcp.cloud.endpoint) {
    return ["运行 yeelight-ai mcp configure cloud --remote 恢复 Cloud MCP。"];
  }
  return [
    "查看设备：yeelight-ai device list",
    "诊断配置：yeelight-ai doctor",
    "高级工具：yeelight-ai mcp tools cloud",
  ];
}

function buildQuickActions() {
  return [
    { key: "rooms", label: "查看房间", command: "yeelight-ai room list" },
    { key: "devices", label: "查看设备", command: "yeelight-ai device list" },
    { key: "scenes", label: "查看场景", command: "yeelight-ai scene list" },
    { key: "light", label: "控制灯", command: "yeelight-ai light on <deviceId>" },
    { key: "run-scene", label: "执行场景", command: "yeelight-ai scene run <sceneId>" },
  ];
}

function buildAdvancedActions() {
  return [
    { key: "doctor", label: "诊断配置", command: "yeelight-ai doctor" },
    { key: "tools", label: "调用 MCP", command: "yeelight-ai mcp tools cloud" },
    { key: "client", label: "配置客户端", command: "yeelight-ai client configure cursor" },
    { key: "status", label: "查看工作台", command: "yeelight-ai status" },
  ];
}

function formatEndpointSummary(id, endpoint) {
  const value = String(endpoint || "").replace(/\/+$/, "");
  if (!value) {
    return "未配置";
  }
  if (value === String(DEFAULT_ENDPOINTS[id] || "").replace(/\/+$/, "")) {
    return `远端 ${value}`;
  }
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(value)) {
    return `本地 ${value}`;
  }
  return `自定义 ${value}`;
}

function getDefaultProfile(config) {
  return config.auth && config.auth.profiles ? config.auth.profiles.default || {} : {};
}

module.exports = {
  buildWorkspaceSummary,
  formatEndpointSummary,
};
