"use strict";

const { StringDecoder } = require("node:string_decoder");
const { loadConfig } = require("../config/store");
const { redactProfile } = require("../config/redact");
const { CliError } = require("../errors");
const { buildWorkspaceSummary } = require("../workspace/summary");
const { runClientCommand } = require("./client");
const { runDemoCommand } = require("./demo");
const { runDoctorCommand } = require("./doctor");
const { runLoginCommand } = require("./login");
const { runMcpCommand } = require("./mcp");
const { runResourceCommand } = require("./resources");

const SHORTCUT_PAGE_SIZE = 20;

const MAIN_MENU_CHOICES = [
  "",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "0",
  "q",
  "quit",
  "exit",
  "退出",
  "house",
  "home",
  "家庭",
  "doctor",
  "diagnose",
  "诊断",
  "mcp",
  "tools",
  "tool",
  "client",
  "config",
  "配置",
  "demo",
  "login",
  "登录",
  "快捷",
  "shortcut",
  "device",
  "devices",
  "room",
  "rooms",
  "scene",
  "scenes",
  "run-scene",
  "execute-scene",
  "执行场景",
  "light",
  "lights",
];

const SHORTCUT_MENU_CHOICES = [
  "",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "0",
  "q",
  "quit",
  "exit",
  "返回",
  "house",
  "home",
  "家庭",
  "room",
  "rooms",
  "房间",
  "device",
  "devices",
  "设备",
  "scene",
  "scenes",
  "场景",
  "run-scene",
  "execute-scene",
  "执行场景",
  "light",
  "lights",
  "灯",
];

async function runHomeCommand(argv, io) {
  if (!io.stdin.isTTY) {
    throw new CliError("无参数启动需要交互式终端；脚本环境请使用 yeelight-ai --help 或具体子命令。");
  }

  const prompt = createPrompt(io);
  try {
    await ensureLoginContext(io, prompt);
    return await runMainMenu(io, prompt);
  } finally {
    prompt.close();
  }
}

async function ensureLoginContext(io, prompt) {
  const loadResult = loadConfig({ env: io.env });
  const profile = getDefaultProfile(loadResult.config);
  if (profile.authorization && profile.houseId) {
    io.stdout.write("检测到本地登录上下文：\n");
    const redacted = redactProfile(profile);
    io.stdout.write(`Authorization：${redacted.authorization}\n`);
    io.stdout.write(`House-Id：${redacted.houseId}\n`);
    io.stdout.write(`Region：${redacted.region}\n`);
    io.stdout.write(`家庭类型：${redacted.bizType === "0" ? "普通家庭" : "商照项目"}（bizType=${redacted.bizType}）\n`);
    const reuse = await confirm(prompt, "是否复用当前登录上下文？[Y/n] ", true);
    if (reuse) {
      return;
    }
  }
  io.stdout.write("开始登录并绑定家庭。\n");
  prompt.close();
  await runLoginCommand([], io);
  prompt.reopen();
}

async function runMainMenu(io, prompt) {
  for (;;) {
    renderMainMenu(io);
    const choice = await readMenuChoice(prompt, "请选择操作: ", MAIN_MENU_CHOICES);
    switch (normalizeMainMenuChoice(choice).menuChoice) {
      case "":
        break;
      case "1":
        await runMenuAction(io, () => runShortcutMenu(io, prompt));
        break;
      case "2":
        await runMenuAction(io, () => runDoctorCommand([], io));
        break;
      case "3":
        await runMenuAction(io, async () => {
          prompt.close();
          try {
            await runLoginCommand([], io);
          } finally {
            prompt.reopen();
          }
        });
        break;
      case "4":
        await runMenuAction(io, () => runMcpCommand(["list"], io));
        break;
      case "5":
        await runMenuAction(io, () => runMcpCallMenu(io, prompt));
        break;
      case "6":
        await runMenuAction(io, () => runClientMenu(io, prompt));
        break;
      case "7":
        await runMenuAction(io, () => runDemoMenu(io, prompt));
        break;
      case "house":
        await runMenuAction(io, () => runResourceCommand("house", ["show"], io));
        break;
      case "rooms":
        await runMenuAction(io, () => runPagedShortcutList(io, prompt, "room", ["list"]));
        break;
      case "devices":
        await runMenuAction(io, () => runShortcutDeviceList(io, prompt));
        break;
      case "scenes":
        await runMenuAction(io, () => runPagedShortcutList(io, prompt, "scene", ["list"]));
        break;
      case "light":
        await runMenuAction(io, () => runShortcutLightControl(io, prompt));
        break;
      case "run-scene":
        await runMenuAction(io, () => runShortcutSceneRun(io, prompt));
        break;
      case "0":
      case "q":
      case "quit":
      case "exit":
      case "退出":
        return 0;
      default:
        io.stderr.write(`未知选项：${choice}\n`);
    }
  }
}

