"use strict";

const { hasRepeatedBearer, normalizeAuthorization } = require("../security/bearer");
const { buildConcreteHeaders } = require("../clients/common");
const { DEFAULT_ENDPOINTS, LEGACY_ENDPOINTS } = require("../config/defaults");
const { listAdapters } = require("../mcp/registry");
const { initializeMcpSession, listMcpTools } = require("../mcp/protocol");
const { checkResult } = require("./types");

async function runDoctor(loadResult, options = {}) {
  const config = loadResult.config;
  const checks = [];

  checks.push(...runGlobalChecks(loadResult));
  checks.push(...runMcpChecks(config, options));
  checks.push(...runClientChecks(config));

  if (options.probe) {
    checks.push(...(await runReachabilityChecks(config, options)));
  } else {
    checks.push(
      checkResult(
        "ENDPOINT_REACHABILITY_SKIPPED",
        "global",
        "unknown",
        "未执行 endpoint 网络探测。",
        "需要网络探测时运行 doctor --probe。"
      )
    );
  }

  const filteredChecks = filterChecks(checks, options.mcp);
  return {
    ok: !filteredChecks.some((item) => item.status === "fail"),
    configPath: loadResult.path,
    checks: filteredChecks,
  };
}

function runGlobalChecks(loadResult) {
  const config = loadResult.config;
  const profile = getDefaultProfile(config);
  const checks = [
    checkResult(
      "GLOBAL_CONFIG_EXISTS",
      "global",
      loadResult.exists ? "pass" : "fail",
      loadResult.exists ? "配置文件已存在。" : "配置文件不存在。",
      loadResult.exists ? "" : "直接运行 yeelight-ai，CLI 会自动创建默认配置并进入登录引导。"
    ),
  ];
  checks.push(
    checkResult(
      "CLOUD_REGION",
      "global",
      profile.region ? "pass" : "fail",
      profile.region ? `当前云端 Region：${profile.region}。` : "当前 profile 缺少 Region。",
      profile.region ? "" : "重新登录并选择 Region。"
    )
  );

  const normalized = normalizeAuthorization(profile.authorization);
  checks.push(
    checkResult(
      "AUTH_TOKEN_PRESENT",
      "global",
      normalized ? "pass" : "fail",
      normalized ? "默认 profile 已配置 Authorization。" : "默认 profile 未配置 Authorization。",
      normalized ? "" : "直接运行 yeelight-ai，按引导完成登录并选择家庭。"
    )
  );
  checks.push(
    checkResult(
      "AUTH_BEARER_NORMALIZED",
      "global",
      normalized && !hasRepeatedBearer(normalized) ? "pass" : profile.authorization ? "fail" : "warn",
      normalized && !hasRepeatedBearer(normalized) ? "Authorization 已归一化为单个 Bearer 前缀。" : "Authorization 可能未正确归一化。",
      "在工作台选择“重新登录/切换家庭”重新保存凭证。"
    )
  );
  checks.push(
    checkResult(
      "TOKEN_REDACTION",
      "global",
      config.security && config.security.redaction ? "pass" : "fail",
      config.security && config.security.redaction ? "默认启用输出脱敏。" : "输出脱敏未启用。",
      "保持 security.redaction=true。"
    )
  );
  checks.push(
    checkResult(
      "DEFAULT_LOCALHOST",
      "global",
      config.security && config.security.bindHost === "127.0.0.1" ? "pass" : "fail",
      config.security && config.security.bindHost === "127.0.0.1" ? "本地默认绑定 127.0.0.1。" : "本地默认绑定地址不是 127.0.0.1。",
      "将 security.bindHost 设置为 127.0.0.1。"
    )
  );
  return checks;
}

