"use strict";

const readline = require("readline");
const { getBooleanFlag, getStringFlag, hasFlag, parseArgs } = require("../args");
const { BIZ_TYPE_OPTIONS, DEFAULT_BIZ_TYPE, formatBizTypeWithCode, normalizeBizType } = require("../config/bizType");
const { applyRegionEndpoints, buildRegionEndpoints, resolveRegion } = require("../config/region");
const { loadConfig, saveConfig } = require("../config/store");
const { redactProfile } = require("../config/redact");
const { CliError } = require("../errors");
const { writeJson } = require("../output/json");
const { HouseClient } = require("../auth/houseClient");
const { generateQrLoginClientDeviceId, normalizeClientDeviceId } = require("../auth/qrProtocol");
const { normalizeAuthorization } = require("../security/bearer");

const LOGIN_METHODS = new Set(["qr", "manual"]);
const PASSWORD_LOGIN_REMOVED_MESSAGE = "账密登录已移除，请使用扫码登录或手动 token。";

async function runLoginCommand(argv, io) {
  const { flags } = parseArgs(argv);
  const asJson = getBooleanFlag(flags, "json", false);
  const profileName = getStringFlag(flags, "profile", "default");
  const loadResult = loadConfig({ env: io.env });
  const config = loadResult.config;

  const current = ensureProfile(config, profileName);
  if (hasFlag(flags, "client-id")) {
    throw new CliError("Client ID 已从公开认证契约中移除；只需 Authorization、Region 和可选 House ID。");
  }
  const region = resolveRegion({
    flag: getStringFlag(flags, "region", ""),
    env: io.env.YEELIGHT_CLOUD_REGION,
    profile: current.region,
  });
  const baseUrl = getStringFlag(flags, "base-url", io.env.YEELIGHT_QR_LOGIN_BASE_URL || buildRegionEndpoints(region).account);
  const explicitQr = getBooleanFlag(flags, "qr", false);
  const explicitManual = getBooleanFlag(flags, "manual", false);
  const methodFlag = getStringFlag(flags, "method", "");
  if (explicitQr && (explicitManual || methodFlag || hasQrConflictInput(flags))) {
    throw new CliError("login --qr 不能和 --manual、--method、--authorization、--account 或 --password 同时使用。");
  }
  if (explicitManual && methodFlag) {
    throw new CliError("login --manual 不能和 --method 同时使用。");
  }
  const method = await resolveLoginMethod({ flags, methodFlag, explicitQr, explicitManual, io });

  if (method === "qr") {
    return runQrLogin(flags, {
      asJson,
      profileName,
      config,
      io,
      region,
      baseUrl,
    });
  }
  const authorizationInput = getStringFlag(flags, "authorization", "");
  const houseIdInput = getStringFlag(flags, "house-id", "");
  const explicitBizType = getExplicitBizType(flags);

  const shouldPrompt = explicitManual || (!authorizationInput && !houseIdInput);
  const promptDefaults = {
    authorization: authorizationInput || current.authorization,
    houseId: houseIdInput || current.houseId,
  };
  const answers = shouldPrompt ? await promptForCredentials(io, promptDefaults) : {};

  const authorization = normalizeAuthorization(authorizationInput || answers.authorization || current.authorization);
  const houseId = houseIdInput || answers.houseId || current.houseId;

  if (!authorization) {
    throw new CliError("Authorization 不能为空。");
  }
  const bizType = await resolveBizType({
    explicitBizType,
    currentBizType: current.bizType,
    io,
    asJson,
  });
  const selectedHouseId = await resolveHouseId({
    flags,
    io,
    asJson,
    credentials: {
      authorization,
      bizType,
    },
    explicitHouseId: houseId,
    baseUrl,
  });

  config.auth.profiles[profileName] = {
    authorization,
    houseId: selectedHouseId,
    bizType,
    region,
  };
  applyRegionEndpoints(config, region);
  const path = saveConfig(config, { env: io.env });
  const result = {
    ok: true,
    path,
    profile: profileName,
    credentials: redactProfile(config.auth.profiles[profileName]),
  };

  if (asJson) {
    writeJson(io, result);
  } else {
    io.stdout.write(`已保存凭证：${profileName}\n`);
    io.stdout.write(`Authorization：${result.credentials.authorization}\n`);
    io.stdout.write(`House-Id：${result.credentials.houseId}\n`);
    io.stdout.write(`Region：${region}\n`);
    io.stdout.write(`业务类型：${formatBizTypeWithCode(bizType)}\n`);
  }
  return 0;
}

