"use strict";

const readline = require("readline");
const { getBooleanFlag, getStringFlag, hasFlag, parseArgs } = require("../args");
const { loadConfig, saveConfig } = require("../config/store");
const { redactProfile } = require("../config/redact");
const { CliError } = require("../errors");
const { writeJson } = require("../output/json");
const { HouseClient } = require("../auth/houseClient");
const { PasswordLoginClient } = require("../auth/passwordClient");
const { normalizeAuthorization } = require("../security/bearer");
const { isInternalMode } = require("../internal");

const LOGIN_METHODS = new Set(["password", "qr", "manual"]);

async function runLoginCommand(argv, io) {
  const { flags } = parseArgs(argv);
  const asJson = getBooleanFlag(flags, "json", false);
  const profileName = getStringFlag(flags, "profile", "default");
  const loadResult = loadConfig({ env: io.env });
  const config = loadResult.config;

  const current = ensureProfile(config, profileName);
  const explicitQr = getBooleanFlag(flags, "qr", false);
  const explicitManual = getBooleanFlag(flags, "manual", false);
  const methodFlag = getStringFlag(flags, "method", "");
  if (explicitQr && (explicitManual || methodFlag || hasQrConflictInput(flags))) {
    throw new CliError("login --qr 不能和 --manual、--method、--authorization、--client-id、--account 或 --password 同时使用。");
  }
  if (explicitManual && methodFlag) {
    throw new CliError("login --manual 不能和 --method 同时使用。");
  }
  const method = await resolveLoginMethod({ flags, methodFlag, explicitQr, explicitManual, io, internal: isInternalMode(io.env) });

  if (method === "qr") {
    return runQrLogin(flags, {
      asJson,
      profileName,
      config,
      io,
    });
  }
  if (method === "password") {
    return runPasswordLogin(flags, {
      asJson,
      profileName,
      config,
      current,
      io,
    });
  }

  const authorizationInput = getStringFlag(flags, "authorization", "");
  const clientIdInput = getStringFlag(flags, "client-id", "");
  const houseIdInput = getStringFlag(flags, "house-id", "");

  const shouldPrompt = explicitManual || (!authorizationInput && !clientIdInput && !houseIdInput);
  const promptDefaults = {
    authorization: authorizationInput || current.authorization,
    clientId: clientIdInput || current.clientId,
    houseId: houseIdInput || current.houseId,
  };
  const answers = shouldPrompt ? await promptForCredentials(io, promptDefaults) : {};

  const authorization = normalizeAuthorization(authorizationInput || answers.authorization || current.authorization);
  const clientId = clientIdInput || answers.clientId || current.clientId;
  const houseId = houseIdInput || answers.houseId || current.houseId;

  if (!authorization) {
    throw new CliError("Authorization 不能为空。");
  }
  const selectedHouseId = await resolveHouseId({
    flags,
    io,
    asJson,
    credentials: {
      authorization,
      clientId,
    },
    explicitHouseId: houseId,
    currentHouseId: current.houseId,
    baseUrl: getStringFlag(flags, "base-url", io.env.YEELIGHT_PASSWORD_LOGIN_BASE_URL || ""),
  });

  config.auth.profiles[profileName] = {
    authorization,
    clientId,
    houseId: selectedHouseId,
  };
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
    io.stdout.write(`Client-Id：${result.credentials.clientId}\n`);
    io.stdout.write(`House-Id：${result.credentials.houseId}\n`);
  }
  return 0;
}

