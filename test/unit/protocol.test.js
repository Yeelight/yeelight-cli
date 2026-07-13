"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const http = require("node:http");
const test = require("node:test");
const { callMcpTool, formatHttpError, listAllMcpTools, listMcpTools, makeHeaderReader } = require("../../src/mcp/protocol");

test("MCP tools/list 按 initialize session 流程发现工具", async (t) => {
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ body, headers: options.headers });
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-1" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "gateway.info",
              description: "查询网关信息",
              inputSchema: { type: "object" },
            },
          ],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  const result = await listMcpTools("http://127.0.0.1:18080/mcp");

  assert.equal(result.ok, true);
  assert.equal(result.sessionId, "session-1");
  assert.equal(result.tools[0].name, "gateway.info");
  assert.equal(calls[1].headers["Mcp-Session-Id"], "session-1");
});

test("MCP tools/list 支持 cursor 并返回 nextCursor", async (t) => {
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} });
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [{ name: "page.tool", inputSchema: { type: "object" } }],
          nextCursor: "cursor-2",
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  const result = await listMcpTools("https://api.example.test/mcp", { cursor: "cursor-1" });

  assert.equal(result.ok, true);
  assert.equal(result.nextCursor, "cursor-2");
  assert.deepEqual(calls.find((call) => call.method === "tools/list").params, { cursor: "cursor-1" });
});

test("MCP tools/list --all 会按 nextCursor 拉取全部工具", async (t) => {
  const cursors = [];
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-all" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/list") {
      cursors.push(body.params.cursor || "");
      if (!body.params.cursor) {
        return responseJson({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [{ name: "tool.one", inputSchema: { type: "object" } }],
            nextCursor: "cursor-2",
          },
        });
      }
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [{ name: "tool.two", inputSchema: { type: "object" } }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  const result = await listAllMcpTools("https://api.example.test/mcp");

  assert.equal(result.ok, true);
  assert.deepEqual(result.tools.map((tool) => tool.name), ["tool.one", "tool.two"]);
  assert.deepEqual(cursors, ["", "cursor-2"]);
});

function responseJson(body, headers = {}, options = {}) {
  return {
    ok: options.ok !== undefined ? options.ok : true,
    status: options.status || 200,
    headers: {
      get(name) {
        return headers[name] || headers[name.toLowerCase()] || "";
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("MCP tools/list 网络失败时返回结构化错误", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    const error = new TypeError("fetch failed");
    error.cause = {
      code: "ECONNREFUSED",
      address: "192.168.1.93",
      port: 18080,
      message: "connect ECONNREFUSED 192.168.1.93:18080",
    };
    throw error;
  };

  const result = await listMcpTools("http://192.168.1.93:18080/mcp");

  assert.equal(result.ok, false);
  assert.match(result.error, /ECONNREFUSED/);
  assert.match(result.error, /192\.168\.1\.93:18080/);
});

test("MCP tools/list 超时时返回明确超时错误", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
    });
  };

  const result = await listMcpTools("https://api.example.test/mcp", { timeoutMs: 1 });

  assert.equal(result.ok, false);
  assert.match(result.error, /ETIMEDOUT/);
  assert.match(result.error, /1ms/);
});

test("MCP tools/list 会使用调用方指定的 timeout", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
    });
  };

  const started = Date.now();
  const result = await listMcpTools("https://api.example.test/mcp", { timeoutMs: 20 });
  const elapsed = Date.now() - started;

  assert.equal(result.ok, false);
  assert.equal(elapsed < 1000, true);
  assert.match(result.error, /20ms/);
});

test("MCP initialize 遇到 421 会短重试", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const calls = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.method);
    if (body.method === "initialize" && calls.filter((method) => method === "initialize").length === 1) {
      return responseJson({ jsonrpc: "2.0", id: 1, error: { message: "stale session" } }, {}, { ok: false, status: 421 });
    }
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} });
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: { tools: [{ name: "get_devices", inputSchema: { type: "object" } }] },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  const result = await listMcpTools("https://api.example.test/mcp");

  assert.equal(result.ok, true);
  assert.equal(calls.filter((method) => method === "initialize").length, 2);
  assert.equal(calls.includes("notifications/initialized"), false);
  assert.equal(result.tools[0].name, "get_devices");
});

