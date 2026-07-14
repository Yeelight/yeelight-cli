"use strict";

const { DEFAULT_BIZ_TYPE, normalizeBizType } = require("../config/bizType");
const { CliError } = require("../errors");

const DEFAULT_API_BASE_URL = "https://api.yeelight.com";

class HouseClient {
  constructor(options = {}) {
    this.baseUrl = normalizeApiBaseUrl(options.baseUrl || DEFAULT_API_BASE_URL);
    this.fetch = options.fetch || global.fetch;
    this.timeoutMs = Number(options.timeoutMs || 15000);
    if (typeof this.fetch !== "function") {
      throw new CliError("当前 Node.js 不支持 fetch，无法拉取家庭列表。");
    }
  }

  async listHouses(credentials) {
    const appHouses = await this.tryListAppHouses(credentials);
    if (appHouses.length > 0) {
      return appHouses;
    }
    return this.tryListSaasProjects(credentials);
  }

  async tryListAppHouses(credentials) {
    const response = await this.post("/apis/iot/v1/house/r/list", {}, credentials);
    return normalizeHouseList(response, "house");
  }

  async tryListSaasProjects(credentials) {
    try {
      const role = await this.get("/apis/commercial/saas/v1/user/r/saas-role", credentials);
      if (role === "commercial_saas_user") {
        return [];
      }
      const roles = await this.get("/apis/commercial/saas/v1/user/r/project-role", credentials);
      const projects = await this.post("/apis/commercial/saas/v1/project/r/page", { pageNo: 1, pageSize: 999 }, credentials);
      const rows = projects && Array.isArray(projects.rows) ? projects.rows : Array.isArray(projects) ? projects : [];
      return normalizeHouseList(rows.filter((item) => {
        const houseId = item && item.houseId !== undefined && item.houseId !== null ? String(item.houseId) : "";
        return roles && (roles[houseId] === 1 || roles[houseId] === 2);
      }), "project");
    } catch (error) {
      if (error instanceof CliError) {
        return [];
      }
      throw error;
    }
  }

  async get(path, credentials) {
    return this.request("GET", path, undefined, credentials);
  }

  async post(path, data, credentials) {
    return this.request("POST", path, data, credentials);
  }

  async request(method, path, data, credentials) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = {
        "Accept-Language": "zh-CN",
        Authorization: credentials.authorization,
        bizType: normalizeBizType(credentials.bizType, DEFAULT_BIZ_TYPE),
      };
      if (credentials.clientId) {
        headers["Client-Id"] = credentials.clientId;
      }
      if (data !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
        signal: controller.signal,
      });
      const text = await response.text();
      const body = text ? parseJson(text) : {};
      if (!response.ok) {
        throw new CliError(`家庭列表接口返回 HTTP ${response.status}。`);
      }
      if (body && body.success === false) {
        throw new CliError(body.message || body.msg || "家庭列表接口返回失败。");
      }
      return body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }
      throw new CliError(`家庭列表接口请求失败：${formatNetworkError(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeHouseList(value, source) {
  const items = extractList(value);
  return items
    .map((item) => normalizeHouse(item, source))
    .filter((item) => item.houseId);
}

function extractList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  for (const key of ["rows", "list", "houses", "houseList", "data"]) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }
  return [];
}

function normalizeHouse(item, source) {
  if (!item || typeof item !== "object") {
    return { houseId: "", name: "", source };
  }
  const houseId = pick(item, ["houseId", "id", "value"]);
  const name = pick(item, ["name", "houseName", "areaName", "text"]) || houseId;
  return {
    houseId,
    name,
    source,
  };
}

function pick(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && String(source[key]).trim()) {
      return String(source[key]).trim();
    }
  }
  return "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError("家庭列表接口返回内容不是合法 JSON。");
  }
}

function formatNetworkError(error) {
  if (error && error.name === "AbortError") {
    return "请求超时";
  }
  return error && error.message ? error.message : String(error);
}

function normalizeApiBaseUrl(value) {
  const text = String(value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
  return text || DEFAULT_API_BASE_URL;
}

module.exports = {
  HouseClient,
  normalizeHouseList,
};