function renderMainMenu(io) {
  const summary = buildWorkspaceSummary(loadConfig({ env: io.env }));

  io.stdout.write("\nYeelight AI CLI 工作台\n");
  io.stdout.write("状态\n");
  io.stdout.write(`当前家庭：${summary.houseId || "未绑定"}\n`);
  io.stdout.write(`Region：${summary.region}\n`);
  io.stdout.write(`家庭类型：${summary.bizTypeLabel}（bizType=${summary.bizType}）\n`);
  io.stdout.write(`Cloud MCP：${summary.mcp.cloud.summary}\n`);
  io.stdout.write(`Metadata MCP：${summary.mcp.metadata.summary}\n`);
  io.stdout.write(`推荐下一步：${formatMainMenuNextStep(summary)}\n`);
  io.stdout.write("\n常用\n");
  io.stdout.write("  1. 常用快捷操作  rooms / devices / light / run-scene\n");
  io.stdout.write("  2. 诊断当前配置  doctor\n");
  io.stdout.write("  3. 重新登录/切换家庭  login\n");
  io.stdout.write("\n高级\n");
  io.stdout.write("  4. 查看 MCP 列表  mcp\n");
  io.stdout.write("  5. 调用 MCP 工具  tools\n");
  io.stdout.write("  6. 配置客户端  client\n");
  io.stdout.write("  7. 运行 demo  demo\n");
  io.stdout.write("  0. 退出\n");
}

function formatMainMenuNextStep(summary) {
  if (!summary.loggedIn) {
    return "先完成登录和家庭绑定，或输入 login 重新登录。";
  }
  if (!summary.mcp.cloud.enabled || !summary.mcp.cloud.endpoint) {
    return "输入 doctor 排障，或运行 yeelight-ai mcp configure cloud --remote。";
  }
  return "查设备输入 devices，排障输入 doctor，高级 MCP 调用输入 tools。";
}

function normalizeMainMenuChoice(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["doctor", "diagnose", "诊断"].includes(text)) {
    return { menuChoice: "2" };
  }
  if (["mcp"].includes(text)) {
    return { menuChoice: "4" };
  }
  if (["tools", "tool"].includes(text)) {
    return { menuChoice: "5" };
  }
  if (["client", "config", "配置"].includes(text)) {
    return { menuChoice: "6" };
  }
  if (text === "demo") {
    return { menuChoice: "7" };
  }
  if (["login", "登录"].includes(text)) {
    return { menuChoice: "3" };
  }
  if (["house", "home", "家庭"].includes(text)) {
    return { menuChoice: "house" };
  }
  if (["room", "rooms", "房间"].includes(text)) {
    return { menuChoice: "rooms" };
  }
  if (["device", "devices", "设备"].includes(text)) {
    return { menuChoice: "devices" };
  }
  if (["scene", "scenes", "场景"].includes(text)) {
    return { menuChoice: "scenes" };
  }
  if (["light", "lights", "灯"].includes(text)) {
    return { menuChoice: "light" };
  }
  if (["run-scene", "execute-scene", "执行场景"].includes(text)) {
    return { menuChoice: "run-scene" };
  }
  if (["快捷", "shortcut"].includes(text)) {
    return { menuChoice: "1" };
  }
  return { menuChoice: text };
}

async function runMenuAction(io, action) {
  try {
    await action();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    io.stderr.write(`操作失败：${message}\n`);
  }
}

