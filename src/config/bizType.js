"use strict";

const DEFAULT_BIZ_TYPE = "1";

const BIZ_TYPE_OPTIONS = [
  {
    value: "0",
    label: "普通家庭",
    aliases: ["c", "c端", "consumer", "home", "普通", "普通家庭"],
  },
  {
    value: "1",
    label: "商照项目",
    aliases: ["b", "b端", "business", "commercial", "project", "商照", "商照家庭", "商照项目"],
  },
];

function normalizeBizType(value, fallback = DEFAULT_BIZ_TYPE) {
  const text = String(value === undefined || value === null ? "" : value).trim().toLowerCase();
  if (!text) {
    return fallback;
  }
  const matched = BIZ_TYPE_OPTIONS.find((option) =>
    option.value === text || option.aliases.includes(text)
  );
  return matched ? matched.value : "";
}

function formatBizType(value) {
  const normalized = normalizeBizType(value, DEFAULT_BIZ_TYPE);
  const matched = BIZ_TYPE_OPTIONS.find((option) => option.value === normalized);
  return matched ? matched.label : "商照项目";
}

function formatBizTypeWithCode(value) {
  const normalized = normalizeBizType(value, DEFAULT_BIZ_TYPE);
  return `${formatBizType(normalized)}（bizType=${normalized}）`;
}

module.exports = {
  BIZ_TYPE_OPTIONS,
  DEFAULT_BIZ_TYPE,
  formatBizType,
  formatBizTypeWithCode,
  normalizeBizType,
};
