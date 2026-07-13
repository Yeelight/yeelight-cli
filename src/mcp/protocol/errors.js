"use strict";

function formatHttpError(stage, response) {
  const rpcError = response.body && response.body.error;
  const detail = rpcError && rpcError.message ? `：${rpcError.message}` : "";
  const hint = formatHttpHint(stage, response.status);
  return `${stage} 失败：HTTP ${response.status}${detail}${hint}`;
}

function formatHttpHint(stage, status) {
  if (status === 413) {
    return "。请求被远端网关拒绝（Payload Too Large）。metadata 当前可在 CLI 本地查看工具列表和参数说明，但远端 initialize 返回 413，真实调用需要服务端修复后再试。";
  }
  if (status === 421 && stage === "initialize") {
    return "。远端 MCP 服务拒绝本次初始化请求，通常与网关路由、协议版本或服务端会话处理有关。读类快捷命令会自动尝试 OpenAPI fallback；若直接使用 mcp 子命令，请稍后重试或联系服务端确认 cloud MCP initialize。";
  }
  return "";
}

function formatRedirectError(stage, response) {
  const location = response.location || "";
  const hint = isPrivateHttpLocation(location)
    ? "。服务端返回了内网地址，请使用公开 MCP endpoint，避免 endpoint 末尾多余斜杠，或联系服务端修正重定向。"
    : "";
  return `${stage} 失败：HTTP ${response.status} 重定向到 ${location || "未知地址"}${hint}`;
}

function formatNetworkError(error) {
  const cause = error && error.cause ? error.cause : {};
  const parts = [];
  if (cause.code) {
    parts.push(cause.code);
  }
  if (cause.address || cause.port) {
    parts.push(`${cause.address || "unknown"}:${cause.port || "unknown"}`);
  }
  if (cause.message) {
    parts.push(cause.message);
  } else if (error && error.message) {
    parts.push(error.message);
  }
  return parts.length > 0 ? parts.join(" - ") : "未知网络错误";
}

function isPrivateHttpLocation(value) {
  return /^http:\/\/(10\.|127\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(String(value || ""));
}

module.exports = {
  formatHttpError,
  formatNetworkError,
  formatRedirectError,
};