async function runMcpCallMenu(io, prompt) {
  for (;;) {
    try {
      const mcpId = await selectMcpForCall(io, prompt);
      if (!mcpId) {
        return;
      }
      const next = await runMcpToolSession(io, prompt, mcpId);
      if (next === "main") {
        return;
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      io.stderr.write(`操作失败：${message}\n`);
    }
  }
}

async function selectMcpForCall(io, prompt) {
  const id = await prompt.question("MCP [cloud/metadata/lan，默认 cloud，0 返回主菜单]: ");
  if (isBackChoice(id)) {
    return "";
  }
  const normalizedId = normalizeChoice(id, "cloud", ["cloud", "metadata", "lan"]);
  if (normalizedId === "lan") {
    const ready = await ensureLanConfigured(io, prompt);
    if (!ready) {
      return "";
    }
  }
  return normalizedId;
}

async function runMcpToolSession(io, prompt, normalizedId) {
  io.stdout.write(`已进入 ${normalizedId} MCP。输入 tools 查看工具列表，switch 切换 MCP，0 返回主菜单。\n`);
  let listedTools = false;
  let pendingToolName = "";
  let askInitialToolsList = true;
  for (;;) {
    try {
      if (askInitialToolsList) {
        const shouldContinue = await askInitialMcpToolsList(io, prompt, normalizedId, (toolName) => {
          pendingToolName = toolName;
        });
        askInitialToolsList = false;
        if (shouldContinue === "main") {
          return;
        }
        if (shouldContinue === "switch") {
          return;
        }
        listedTools = shouldContinue === "listed";
      }
      const next = await runSingleMcpToolAction(io, prompt, normalizedId, listedTools, pendingToolName);
      pendingToolName = "";
      if (next === "main") {
        return "main";
      }
      if (next === "switch") {
        return "switch";
      }
      if (next === "listed") {
        listedTools = true;
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      io.stderr.write(`操作失败：${message}\n`);
    }
  }
}

async function askInitialMcpToolsList(io, prompt, normalizedId, setPendingToolName) {
  const listToolsAnswer = await prompt.question("是否先查看工具列表？[Y/n] ");
  if (isBackChoice(listToolsAnswer)) {
    return "main";
  }
  if (isSwitchChoice(listToolsAnswer)) {
    return "switch";
  }
  const pendingToolName = parseToolNameFromListAnswer(listToolsAnswer);
  if (pendingToolName) {
    setPendingToolName(pendingToolName);
  }
  const listTools = pendingToolName ? false : parseConfirmAnswer(listToolsAnswer, true);
  if (listTools) {
    const code = await runMcpCommand(["tools", normalizedId], io);
    if (code !== 0) {
      const continueManual = await confirm(prompt, "工具列表获取失败，是否仍手动输入工具名继续？[y/N] ", false);
      if (!continueManual) {
        return "continue";
      }
    } else {
      io.stdout.write("提示：输入工具名会先展示参数说明；只想看参数不调用，可输入 ?工具名。\n");
      return "listed";
    }
  }
  return "continue";
}

async function runSingleMcpToolAction(io, prompt, normalizedId, listedTools, pendingToolName) {
  const toolName = pendingToolName || await prompt.question(`${normalizedId} 工具名（?工具名看参数，tools 看列表，switch 切换 MCP，0 返回主菜单）: `);
  if (isBackChoice(toolName)) {
    return "main";
  }
  if (isSwitchChoice(toolName)) {
    return "switch";
  }
  if (isToolsListChoice(toolName)) {
    const code = await runMcpCommand(["tools", normalizedId], io);
    return code === 0 ? "listed" : "continue";
  }
  const normalizedToolName = String(toolName || "").trim();
  if (!normalizedToolName) {
    throw new CliError("工具名不能为空。");
  }
  const describeOnly = normalizedToolName.startsWith("?");
  const callToolName = describeOnly ? normalizedToolName.slice(1).trim() : normalizedToolName;
  if (!callToolName) {
    throw new CliError("工具名不能为空。");
  }
  const showSchema = describeOnly || await shouldShowToolSchema(prompt, listedTools, Boolean(pendingToolName));
  if (showSchema) {
    const code = await runMcpCommand(["describe", normalizedId, callToolName], io);
    if (code !== 0) {
      const continueCall = await confirm(prompt, "参数说明获取失败，是否仍继续调用？[y/N] ", false);
      if (!continueCall) {
        return "continue";
      }
    }
  }
  if (describeOnly) {
    return "continue";
  }
  const args = await readJsonArgument(prompt);
  const callArgs = ["call", normalizedId, callToolName];
  if (String(args || "").trim()) {
    callArgs.push("--args", String(args).trim());
  }
  await runMcpCommand(callArgs, io);
  return "continue";
}

async function readJsonArgument(prompt) {
  const firstLine = await prompt.question("参数 JSON object [默认 {}，支持多行粘贴]: ");
  const lines = [firstLine];
  let text = String(firstLine || "");
  if (!text.trim()) {
    return "";
  }
  while (shouldReadMoreJson(text) && lines.length < 200) {
    const nextLine = await prompt.question("... ");
    if (!nextLine && typeof prompt.isClosed === "function" && prompt.isClosed()) {
      break;
    }
    lines.push(nextLine);
    text = lines.join("\n");
  }
  if (shouldReadMoreJson(text)) {
    throw new CliError("参数 JSON object 看起来还没有闭合，请检查括号或改用单行 JSON。");
  }
  return text;
}

async function shouldShowToolSchema(prompt, listedTools, hasPendingToolName) {
  if (hasPendingToolName || listedTools) {
    return confirm(prompt, "是否查看该工具参数说明？[Y/n] ", true);
  }
  return true;
}

function shouldReadMoreJson(text) {
  const value = String(text || "").trim();
  if (!value) {
    return false;
  }
  try {
    JSON.parse(value);
    return false;
  } catch (error) {
    return hasOpenJsonContainer(value);
  }
}

function isLikelyIncompleteJsonError(error) {
  const message = error && error.message ? error.message : "";
  return (
    message.includes("Unexpected end of JSON input") ||
    message.includes("Expected property name or '}'") ||
    message.includes("Expected ',' or '}'") ||
    message.includes("Expected ',' or ']'") ||
    message.includes("Unterminated string") ||
    message.includes("Bad control character")
  );
}

function hasOpenJsonContainer(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (const char of String(text || "")) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }
    if (char === "}") {
      if (stack[stack.length - 1] === "{") {
        stack.pop();
      }
      continue;
    }
    if (char === "]") {
      if (stack[stack.length - 1] === "[") {
        stack.pop();
      }
    }
  }
  return inString || stack.length > 0;
}

