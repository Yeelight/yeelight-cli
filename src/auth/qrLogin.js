"use strict";

const { CliError } = require("../errors");
const { normalizeAuthorization } = require("../security/bearer");
const { renderQrTerminal } = require("../output/qrcode");
const { QrLoginClient } = require("./qrClient");
const {
  DEFAULT_QR_LOGIN_POLL_INTERVAL_MS,
  DEFAULT_QR_LOGIN_TIMEOUT_MS,
  buildQrPayload,
  extractHouseId,
  extractToken,
  generateQrLoginClientDeviceId,
  isExpiredStatus,
  isLoginStatus,
  normalizeClientDeviceId,
  normalizeQrLoginBaseUrl,
} = require("./qrProtocol");

async function runQrLoginFlow(options = {}) {
  const io = options.io;
  const client = options.client || new QrLoginClient({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    timeoutMs: options.requestTimeoutMs,
    bizType: options.bizType,
  });
  const clientDeviceId = normalizeClientDeviceId(options.clientDeviceId || options.device) || generateQrLoginClientDeviceId();
  const created = await client.create(clientDeviceId);
  const qrCodeId = created.qrCodeId;
  if (!qrCodeId) {
    throw new CliError("扫码登录接口未返回 qrCodeId。");
  }

  const payload = buildQrPayload(qrCodeId, clientDeviceId);
  if (!options.json && io) {
    printQrLoginPrompt(io, {
      payload,
      qrCodeId,
      clientDeviceId,
      baseUrl: normalizeQrLoginBaseUrl(options.baseUrl),
      expireAt: created.expireAt,
    });
  }
  if (options.noWait) {
    return {
      ok: true,
      status: created.status || "CREATED",
      qrCodeId,
      clientDeviceId,
      payload,
      expireAt: created.expireAt || null,
      credentials: null,
    };
  }

  const timeoutMs = Number(options.timeoutMs || DEFAULT_QR_LOGIN_TIMEOUT_MS);
  const pollIntervalMs = Number(options.pollIntervalMs || DEFAULT_QR_LOGIN_POLL_INTERVAL_MS);
  const startedAt = Date.now();
  let lastStatus = created.status || "CREATED";
  while (Date.now() - startedAt <= timeoutMs) {
    await sleep(pollIntervalMs);
    const checked = await client.check(qrCodeId);
    lastStatus = checked.status || lastStatus;
    if (!options.json && io && lastStatus) {
      io.stderr.write(`扫码状态：${lastStatus}\n`);
    }
    if (isExpiredStatus(lastStatus) || isExpiredByTime(checked.expireAt)) {
      throw new CliError("二维码已过期，请重新运行 yeelight-ai login。");
    }
    if (!isLoginStatus(lastStatus)) {
      continue;
    }
    const accessToken = extractToken(checked);
    if (!accessToken) {
      throw new CliError("扫码已登录，但响应中没有 accessToken。");
    }
    return {
      ok: true,
      status: lastStatus,
      qrCodeId,
      clientDeviceId,
      payload,
      expireAt: checked.expireAt || created.expireAt || null,
      credentials: {
        authorization: normalizeAuthorization(accessToken),
        houseId: extractHouseId(checked),
      },
    };
  }

  throw new CliError("等待扫码登录超时，请重新运行 yeelight-ai login。");
}

function printQrLoginPrompt(io, details) {
  io.stdout.write("请打开 Yeelight Pro APP，点击首页右上角 + -> MCP 授权，扫描下面的二维码。\n\n");
  io.stdout.write(`${renderQrTerminal(details.payload)}\n`);
  io.stdout.write(`二维码 ID：${details.qrCodeId}\n`);
  io.stdout.write(`CLI 设备标识：${details.clientDeviceId}\n`);
  if (details.expireAt) {
    io.stdout.write(`过期时间：${new Date(Number(details.expireAt)).toLocaleString("zh-CN", { hour12: false })}\n`);
  }
  io.stdout.write("等待手机确认中...\n");
}

function isExpiredByTime(expireAt) {
  return Boolean(expireAt && Number(expireAt) <= Date.now());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  runQrLoginFlow,
};
