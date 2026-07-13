"use strict";

const readline = require("readline");
const { getBooleanFlag, parseArgs } = require("../args");
const { buildCursorConfig, getCursorConfigPath, writeCursorConfig } = require("../clients/cursor");
const { buildClaudeConfig, getClaudeConfigPath, writeClaudeConfig } = require("../clients/claude");
const { buildVscodeConfig, getVscodeConfigPath, writeVscodeConfig } = require("../clients/vscode");
const { loadConfig } = require("../config/store");
const { CliError } = require("../errors");
const { writeJson } = require("../output/json");

async function runClientCommand(argv, io) {
  const { positionals, flags } = parseArgs(argv);
  const action = positionals[0];
  const target = positionals[1];
  if (action !== "configure" || !["cursor", "claude", "vscode"].includes(target)) {
    throw new CliError("client configure 支持 cursor、claude、vscode。");
  }

  const asJson = getBooleanFlag(flags, "json", false);
  const write = getBooleanFlag(flags, "write", false);
  const yes = getBooleanFlag(flags, "yes", false);
  const concrete = getBooleanFlag(flags, "concrete-headers", false);
  const loadResult = loadConfig({ env: io.env });
  const client = getClientBuilder(target);
  const generatedConfig = client.build(loadResult.config, { useEnvPlaceholders: !concrete });

  if (write && !yes) {
    const targetPath = client.getPath(io.env);
    const confirmed = await confirmWrite(io, targetPath);
    if (!confirmed) {
      throw new CliError("已取消写入。");
    }
  }

  let writtenPath = "";
  if (write) {
    writtenPath = client.write(generatedConfig, io.env);
  }

  const result = {
    ok: true,
    target,
    path: writtenPath || client.getPath(io.env),
    written: Boolean(writtenPath),
    config: generatedConfig,
  };

  if (asJson) {
    writeJson(io, result);
  } else if (write) {
    io.stdout.write(`已写入 ${target} 配置：${writtenPath}\n`);
  } else {
    io.stdout.write(`${JSON.stringify(generatedConfig, null, 2)}\n`);
  }
  return 0;
}

function getClientBuilder(target) {
  const builders = {
    cursor: {
      build: buildCursorConfig,
      getPath: getCursorConfigPath,
      write: writeCursorConfig,
    },
    claude: {
      build: buildClaudeConfig,
      getPath: getClaudeConfigPath,
      write: writeClaudeConfig,
    },
    vscode: {
      build: buildVscodeConfig,
      getPath: getVscodeConfigPath,
      write: writeVscodeConfig,
    },
  };
  return builders[target];
}

async function confirmWrite(io, targetPath) {
  if (!io.stdin.isTTY) {
    throw new CliError("非交互环境写入 Cursor 配置时必须传 --yes。");
  }
  const rl = readline.createInterface({
    input: io.stdin,
    output: io.stderr,
  });
  try {
    const answer = await new Promise((resolve) => {
      rl.question(`即将写入 Cursor 配置 ${targetPath}，继续吗？[y/N] `, resolve);
    });
    return String(answer).trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

module.exports = {
  runClientCommand,
};
