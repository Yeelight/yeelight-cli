"use strict";

function checkResult(id, scope, status, message, suggestion = "") {
  return {
    id,
    scope,
    status,
    message,
    suggestion,
  };
}

module.exports = {
  checkResult,
};
