"use strict";

const crypto = require("crypto");

const DEFAULT_QR_LOGIN_BASE_URL = "https://api.yeelight.com";
const DEFAULT_QR_LOGIN_DEVICE = "F8:24:41:00:00:01";
const DEFAULT_QR_LOGIN_POLL_INTERVAL_MS = 3000;
const DEFAULT_QR_LOGIN_TIMEOUT_MS = 180000;

function normalizeQrLoginBaseUrl(value) {
  const text = String(value || DEFAULT_QR_LOGIN_BASE_URL).trim().replace(/\/+$/, "");
  return text || DEFAULT_QR_LOGIN_BASE_URL;
}

function normalizeDeviceMac(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^[0-9a-fA-F]{12}$/.test(raw)) {
    return raw.match(/.{1,2}/g).join(":").toUpperCase();
  }
  if (/^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$/.test(raw)) {
    return raw.toUpperCase();
  }
  return raw;
}

function generateQrLoginDevice() {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase().match(/.{1,2}/g).join(":");
  return `F8:24:41:${suffix}`;
}

function buildQrPayload(qrCodeId, device, options = {}) {
  const projectId = options.projectId || options.houseId || "";
  const normalizedDevice = normalizeDeviceMac(device);
  const withProjectId = projectId ? `&${projectId}` : "";
  return `dali&${normalizedDevice}&${qrCodeId}${withProjectId}`;
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

function extractClientId(qrInfo) {
  const token = qrInfo && qrInfo.token && typeof qrInfo.token === "object" ? qrInfo.token : {};
  return token.clientId || "";
}

function extractHouseId(qrInfo) {
  const source = qrInfo && typeof qrInfo.source === "string" ? qrInfo.source : "";
  if (!source) {
    return "";
  }
  const normalized = source.startsWith("dali:") ? source.slice("dali:".length) : source;
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
  DEFAULT_QR_LOGIN_DEVICE,
  DEFAULT_QR_LOGIN_POLL_INTERVAL_MS,
  DEFAULT_QR_LOGIN_TIMEOUT_MS,
  buildQrPayload,
  extractClientId,
  extractHouseId,
  extractQrInfo,
  extractToken,
  generateQrLoginDevice,
  isExpiredStatus,
  isLoginStatus,
  normalizeDeviceMac,
  normalizeQrLoginBaseUrl,
};
