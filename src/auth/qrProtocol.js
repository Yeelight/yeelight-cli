"use strict";

const crypto = require("crypto");

const DEFAULT_QR_LOGIN_BASE_URL = "https://api.yeelight.com";
const DEFAULT_QR_LOGIN_POLL_INTERVAL_MS = 3000;
const DEFAULT_QR_LOGIN_TIMEOUT_MS = 180000;

function normalizeQrLoginBaseUrl(value) {
  const text = String(value || DEFAULT_QR_LOGIN_BASE_URL).trim().replace(/\/+$/, "");
  return text || DEFAULT_QR_LOGIN_BASE_URL;
}

function normalizeClientDeviceId(value) {
  return String(value || "").trim();
}

function generateQrLoginClientDeviceId() {
  return `cli_${crypto.randomBytes(6).toString("base64url")}`;
}

function buildQrPayload(qrCodeId, clientDeviceId) {
  return `cli&${normalizeClientDeviceId(clientDeviceId)}&${qrCodeId}`;
}

function extractQrInfo(response) {
  const data = response && typeof response === "object" && response.data && typeof response.data === "object"
    ? response.data
    : response;
  return data && typeof data === "object" ? data : {};
}

function extractToken(qrInfo) {
  const token = qrInfo && qrInfo.token && typeof qrInfo.token === "object" ? qrInfo.token : {};
  return token.accessToken || token.token || "";
}

function extractHouseId(qrInfo) {
  const source = qrInfo && typeof qrInfo.source === "string" ? qrInfo.source : "";
  if (!source) {
    return "";
  }
  const normalized = source.replace(/^(dali|cli):/, "");
  try {
    const parsed = JSON.parse(normalized);
    return parsed && parsed.houseId !== undefined && parsed.houseId !== null ? String(parsed.houseId) : "";
  } catch (error) {
    return /^\d+$/.test(normalized) ? normalized : "";
  }
}

function isLoginStatus(status) {
  return String(status || "").toUpperCase() === "LOGIN";
}

function isExpiredStatus(status) {
  return String(status || "").toUpperCase() === "EXPIRED";
}

module.exports = {
  DEFAULT_QR_LOGIN_BASE_URL,
  DEFAULT_QR_LOGIN_POLL_INTERVAL_MS,
  DEFAULT_QR_LOGIN_TIMEOUT_MS,
  buildQrPayload,
  extractHouseId,
  extractQrInfo,
  extractToken,
  generateQrLoginClientDeviceId,
  isExpiredStatus,
  isLoginStatus,
  normalizeClientDeviceId,
  normalizeQrLoginBaseUrl,
};
