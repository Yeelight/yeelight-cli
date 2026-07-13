"use strict";

const BLOCKED_CONTROL_PROPERTIES = new Set(["rs", "cp", "o"]);

function normalizePropertyName(value) {
  return String(value || "").trim();
}

function isBlockedControlProperty(value) {
  return BLOCKED_CONTROL_PROPERTIES.has(normalizePropertyName(value));
}

function getBlockedControlProperties() {
  return Array.from(BLOCKED_CONTROL_PROPERTIES);
}

function getControlParamsFromArguments(toolName, args) {
  if (toolName !== "control_node") {
    return [];
  }
  const params = args
    && args.controlRequest
    && args.controlRequest.command
    && args.controlRequest.command.params;
  return Array.isArray(params) ? params : [];
}

function findBlockedControlProperty(params) {
  for (const param of params || []) {
    if (!param || typeof param !== "object") {
      continue;
    }
    const propName = normalizePropertyName(param.propName);
    if (isBlockedControlProperty(propName)) {
      return propName;
    }
  }
  return "";
}

function assertControlArgumentsAllowed(toolName, args, errorFactory = Error) {
  const blocked = findBlockedControlProperty(getControlParamsFromArguments(toolName, args));
  if (!blocked) {
    return;
  }
  throw new errorFactory(buildBlockedControlPropertyMessage(blocked));
}

function buildBlockedControlPropertyMessage(propName) {
  return `属性 ${propName} 是只读/状态属性，CLI 不允许控制。可控制属性请以设备列表中展示的 Properties 为准。`;
}

function summarizeControllableProperties(properties) {
  if (!Array.isArray(properties) || properties.length === 0) {
    return "";
  }
  return filterControllableProperties(properties)
    .map((property) => property && (property.propId || property.name || ""))
    .map(normalizePropertyName)
    .filter(Boolean)
    .slice(0, 6)
    .join(",");
}

function filterControllableProperties(properties) {
  if (!Array.isArray(properties)) {
    return properties;
  }
  return properties.filter((property) => {
    const name = normalizePropertyName(property && (property.propId || property.name || ""));
    return !name || !isBlockedControlProperty(name);
  });
}

function sanitizeControllablePropertyData(data) {
  if (Array.isArray(data)) {
    return data.map(sanitizeDeviceLikeProperties);
  }
  if (!data || typeof data !== "object") {
    return data;
  }
  if (Array.isArray(data.rows)) {
    return {
      ...data,
      rows: data.rows.map(sanitizeDeviceLikeProperties),
    };
  }
  if (Array.isArray(data.items)) {
    return {
      ...data,
      items: data.items.map(sanitizeDeviceLikeProperties),
    };
  }
  return sanitizeDeviceLikeProperties(data);
}

function sanitizeDeviceLikeProperties(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return item;
  }
  const next = { ...item };
  if (Array.isArray(item.properties)) {
    next.properties = filterControllableProperties(item.properties);
  }
  if (Array.isArray(item.subDeviceList)) {
    next.subDeviceList = item.subDeviceList.map(sanitizeDeviceLikeProperties);
  }
  return next;
}

module.exports = {
  assertControlArgumentsAllowed,
  buildBlockedControlPropertyMessage,
  filterControllableProperties,
  findBlockedControlProperty,
  getBlockedControlProperties,
  getControlParamsFromArguments,
  isBlockedControlProperty,
  sanitizeControllablePropertyData,
  summarizeControllableProperties,
};
