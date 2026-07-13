"use strict";

function findTool(tools, name) {
  return (tools || []).find((tool) => tool && tool.name === name) || null;
}

function getToolInputSchema(tool) {
  return tool && (tool.inputSchema || tool.input_schema || tool.parameters) || null;
}

function summarizeInputSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return {
      hasSchema: false,
      parameters: [],
      example: {},
    };
  }
  const root = schema;
  const normalized = normalizeForProperties(schema, root);
  const parameters = collectParameters(normalized, root, "", 0, 3);
  return {
    hasSchema: true,
    parameters,
    example: buildExample(normalized, root, 0),
  };
}

function formatToolDetails(tool) {
  const lines = [`工具: ${tool.name}`];
  if (tool.description) {
    lines.push(`说明: ${oneLine(tool.description)}`);
  }

  const schema = getToolInputSchema(tool);
  const summary = summarizeInputSchema(schema);
  lines.push("参数:");
  if (!summary.hasSchema) {
    lines.push("  服务端未提供 inputSchema，请参考 --json 输出或服务端文档。");
    return `${lines.join("\n")}\n`;
  }
  if (summary.parameters.length === 0) {
    lines.push("  无参数，调用时使用 {}。");
  } else {
    summary.parameters.forEach((parameter) => {
      lines.push(formatParameter(parameter));
    });
  }

  lines.push("");
  lines.push("参数 JSON 示例:");
  lines.push(JSON.stringify(summary.example, null, 2));
  return `${lines.join("\n")}\n`;
}

function formatToolParameterSummary(tool) {
  const schema = getToolInputSchema(tool);
  const summary = summarizeInputSchema(schema);
  if (!summary.hasSchema) {
    return "未声明";
  }
  const topLevel = summary.parameters.filter((parameter) => parameter.depth === 0);
  if (topLevel.length === 0) {
    return "无参数";
  }
  return topLevel
    .map((parameter) => `${parameter.name}(${parameter.required ? "必填" : "可选"})`)
    .join(", ");
}

function formatToolListDescription(value) {
  const text = oneLine(value);
  if (text.length <= 80) {
    return text;
  }
  return `${text.slice(0, 77)}...`;
}

function formatParameter(parameter) {
  const indent = "  ".repeat(parameter.depth + 1);
  const requiredText = parameter.required ? "必填" : "可选";
  const suffixes = [];
  if (parameter.enumValues.length > 0) {
    suffixes.push(`可选值: ${parameter.enumValues.map(formatLiteral).join(", ")}`);
  }
  if (parameter.defaultValue !== undefined) {
    suffixes.push(`默认: ${formatLiteral(parameter.defaultValue)}`);
  }
  const suffix = suffixes.length > 0 ? `；${suffixes.join("；")}` : "";
  const description = parameter.description ? `: ${parameter.description}` : "";
  return `${indent}- ${parameter.path} (${parameter.type}, ${requiredText})${description}${suffix}`;
}

function collectParameters(schema, root, prefix, depth, maxDepth) {
  const normalized = normalizeForProperties(schema, root);
  const properties = normalized && normalized.properties && typeof normalized.properties === "object"
    ? normalized.properties
    : {};
  const required = new Set(Array.isArray(normalized.required) ? normalized.required : []);
  const entries = [];

  Object.keys(properties).forEach((name) => {
    const propertySchema = normalizeForProperties(properties[name], root);
    const path = prefix ? `${prefix}.${name}` : name;
    const entry = {
      name,
      path,
      depth,
      required: required.has(name),
      type: formatSchemaType(propertySchema, root),
      description: oneLine(propertySchema.description || propertySchema.title || ""),
      enumValues: Array.isArray(propertySchema.enum) ? propertySchema.enum : [],
      defaultValue: propertySchema.default,
    };
    entries.push(entry);

    if (depth >= maxDepth) {
      return;
    }

    if (hasObjectProperties(propertySchema, root)) {
      entries.push(...collectParameters(propertySchema, root, path, depth + 1, maxDepth));
      return;
    }

    const items = getArrayItemsSchema(propertySchema, root);
    if (items && hasObjectProperties(items, root)) {
      entries.push(...collectParameters(items, root, `${path}[]`, depth + 1, maxDepth));
    }
  });

  if (entries.length === 0 && normalized && normalized.additionalProperties && typeof normalized.additionalProperties === "object") {
    entries.push({
      name: "*",
      path: prefix ? `${prefix}.*` : "*",
      depth,
      required: false,
      type: formatSchemaType(normalized.additionalProperties, root),
      description: "任意键值参数",
      enumValues: [],
      defaultValue: undefined,
    });
  }

  return entries;
}

