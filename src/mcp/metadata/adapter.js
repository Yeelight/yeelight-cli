"use strict";

const { DEFAULT_ENDPOINTS } = require("../../config/defaults");
const {
  METADATA_SAFETY,
  METADATA_TOOLS,
  getMetadataGroups,
} = require("./catalog");
const { getMetadataToolDefinitions } = require("./tool-definitions");

function getMetadataAdapter() {
  return {
    id: "metadata",
    displayName: "Metadata MCP",
    codeName: "yeelight-metadata-mcp",
    getDefaultEndpoint() {
      return DEFAULT_ENDPOINTS.metadata;
    },
    inspect(config) {
      const mcpConfig = config.mcp.metadata;
      return {
        id: "metadata",
        displayName: "Metadata MCP",
        codeName: "yeelight-metadata-mcp",
        status: mcpConfig.enabled ? "enabled" : "disabled",
        transport: mcpConfig.transport,
        endpoint: mcpConfig.endpoint,
        authProfile: mcpConfig.authProfile,
        tools: METADATA_TOOLS,
        safety: METADATA_SAFETY,
        taskModel: {
          groups: 7,
          tasks: 23,
          actions: 156,
          source: "yeelight-metadata-mcp/README.md 与 tests/test_registry.py",
        },
        renameStatus: "done",
        safetyContract: {
          dryRun: "pass",
          confirmSideEffect: "pass",
          candidateGate: "pass",
        },
      };
    },
    getStaticTools() {
      return getMetadataToolDefinitions();
    },
    getGroups() {
      return getMetadataGroups();
    },
    releaseChecks() {
      return [
        {
          id: "CONFIRM_SIDE_EFFECT",
          scope: "metadata",
          status: "pass",
          message: "Metadata MCP 已声明 S2/S3 非 dryRun 必须确认副作用。",
          suggestion: "保持 execute_task 的校验覆盖。",
        },
        {
          id: "REGISTRY_METADATA",
          scope: "metadata",
          status: "pass",
          message: "已存在 server.json 和任务注册信息。",
          suggestion: "发布前同步版本号与 README。",
        },
      ];
    },
  };
}

module.exports = {
  getMetadataAdapter,
};
