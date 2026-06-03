/**
 * lightweightExcelExtractor.js
 *
 * Deterministic, synchronous Excel extractor.
 * Uses the `xlsx` library (SheetJS) — no background queues, no OCR, no caching.
 *
 * Returns a structured object with:
 *   - sheets: Array<{ name, rows: Array<Array<string>> }>
 *   - projects: Array of ECM project objects extracted from the primary sheet
 *   - rawText: flat text dump for fallback / LLM context
 */

const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

/**
 * Extract all data from an Excel file.
 * @param {string} filePath  – absolute path to the .xlsx / .xls file
 * @returns {{ sheets, projects, rawText, warnings }}
 */
function extractExcel(filePath) {
  const warnings = [];

  if (!filePath || !fs.existsSync(filePath)) {
    warnings.push(`File not found: ${filePath}`);
    return { sheets: [], projects: [], rawText: "", warnings };
  }

  let workbook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: true, sheetStubs: true });
  } catch (err) {
    warnings.push(`Failed to read workbook: ${err.message}`);
    return { sheets: [], projects: [], rawText: "", warnings };
  }

  const sheets = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    // Filter completely empty rows
    const filteredRows = rows
      .map((row) => row.map((cell) => String(cell ?? "").trim()))
      .filter((row) => row.some((cell) => cell !== ""));

    sheets.push({ name: sheetName, rows: filteredRows });
  }

  const projects = extractProjects(sheets);
  const rawText = sheetsToText(sheets);

  return { sheets, projects, rawText, warnings };
}

/**
 * Extract ECM project rows from sheets.
 * Looks for header rows containing keywords like "ECM", "Project", "Saving", "Investment".
 */
function extractProjects(sheets) {
  const projects = [];

  for (const sheet of sheets) {
    const { name: sheetName, rows } = sheet;
    if (!rows || rows.length < 2) continue;

    // Find the header row
    const headerRowIdx = findHeaderRow(rows);
    if (headerRowIdx === -1) continue;

    const headers = rows[headerRowIdx].map((h) => String(h).toLowerCase().trim());

    // Map column indices
    const colIdx = {
      ecmNo:        findCol(headers, ["ecm no", "ecm#", "sr no", "sr.", "no.", "sl no"]),
      system:       findCol(headers, ["system", "energy system", "category"]),
      description:  findCol(headers, ["description", "project", "measure", "recommendation", "ecm description"]),
      energySaving: findCol(headers, ["energy saving", "energy saved", "kwh", "units saved"]),
      annualSaving: findCol(headers, ["annual saving", "cost saving", "rs.", "inr", "annual cost"]),
      investment:   findCol(headers, ["investment", "cost", "capital cost", "capex"]),
      payback:      findCol(headers, ["payback", "simple payback", "spb"]),
    };

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((cell) => cell === "")) continue;

      const description = getValue(row, colIdx.description);
      if (!description) continue;

      // Skip sub-total / total rows
      if (/^(total|sub.?total|grand total)/i.test(description)) continue;

      projects.push({
        ecmNo:        getValue(row, colIdx.ecmNo) || String(projects.length + 1),
        system:       getValue(row, colIdx.system) || "",
        description,
        energySaving: parseNum(getValue(row, colIdx.energySaving)),
        annualSaving: parseNum(getValue(row, colIdx.annualSaving)),
        investment:   parseNum(getValue(row, colIdx.investment)),
        payback:      parseNum(getValue(row, colIdx.payback)),
        sourceSheet:  sheetName,
        sourceRow:    i + 1,
      });
    }

    // If we found projects in this sheet, stop looking
    if (projects.length > 0) break;
  }

  return projects;
}

/** Find the first row that looks like a header */
function findHeaderRow(rows) {
  const keywords = ["description", "project", "ecm", "saving", "investment", "system", "measure"];
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const rowText = rows[i].join(" ").toLowerCase();
    const hits = keywords.filter((kw) => rowText.includes(kw)).length;
    if (hits >= 2) return i;
  }
  return -1;
}

/** Find the column index by checking for any of the candidate header strings */
function findCol(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function getValue(row, idx) {
  if (idx === -1 || idx >= row.length) return "";
  return String(row[idx] ?? "").trim();
}

function parseNum(str) {
  if (!str) return null;
  const num = parseFloat(String(str).replace(/[^0-9.\-]/g, ""));
  return isNaN(num) ? null : num;
}

/** Convert all sheets to a flat text blob */
function sheetsToText(sheets) {
  return sheets
    .map((sheet) => {
      const headerLine = `=== Sheet: ${sheet.name} ===`;
      const dataLines = sheet.rows.map((row) => row.join(" | ")).join("\n");
      return `${headerLine}\n${dataLines}`;
    })
    .join("\n\n");
}

module.exports = { extractExcel };
