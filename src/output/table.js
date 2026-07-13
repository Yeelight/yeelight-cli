"use strict";

function formatTable(headers, rows) {
  const allRows = [headers, ...rows];
  const widths = headers.map((_, columnIndex) =>
    Math.max(...allRows.map((row) => stringLength(row[columnIndex])))
  );

  return rowsWithHeader(headers, rows)
    .map((row) =>
      row
        .map((cell, columnIndex) => String(cell).padEnd(widths[columnIndex], " "))
        .join("  ")
        .trimEnd()
    )
    .join("\n");
}

function rowsWithHeader(headers, rows) {
  const separator = headers.map((header) => "-".repeat(Math.max(3, stringLength(header))));
  return [headers, separator, ...rows];
}

function stringLength(value) {
  return String(value === undefined || value === null ? "" : value).length;
}

module.exports = {
  formatTable,
};
