"use strict";

const { normalizeAuthorization } = require("../security/bearer");

const DEFAULT_PASSWORD_LOGIN_BASE_URL = "https://api.yeelight.com";

function normalizePasswordLoginBaseUrl(value) {
  const text = String(value || DEFAULT_PASSWORD_LOGIN_BASE_URL).trim().replace(/\/+$/, "");
  return text || DEFAULT_PASSWORD_LOGIN_BASE_URL;
}

function extractPasswordLoginCredentials(response) {
  const data = response && typeof response === "object" && response.data && typeof response.data === "object"
    ? response.data
    : response;
  const token = data && data.token && typeof data.token === "object" ? data.token : {};
  const accessToken = pickFirst(data, ["access_token", "accessToken"]) || pickFirst(token, ["accessToken", "access_token", "token"]);
  return {
    authorization: normalizeAuthorization(accessToken),
    clientId: pickFirst(data, ["clientId", "client_id"]) || pickFirst(token, ["clientId", "client_id"]),
    houseId: pickFirst(data, ["houseId", "house_id"]),
  };
}

function pickFirst(source, keys) {
  if (!source || typeof source !== "object") {
    return "";
  }
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && String(source[key]).trim()) {
      return String(source[key]).trim();
    }
  }
  return "";
}

module.exports = {
  DEFAULT_PASSWORD_LOGIN_BASE_URL,
  extractPasswordLoginCredentials,
  normalizePasswordLoginBaseUrl,
};
