"use strict";

function normalizeCursor(value) {
  const text = String(value || "").trim();
  return text || null;
}

module.exports = {
  normalizeCursor,
};