function runMcpChecks(config, options = {}) {
  const checks = [];
  for (const adapter of listAdapters()) {
    const mcpConfig = config.mcp[adapter.id];
    if (adapter.id === "lan") {
      checks.push(
        checkResult(
          "LAN_CONTRACT_PRESENT",
          "lan",
          "pass",
          "LAN MCP 文档已提供 Streamable HTTP endpoint 和工具发现契约。",
          "通过 mcp configure lan --gateway-ip <ip> 配置实际网关。"
        )
      );
      checks.push(
        checkResult(
          "LAN_ENDPOINT_CONFIGURED",
          "lan",
          mcpConfig.endpoint ? "pass" : "pending",
          mcpConfig.endpoint ? "LAN MCP endpoint 已配置。" : "LAN MCP endpoint 尚未配置。",
          "运行 yeelight-ai mcp configure lan --gateway-ip <ip>。"
        )
      );
      checks.push(
        checkResult(
          "LAN_APP_SWITCH",
          "lan",
          "warn",
          "LAN MCP 使用前需要在 APP 开启 LAN CONTROL。",
          "确认 APP 已开启 LAN CONTROL。"
        )
      );
      continue;
    }

    const prefix = adapter.id.toUpperCase();
    checks.push(
      checkResult(
        `${prefix}_ENDPOINT_CONFIGURED`,
        adapter.id,
        mcpConfig && mcpConfig.endpoint ? "pass" : "fail",
        mcpConfig && mcpConfig.endpoint ? `${adapter.displayName} endpoint 已配置。` : `${adapter.displayName} endpoint 缺失。`,
        `直接运行 yeelight-ai 进入工作台，或使用 yeelight-ai mcp configure ${adapter.id} --endpoint <url> 修正 endpoint。`
      )
    );

    const profile = getProfile(config, mcpConfig.authProfile);
    checks.push(
      checkResult(
        `${prefix}_AUTH_PROFILE_CONFIGURED`,
        adapter.id,
        profile && profile.authorization ? "pass" : "fail",
        profile && profile.authorization ? `${adapter.displayName} auth profile 已配置。` : `${adapter.displayName} auth profile 缺少 token。`,
        "直接运行 yeelight-ai，按引导完成登录并选择家庭。"
      )
    );
  }

  if (!options.mcp || options.mcp === "cloud") {
    const cloudAdapter = listAdapters().find((adapter) => adapter.id === "cloud");
    checks.push(...cloudAdapter.releaseChecks().filter((check) => ["WRITE_DRY_RUN", "CONFIRM_SIDE_EFFECT", "BEARER_NORMALIZATION"].includes(check.id)));
  }

  return checks;
}

function runClientChecks(config) {
  const enabled = Object.values(config.mcp || {}).filter((item) => item.enabled).length;
  return [
    checkResult(
      "CLIENT_CONFIG_VALID",
      "clients",
      enabled > 0 ? "pass" : "warn",
      enabled > 0 ? "至少有一个 MCP 启用，可生成客户端配置。" : "当前没有启用的 MCP。",
      "直接运行 yeelight-ai 检查配置，或启用至少一个 MCP 后再生成客户端配置。"
    ),
  ];
}

async function runReachabilityChecks(config, options = {}) {
  const checks = [];
  for (const adapter of listAdapters()) {
    if (options.mcp && adapter.id !== options.mcp) {
      continue;
    }
    if (adapter.id === "lan") {
      const mcpConfig = config.mcp.lan;
      if (!mcpConfig.endpoint) {
        checks.push(checkResult("LAN_ENDPOINT_REACHABLE", "lan", "pending", "LAN endpoint 尚未定义。", "运行 yeelight-ai mcp configure lan --gateway-ip <ip>。"));
        continue;
      }
      const toolsResult = await listMcpTools(mcpConfig.endpoint, {
        protocolVersion: mcpConfig.protocolVersion || "2025-06-18",
        timeoutMs: options.timeoutMs,
      });
      checks.push(
        checkResult(
          "LAN_TOOLS_LIST",
          "lan",
          toolsResult.ok ? "pass" : "warn",
          toolsResult.ok ? `LAN MCP tools/list 成功，发现 ${toolsResult.tools.length} 个工具。` : `LAN MCP tools/list 未通过：${toolsResult.error}`,
          "确认网关 IP、APP LAN CONTROL 开关和本机网络。"
        )
      );
      continue;
    }
    const mcpConfig = config.mcp[adapter.id];
    if (adapter.id === "metadata") {
      checks.push(...(await runMetadataMcpProbe(config, mcpConfig, options)));
      continue;
    }
    const id = `${adapter.id.toUpperCase()}_ENDPOINT_REACHABLE`;
    if (!mcpConfig.endpoint) {
      checks.push(checkResult(id, adapter.id, "fail", "endpoint 缺失，无法探测。", "先配置 endpoint。"));
      continue;
    }
    const status = await probeEndpoint(mcpConfig.endpoint);
    checks.push(
      checkResult(
        id,
        adapter.id,
        status.ok ? "pass" : "warn",
        status.ok ? "endpoint 可连接。" : `endpoint 探测未通过：${status.message}`,
        "确认网络、URL 和服务状态。"
      )
    );
  }
  return checks;
}

