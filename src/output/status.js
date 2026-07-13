"use strict";

const STATUS_ORDER = {
  fail: 0,
  warn: 1,
  unknown: 2,
  pending: 3,
  pass: 4,
};

function worstStatus(statuses) {
  return statuses.reduce((worst, current) => {
    if (STATUS_ORDER[current] < STATUS_ORDER[worst]) {
      return current;
    }
    return worst;
  }, "pass");
}

function statusText(status) {
  const labels = {
    pass: "pass",
    warn: "warn",
    fail: "fail",
    pending: "pending",
    unknown: "unknown",
  };
  return labels[status] || "unknown";
}

module.exports = {
  statusText,
  worstStatus,
};
