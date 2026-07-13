"use strict";

const http = require("node:http");
const https = require("node:https");
const { DEFAULT_MCP_REQUEST_TIMEOUT_MS } = require("./constants");
const { getHeader, makeHeaderReader, parseResponseBody } = require("./content");

async function postJsonRpc(endpoint, body, headers = {}, options = {}) {
  const maxAttempts = Number(options.maxAttempts || 2);
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await postJsonRpcOnce(endpoint, body, headers, options);
    } catch (error) {
      lastError = error;
      if (!isRetryableTransportError(error)) {
        throw error;
      }
      if (attempt === maxAttempts) {
        break;
      }
      await sleep(100 * attempt);
    }
  }
  if (options.nodeHttpFallback && isRetryableTransportError(lastError)) {
    return postJsonRpcNodeHttp(endpoint, body, headers, options);
  }
  throw lastError;
}

function postJsonRpcNodeHttp(endpoint, body, headers = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const payload = JSON.stringify(body);
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
    const client = url.protocol === "http:" ? http : https;
    const request = client.request(url, {
      method: "POST",
      headers: {
        "Accept": "application/json, text/event-stream",
        "Accept-Encoding": "identity",
        "Connection": "close",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
      timeout: timeoutMs,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const responseHeaders = makeHeaderReader(response.headers);
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          redirected: isRedirectStatus(response.statusCode),
          location: getHeader(responseHeaders, "location"),
          headers: responseHeaders,
          body: text ? parseResponseBody(text, responseHeaders) : {},
        });
      });
    });
    request.on("timeout", () => {
      const timeoutError = new Error(`请求超时（${timeoutMs}ms）`);
      timeoutError.cause = {
        code: "ETIMEDOUT",
        message: `request timeout after ${timeoutMs}ms`,
      };
      request.destroy(timeoutError);
    });
    request.on("error", reject);
    request.end(payload);
  });
}

async function postJsonRpcOnce(endpoint, body, headers = {}, options = {}) {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node.js 不支持 fetch，无法执行 MCP HTTP 探测。");
  }
  const controller = new AbortController();
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Accept": "application/json, text/event-stream",
        "Accept-Encoding": "identity",
        "Connection": "close",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      redirected: isRedirectStatus(response.status),
      location: getHeader(response.headers, "location"),
      headers: response.headers,
      body: text ? parseResponseBody(text, response.headers) : {},
    };
  } catch (error) {
    if (timedOut || error.name === "AbortError" || error.message === "This operation was aborted") {
      const timeoutError = new Error(`请求超时（${timeoutMs}ms）`);
      timeoutError.cause = {
        code: "ETIMEDOUT",
        message: `request timeout after ${timeoutMs}ms`,
      };
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildMcpHeaders(protocolVersion, sessionId, requestHeaders = {}) {
  const headers = {
    ...requestHeaders,
    "MCP-Protocol-Version": protocolVersion,
  };
  if (sessionId) {
    headers["Mcp-Session-Id"] = sessionId;
  }
  return headers;
}

function normalizeTimeoutMs(value) {
  const parsed = Number(value || DEFAULT_MCP_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MCP_REQUEST_TIMEOUT_MS;
  }
  return parsed;
}

function isRetryableTransportError(error) {
  const code = error && error.cause && error.cause.code;
  return code === "UND_ERR_REQ_CONTENT_LENGTH_MISMATCH" || code === "UND_ERR_CONNECT_TIMEOUT";
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(Number(status));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  buildMcpHeaders,
  normalizeTimeoutMs,
  postJsonRpc,
  sleep,
};