async function resolveLoginMethod(options) {
  const flags = options.flags;
  const allowQr = Boolean(options.internal);
  if (options.explicitQr) {
    if (!allowQr) {
      throw new CliError("扫码登录暂未开放，请使用账密登录或手动 token。");
    }
    return "qr";
  }
  if (options.explicitManual || hasFlag(flags, "authorization")) {
    if (options.methodFlag && options.methodFlag.toLowerCase() !== "manual") {
      throw new CliError("--authorization 只能用于 manual 登录方式。");
    }
    return "manual";
  }
  if (options.methodFlag) {
    const method = options.methodFlag.toLowerCase();
    if (!LOGIN_METHODS.has(method)) {
      throw new CliError(`不支持的登录方式：${options.methodFlag}。可选：${formatLoginMethods(allowQr)}。`);
    }
    if (method === "qr" && !allowQr) {
      throw new CliError("扫码登录暂未开放，请使用账密登录或手动 token。");
    }
    if (method === "qr" && hasQrConflictInput(flags)) {
      throw new CliError("login --method qr 不能和 --authorization、--client-id、--account 或 --password 同时使用。");
    }
    return method;
  }
  if (hasFlag(flags, "account") || hasFlag(flags, "password")) {
    return "password";
  }
  if (getBooleanFlag(flags, "json", false)) {
    throw new CliError(allowQr ? "请通过 --method password、--method qr 或 --authorization 指定登录方式。" : "请通过 --method password 或 --authorization 指定登录方式。");
  }
  return promptForLoginMethod(options.io, { allowQr });
}

function hasQrConflictInput(flags) {
  return hasFlag(flags, "authorization") || hasFlag(flags, "client-id") || hasFlag(flags, "account") || hasFlag(flags, "password");
}

function formatLoginMethods(allowQr) {
  return allowQr ? "password、qr、manual" : "password、manual";
}

async function promptForLoginMethod(io, options = {}) {
  const allowQr = Boolean(options.allowQr);
  io.stderr.write("请选择登录方式：\n");
  io.stderr.write("  1. password 账密登录（推荐，当前可用）\n");
  if (allowQr) {
    io.stderr.write("  2. qr 扫码登录（内部预览）\n");
    io.stderr.write("  3. manual 手动粘贴 token\n");
  } else {
    io.stderr.write("  2. manual 手动粘贴 token\n");
  }
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stderr,
  });
  try {
    const prompt = allowQr ? "登录方式 [password/qr/manual，默认 password]: " : "登录方式 [password/manual，默认 password]: ";
    const answer = (await question(rl, prompt)).toLowerCase();
    if (!answer || answer === "1" || answer === "password") {
      return "password";
    }
    if (allowQr && (answer === "2" || answer === "qr")) {
      return "qr";
    }
    if (answer === "manual" || (!allowQr && answer === "2") || (allowQr && answer === "3")) {
      return "manual";
    }
    if (answer === "qr") {
      throw new CliError("扫码登录暂未开放，请使用账密登录或手动 token。");
    }
    throw new CliError(`不支持的登录方式：${answer}`);
  } finally {
    rl.close();
  }
}

async function runPasswordLogin(flags, context) {
  if (hasFlag(flags, "authorization")) {
    throw new CliError("账密登录不能和 --authorization 同时使用。");
  }
  const accountInput = getStringFlag(flags, "account", "");
  const passwordInput = getStringFlag(flags, "password", "");
  const clientIdInput = getStringFlag(flags, "client-id", "");
  const houseIdInput = getStringFlag(flags, "house-id", "");
  const answers = accountInput && passwordInput
    ? {}
    : await promptForPasswordLogin(context.io, { account: accountInput });
  const account = accountInput || answers.account;
  const password = passwordInput || answers.password;
  if (!account) {
    throw new CliError("账号不能为空。");
  }
  if (!password) {
    throw new CliError("密码不能为空。");
  }

  const client = new PasswordLoginClient({
    baseUrl: getStringFlag(flags, "base-url", context.io.env.YEELIGHT_PASSWORD_LOGIN_BASE_URL || ""),
  });
  const credentials = await client.login({ account, password });
  if (!credentials.authorization) {
    throw new CliError("账密登录成功响应中没有 access token。");
  }
  const selectedHouseId = await resolveHouseId({
    flags,
    io: context.io,
    asJson: context.asJson,
    credentials: {
      authorization: credentials.authorization,
      clientId: clientIdInput || credentials.clientId || context.current.clientId || "",
    },
    explicitHouseId: houseIdInput,
    currentHouseId: context.current.houseId,
    baseUrl: getStringFlag(flags, "base-url", context.io.env.YEELIGHT_PASSWORD_LOGIN_BASE_URL || ""),
  });

  context.config.auth.profiles[context.profileName] = {
    authorization: credentials.authorization,
    clientId: clientIdInput || credentials.clientId || context.current.clientId || "",
    houseId: selectedHouseId || credentials.houseId || context.current.houseId || "",
  };
  const path = saveConfig(context.config, { env: context.io.env });
  const result = {
    ok: true,
    method: "password",
    path,
    profile: context.profileName,
    credentials: redactProfile(context.config.auth.profiles[context.profileName]),
  };

  if (context.asJson) {
    writeJson(context.io, result);
  } else {
    context.io.stdout.write(`已通过账密登录并保存凭证：${context.profileName}\n`);
    context.io.stdout.write(`Authorization：${result.credentials.authorization}\n`);
    context.io.stdout.write(`Client-Id：${result.credentials.clientId}\n`);
    context.io.stdout.write(`House-Id：${result.credentials.houseId}\n`);
  }
  return 0;
}

