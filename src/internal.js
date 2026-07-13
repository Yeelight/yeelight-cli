"use strict";

const fs = require("fs");
const path = require("path");

function isInternalMode(env = process.env) {
  return String(env.YEELIGHT_AI_INTERNAL || "").trim() === "1" && fs.existsSync(path.join(__dirname, "commands", "release.js"));
}

module.exports = {
  isInternalMode,
};
