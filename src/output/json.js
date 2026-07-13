"use strict";

function writeJson(io, value) {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

module.exports = {
  writeJson,
};