async function ensureLanConfigured(io, prompt) {
  const loadResult = loadConfig({ env: io.env });
  const lan = loadResult.config.mcp.lan || {};
  if (lan.enabled && lan.endpoint) {
    return true;
  }
  io.stderr.write("LAN MCP 未启用或未配置 gateway IP。\n");
  const configure = await confirm(prompt, "是否现在配置 LAN MCP？[Y/n] ", true);
  if (!configure) {
    io.stderr.write("已跳过 LAN MCP 配置。\n");
    return false;
  }
  const defaultGateway = lan.gatewayIp || io.env.YEELIGHT_AI_LAN_GATEWAY_IP || io.env.YEELIGHT_GATEWAY_IP || "";
  const suffix = defaultGateway ? `，默认 ${defaultGateway}` : "";
  const value = await prompt.question(`Gateway IP 或 endpoint${suffix}: `);
  const target = String(value || defaultGateway).trim();
  if (!target) {
    io.stderr.write("未输入 gateway IP，已取消 LAN MCP 配置。\n");
    return false;
  }
  const args = ["configure", "lan"];
  if (/^https?:\/\//.test(target)) {
    args.push("--endpoint", target);
  } else {
    args.push("--gateway-ip", target);
  }
  await runMcpCommand(args, io);
  return true;
}

async function runClientMenu(io, prompt) {
  for (;;) {
    const shouldReturn = await runSingleClientMenu(io, prompt);
    if (shouldReturn) {
      return;
    }
  }
}

async function runSingleClientMenu(io, prompt) {
  const target = await prompt.question("客户端 [cursor/claude/vscode，默认 cursor，0 返回]: ");
  if (isBackChoice(target)) {
    return true;
  }
  const normalizedTarget = normalizeChoice(target, "cursor", ["cursor", "claude", "vscode"]);
  const write = await confirm(prompt, "是否写入客户端配置？[y/N] ", false);
  const args = ["configure", normalizedTarget];
  if (write) {
    args.push("--write", "--yes");
  }
  await runClientCommand(args, io);
  return false;
}

