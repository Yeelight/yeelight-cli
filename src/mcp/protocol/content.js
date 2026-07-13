"use strict";

function parseToolContent(result) {
  if (result && result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  if (!result || !Array.isArray(result.content) || result.content.length === 0) {
    return null;
  }
  const first = result.content[0];
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    return first || null;
  }
  return parseJson(first.text);
}

function parseResponseBody(text, headers) {
  const contentType = getHeader(headers, "content-type");
  if (contentType.includes("text/event-stream")) {
    return parseSseJson(text);
  }
  return parseJson(text);
}

function parseSseJson(text) {
  const dataLines = String(text)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line && line !== "[DONE]");
  if (dataLines.length === 0) {
    return { raw: text };
  }
  return parseJson(dataLines.join("\n"));
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
}

function getHeader(headers, name) {
  if (!headers || typeof headers.get !== "function") {
    return "";
  }
  return headers.get(name) || headers.get(name.toLowerCase()) || "";
}

function makeHeaderReader(headers) {
  return {
    get(name) {
      const value = headers[String(name || "").toLowerCase()];
      if (Array.isArray(value)) {
        return value.join(", ");
      }
      return value || "";
    },
  };
}

module.exports = {
  getHeader,
  makeHeaderReader,
  parseResponseBody,
  parseToolContent,
};
