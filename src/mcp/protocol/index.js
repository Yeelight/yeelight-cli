"use strict";

const {
  DEFAULT_MCP_PROTOCOL_VERSION,
  DEFAULT_MCP_REQUEST_TIMEOUT_MS,
} = require("./constants");
const { makeHeaderReader, parseResponseBody, parseToolContent } = require("./content");
const { formatHttpError, formatNetworkError } = require("./errors");
const { initializeMcpSession } = require("./session");
const { buildMcpHeaders } = require("./transport");
const { callMcpTool, listAllMcpTools, listMcpTools } = require("./tools");

module.exports = {
  DEFAULT_MCP_PROTOCOL_VERSION,
  DEFAULT_MCP_REQUEST_TIMEOUT_MS,
  callMcpTool,
  buildMcpHeaders,
  formatHttpError,
  formatNetworkError,
  initializeMcpSession,
  listAllMcpTools,
  listMcpTools,
  makeHeaderReader,
  parseResponseBody,
  parseToolContent,
};
