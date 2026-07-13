"use strict";

const { MCP_IDS } = require("../config/defaults");
const { getCloudAdapter } = require("./cloud");
const { getLanAdapter } = require("./lan");
const { getMetadataAdapter } = require("./metadata");

const ADAPTERS = {
  cloud: getCloudAdapter(),
  metadata: getMetadataAdapter(),
  lan: getLanAdapter(),
};

function getAdapter(id) {
  return ADAPTERS[id];
}

function listAdapters() {
  return MCP_IDS.map((id) => ADAPTERS[id]);
}

function assertMcpId(id) {
  if (!ADAPTERS[id]) {
    throw new Error(`不支持的 MCP ID：${id}`);
  }
}

module.exports = {
  assertMcpId,
  getAdapter,
  listAdapters,
};
