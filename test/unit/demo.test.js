"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildDemo } = require("../../src/commands/demo");
const { createDefaultConfig } = require("../../src/config/defaults");

test("cloud demo 只生成 dryRun 示例", async () => {
  const result = await buildDemo("cloud", createDefaultConfig());

  assert.equal(result.mode, "dry-run-plan");
  assert.equal(result.sampleDryRun.arguments.controlRequest.dryRun, true);
  assert.equal(result.safetyContract.dryRun, "pass");
});

test("metadata demo 使用收敛后的工具流程", async () => {
  const result = await buildDemo("metadata", createDefaultConfig());

  assert.deepEqual(result.steps, ["list_tasks(query)", "list_tasks(task)", "get_action_schema", "execute_task(dryRun=true)"]);
  assert.equal(result.sampleDryRun.tool, "yeelight_metadata.execute_task");
});

test("lan demo 未 probe 时不访问网关", async () => {
  const config = createDefaultConfig();
  config.mcp.lan.endpoint = "http://192.168.1.93:18080/mcp";

  const result = await buildDemo("lan", config, { probe: false });

  assert.equal(result.mode, "lan-plan");
  assert.equal(result.ok, undefined);
  assert.match(result.notes, /--probe/);
});
