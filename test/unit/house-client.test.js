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

test("家庭列表为空时回退到 DALI SaaS 项目列表", async () => {
  const calls = [];
  const client = new HouseClient({
    baseUrl: "https://api.example.test",
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (String(url).endsWith("/apis/iot/v1/house/r/list")) {
        return responseJson({ success: true, data: [] });
      }
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

  const houses = await client.listHouses({ authorization: "Bearer token", clientId: "client" });

  assert.equal(calls.length, 4);
  assert.equal(calls[0].options.headers.Authorization, "Bearer token");
  assert.deepEqual(houses, [
    { houseId: "2001", name: "DALI 项目", source: "project" },
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