async function resolveLoginMethod(options) {
  const flags = options.flags;
  if (options.explicitQr) {
    return "qr";
  }
  if (options.methodFlag) {
    const method = options.methodFlag.toLowerCase();
    if (method === "password") {
      throw new CliError(PASSWORD_LOGIN_REMOVED_MESSAGE);
    }
    if (!LOGIN_METHODS.has(method)) {
      throw new CliError(`不支持的登录方式：${options.methodFlag}。可选：${formatLoginMethods()}。`);
    }
    if (method === "qr" && hasQrConflictInput(flags)) {
      throw new CliError("login --method qr 不能和 --authorization、--account 或 --password 同时使用。");
    }
    if (method === "manual" && hasPasswordLoginInput(flags)) {
      throw new CliError(PASSWORD_LOGIN_REMOVED_MESSAGE);
    }
    return method;
  }
  if (hasPasswordLoginInput(flags)) {
    throw new CliError(PASSWORD_LOGIN_REMOVED_MESSAGE);
  }
  if (options.explicitManual || hasFlag(flags, "authorization")) {
    return "manual";
  }
  if (shouldPromptForLoginMethod(options)) {
    return promptForLoginMethod(options.io);
  }
  return "qr";
}

function hasQrConflictInput(flags) {
  return hasFlag(flags, "authorization") || hasFlag(flags, "account") || hasFlag(flags, "password");
}

function hasPasswordLoginInput(flags) {
  return hasFlag(flags, "account") || hasFlag(flags, "password");
}

function formatLoginMethods() {
  return "qr、manual";
}

function shouldPromptForLoginMethod(options) {
  return Boolean(options.io && options.io.stdin && options.io.stdin.isTTY && !getBooleanFlag(options.flags, "json", false));
}

async function promptForLoginMethod(io) {
  io.stderr.write("请选择登录方式：\n");
  io.stderr.write("  1. 扫码登录（推荐，默认）\n");
  io.stderr.write("  2. 手动粘贴 token\n");
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stderr,
  });
  try {
    const answer = (await question(rl, "登录方式 [qr/manual，默认 qr]: ")).toLowerCase();
    if (!answer || answer === "1" || answer === "qr") {
      return "qr";
    }
    if (answer === "2" || answer === "manual" || answer === "token" || answer === "手动") {
      return "manual";
    }
    throw new CliError(`不支持的登录方式：${answer}`);
  } finally {
    rl.close();
  }
}
async function resolveHouseId(options) {
  if (options.explicitHouseId) {
    return options.explicitHouseId;
  }
  const houses = await new HouseClient({ baseUrl: options.baseUrl }).listHouses(options.credentials);
  if (houses.length === 0) {
    throw new CliError("登录成功，但未拉取到家庭列表。请确认账号已有家庭，或使用 --house-id <id> 手动指定。");
  }
  if (houses.length === 1) {
    if (!options.asJson) {
      options.io.stderr.write(`已自动选择家庭：${houses[0].name} (${houses[0].houseId})\n`);
    }
    return houses[0].houseId;
  }
  if (options.asJson) {
    throw new CliError(`登录成功，但账号有 ${houses.length} 个家庭。请重新运行并传入 --house-id <id>。`);
  }
  return promptForHouseSelection(options.io, houses);
}

function getExplicitBizType(flags) {
  const value = getStringFlag(flags, "biz-type", "") || getStringFlag(flags, "bizType", "");
  if (!value) {
    return "";
  }
  const normalized = normalizeBizType(value, "");
  if (!normalized) {
    throw new CliError(`不支持的业务类型：${value}。可选：0（普通家庭）、1（商照项目）。`);
  }
  return normalized;
}