async function runDemoMenu(io, prompt) {
  for (;;) {
    const shouldReturn = await runSingleDemoMenu(io, prompt);
    if (shouldReturn) {
      return;
    }
  }
}

async function runSingleDemoMenu(io, prompt) {
  const target = await prompt.question("Demo [cloud/metadata/lan，默认 cloud，0 返回]: ");
  if (isBackChoice(target)) {
    return true;
  }
  const normalizedTarget = normalizeChoice(target, "cloud", ["cloud", "metadata", "lan"]);
  const args = [normalizedTarget];
  if (normalizedTarget === "lan") {
    const probe = await confirm(prompt, "LAN demo 是否执行只读探测？[y/N] ", false);
    if (probe) {
      args.push("--probe");
    }
  }
  await runDemoCommand(args, io);
  return false;
}

async function runShortcutMenu(io, prompt) {
  for (;;) {
    io.stdout.write("\n常用快捷操作\n");
    io.stdout.write("查询\n");
    io.stdout.write("  1. 查看当前家庭  house\n");
    io.stdout.write("  2. 查看房间列表  rooms\n");
    io.stdout.write("  3. 查看设备列表  devices\n");
    io.stdout.write("  4. 查看场景列表  scenes\n");
    io.stdout.write("控制\n");
    io.stdout.write("  5. 控制灯  light\n");
    io.stdout.write("  6. 执行场景  run-scene\n");
    io.stdout.write("  0. 返回主菜单\n");
    const choice = await readMenuChoice(prompt, "请选择快捷操作: ", SHORTCUT_MENU_CHOICES);
    switch (normalizeShortcutChoice(choice)) {
      case "":
        break;
      case "1":
        await runMenuAction(io, () => runResourceCommand("house", ["show"], io));
        break;
      case "2":
        await runMenuAction(io, () => runPagedShortcutList(io, prompt, "room", ["list"]));
        break;
      case "3":
        await runMenuAction(io, () => runShortcutDeviceList(io, prompt));
        break;
      case "4":
        await runMenuAction(io, () => runPagedShortcutList(io, prompt, "scene", ["list"]));
        break;
      case "5":
        await runMenuAction(io, () => runShortcutLightControl(io, prompt));
        break;
      case "6":
        await runMenuAction(io, () => runShortcutSceneRun(io, prompt));
        break;
      case "0":
      case "q":
      case "quit":
      case "exit":
      case "返回":
        return;
      default:
        io.stderr.write(`未知选项：${choice}\n`);
    }
  }
}

function normalizeShortcutChoice(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["house", "home", "家庭"].includes(text)) {
    return "1";
  }
  if (["room", "rooms", "房间"].includes(text)) {
    return "2";
  }
  if (["device", "devices", "设备"].includes(text)) {
    return "3";
  }
  if (["scene", "scenes", "场景"].includes(text)) {
    return "4";
  }
  if (["run-scene", "execute-scene", "执行场景"].includes(text)) {
    return "6";
  }
  if (["light", "lights", "灯"].includes(text)) {
    return "5";
  }
  return text;
}

async function runShortcutDeviceList(io, prompt) {
  const roomId = await prompt.question("房间 ID [可选，直接回车查看全部，0 返回]: ");
  if (isBackChoice(roomId)) {
    return;
  }
  const args = ["list"];
  if (String(roomId || "").trim()) {
    args.push("--room", String(roomId).trim());
  }
  await runPagedShortcutList(io, prompt, "device", args);
}

async function runShortcutLightControl(io, prompt) {
  const action = await prompt.question("动作 [on/off/brightness/color-temperature，默认 on，0 返回]: ");
  if (isBackChoice(action)) {
    return;
  }
  const normalizedAction = normalizeChoice(action, "on", ["on", "off", "brightness", "color-temperature"]);
  const showDevices = await confirm(prompt, "是否先查看设备列表？[Y/n] ", true);
  if (showDevices) {
    await runPagedShortcutList(io, prompt, "device", ["list"]);
  }
  const deviceId = await prompt.question("设备 ID [0 返回]: ");
  if (isBackChoice(deviceId)) {
    return;
  }
  const args = [normalizedAction, String(deviceId).trim()];
  if (normalizedAction === "brightness") {
    args.push(await promptRequiredValue(prompt, "亮度 [1-100]: ", "亮度不能为空。"));
  }
  if (normalizedAction === "color-temperature") {
    args.push(await promptRequiredValue(prompt, "色温 [2700-6500]: ", "色温不能为空。"));
  }
  const execute = await confirm(prompt, "是否真实执行？默认只生成 dry-run 计划。[y/N] ", false);
  if (execute) {
    args.push("--yes");
  }
  await runResourceCommand("light", args, io);
}