test("MCP transport content-length 异常会重试到第四次", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let attempts = 0;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      attempts += 1;
      if (attempts < 4) {
        const error = new TypeError("fetch failed");
        error.cause = {
          code: "UND_ERR_REQ_CONTENT_LENGTH_MISMATCH",
          message: "Request body length does not match content-length header",
        };
        throw error;
      }
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} });
    }
    if (body.method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id: 2,
        result: { tools: [{ name: "get_devices", inputSchema: { type: "object" } }] },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  const result = await listMcpTools("https://api.example.test/mcp");

  assert.equal(result.ok, true);
  assert.equal(attempts, 4);
});

test("MCP transport content-length 异常重试耗尽后使用 Node HTTP fallback", async (t) => {
  const originalFetch = global.fetch;
  const originalRequest = http.request;
  t.after(() => {
    global.fetch = originalFetch;
    http.request = originalRequest;
  });
  let fetchAttempts = 0;
  let fallbackCalls = 0;
  global.fetch = async () => {
    fetchAttempts += 1;
    const error = new TypeError("fetch failed");
    error.cause = {
      code: "UND_ERR_REQ_CONTENT_LENGTH_MISMATCH",
      message: "Request body length does not match content-length header",
    };
    throw error;
  };
  http.request = (_url, _options, callback) => {
    const request = new EventEmitter();
    request.end = (payload) => {
      fallbackCalls += 1;
      const body = JSON.parse(payload);
      const responseBody = body.method === "tools/list"
        ? { jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "get_devices", inputSchema: { type: "object" } }] } }
        : { jsonrpc: "2.0", id: body.id, result: {} };
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { "content-type": "application/json" };
      process.nextTick(() => {
        callback(response);
        response.emit("data", Buffer.from(JSON.stringify(responseBody), "utf8"));
        response.emit("end");
      });
    };
    request.destroy = (error) => {
      request.emit("error", error);
    };
    return request;
  };

  const result = await listMcpTools("http://api.example.test/mcp");

  assert.equal(result.ok, true);
  assert.equal(fetchAttempts, 8);
  assert.equal(fallbackCalls, 2);
  assert.equal(result.tools[0].name, "get_devices");
});

test("Node HTTP header reader 支持数组和大小写读取", () => {
  const headers = makeHeaderReader({
    "content-type": "text/event-stream",
    "set-cookie": ["a=1", "b=2"],
  });

  assert.equal(headers.get("Content-Type"), "text/event-stream");
  assert.equal(headers.get("set-cookie"), "a=1, b=2");
});

test("HTTP 413 错误提示说明 metadata 远端 initialize 状态", () => {
  const error = formatHttpError("initialize", { status: 413, body: {} });

  assert.match(error, /HTTP 413/);
  assert.match(error, /metadata/);
  assert.match(error, /initialize/);
  assert.match(error, /服务端修复/);
});

test("HTTP 421 错误提示说明 initialize 和快捷命令 fallback", () => {
  const error = formatHttpError("initialize", { status: 421, body: {} });

  assert.match(error, /HTTP 421/);
  assert.match(error, /OpenAPI fallback/);
  assert.match(error, /cloud MCP initialize/);
});

test("MCP tools/call 会解析文本 JSON payload", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-2" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          content: [{ type: "text", text: "{\"ok\":true,\"name\":\"gateway\"}" }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  const result = await callMcpTool("http://127.0.0.1:18080/mcp", "get_provider_info");

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { ok: true, name: "gateway" });
});

test("MCP tools/call 优先使用 structuredContent", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} });
    }
    if (body.method === "tools/call") {
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          structuredContent: { ok: true, source: "structured" },
          content: [{ type: "text", text: "{\"ok\":false,\"source\":\"text\"}" }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  const result = await callMcpTool("https://api.example.test/mcp", "get_devices");

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { ok: true, source: "structured" });
});

test("MCP tools/call 会透传认证 Header", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const calls = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ body, headers: options.headers });
    if (body.method === "initialize") {
      return responseJson({ jsonrpc: "2.0", id: 1, result: {} }, { "mcp-session-id": "session-auth" });
    }
    if (body.method === "notifications/initialized") {
      return responseJson({});
    }
    if (body.method === "tools/call") {
      return responseJson({
        jsonrpc: "2.0",
        id: 3,
        result: {
          isError: false,
          content: [{ type: "text", text: "{\"ok\":true}" }],
        },
      });
    }
    throw new Error(`未预期的方法：${body.method}`);
  };

  const result = await callMcpTool("https://api.example.test/mcp", "get_devices", {}, {
    headers: {
      Authorization: "Bearer token",
      "Client-Id": "client",
      "House-Id": "house",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].headers.Authorization, "Bearer token");
  assert.equal(calls[1].headers["House-Id"], "house");
  assert.equal(calls[2].headers["Client-Id"], "client");
});
