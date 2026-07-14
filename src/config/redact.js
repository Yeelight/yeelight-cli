"use strict";

const { DEFAULT_BIZ_TYPE, normalizeBizType } = require("./bizType");

function redactSecret(value, options = {}) {
  if (!value) {
    return "";
  }
  const text = String(value);
  if (options.hideCompletely) {
    return "****";
  }
  if (text.length <= 8) {
    return "****";
  }
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function redactProfile(profile) {
  return {
    authorization: redactSecret(profile.authorization),
    clientId: redactSecret(profile.clientId),
    houseId: redactSecret(profile.houseId, { hideCompletely: true }),
    bizType: normalizeBizType(profile.bizType, DEFAULT_BIZ_TYPE),
  };
}

function redactConfig(config) {
  const clone = JSON.parse(JSON.stringify(config));
  const profiles = clone.auth && clone.auth.profiles ? clone.auth.profiles : {};
  for (const key of Object.keys(profiles)) {
    profiles[key] = redactProfile(profiles[key]);
  }
  return clone;
}

module.exports = {
  redactConfig,
  redactProfile,
  redactSecret,
};
