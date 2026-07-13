"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { hasRepeatedBearer, normalizeAuthorization } = require("../../src/security/bearer");

test("裸 token 会归一化为单个 Bearer 前缀", () => {
  assert.equal(normalizeAuthorization("abc123"), "Bearer abc123");
});

test("已有 Bearer 前缀不会重复拼接", () => {
  assert.equal(normalizeAuthorization("Bearer abc123"), "Bearer abc123");
  assert.equal(normalizeAuthorization("Bearer Bearer abc123"), "Bearer abc123");
});

test("重复 Bearer 可以被识别", () => {
  assert.equal(hasRepeatedBearer("Bearer Bearer abc123"), true);
  assert.equal(hasRepeatedBearer("Bearer abc123"), false);
});