async function resolveBizType(options) {
  if (options.explicitBizType) {
    return options.explicitBizType;
  }
  if (shouldPromptForBizType(options)) {
    return promptForBizType(options.io, options.currentBizType);
  }
  return normalizeBizType(options.currentBizType, DEFAULT_BIZ_TYPE);
}

function shouldPromptForBizType(options) {
  return Boolean(options.io && options.io.stdin && options.io.stdin.isTTY && !options.asJson);
}

async function promptForBizType(io, currentBizType) {
  const current = normalizeBizType(currentBizType, DEFAULT_BIZ_TYPE);
  io.stderr.write("请选择家庭类型：\n");
  BIZ_TYPE_OPTIONS.forEach((option) => {
    const suffix = option.value === current ? "（默认）" : "";
    io.stderr.write(`  ${option.value}. ${option.label}${suffix}\n`);
  });
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stderr,
  });

  try {
    const answer = await question(rl, `家庭类型 [0/1，默认 ${current}]: `);
    return selectBizType(answer, current);
  } finally {
    rl.close();
  }
}

function selectBizType(answer, fallback) {
  const text = String(answer || "").trim();
  if (!text) {
    return fallback;
  }
  const normalized = normalizeBizType(text, "");
  if (!normalized) {
    throw new CliError(`无效的家庭类型：${answer}`);
  }
  return normalized;
}

async function runQrLogin(flags, context) {
  const { runQrLoginFlow } = require("../auth/qrLogin");
  const resolvedClientDevice = resolveQrLoginClientDeviceId(flags, context);
  const explicitBizType = getExplicitBizType(flags);
  const bizType = await resolveBizType({
    explicitBizType,
    currentBizType: DEFAULT_BIZ_TYPE,
    io: context.io,
    asJson: context.asJson,
  });
  if (resolvedClientDevice.changed) {
    saveConfig(context.config, { env: context.io.env });
  }
  const qrResult = await runQrLoginFlow({
    io: context.io,
    json: context.asJson,
    baseUrl: context.baseUrl,
    clientDeviceId: resolvedClientDevice.clientDeviceId,
    houseId: getStringFlag(flags, "house-id", ""),
    timeoutMs: Number(getStringFlag(flags, "timeout-ms", "") || 180000),
    pollIntervalMs: Number(getStringFlag(flags, "poll-interval-ms", "") || 3000),
    noWait: getBooleanFlag(flags, "no-wait", false),
    bizType,
  });

  if (!qrResult.credentials) {
    const result = {
      ok: true,
      status: qrResult.status,
      qrCodeId: qrResult.qrCodeId,
      clientDeviceId: qrResult.clientDeviceId,
      payload: qrResult.payload,
      expireAt: qrResult.expireAt,
    };
    if (context.asJson) {
      writeJson(context.io, result);
    } else {
      context.io.stdout.write("二维码已生成，未等待手机确认。\n");
    }
    return 0;
  }

  const authorization = qrResult.credentials.authorization;
  const houseId = qrResult.credentials.houseId || getStringFlag(flags, "house-id", "");
  const selectedHouseId = await resolveHouseId({
    flags,
    io: context.io,
    asJson: context.asJson,
    credentials: {
      authorization,
      bizType,
    },
    explicitHouseId: houseId,
    baseUrl: context.baseUrl,
  });
  context.config.auth.profiles[context.profileName] = {
    authorization,
    houseId: selectedHouseId,
    bizType,
    region: context.region,
  };
  applyRegionEndpoints(context.config, context.region);
  const path = saveConfig(context.config, { env: context.io.env });
  const result = {
    ok: true,
    path,
    profile: context.profileName,
    status: qrResult.status,
    qrCodeId: qrResult.qrCodeId,
    credentials: redactProfile(context.config.auth.profiles[context.profileName]),
  };
  if (context.asJson) {
    writeJson(context.io, result);
  } else {
    context.io.stdout.write(`已通过扫码登录并保存凭证：${context.profileName}\n`);
    context.io.stdout.write(`Authorization：${result.credentials.authorization}\n`);
    context.io.stdout.write(`House-Id：${result.credentials.houseId}\n`);
    context.io.stdout.write(`Region：${context.region}\n`);
    context.io.stdout.write(`业务类型：${formatBizTypeWithCode(bizType)}\n`);
  }
  return 0;
}