function hasObjectProperties(schema, root) {
  const normalized = normalizeForProperties(schema, root);
  return Boolean(normalized && normalized.properties && typeof normalized.properties === "object");
}

function getArrayItemsSchema(schema, root) {
  const normalized = normalizeForProperties(schema, root);
  if (!normalized) {
    return null;
  }
  const type = normalized.type;
  if (type === "array" || normalized.items) {
    return normalized.items || {};
  }
  return null;
}

function buildExample(schema, root, depth) {
  const normalized = normalizeForProperties(schema, root);
  if (!normalized || depth > 5) {
    return {};
  }

  const type = pickExampleType(inferType(normalized, root));
  if (type === "object") {
    const properties = normalized.properties && typeof normalized.properties === "object" ? normalized.properties : {};
    const keys = selectExampleKeys(properties, normalized.required);
    const output = {};
    keys.forEach((key) => {
      output[key] = buildExample(properties[key], root, depth + 1);
    });
    return output;
  }
  if (type === "array") {
    return [buildExample(normalized.items || {}, root, depth + 1)];
  }
  if (normalized.const !== undefined) {
    return normalized.const;
  }
  if (normalized.default !== undefined) {
    return normalized.default;
  }
  if (Array.isArray(normalized.enum) && normalized.enum.length > 0) {
    return normalized.enum[0];
  }
  if (type === "integer" || type === "number") {
    return normalized.minimum !== undefined ? normalized.minimum : 0;
  }
  if (type === "boolean") {
    return false;
  }
  if (type === "null") {
    return null;
  }
  return "<string>";
}

function selectExampleKeys(properties, required) {
  const keys = Object.keys(properties || {});
  const requiredSet = new Set(Array.isArray(required) ? required : []);
  const requiredKeys = keys.filter((key) => requiredSet.has(key));
  const optionalKeys = keys.filter((key) => !requiredSet.has(key));
  const defaultKeys = optionalKeys.filter((key) => propertyHasDefault(properties[key]));
  const preferredKeys = optionalKeys.filter((key) => ["payload", "options"].includes(key) && !defaultKeys.includes(key));
  const otherOptionalKeys = optionalKeys.filter((key) => !defaultKeys.includes(key) && !preferredKeys.includes(key));
  if (requiredKeys.length > 0) {
    const selected = requiredKeys.concat(defaultKeys, preferredKeys);
    return selected.concat(otherOptionalKeys.slice(0, Math.max(0, 4 - selected.length)));
  }
  const selected = defaultKeys.concat(preferredKeys);
  return selected.concat(otherOptionalKeys.slice(0, Math.max(0, 4 - selected.length)));
}

function propertyHasDefault(schema) {
  const normalized = normalizeForProperties(schema, schema);
  if (!normalized || typeof normalized !== "object") {
    return false;
  }
  if (normalized.default !== undefined) {
    return true;
  }
  const properties = normalized.properties && typeof normalized.properties === "object" ? normalized.properties : {};
  return Object.values(properties).some((property) => propertyHasDefault(property));
}

