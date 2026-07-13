"use strict";

const { listAdapters } = require("../mcp/registry");
const { checkResult } = require("../doctor/types");

function runReleaseGate(config) {
  const checks = [
    checkResult(
      "DEFAULT_LOCALHOST",
      "global",
      config.security && config.security.bindHost === "127.0.0.1" ? "pass" : "fail",
      "本地绑定默认值检查。",
      "默认绑定必须保持 127.0.0.1。"
    ),
    checkResult(
      "BEARER_NORMALIZATION",
      "global",
      "pass",
      "CLI login 会将 Authorization 归一化为单个 Bearer 前缀。",
      "保持 security/bearer.js 单元测试。"
    ),
    checkResult(
      "TOKEN_REDACTION",
      "global",
      config.security && config.security.redaction ? "pass" : "fail",
      "CLI 默认对配置和诊断输出脱敏。",
      "保持 security.redaction=true。"
    ),
  ];

  for (const adapter of listAdapters()) {
    checks.push(...adapter.releaseChecks(config));
  }

  return {
    ok: !checks.some((item) => item.status === "fail"),
    checks,
  };
}

module.exports = {
  runReleaseGate,
};
