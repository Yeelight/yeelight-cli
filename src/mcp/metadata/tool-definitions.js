"use strict";

const { METADATA_GROUP_IDS, TASK_ACTION_SCHEMA } = require("./catalog");

const METADATA_TOOL_DEFINITIONS = [
  {
    name: "yeelight_metadata.list_groups",
    description: "分页返回 Metadata 任务分组摘要，帮助选择 list_tasks 的 group 参数。",
    inputSchema: {
      type: "object",
      properties: {
        cursor: {
          type: ["string", "null"],
          description: "分页游标；来自上一次返回的 nextCursor，调用方只需原样传回",
          default: null,
        },
        limit: {
          type: "integer",
          description: "最多返回多少个分组",
          default: 20,
          minimum: 1,
        },
      },
    },
  },
  {
    name: "yeelight_metadata.list_tasks",
    description: "浏览、搜索或查看 Metadata 任务。传 task 返回单任务详情；传 query 搜索任务和 action；都不传则按 group 分页列出任务摘要。",
    inputSchema: {
      type: "object",
      properties: {
        group: {
          type: ["string", "null"],
          enum: [...METADATA_GROUP_IDS, null],
          description: "可选分组 ID，例如 family_space；分组列表请先调用 yeelight_metadata.list_groups",
          default: null,
        },
        query: {
          type: ["string", "null"],
          description: "可选搜索关键词，例如 room、房间、device、automation；传入后返回匹配任务和 action",
          default: null,
        },
        task: {
          type: ["string", "null"],
          description: "可选任务 ID，例如 family_space.manage_room；传入后返回该任务详情和 action 摘要",
          default: null,
        },
        cursor: {
          type: ["string", "null"],
          description: "分页游标；来自上一次返回的 nextCursor，调用方只需原样传回",
          default: null,
        },
        limit: {
          type: "integer",
          description: "最多返回多少个任务",
          default: 50,
          minimum: 1,
        },
      },
    },
  },
  {
    name: "yeelight_metadata.list_actions",
    description: "列出或筛选 action，支持按 task、group、status、sideEffect、executionMode 过滤。",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: ["string", "null"],
          description: "可选任务 ID，例如 family_space.manage_room",
          default: null,
        },
        group: {
          type: ["string", "null"],
          enum: [...METADATA_GROUP_IDS, null],
          description: "可选分组 ID，例如 family_space",
          default: null,
        },
        status: {
          type: ["string", "null"],
          enum: ["confirmed", "candidate", "external", "non_rest", null],
          description: "可选 action 状态",
          default: null,
        },
        sideEffect: {
          type: ["string", "null"],
          enum: ["S0", "S1", "S2", "S3", null],
          description: "可选副作用等级",
          default: null,
        },
        executionMode: {
          type: ["string", "null"],
          description: "可选执行模式，例如 cloud_api、manual_assist、requires_mobile_app",
          default: null,
        },
        cursor: {
          type: ["string", "null"],
          description: "分页游标；来自上一次返回的 nextCursor，调用方只需原样传回",
          default: null,
        },
        limit: {
          type: "integer",
          description: "最多返回多少个 action",
          default: 200,
          minimum: 1,
        },
      },
    },
  },
  {
    name: "yeelight_metadata.get_action_schema",
    description: "返回指定 task/action 的参数 schema、全局 Header、局部 context、payload 和 options 提示。",
    inputSchema: {
      type: "object",
      required: ["task", "action"],
      properties: {
        task: {
          type: "string",
          description: "任务 ID，例如 family_space.manage_room",
        },
        action: {
          type: "string",
          description: "动作 ID，例如 create、list、delete 或 get_house_detail",
        },
      },
    },
  },
  {
    name: "yeelight_metadata.execute_task",
    description: "校验或执行元数据管理任务。默认 options.dryRun=true 只生成执行计划；真实执行前会校验 schema、候选状态和副作用确认。",
    inputSchema: {
      type: "object",
      required: ["request"],
      properties: {
        request: {
          ...TASK_ACTION_SCHEMA,
          description: "任务执行请求，必须包含 task、action、context、payload 和 options",
        },
      },
    },
  },
];

function getMetadataToolDefinitions() {
  return METADATA_TOOL_DEFINITIONS.map((tool) => ({
    ...tool,
    inputSchema: JSON.parse(JSON.stringify(tool.inputSchema)),
  }));
}

module.exports = {
  METADATA_TOOL_DEFINITIONS,
  getMetadataToolDefinitions,
};