async function runShortcutSceneRun(io, prompt) {
  const showScenes = await confirm(prompt, "是否先查看场景列表？[Y/n] ", true);
  if (showScenes) {
    await runPagedShortcutList(io, prompt, "scene", ["list"]);
  }
  const sceneId = await prompt.question("场景 ID [0 返回]: ");
  if (isBackChoice(sceneId)) {
    return;
  }
  const args = ["run", String(sceneId).trim()];
  const execute = await confirm(prompt, "是否真实执行？默认只生成 dry-run 计划。[y/N] ", false);
  if (execute) {
    args.push("--yes");
  }
  await runResourceCommand("scene", args, io);
}

async function runPagedShortcutList(io, prompt, resource, baseArgs) {
  let cursor = "";
  for (;;) {
    let latestOutput = null;
    const pageArgs = [...baseArgs, "--limit", String(SHORTCUT_PAGE_SIZE)];
    if (cursor) {
      pageArgs.push("--cursor", cursor);
    }
    const code = await runResourceCommand(resource, pageArgs, {
      ...io,
      onResourceOutput(output) {
        latestOutput = output;
        if (typeof io.onResourceOutput === "function") {
          io.onResourceOutput(output);
        }
      },
    });
    if (code !== 0) {
      return code;
    }
    const nextCursor = latestOutput && latestOutput.nextCursor ? String(latestOutput.nextCursor) : "";
    if (!nextCursor) {
      return code;
    }
    const answer = await prompt.question("翻页 [n 下一页，直接回车继续，0 返回]: ");
    if (isBackChoice(answer)) {
      return 0;
    }
    if (["n", "next", "下一页"].includes(String(answer || "").trim().toLowerCase())) {
      cursor = nextCursor;
      continue;
    }
    return code;
  }
}

async function promptRequiredValue(prompt, message, errorMessage) {
  const value = await prompt.question(message);
  if (!String(value || "").trim()) {
    throw new CliError(errorMessage);
  }
  return String(value).trim();
}

async function readMenuChoice(prompt, message, allowedChoices) {
  const allowed = new Set(allowedChoices);
  for (;;) {
    const raw = await prompt.question(message);
    const parsed = parseMenuChoice(raw, allowed);
    if (!parsed.ignore) {
      return parsed.choice;
    }
  }
}

function parseMenuChoice(value, allowed) {
  const text = String(value || "").trim();
  const promptEcho = text.match(/^请选择(?:快捷)?操作\s*[:：]\s*(.*)$/);
  if (promptEcho) {
    const choice = promptEcho[1].trim();
    const matchedChoice = findAllowedChoice(choice, allowed);
    return matchedChoice ? { choice: matchedChoice, ignore: false } : { choice: "", ignore: true };
  }
  const matchedChoice = findAllowedChoice(text, allowed);
  if (matchedChoice) {
    return { choice: matchedChoice, ignore: false };
  }
  if (isLikelyCliEchoLine(text)) {
    return { choice: "", ignore: true };
  }
  return { choice: text, ignore: false };
}

function findAllowedChoice(value, allowed) {
  const text = String(value || "").trim();
  if (allowed.has(text)) {
    return text;
  }
  const lower = text.toLowerCase();
  return allowed.has(lower) ? lower : "";
}

function isLikelyCliEchoLine(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  if ([
    "Yeelight AI CLI",
    "Yeelight AI CLI 工作台",
    "状态",
    "常用",
    "高级",
    "常用快捷操作",
    "查询",
    "控制",
  ].includes(text)) {
    return true;
  }
  if (/^(当前家庭|Cloud MCP|Metadata MCP|推荐下一步)：/.test(text)) {
    return true;
  }
  if (/^\d+\.\s+/.test(text)) {
    return true;
  }
  if (/^(House ID|Room ID|Device ID|Scene ID)\b/.test(text)) {
    return true;
  }
  if (/^-{3,}(?:\s{2,}-{3,})*$/.test(text)) {
    return true;
  }
  if (/^\d+\s{2,}\S/.test(text)) {
    return true;
  }
  return /^(提示：|建议：|操作失败：|已生成执行计划|已执行：|真实执行请追加|-\s+)/.test(text);
}