async function runMetadataMcpProbe(config, mcpConfig, options = {}) {
  if (!mcpConfig.endpoint) {
    return [
      checkResult("METADATA_INITIALIZE_CURRENT", "metadata", "fail", "metadata endpoint 缺失，无法执行 MCP initialize。", "先配置 metadata endpoint。"),
    ];
  }
  const protocolVersion = mcpConfig.protocolVersion || "2025-06-18";
  const profileName = mcpConfig.authProfile || "default";
  const headers = buildConcreteHeaders(config, profileName);
  const candidates = buildMetadataProbeCandidates(mcpConfig.endpoint);
  const checks = [];
  for (const candidate of candidates) {
    const result = await initializeMcpSession(candidate.endpoint, {
      protocolVersion,
      headers,
      timeoutMs: options.timeoutMs,
    });
    checks.push(
      checkResult(
        candidate.id,
        "metadata",
        result.ok ? "pass" : candidate.required ? "fail" : "warn",
        result.ok
          ? `${candidate.label} MCP initialize 成功。`
          : `${candidate.label} MCP initialize 未通过：${result.error}`,
        metadataProbeSuggestion(candidate, result)
      )
    );
  }
  return checks;
}

function buildMetadataProbeCandidates(currentEndpoint) {
  const candidates = [
    {
      id: "METADATA_INITIALIZE_CURRENT",
      label: "当前 metadata endpoint",
      endpoint: currentEndpoint,
      required: true,
    },
  ];
  for (const endpoint of [DEFAULT_ENDPOINTS.metadata, ...(LEGACY_ENDPOINTS.metadata || [])]) {
    if (endpoint !== currentEndpoint && !candidates.some((item) => item.endpoint === endpoint)) {
      candidates.push({
        id: endpoint === DEFAULT_ENDPOINTS.metadata ? "METADATA_INITIALIZE_DEFAULT" : "METADATA_INITIALIZE_LEGACY",
        label: endpoint === DEFAULT_ENDPOINTS.metadata ? "默认 metadata endpoint" : "备用 metadata endpoint",
        endpoint,
        required: false,
      });
    }
  }
  return candidates;
}

function metadataProbeSuggestion(candidate, result) {
  const error = String(result.error || "");
  if (candidate.id === "METADATA_INITIALIZE_LEGACY" && /HTTP 413/.test(error)) {
    return "备用 metadata endpoint 当前不可用，请继续使用默认 metadata endpoint。";
  }
  if (/ETIMEDOUT|timeout|超时/i.test(error)) {
    return "请求超时。请检查本机网络后稍后重试；如果持续失败，请联系服务支持确认远端 MCP 服务状态。";
  }
  if (/HTTP 413/.test(error)) {
    return "远端服务拒绝了本次 MCP initialize 请求，请稍后重试或联系服务支持确认 endpoint 状态。";
  }
  return "确认 metadata MCP 服务已部署，并且 endpoint、认证 Header 与 MCP 路径一致。";
}

async function probeEndpoint(url) {
  if (typeof fetch !== "function") {
    return { ok: false, message: "当前 Node.js 不支持 fetch" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    return { ok: response.status < 500, message: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, message: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function filterChecks(checks, mcpId) {
  if (!mcpId) {
    return checks;
  }
  return checks.filter((item) => {
    if (item.scope === mcpId || item.scope === "clients") {
      return true;
    }
    if (item.scope !== "global") {
      return false;
    }
    if (mcpId === "lan" && ["AUTH_TOKEN_PRESENT", "AUTH_BEARER_NORMALIZED"].includes(item.id)) {
      return false;
    }
    return true;
  });
}

function getDefaultProfile(config) {
  return getProfile(config, "default") || {};
}

function getProfile(config, name) {
  return config.auth && config.auth.profiles ? config.auth.profiles[name || "default"] : undefined;
}

module.exports = {
  runDoctor,
  runGlobalChecks,
  runMcpChecks,
};
