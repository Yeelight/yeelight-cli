"use strict";

function normalizeAuthorization(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  let token = text;
  while (/^bearer\s+/i.test(token)) {
    token = token.replace(/^bearer\s+/i, "").trim();
  }
  return token ? `Bearer ${token}` : "";
}

function hasRepeatedBearer(value) {
  return /^bearer\s+bearer\s+/i.test(String(value || "").trim());
}

module.exports = {
  hasRepeatedBearer,
  normalizeAuthorization,
};