function normalizeChoice(value, fallback, allowed) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return fallback;
  }
  if (!allowed.includes(text)) {
    throw new CliError(`不支持的选项：${value}`);
  }
  return text;
}

function isBackChoice(value) {
  return ["0", "back", "b", "return", "返回", "上一级"].includes(String(value || "").trim().toLowerCase());
}

function isSwitchChoice(value) {
  return ["switch", "s", "切换", "切换mcp", "切换 mcp"].includes(String(value || "").trim().toLowerCase());
}

function isToolsListChoice(value) {
  return ["tools", "tool", "list", "ls", "工具", "工具列表"].includes(String(value || "").trim().toLowerCase());
}

function getDefaultProfile(config) {
  return config.auth && config.auth.profiles ? config.auth.profiles.default || {} : {};
}

async function confirm(prompt, message, defaultValue) {
  return parseConfirmAnswer(await prompt.question(message), defaultValue);
}

function parseConfirmAnswer(value, defaultValue) {
  const answer = String(value || "").trim().toLowerCase();
  if (!answer) {
    return defaultValue;
  }
  return ["y", "yes"].includes(answer);
}

function parseToolNameFromListAnswer(value) {
  const answer = String(value || "").trim();
  if (!answer || ["y", "yes", "n", "no"].includes(answer.toLowerCase())) {
    return "";
  }
  return answer;
}

function createPrompt(io) {
  const decoder = new StringDecoder("utf8");
  let listening = false;
  let closed = false;
  const bufferedLines = [];
  const waiters = [];
  let pending = "";
  let lastChunkEndedWithCr = false;
  let onData = null;
  let onEnd = null;

  function settleWaiters(value) {
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter(value);
    }
  }

  function pushLine(line) {
    const waiter = waiters.shift();
    if (waiter) {
      waiter(line);
    } else {
      bufferedLines.push(line);
    }
  }

  function acceptText(text) {
    let normalized = String(text || "");
    if (lastChunkEndedWithCr && normalized.startsWith("\n")) {
      normalized = normalized.slice(1);
    }
    lastChunkEndedWithCr = normalized.endsWith("\r");
    pending += normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (;;) {
      const newlineIndex = pending.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }
      const line = pending.slice(0, newlineIndex);
      pending = pending.slice(newlineIndex + 1);
      pushLine(line);
    }
  }

  function detach() {
    if (!listening) {
      return;
    }
    io.stdin.off("data", onData);
    io.stdin.off("end", onEnd);
    listening = false;
  }

  function reopen() {
    if (listening) {
      return;
    }
    closed = false;
    onData = (chunk) => acceptText(decoder.write(chunk));
    onEnd = () => {
      detach();
      const rest = decoder.end();
      if (rest) {
        acceptText(rest);
      }
      closed = true;
      settleWaiters("");
    };
    io.stdin.on("data", onData);
    io.stdin.once("end", onEnd);
    if (typeof io.stdin.resume === "function") {
      io.stdin.resume();
    }
    listening = true;
  }

  reopen();
  return {
    question(message) {
      reopen();
      if (bufferedLines.length > 0) {
        io.stderr.write(message);
        return Promise.resolve(bufferedLines.shift());
      }
      if (closed) {
        io.stderr.write(message);
        return Promise.resolve("");
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
        io.stderr.write(message);
      });
    },
    close() {
      detach();
      settleWaiters("");
      if (io.stdin && typeof io.stdin.pause === "function") {
        io.stdin.pause();
      }
    },
    isClosed() {
      return closed && bufferedLines.length === 0;
    },
    reopen,
  };
}

module.exports = {
  isLikelyIncompleteJsonError,
  parseToolNameFromListAnswer,
  readJsonArgument,
  runHomeCommand,
  hasOpenJsonContainer,
  shouldReadMoreJson,
};