function formatSchemaType(schema, root) {
  const normalized = normalizeForProperties(schema, root);
  if (!normalized || typeof normalized !== "object") {
    return "unknown";
  }
  if (normalized.const !== undefined) {
    return `const ${formatLiteral(normalized.const)}`;
  }
  if (Array.isArray(normalized.enum) && normalized.enum.length > 0) {
    return "enum";
  }
  if (normalized.anyOf || normalized.oneOf) {
    const variants = normalized.anyOf || normalized.oneOf;
    return unique(variants.map((item) => formatSchemaType(item, root))).join(" | ");
  }
  if (normalized.allOf) {
    return unique(normalized.allOf.map((item) => formatSchemaType(item, root))).join(" & ");
  }

  const type = inferType(normalized, root);
  if (type === "array") {
    return `array<${formatSchemaType(normalized.items || {}, root)}>`;
  }
  return type || "unknown";
}

function inferType(schema, root) {
  const normalized = resolveSchema(schema, root);
  if (!normalized || typeof normalized !== "object") {
    return "";
  }
  if (Array.isArray(normalized.type)) {
    return normalized.type.join(" | ");
  }
  if (normalized.type) {
    return normalized.type;
  }
  if (normalized.properties || normalized.additionalProperties) {
    return "object";
  }
  if (normalized.items) {
    return "array";
  }
  if (normalized.anyOf || normalized.oneOf) {
    const variants = normalized.anyOf || normalized.oneOf;
    return unique(variants.map((item) => inferType(item, root)).filter(Boolean)).join(" | ");
  }
  return "";
}

function pickExampleType(type) {
  const candidates = String(type || "")
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item && item !== "null");
  return candidates[0] || String(type || "");
}

function normalizeForProperties(schema, root) {
  const resolved = resolveSchema(schema, root);
  if (!resolved || typeof resolved !== "object") {
    return resolved;
  }
  if (Array.isArray(resolved.allOf)) {
    return resolved.allOf.reduce((merged, item) => mergeObjectSchemas(merged, normalizeForProperties(item, root)), {
      ...resolved,
      allOf: undefined,
      properties: {},
      required: [],
    });
  }
  const variants = resolved.anyOf || resolved.oneOf;
  if (Array.isArray(variants)) {
    const objectVariant = variants
      .map((item) => normalizeForProperties(item, root))
      .find((item) => item && (item.properties || item.type === "object"));
    if (objectVariant) {
      return {
        ...resolved,
        ...objectVariant,
        description: resolved.description || objectVariant.description,
        title: resolved.title || objectVariant.title,
      };
    }
  }
  return resolved;
}

function mergeObjectSchemas(left, right) {
  const output = {
    ...left,
    ...right,
    properties: {
      ...(left && left.properties || {}),
      ...(right && right.properties || {}),
    },
    required: unique([
      ...(left && Array.isArray(left.required) ? left.required : []),
      ...(right && Array.isArray(right.required) ? right.required : []),
    ]),
  };
  return output;
}

function resolveSchema(schema, root, seen = new Set()) {
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  if (!schema.$ref || typeof schema.$ref !== "string" || !schema.$ref.startsWith("#/")) {
    return schema;
  }
  if (seen.has(schema.$ref)) {
    return schema;
  }
  const target = resolveJsonPointer(root, schema.$ref);
  if (!target) {
    return schema;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(schema.$ref);
  const siblings = { ...schema };
  delete siblings.$ref;
  return {
    ...resolveSchema(target, root, nextSeen),
    ...siblings,
  };
}

function resolveJsonPointer(root, pointer) {
  const parts = pointer
    .replace(/^#\//, "")
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = root;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, part)) {
      return null;
    }
    current = current[part];
  }
  return current;
}

function oneLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatLiteral(value) {
  return typeof value === "string" ? `"${value}"` : JSON.stringify(value);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

module.exports = {
  findTool,
  formatToolListDescription,
  formatToolParameterSummary,
  formatToolDetails,
  getToolInputSchema,
  summarizeInputSchema,
};
