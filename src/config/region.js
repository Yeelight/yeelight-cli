"use strict";

const { CliError } = require("../errors");

const DEFAULT_REGION = "cn";
const REGION_ORIGINS = {
  cn: "https://api.yeelight.com",
  sg: "https://api-sg.yeelight.com",
  us: "https://api-us.yeelight.com",
  eu: "https://api-de.yeelight.com",
  dev: "http://api-dev.yeedev.com",
};

const REGION_ALIASES = {
  de: "eu",
  local_dev: "dev",
  "local-dev": "dev",
  cloud_region_cn: "cn",
  cloud_region_sg: "sg",
  cloud_region_us: "us",
  cloud_region_eu: "eu",
};

function normalizeRegion(value, fallback = DEFAULT_REGION) {
  const text = String(value || fallback).trim().toLowerCase();
  const region = REGION_ALIASES[text] || text;
  if (!REGION_ORIGINS[region]) {
    throw new CliError(`不支持的 Region：${value}。可选：cn、sg、us、eu。`);
  }
  return region;
}

function resolveRegion(options = {}) {
  return normalizeRegion(options.flag || options.env || options.profile || DEFAULT_REGION);
}

function buildRegionEndpoints(value) {
  const region = normalizeRegion(value);
  const account = REGION_ORIGINS[region];
  return {
    region,
    account,
    openApi: `${account}/apis/iot`,
    cloud: `${account}/apis/mcp_server/v1/mcp`,
    metadata: `${account}/apis/metadata_mcp_server/v1/mcp`,
  };
}

function isOfficialEndpoint(id, endpoint) {
  const value = String(endpoint || "").replace(/\/+$/, "");
  if (!value) {
    return false;
  }
  for (const region of Object.keys(REGION_ORIGINS)) {
    const endpoints = buildRegionEndpoints(region);
    if (value === String(endpoints[id] || "").replace(/\/+$/, "")) {
      return true;
    }
  }
  return id === "metadata" && value === "https://api.yeelight.com/apis/app_mcp_server/v1/mcp";
}

function applyRegionEndpoints(config, value) {
  const endpoints = buildRegionEndpoints(value);
  for (const id of ["cloud", "metadata"]) {
    const current = config.mcp && config.mcp[id] ? config.mcp[id].endpoint : "";
    if (!current || isOfficialEndpoint(id, current)) {
      config.mcp[id].endpoint = endpoints[id];
    }
  }
  return config;
}

module.exports = {
  DEFAULT_REGION,
  applyRegionEndpoints,
  buildRegionEndpoints,
  isOfficialEndpoint,
  normalizeRegion,
  resolveRegion,
};
