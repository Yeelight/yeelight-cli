"use strict";

function parseArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const equalIndex = token.indexOf("=");
      let name;
      let value;
      if (equalIndex >= 0) {
        name = token.slice(2, equalIndex);
        value = token.slice(equalIndex + 1);
      } else {
        name = token.slice(2);
        const next = argv[index + 1];
        if (next !== undefined && !next.startsWith("--")) {
          value = next;
          index += 1;
        } else {
          value = true;
        }
      }
      flags[name] = value;
      continue;
    }

    positionals.push(token);
  }

  return { positionals, flags };
}

function hasFlag(flags, name) {
  return Object.prototype.hasOwnProperty.call(flags, name);
}

function getFlag(flags, name, fallback = undefined) {
  if (!hasFlag(flags, name)) {
    return fallback;
  }
  return flags[name];
}

function getStringFlag(flags, name, fallback = "") {
  const value = getFlag(flags, name, fallback);
  if (value === true || value === false || value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function getBooleanFlag(flags, name, fallback = false) {
  if (!hasFlag(flags, name)) {
    return fallback;
  }
  const value = flags[name];
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

module.exports = {
  getBooleanFlag,
  getFlag,
  getStringFlag,
  hasFlag,
  parseArgs,
};
