const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

/**
 * Deterministic lightweight excel extraction.
 * @param {string} filePath - absolute path to the .xlsx / .xls file
 * @param {object} file - the file object
 * @returns {object} { success: true, parserUsed: 'lightweight_xlsx', fileName, sheetNames, totalRows, projects, projectCount }
 */
function extractLightweightExcelData(filePath, file) {
  const fileName = file?.filename || path.basename(filePath);

  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: "File not found", fileName };
  }

  let workbook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: true, sheetStubs: true });
  } catch (err) {
    return { success: false, error: err.message, fileName };
  }

  const sheetNames = workbook.SheetNames;
  const sheets = [];
  let totalRows = 0;

  for (const sheetName of sheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    const filteredRows = rows
      .map((row) => row.map((cell) => String(cell ?? "").trim()))
      .filter((row) => row.some((cell) => cell !== ""));

    totalRows += filteredRows.length;
    sheets.push({ name: sheetName, rows: filteredRows });
  }

  const projects = extractProjects(sheets);

  return {
    success: true,
    parserUsed: "lightweight_xlsx",
    fileName,
    sheetNames,
    totalRows,
    projects,
    projectCount: projects.length,
  };
}

function extractProjects(sheets) {
  const projects = [];

  for (const sheet of sheets) {
    const { name: sheetName, rows } = sheet;
    if (!rows || rows.length < 2) continue;

    const headerRowIdx = findHeaderRow(rows);
    if (headerRowIdx === -1) continue;

    const headers = rows[headerRowIdx].map((h) =>
      String(h).toLowerCase().trim()
    );

    const colIdx = {
      ecmNo: findCol(headers, [
        "ecm no",
        "ecm#",
        "sr no",
        "sr.",
        "no.",
        "sl no",
      ]),
      system: findCol(headers, ["system", "energy system", "category"]),
      description: findCol(headers, [
        "description",
        "project",
        "measure",
        "recommendation",
        "ecm description",
      ]),
      energySaving: findCol(headers, [
        "energy saving",
        "energy saved",
        "kwh",
        "units saved",
      ]),
      annualSaving: findCol(headers, [
        "annual saving",
        "cost saving",
        "rs.",
        "inr",
        "annual cost",
      ]),
      investment: findCol(headers, [
        "investment",
        "cost",
        "capital cost",
        "capex",
      ]),
      payback: findCol(headers, ["payback", "simple payback", "spb"]),
    };

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((cell) => cell === "")) continue;

      const description = getValue(row, colIdx.description);
      if (!description) continue;
      if (/^(total|sub.?total|grand total)/i.test(description)) continue;

      projects.push({
        ecmNo: getValue(row, colIdx.ecmNo) || String(projects.length + 1),
        system: getValue(row, colIdx.system) || "",
        description,
        energySaving: parseNum(getValue(row, colIdx.energySaving)),
        annualSaving: parseNum(getValue(row, colIdx.annualSaving)),
        investment: parseNum(getValue(row, colIdx.investment)),
        payback: parseNum(getValue(row, colIdx.payback)),
        sourceSheet: sheetName,
        sourceRow: i + 1,
      });
    }

    if (projects.length > 0) break;
  }

  // Fallback: If no projects extracted via headers, scan rows for keywords
  if (projects.length === 0) {
    for (const sheet of sheets) {
      const { name: sheetName, rows } = sheet;
      if (!rows || rows.length < 2) continue;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every((cell) => cell === "")) continue;

        const rowText = row.join(" ").toLowerCase();
        
        // Skip header-like rows or total rows
        if (/^(total|sub.?total|grand total)/i.test(rowText)) continue;
        if (rowText.includes("description") && rowText.includes("saving")) continue;

        const keywordRegex = /\b(ecm|energy|saving|motor|pump|compressor|hvac|chiller|boiler|vfd|led|lighting)\b/i;
        
        if (keywordRegex.test(rowText)) {
          // Find the longest string in the row as description
          const strings = row.filter(cell => typeof cell === "string" && isNaN(parseNum(cell)));
          const description = strings.sort((a, b) => b.length - a.length)[0] || rowText.substring(0, 50);

          // Find the first few numbers
          const numbers = row.map(cell => parseNum(cell)).filter(n => n !== null);
          
          if (description && description.length > 5) {
            projects.push({
              ecmNo: String(projects.length + 1),
              system: "Fallback ECM",
              description,
              energySaving: numbers[0] || null,
              annualSaving: numbers[1] || null,
              investment: numbers[2] || null,
              payback: numbers[3] || null,
              sourceSheet: sheetName,
              sourceRow: i + 1,
              isFallback: true
            });
          }
        }
      }
      
      if (projects.length > 0) break;
    }
  }

  return projects;
}

function findHeaderRow(rows) {
  const keywords = [
    "description",
    "project",
    "ecm",
    "saving",
    "investment",
    "system",
    "measure",
  ];
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const rowText = rows[i].join(" ").toLowerCase();
    const hits = keywords.filter((kw) => rowText.includes(kw)).length;
    if (hits >= 2) return i;
  }
  return -1;
}

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

module.exports = { extractLightweightExcelData };
