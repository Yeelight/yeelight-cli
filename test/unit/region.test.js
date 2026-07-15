"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildRegionEndpoints,
  normalizeRegion,
  resolveRegion,
} = require("../../src/config/region");

test("Region 映射与 yeelight-home 保持一致", () => {
  assert.deepEqual(buildRegionEndpoints("cn"), {
    region: "cn",
    account: "https://api.yeelight.com",
    openApi: "https://api.yeelight.com/apis/iot",
    cloud: "https://api.yeelight.com/apis/mcp_server/v1/mcp",
    metadata: "https://api.yeelight.com/apis/metadata_mcp_server/v1/mcp",
  });
  assert.equal(buildRegionEndpoints("sg").account, "https://api-sg.yeelight.com");
  assert.equal(buildRegionEndpoints("us").account, "https://api-us.yeelight.com");
  assert.equal(buildRegionEndpoints("eu").account, "https://api-de.yeelight.com");
  assert.equal(normalizeRegion("de"), "eu");
  assert.equal(normalizeRegion("cloud_region_sg"), "sg");
  assert.throws(() => normalizeRegion("unknown"), /不支持的 Region/);
});

test("Region 优先级为 flag、环境变量、profile、cn", () => {
  assert.equal(resolveRegion({ flag: "us", env: "sg", profile: "eu" }), "us");
  assert.equal(resolveRegion({ env: "sg", profile: "eu" }), "sg");
  assert.equal(resolveRegion({ profile: "eu" }), "eu");
  assert.equal(resolveRegion({}), "cn");
});
