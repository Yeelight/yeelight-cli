"use strict";

const { DEFAULT_BIZ_TYPE, normalizeBizType } = require("../config/bizType");
const { CliError } = require("../errors");
const {
  DEFAULT_QR_LOGIN_BASE_URL,
  extractQrInfo,
  normalizeQrLoginBaseUrl,
} = require("./qrProtocol");

class QrLoginClient {
  constructor(options = {}) {
    this.baseUrl = normalizeQrLoginBaseUrl(options.baseUrl || DEFAULT_QR_LOGIN_BASE_URL);
    this.fetch = options.fetch || global.fetch;
    this.timeoutMs = Number(options.timeoutMs || 15000);
    this.bizType = normalizeBizType(options.bizType, DEFAULT_BIZ_TYPE);
    if (typeof this.fetch !== "function") {
      throw new CliError("当前 Node.js 不支持 fetch，无法执行扫码登录。");
    }
  }

  async create(device) {
    const response = await this.post(`/apis/account/user/scan-login/query/qrcode/${encodeURIComponent(device)}`);
    return extractQrInfo(response);
  }

  async check(qrCodeId) {
    const response = await this.post(`/apis/account/user/scan-login/check/qrcode/${encodeURIComponent(qrCodeId)}`);
    return extractQrInfo(response);
  }

  async post(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Accept-Language": "zh-CN",
          bizType: this.bizType,
        },
        signal: controller.signal,
      });
      const text = await response.text();
      const body = text ? parseJson(text) : {};
      if (!response.ok) {
        throw new CliError(`扫码登录接口返回 HTTP ${response.status}。`);
      }
      if (body && body.success === false) {
        throw new CliError(body.message || body.msg || "扫码登录接口返回失败。");
      }
      return body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }
      throw new CliError(`扫码登录接口请求失败：${formatNetworkError(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError("扫码登录接口返回内容不是合法 JSON。");
  }
}

function formatNetworkError(error) {
  if (error && error.name === "AbortError") {
    return "请求超时";
  }
  return error && error.message ? error.message : String(error);
}

module.exports = {
  QrLoginClient,
};
