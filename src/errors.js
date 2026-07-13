"use strict";

class CliError extends Error {
  constructor(message, exitCode = 1, details = undefined) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    this.details = details;
  }
}

module.exports = { CliError };
