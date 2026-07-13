"use strict";

const { DEFAULT_MCP_PROTOCOL_VERSION } = require("./constants");
const { getHeader } = require("./content");
const { formatHttpError, formatNetworkError, formatRedirectError } = require("./errors");
const { buildMcpHeaders, normalizeTimeoutMs, postJsonRpc, sleep } = require("./transport");

async function initializeMcpSession(endpoint, options = {}) {
  const protocolVersion = options.protocolVersion || DEFAULT_MCP_PROTOCOL_VERSION;
  const requestHeaders = options.headers || {};
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const initializeHttpRetries = Number(options.initializeHttpRetries || 0);
  let initialize;
  try {
    initialize = await postJsonRpc(endpoint, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: {
          name: "yeelight-ai-cli",
          version: "0.0.1",
        },
      },
    }, {
      ...requestHeaders,
      "MCP-Protocol-Version": protocolVersion,
    }, { timeoutMs, maxAttempts: 4, nodeHttpFallback: true });
  } catch (error) {
    return {
      ok: false,
      protocolVersion,
      sessionId: "",
      status: 0,
      error: formatNetworkError(error),
    };
  }

  const sessionId = getHeader(initialize.headers, "mcp-session-id");
  if (initialize.redirected) {
    return {
      ok: false,
      protocolVersion,
      sessionId: "",
      status: initialize.status,
      error: formatRedirectError("initialize", initialize),
    };
  }
  if (!initialize.ok) {
    if (shouldRetryInitializeHttp(initialize, initializeHttpRetries)) {
      await sleep(100 * (initializeHttpRetries + 1));
      return initializeMcpSession(endpoint, {
        ...options,
        initializeHttpRetries: initializeHttpRetries + 1,
      });
    }
    return {
      ok: false,
      protocolVersion,
      sessionId: "",
      status: initialize.status,
      error: formatHttpError("initialize", initialize),
    };
  }
  if (initialize.body && initialize.body.error) {
    return {
      ok: false,
      protocolVersion,
      sessionId: "",
      status: initialize.status,
      error: initialize.body.error.message || "initialize 返回 JSON-RPC error。",
    };
  }
  if (!sessionId) {
    return {
      ok: true,
      protocolVersion,
      sessionId: "",
      initialize: initialize.body,
      stateless: true,
    };
  }
  let initialized;
  try {
    initialized = await postJsonRpc(endpoint, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }, buildMcpHeaders(protocolVersion, sessionId, requestHeaders), { timeoutMs });
  } catch (error) {
    return {
      ok: false,
      protocolVersion,
      sessionId,
      status: 0,
      error: formatNetworkError(error),
    };
  }

  if (!initialized.ok) {
    return {
      ok: false,
      protocolVersion,
      sessionId,
      status: initialized.status,
      error: initialized.redirected
        ? formatRedirectError("notifications/initialized", initialized)
        : formatHttpError("notifications/initialized", initialized),
    };
  }

  return {
    ok: true,
    protocolVersion,
    sessionId,
    initialize: initialize.body,
  };
}

function shouldRetryInitializeHttp(response, retryCount) {
  return response.status === 421 && retryCount < 2;
}

module.exports = {
  initializeMcpSession,
};
