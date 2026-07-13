"use strict";

const { CliError } = require("../errors");
const {
  DEFAULT_PASSWORD_LOGIN_BASE_URL,
  extractPasswordLoginCredentials,
  normalizePasswordLoginBaseUrl,
} = require("./passwordProtocol");

class PasswordLoginClient {
  constructor(options = {}) {
    this.baseUrl = normalizePasswordLoginBaseUrl(options.baseUrl || DEFAULT_PASSWORD_LOGIN_BASE_URL);
    this.fetch = options.fetch || global.fetch;
    this.timeoutMs = Number(options.timeoutMs || 15000);
    if (typeof this.fetch !== "function") {
      throw new CliError("当前 Node.js 不支持 fetch，无法执行账密登录。");
    }
  }

  async login(credentials) {
    const response = await this.post("/apis/iot/v1/oauth/login", {
      username: credentials.account,
      password: credentials.password,
    });
    return extractPasswordLoginCredentials(response);
  }

  async post(path, data) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Accept-Language": "zh-CN",
          "Content-Type": "application/json",
          bizType: "1",
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      const text = await response.text();
      const body = text ? parseJson(text) : {};
      if (!response.ok) {
        throw new CliError(`账密登录接口返回 HTTP ${response.status}。`);
      }
      if (body && body.success === false) {
        throw new CliError(body.message || body.msg || "账密登录接口返回失败。");
      }
      return body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }
      throw new CliError(`账密登录接口请求失败：${formatNetworkError(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError("账密登录接口返回内容不是合法 JSON。");
  }
}

function formatNetworkError(error) {
  if (error && error.name === "AbortError") {
    return "请求超时";
  }
  return error && error.message ? error.message : String(error);
}

module.exports = {
  PasswordLoginClient,
};