async function resolveHouseId(options) {
  if (options.explicitHouseId) {
    return options.explicitHouseId;
  }
  const houses = await new HouseClient({ baseUrl: options.baseUrl }).listHouses(options.credentials);
  if (houses.length === 0) {
    if (options.currentHouseId) {
      return options.currentHouseId;
    }
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

async function runQrLogin(flags, context) {
  const { runQrLoginFlow } = require("../auth/qrLogin");
  const qrResult = await runQrLoginFlow({
    io: context.io,
    json: context.asJson,
    baseUrl: getStringFlag(flags, "base-url", context.io.env.YEELIGHT_QR_LOGIN_BASE_URL || ""),
    device: getStringFlag(flags, "device", context.io.env.YEELIGHT_QR_LOGIN_DEVICE || ""),
    projectId: getStringFlag(flags, "project-id", ""),
    houseId: getStringFlag(flags, "house-id", ""),
    timeoutMs: Number(getStringFlag(flags, "timeout-ms", "") || 180000),
    pollIntervalMs: Number(getStringFlag(flags, "poll-interval-ms", "") || 3000),
    noWait: getBooleanFlag(flags, "no-wait", false),
  });

  if (!qrResult.credentials) {
    const result = {
      ok: true,
      status: qrResult.status,
      qrCodeId: qrResult.qrCodeId,
      device: qrResult.device,
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

  const previous = ensureProfile(context.config, context.profileName);
  const authorization = qrResult.credentials.authorization;
  const clientId = qrResult.credentials.clientId || previous.clientId || "";
  const houseId = qrResult.credentials.houseId || getStringFlag(flags, "house-id", "");
  const selectedHouseId = await resolveHouseId({
    flags,
    io: context.io,
    asJson: context.asJson,
    credentials: {
      authorization,
      clientId,
    },
    explicitHouseId: houseId,
    currentHouseId: previous.houseId,
    baseUrl: getStringFlag(flags, "base-url", context.io.env.YEELIGHT_QR_LOGIN_BASE_URL || ""),
  });
  context.config.auth.profiles[context.profileName] = {
    authorization,
    clientId,
    houseId: selectedHouseId,
  };
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
    context.io.stdout.write(`Client-Id：${result.credentials.clientId}\n`);
    context.io.stdout.write(`House-Id：${result.credentials.houseId}\n`);
  }
  return 0;
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
      clientId: "",
      houseId: "",
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
    const clientId = await question(rl, `Client-Id${current.clientId ? "（回车保留当前值）" : ""}: `);
    const houseId = await question(rl, `House-Id${current.houseId ? "（回车保留当前值）" : ""}: `);
    return { authorization, clientId, houseId };
  } finally {
    rl.close();
  }
}

async function promptForPasswordLogin(io, current) {
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stderr,
  });

  try {
    const account = current.account || await question(rl, "账号（手机号/邮箱）: ");
    const password = await questionHidden(rl, "密码: ");
    return { account, password };
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

function questionHidden(rl, prompt) {
  const output = rl.output;
  const originalWrite = output && output.write;
  if (!output || typeof originalWrite !== "function") {
    return question(rl, prompt);
  }
  return new Promise((resolve) => {
    output.write(prompt);
    output.write = function writeMasked(value) {
      if (String(value).includes("\n")) {
        return originalWrite.apply(output, arguments);
      }
      return true;
    };
    rl.question("", (answer) => {
      output.write = originalWrite;
      output.write("\n");
      resolve(answer.trim());
    });
  });
}

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

module.exports = {
  runLoginCommand,
};