function resolveQrLoginClientDeviceId(flags, context) {
  const explicit = normalizeClientDeviceId(
    getStringFlag(flags, "client-device-id", "") || getStringFlag(flags, "device", context.io.env.YEELIGHT_QR_LOGIN_DEVICE || "")
  );
  if (explicit) {
    return {
      clientDeviceId: explicit,
      changed: false,
    };
  }

  const qrLogin = ensureQrLoginConfig(context.config);
  const current = normalizeClientDeviceId(qrLogin.clientDeviceId);
  if (current) {
    if (isLegacyGeneratedQrLoginClientDeviceId(current)) {
      qrLogin.clientDeviceId = generateQrLoginClientDeviceId();
      return {
        clientDeviceId: qrLogin.clientDeviceId,
        changed: true,
      };
    }
    if (current !== qrLogin.clientDeviceId) {
      qrLogin.clientDeviceId = current;
      return {
        clientDeviceId: current,
        changed: true,
      };
    }
    return {
      clientDeviceId: current,
      changed: false,
    };
  }

  qrLogin.clientDeviceId = generateQrLoginClientDeviceId();
  return {
    clientDeviceId: qrLogin.clientDeviceId,
    changed: true,
  };
}

function ensureQrLoginConfig(config) {
  if (!config.auth) {
    config.auth = { profiles: {} };
  }
  if (!config.auth.qrLogin || typeof config.auth.qrLogin !== "object") {
    config.auth.qrLogin = {
      clientDeviceId: "",
    };
  }
  return config.auth.qrLogin;
}

function isLegacyGeneratedQrLoginClientDeviceId(value) {
  return /^cli_[0-9a-f]{16}$/.test(value);
}

function ensureProfile(config, profileName) {
  if (!config.auth) {
    config.auth = { profiles: {} };
  }
  if (!config.auth.profiles) {
    config.auth.profiles = {};
  }
  if (!config.auth.profiles[profileName]) {
    config.auth.profiles[profileName] = {
      authorization: "",
      houseId: "",
      bizType: DEFAULT_BIZ_TYPE,
      region: "cn",
    };
  }
  return config.auth.profiles[profileName];
}

async function promptForCredentials(io, current) {
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stderr,
  });

  try {
    const authorization = await question(rl, `Authorization${current.authorization ? "（回车保留当前值）" : ""}: `);
    const houseId = await question(rl, `House-Id${current.houseId ? "（回车保留当前值）" : ""}: `);
    return { authorization, houseId };
  } finally {
    rl.close();
  }
}

async function promptForHouseSelection(io, houses) {
  io.stderr.write("请选择要用于 MCP Header 的家庭：\n");
  houses.forEach((house, index) => {
    io.stderr.write(`  ${index + 1}. ${house.name} (${house.houseId})\n`);
  });
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stderr,
  });

  try {
    const answer = await question(rl, "家庭序号或 houseId: ");
    const selected = selectHouse(answer, houses);
    if (!selected) {
      throw new CliError(`无效的家庭选择：${answer}`);
    }
    return selected.houseId;
  } finally {
    rl.close();
  }
}

function selectHouse(answer, houses) {
  const text = String(answer || "").trim();
  if (!text) {
    return houses[0];
  }
  if (/^\d+$/.test(text)) {
    const index = Number(text) - 1;
    if (houses[index]) {
      return houses[index];
    }
  }
  return houses.find((house) => house.houseId === text);
}

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

module.exports = {
  promptForLoginMethod,
  runLoginCommand,
  selectBizType,
};
