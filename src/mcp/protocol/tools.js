"use strict";

const { parseToolContent } = require("./content");
const { formatHttpError, formatNetworkError, formatRedirectError } = require("./errors");
const { normalizeCursor } = require("./pagination");
const { initializeMcpSession } = require("./session");
const { buildMcpHeaders, normalizeTimeoutMs, postJsonRpc } = require("./transport");

async function listMcpTools(endpoint, options = {}) {
  const session = options.session || await initializeMcpSession(endpoint, options);
  const requestHeaders = options.headers || {};
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const cursor = normalizeCursor(options.cursor);
  if (!session.ok) {
    return {
      ok: false,
      protocolVersion: session.protocolVersion,
      sessionId: session.sessionId,
      tools: [],
      nextCursor: null,
      error: session.error,
    };
  }

  let response;
  try {
    response = await postJsonRpc(endpoint, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: cursor ? { cursor } : {},
    }, buildMcpHeaders(session.protocolVersion, session.sessionId, requestHeaders), { timeoutMs, maxAttempts: 4, nodeHttpFallback: true });
  } catch (error) {
    return {
      ok: false,
      protocolVersion: session.protocolVersion,
      sessionId: session.sessionId,
      tools: [],
      nextCursor: null,
      error: formatNetworkError(error),
    };
  }

  if (!response.ok) {
    const error = response.redirected
      ? formatRedirectError("tools/list", response)
      : formatHttpError("tools/list", response);
    if (shouldRetryStatelessHttp(response, options)) {
      return listMcpTools(endpoint, { ...options, session: null, retriedStatelessHttp: true });
    }
    return {
      ok: false,
      protocolVersion: session.protocolVersion,
      sessionId: session.sessionId,
      tools: [],
      nextCursor: null,
      error,
    };
  }

  if (response.body && response.body.error) {
    return {
      ok: false,
      protocolVersion: session.protocolVersion,
      sessionId: session.sessionId,
      tools: [],
      nextCursor: null,
      error: response.body.error.message || "tools/list 返回 JSON-RPC error。",
    };
  }
  const result = response.body && response.body.result ? response.body.result : {};

  return {
    ok: true,
    protocolVersion: session.protocolVersion,
    sessionId: session.sessionId,
    tools: Array.isArray(result.tools)
      ? result.tools
      : [],
    nextCursor: normalizeCursor(result.nextCursor),
  };
}

async function listAllMcpTools(endpoint, options = {}) {
  let cursor = normalizeCursor(options.cursor);
  let session = options.session || null;
  const tools = [];
  for (;;) {
    const result = await listMcpTools(endpoint, {
      ...options,
      cursor,
      session,
    });
    if (!result.ok) {
      return {
        ...result,
        tools,
      };
    }
    session = {
      ok: true,
      protocolVersion: result.protocolVersion,
      sessionId: result.sessionId,
    };
    tools.push(...result.tools);
    cursor = normalizeCursor(result.nextCursor);
    if (!cursor) {
      return {
        ...result,
        tools,
        nextCursor: null,
      };
    }
  }
}

async function callMcpTool(endpoint, name, args = {}, options = {}) {
  const session = options.session || await initializeMcpSession(endpoint, options);
  const requestHeaders = options.headers || {};
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  if (!session.ok) {
    return {
      ok: false,
      protocolVersion: session.protocolVersion,
      sessionId: session.sessionId,
      error: session.error,
    };
  }

  let response;
  try {
    response = await postJsonRpc(endpoint, {
      jsonrpc: "2.0",
      id: options.id || 3,
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    }, buildMcpHeaders(session.protocolVersion, session.sessionId, requestHeaders), { timeoutMs });
  } catch (error) {
    return {
      ok: false,
      protocolVersion: session.protocolVersion,
      sessionId: session.sessionId,
      error: formatNetworkError(error),
    };
  }

  if (!response.ok) {
    const error = response.redirected
      ? formatRedirectError(`tools/call ${name}`, response)
      : formatHttpError(`tools/call ${name}`, response);
    if (shouldRetryStatelessHttp(response, options)) {
      return callMcpTool(endpoint, name, args, { ...options, session: null, retriedStatelessHttp: true });
    }
    return {
      ok: false,
      protocolVersion: session.protocolVersion,
      sessionId: session.sessionId,
      error,
    };
  }

  if (response.body && response.body.error) {
    return {
      ok: false,
      protocolVersion: session.protocolVersion,
      sessionId: session.sessionId,
      error: response.body.error.message || `tools/call ${name} 返回 JSON-RPC error。`,
    };
  }

  const result = response.body ? response.body.result : {};
  const parsedContent = parseToolContent(result);
  return {
    ok: !(result && result.isError),
    protocolVersion: session.protocolVersion,
    sessionId: session.sessionId,
    name,
    result,
    data: parsedContent,
  };
}

function shouldRetryStatelessHttp(response, options) {
  return response.status === 421 && !options.retriedStatelessHttp;
}

module.exports = {
  callMcpTool,
  listAllMcpTools,
  listMcpTools,
};
