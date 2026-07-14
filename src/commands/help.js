"use strict";

const { version } = require("../../package.json");

function printHelp(io) {
  const start = [
    "  yeelight-ai",
    "  yeelight-ai status [--json]",
    "  yeelight-ai quick [--json]",
    "  yeelight-ai doctor [--mcp cloud|metadata|lan] [--json] [--probe] [--timeout-ms 30000]",
  ];
  const auth = [
    "  yeelight-ai login",
    "  yeelight-ai login --method qr [--client-device-id <id>] [--house-id <id>] [--biz-type 0|1]",
  ];
  auth.push(
    "  yeelight-ai login --manual",
    "  yeelight-ai login --authorization <token> [--client-id <id>] [--house-id <id>] [--biz-type 0|1]",
  );
  const resources = [
    "  yeelight-ai house show [--json|--format json]",
    "  yeelight-ai room list [--limit <n>] [--cursor <cursor>] [--all] [--json|--format json]",
    "  yeelight-ai device list [--room <roomId>] [--limit <n>] [--cursor <cursor>] [--all] [--json|--format json]",
    "  yeelight-ai device show <deviceId> [--json|--format json]",
    "  yeelight-ai scene list [--limit <n>] [--cursor <cursor>] [--all] [--json|--format json]",
    "  yeelight-ai scene run <sceneId> [--dry-run] [--yes] [--json|--format json]",
    "  yeelight-ai light on|off <deviceId> [--dry-run] [--yes] [--json|--format json]",
    "  yeelight-ai light brightness <deviceId> <1-100> [--dry-run] [--yes] [--json|--format json]",
    "  yeelight-ai light color-temperature <deviceId> <2700-6500> [--dry-run] [--yes] [--json|--format json]",
  ];
  const advanced = [
    "  yeelight-ai mcp list [--json]",
    "  yeelight-ai mcp inspect <cloud|metadata|lan> [--json]",
    "  yeelight-ai mcp tools <cloud|metadata|lan> [--json] [--raw] [--timeout-ms 30000] [--remote] [--cursor <cursor>] [--all]",
    "  yeelight-ai mcp groups metadata [--json]",
    "  yeelight-ai mcp describe <cloud|metadata|lan> <tool> [--json] [--timeout-ms 30000] [--remote]",
    "  yeelight-ai mcp call <cloud|metadata|lan> <tool> [--args '{\"key\":\"value\"}'] [--json] [--raw] [--data-only] [--timeout-ms 30000]",
    "  yeelight-ai mcp configure <cloud|metadata> [--local|--remote|--endpoint <url>] [--json]",
    "  yeelight-ai mcp configure lan --gateway-ip <ip> [--enable] [--json]",
    "  yeelight-ai config get [path] [--json] [--show-secrets]",
    "  yeelight-ai client configure <cursor|claude|vscode> [--json] [--write] [--yes]",
    "  yeelight-ai demo <cloud|metadata|lan> [--json]"
  ];
  const { isInternalMode } = require("../internal");
  if (isInternalMode(io.env)) {
    advanced.push("  yeelight-ai release check [--json]");
  }
  io.stdout.write(`Yeelight AI CLI ${version}

用法：

启动与诊断：
${start.join("\n")}

业务快捷命令：
${resources.join("\n")}

登录与账号：
${auth.join("\n")}

高级 MCP 与客户端：
${advanced.join("\n")}

说明：
  直接运行 yeelight-ai 会检查登录上下文、按需登录并绑定家庭，然后进入工作台。
  家庭类型支持 bizType=0 普通家庭、bizType=1 商照项目；交互登录会在拉取家庭前询问。
  日常查看和控制优先使用 house、room、device、scene、light 业务快捷命令；mcp 子命令用于高级排障和原始工具调用。
`);
}

function printVersion(io) {
  io.stdout.write(`${version}\n`);
}

module.exports = {
  printHelp,
  printVersion,
};
