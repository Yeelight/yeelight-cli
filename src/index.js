"use strict";

const { parseArgs } = require("./args");
const { CliError } = require("./errors");
const { runClientCommand } = require("./commands/client");
const { runConfigCommand } = require("./commands/config");
const { runDemoCommand } = require("./commands/demo");
const { runDoctorCommand } = require("./commands/doctor");
const { printHelp, printVersion } = require("./commands/help");
const { runHomeCommand } = require("./commands/home");
const { runInitCommand } = require("./commands/init");
const { runLoginCommand } = require("./commands/login");
const { runMcpCommand } = require("./commands/mcp");
const { runQuickCommand } = require("./commands/quick");
const { runResourceCommand } = require("./commands/resources");
const { runStatusCommand } = require("./commands/status");
const { isInternalMode } = require("./internal");

const PUBLIC_COMMANDS = {
  init: runInitCommand,
  login: runLoginCommand,
  config: runConfigCommand,
  mcp: runMcpCommand,
  doctor: runDoctorCommand,
  client: runClientCommand,
  demo: runDemoCommand,
  quick: runQuickCommand,
  status: runStatusCommand,
  house: (argv, io) => runResourceCommand("house", argv, io),
  room: (argv, io) => runResourceCommand("room", argv, io),
  device: (argv, io) => runResourceCommand("device", argv, io),
  scene: (argv, io) => runResourceCommand("scene", argv, io),
  light: (argv, io) => runResourceCommand("light", argv, io),
};

const INTERNAL_COMMANDS = {
  release(argv, io) {
    const { runReleaseCommand } = require("./commands/release");
    return runReleaseCommand(argv, io);
  },
};

async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const parsed = parseArgs(argv);
  const command = parsed.positionals[0];

  if (!command && !parsed.flags.help && !parsed.flags.version) {
    return runHomeCommand([], io);
  }

  if (parsed.flags.help || command === "help") {
    printHelp(io);
    return 0;
  }

  if (parsed.flags.version || command === "version") {
    printVersion(io);
    return 0;
  }

  const handler = PUBLIC_COMMANDS[command] || (isInternalMode(io.env) ? INTERNAL_COMMANDS[command] : undefined);
  if (!handler) {
    throw new CliError(`未知命令：${command}`);
  }

  const childArgv = argv.slice(argv.indexOf(command) + 1);
  return handler(childArgv, io);
}

function defaultIo() {
  return {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
  };
}

async function runCli() {
  try {
    const code = await main();
    process.exitCode = code;
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    const message = error && error.message ? error.message : String(error);
    process.stderr.write(`错误：${message}\n`);
    if (!(error instanceof CliError) && process.env.YEELIGHT_AI_DEBUG) {
      process.stderr.write(`${error.stack}\n`);
    }
    process.exitCode = exitCode;
  }
}

module.exports = {
  main,
  runCli,
};
