"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { HouseClient, normalizeHouseList } = require("../../src/auth/houseClient");

test("家庭列表归一化支持 APP house 字段", () => {
  const houses = normalizeHouseList([
    { id: "1001", name: "客厅家庭" },
    { houseId: "1002", houseName: "办公室" },
  ], "house");

  assert.deepEqual(houses, [
    { houseId: "1001", name: "客厅家庭", source: "house" },
    { houseId: "1002", name: "办公室", source: "house" },
  ]);
});

test("普通家庭列表为空时不会跨业务域回退到 SaaS 项目", async () => {
  const calls = [];
  const client = new HouseClient({
    baseUrl: "https://api.example.test",
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (String(url).endsWith("/apis/iot/v1/house/r/list")) {
        return responseJson({ success: true, data: [] });
      }
      throw new Error(`未预期的 URL：${url}`);
    },
  });

  const houses = await client.listHouses({ authorization: "Bearer token", bizType: "0" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, "Bearer token");
  assert.equal(calls[0].options.headers.bizType, "0");
  assert.deepEqual(houses, []);
});

test("显式商照模式只查询 SaaS 项目", async () => {
  const calls = [];
  const client = new HouseClient({
    baseUrl: "https://api.example.test",
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/apis/commercial/saas/v1/user/r/saas-role")) {
        return responseJson({ success: true, data: "owner" });
      }
      if (String(url).endsWith("/apis/commercial/saas/v1/user/r/project-role")) {
        return responseJson({ success: true, data: { "2001": 1, "2002": 3 } });
      }
      if (String(url).endsWith("/apis/commercial/saas/v1/project/r/page")) {
        return responseJson({
          success: true,
          data: {
            rows: [
              { houseId: "2001", name: "DALI 项目" },
              { houseId: "2002", name: "无权限项目" },
            ],
          },
        });
      }
      throw new Error(`未预期的 URL：${url}`);
    },
  });

  const houses = await client.listHouses({ authorization: "Bearer token", bizType: "1" });

  assert.equal(calls.length, 3);
  assert.equal(calls.some((call) => call.url.includes("/apis/iot/v1/house/r/list")), false);
  assert.deepEqual(houses, [
    { houseId: "2001", name: "DALI 项目", source: "project" },
  ]);
});

test("家庭列表请求支持普通家庭 bizType", async () => {
  const calls = [];
  const client = new HouseClient({
    baseUrl: "https://api.example.test",
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (String(url).endsWith("/apis/iot/v1/house/r/list")) {
        return responseJson({
          success: true,
          data: [{ id: "1001", name: "普通家庭" }],
        });
      }
      throw new Error(`未预期的 URL：${url}`);
    },
  });

  const houses = await client.listHouses({ authorization: "Bearer token", clientId: "client", bizType: "0" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.bizType, "0");
  assert.deepEqual(houses, [
    { houseId: "1001", name: "普通家庭", source: "house" },
  ]);
});

function responseJson(body) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body);
    },
  };
}
