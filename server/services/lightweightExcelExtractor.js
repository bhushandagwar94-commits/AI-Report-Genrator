const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const FIELD_SYNONYMS = {
  ecmNo: ["ecm", "ecm no", "ecm number", "sr no", "project no", "measure no"],
  title: [
    "project",
    "project title",
    "ecm name",
    "ecm description",
    "energy saving project",
    "measure",
    "description",
    "recommendation",
  ],
  investment: [
    "investment",
    "total investment",
    "capex",
    "project cost",
    "estimated investment",
    "implementation cost",
  ],
  annualSaving: [
    "annual saving",
    "annual savings",
    "cost saving",
    "cost savings",
    "annual cost saving",
    "annual savings rs",
    "saving inr",
    "monetary saving",
    "financial saving",
  ],
  energySaving: [
    "energy saving",
    "energy savings",
    "kwh saving",
    "annual kwh saving",
    "kwh/year",
    "kwh/yr",
    "units saving",
  ],
  payback: ["payback", "simple payback", "roi", "spb", "years", "months"],
};

const KNOWN_MTL_BADDI_COLUMN_MAP = {
  ecmNo: 0,
  title: 5,
  investment: 15,
  annualSaving: 14,
  energySaving: 13,
  payback: 16,
};

const KNOWN_VR_CHENNAI_COLUMN_MAP = {
  ecmNo: 0,
  title: 3,
  investment: 13,
  annualSaving: 12,
  energySaving: 11,
  payback: 14,
};

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[₹â‚¹()]/g, "")
    .trim();
}

function columnLetter(index) {
  return String.fromCharCode(65 + Number(index || 0));
}

function isKnownMtlBaddiEcmFile(fileName = "") {
  const name = String(fileName).toLowerCase();
  return name.includes("mtl") && name.includes("baddi") && name.includes("ecm");
}

function isKnownVrChennaiEcmFile(fileName = "") {
  const name = String(fileName).toLowerCase();
  return name.includes("vr") && name.includes("chennai") && name.includes("ecm");
}

function shouldForceKnownColumnMap(fileName, headerRow = []) {
  const headerText = headerRow.map(normalizeHeader).join(" ");
  if (
    isKnownMtlBaddiEcmFile(fileName) &&
    /(sr|ecm|project)/.test(headerText) &&
    /investment|capex/.test(headerText) &&
    /annual\s*saving|annual\s*savings|cost\s*saving|savings\s*in\s*rs/.test(headerText) &&
    /energy\s*saving|saving\s*kwh|kwh/.test(headerText) &&
    /payback/.test(headerText)
  ) {
    return "mtl_baddi";
  }
  
  if (
    isKnownVrChennaiEcmFile(fileName) &&
    /(sr|ecm)/.test(headerText) &&
    /investment/.test(headerText) &&
    /savings\s*in\s*rs/.test(headerText) &&
    /saving,\s*kwh/.test(headerText) &&
    /payback/.test(headerText)
  ) {
    return "vr_chennai";
  }

  return null;
}

function buildForcedKnownColumnMap(mapType, headerRow = []) {
  const targetMap = mapType === "vr_chennai" 
    ? KNOWN_VR_CHENNAI_COLUMN_MAP 
    : KNOWN_MTL_BADDI_COLUMN_MAP;

  return Object.fromEntries(
    Object.entries(targetMap).map(([field, columnIndex]) => [
      field,
      {
        columnIndex,
        column: columnLetter(columnIndex),
        header: headerRow[columnIndex] || "",
        score: 100,
        source: `forced_known_${mapType}_map`,
      },
    ])
  );
}

function parseNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace(/[₹â‚¹]/g, "")
    .replace(/rs\.?/gi, "")
    .replace(/inr/gi, "")
    .replace(/kwh\/year/gi, "")
    .replace(/kwh\/yr/gi, "")
    .replace(/kwh/gi, "")
    .replace(/units/gi, "")
    .replace(/years?/gi, "")
    .replace(/,/g, "")
    .trim();

  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "na") return null;

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parsePaybackOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value).toLowerCase().trim();
  if (!text || text === "-" || text === "na") return null;

  if (text.includes("month")) {
    const months = parseNumberOrNull(text);
    return months === null ? null : months / 12;
  }

  return parseNumberOrNull(text);
}

function formatMoney(num) {
  if (num === null || num === undefined) return "[To be verified from source data]";
  return `₹${Math.round(num).toLocaleString("en-IN")}`;
}

function formatEnergy(num) {
  if (num === null || num === undefined) return "[To be verified from source data]";
  return Math.round(num).toLocaleString("en-IN");
}

function formatPayback(num) {
  if (num === null || num === undefined) return "[To be verified from source data]";
  return Number(num).toFixed(2);
}

function scoreInputFile(file) {
  const name = String(
    file?.originalname || file?.originalName || file?.filename || file?.name || ""
  ).toLowerCase();

  let score = 0;
  if (name.includes("ecm")) score += 1000;
  if (name.includes("baddi")) score += 100;
  if (name.includes("power analysis")) score += 700;
  if (name.includes("equipment")) score += 650;
  if (name.includes("energy audit data")) score += 600;
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) score += 100;
  return score;
}

function matchScore(header, synonyms) {
  const normalizedHeader = normalizeHeader(header);
  let best = 0;

  for (const synonym of synonyms) {
    const normalizedSynonym = normalizeHeader(synonym);
    if (normalizedHeader === normalizedSynonym) best = Math.max(best, 100);
    else if (normalizedHeader.includes(normalizedSynonym)) best = Math.max(best, 80);
    else if (
      normalizedSynonym.includes(normalizedHeader) &&
      normalizedHeader.length > 3
    ) {
      best = Math.max(best, 60);
    }
  }

  return best;
}

function scoreHeaderRow(row = []) {
  let hits = 0;
  let hasEcm = false;
  let hasTitle = false;
  let hasInvestment = false;

  row.forEach((cell) => {
    if (matchScore(cell, FIELD_SYNONYMS.ecmNo) > 0) hasEcm = true;
    if (matchScore(cell, FIELD_SYNONYMS.title) > 0) hasTitle = true;
    if (matchScore(cell, FIELD_SYNONYMS.investment) > 0) hasInvestment = true;
    if (matchScore(cell, FIELD_SYNONYMS.annualSaving) > 0) hits += 1;
    if (matchScore(cell, FIELD_SYNONYMS.energySaving) > 0) hits += 1;
    if (matchScore(cell, FIELD_SYNONYMS.payback) > 0) hits += 1;
  });

  let score = hits * 10;
  if (hasEcm) score += 20;
  if (hasTitle) score += 20;
  if (hasInvestment) score += 20;
  return score;
}

function countLikelyEcmRows(rows = []) {
  let count = 0;
  rows.forEach((row) => {
    const hasKeyword = row.some((cell) =>
      /(improvement|optimization|retrofit|replacement|installation|upgrade|saving|recovery|vfd|system)/i.test(
        String(cell)
      )
    );
    if (hasKeyword && row.length >= 3) count += 1;
  });
  return count;
}

function scoreSheet(sheetName, rows = []) {
  let score = 0;
  const name = String(sheetName || "").toLowerCase();

  if (/ecm|category|catergory|saving|project|proposal|summary/.test(name)) {
    score += 100;
  }

  const headerScores = rows.slice(0, 60).map((row, index) => ({
    index,
    score: scoreHeaderRow(row),
  }));

  const bestHeader = [...headerScores].sort((a, b) => b.score - a.score)[0];
  if (bestHeader) score += bestHeader.score;

  const validRows = countLikelyEcmRows(rows);
  score += validRows * 5;

  return {
    sheetName,
    score,
    bestHeaderRowIndex: bestHeader?.index ?? null,
    validRows,
  };
}

function buildColumnCandidates(headerRow = []) {
  const candidates = {};

  for (const field of Object.keys(FIELD_SYNONYMS)) {
    candidates[field] = [];
    headerRow.forEach((cell, columnIndex) => {
      const score = matchScore(cell, FIELD_SYNONYMS[field]);
      if (score > 0) {
        candidates[field].push({
          field,
          columnIndex,
          column: columnLetter(columnIndex),
          header: cell,
          score,
          source: "header_match",
        });
      }
    });
    candidates[field].sort((a, b) => b.score - a.score);
  }

  return candidates;
}

function pickColumn(candidates, field, usedColumns = new Set()) {
  const list = candidates[field] || [];
  for (const candidate of list) {
    if (!usedColumns.has(candidate.columnIndex)) {
      usedColumns.add(candidate.columnIndex);
      return candidate;
    }
  }
  return null;
}

function isLikelyProjectRow(row = [], columnMap = {}) {
  const title = row[columnMap.title?.columnIndex];
  const ecmNo = row[columnMap.ecmNo?.columnIndex];
  const titleText = String(title || "").trim();
  const text = titleText.toLowerCase();

  const hasTitle = titleText.length > 3;
  const hasEcm = /\d+/.test(String(ecmNo || ""));

  if (!hasTitle && !hasEcm) return false;
  if (/^(total|subtotal|summary|group total)$/i.test(text)) return false;
  if (/^ecm\s*name$/i.test(text)) return false;
  return true;
}

function validateEcmExtraction(projects = []) {
  const warnings = [];

  const annualSavingZeroCount = projects.filter(
    (p) => Number(p.annualSavingRaw || 0) === 0
  ).length;

  const energySavingZeroCount = projects.filter(
    (p) => Number(p.energySavingRaw || 0) === 0
  ).length;

  const investmentNonZeroCount = projects.filter(
    (p) => Number(p.investmentRaw || 0) > 0
  ).length;

  if (
    projects.length >= 5 &&
    investmentNonZeroCount > 0 &&
    annualSavingZeroCount / projects.length > 0.8
  ) {
    warnings.push({
      code: "ANNUAL_SAVING_NOT_EXTRACTED",
      message:
        "Annual Saving is zero for most ECMs while investment is available. Column D is probably not mapped.",
    });
  }

  if (
    projects.length >= 5 &&
    investmentNonZeroCount > 0 &&
    energySavingZeroCount / projects.length > 0.8
  ) {
    warnings.push({
      code: "ENERGY_SAVING_NOT_EXTRACTED",
      message:
        "Energy Saving is zero for most ECMs while investment is available. Column E is probably not mapped.",
    });
  }

  return warnings;
}

function resolveUploadedFilePath(baseStorageDir, file) {
  const candidates = [
    file?.location,
    file?.path,
    file?.storedPath,
    file?.absolutePath,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(baseStorageDir, candidate);
    if (fs.existsSync(resolved)) return resolved;
  }

  return null;
}

function buildProjectFromRow({
  row,
  rowIndex,
  columnMap,
  fileName,
  sheetName,
}) {
  const ecmNoValue = row[columnMap.ecmNo?.columnIndex];
  const titleValue = row[columnMap.title?.columnIndex];
  const investmentValue = row[columnMap.investment?.columnIndex];
  const annualSavingValue = row[columnMap.annualSaving?.columnIndex];
  const energySavingValue = row[columnMap.energySaving?.columnIndex];
  const paybackValue = row[columnMap.payback?.columnIndex];

  const investmentRaw = parseNumberOrNull(investmentValue);
  const annualSavingRaw = parseNumberOrNull(annualSavingValue);
  const energySavingRaw = parseNumberOrNull(energySavingValue);
  const paybackRaw = parsePaybackOrNull(paybackValue);

  const ecmNo = String(ecmNoValue || "").trim() || String(rowIndex);
  const title = String(titleValue || "").trim();

  return {
    ecmNo,
    projectNo: ecmNo,
    title,
    projectTitle: title,
    description: title,
    system: "Energy Saving Measures",

    investmentRaw,
    annualSavingRaw,
    energySavingRaw,
    paybackRaw,

    investment: formatMoney(investmentRaw),
    annualSaving: formatMoney(annualSavingRaw),
    energySaving: formatEnergy(energySavingRaw),
    payback: formatPayback(paybackRaw),

    sourceFile: fileName,
    sourceSheet: sheetName,
    sourceRow: rowIndex,

    fieldSources: {
      ecmNo: {
        column: columnMap.ecmNo?.column,
        columnIndex: columnMap.ecmNo?.columnIndex,
        rawValue: ecmNoValue,
      },
      title: {
        column: columnMap.title?.column,
        columnIndex: columnMap.title?.columnIndex,
        rawValue: titleValue,
      },
      investment: {
        column: columnMap.investment?.column,
        columnIndex: columnMap.investment?.columnIndex,
        rawValue: investmentValue,
      },
      annualSaving: {
        column: columnMap.annualSaving?.column,
        columnIndex: columnMap.annualSaving?.columnIndex,
        rawValue: annualSavingValue,
      },
      energySaving: {
        column: columnMap.energySaving?.column,
        columnIndex: columnMap.energySaving?.columnIndex,
        rawValue: energySavingValue,
      },
      payback: {
        column: columnMap.payback?.column,
        columnIndex: columnMap.payback?.columnIndex,
        rawValue: paybackValue,
      },
    },
  };
}

function projectCompletenessScore(project) {
  let score = 0;
  if (project.title) score += Math.min(project.title.length, 200);
  if (project.investmentRaw !== null) score += 50;
  if (project.annualSavingRaw !== null) score += 50;
  if (project.energySavingRaw !== null) score += 50;
  if (project.paybackRaw !== null) score += 25;
  return score;
}

function dedupeProjectsByEcmNo(projects = []) {
  const bestByEcm = new Map();

  for (const project of projects) {
    const key = String(project.ecmNo || "").trim();
    if (!key) continue;

    const existing = bestByEcm.get(key);
    if (!existing) {
      bestByEcm.set(key, project);
      continue;
    }

    if (projectCompletenessScore(project) > projectCompletenessScore(existing)) {
      bestByEcm.set(key, project);
    }
  }

  return [...bestByEcm.values()].sort((a, b) => {
    const left = Number(String(a.ecmNo || "").match(/\d+/)?.[0] || 9999);
    const right = Number(String(b.ecmNo || "").match(/\d+/)?.[0] || 9999);
    return left - right;
  });
}

function extractMultiFileExcelData(files = [], baseStorageDir) {
  const normalizedFiles = Array.isArray(files) ? files : [];
  const extractionDebug = {
    filesReceived: normalizedFiles.map(
      (file) => file?.filename || file?.originalname || file?.originalName || file?.name
    ),
    selectedPrimaryEcmFile: null,
    sheetsScanned: [],
    selectedEcmSheet: null,
    headerRowIndex: null,
    columnMap: {},
    extractedProjectsSample: [],
    validationWarnings: [],
    sourceUsage: {
      ecmFileUsed: false,
      powerAnalysisUsed: false,
      equipmentListUsed: false,
      energyAuditDataUsed: false,
    },
  };

  const scoredFiles = normalizedFiles
    .map((file) => ({ file, score: scoreInputFile(file) }))
    .sort((a, b) => b.score - a.score);

  const primaryFile = scoredFiles[0]?.file;
  if (!primaryFile) {
    return {
      success: false,
      error: "No valid excel files provided",
      extractionDebug,
    };
  }

  const primaryFileName =
    primaryFile.filename ||
    primaryFile.originalname ||
    primaryFile.originalName ||
    primaryFile.name;
  extractionDebug.selectedPrimaryEcmFile = primaryFileName;
  console.log("[PRIMARY_ECM_FILE_SELECTED]", primaryFileName);

  const primaryFilePath = resolveUploadedFilePath(baseStorageDir, primaryFile);
  if (!primaryFilePath) {
    return {
      success: false,
      error: "Primary file not found",
      extractionDebug,
    };
  }

  let workbook;
  try {
    workbook = XLSX.readFile(primaryFilePath, {
      cellDates: true,
      sheetStubs: true,
    });
    extractionDebug.sourceUsage.ecmFileUsed = true;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      extractionDebug,
    };
  }

  const sheetNames = workbook.SheetNames;
  const scannedSheets = [];

  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rows = XLSX.utils
      .sheet_to_json(worksheet, { header: 1, defval: "", blankrows: false })
      .map((row) => row.map((cell) => String(cell ?? "").trim()));

    const scoreInfo = scoreSheet(sheetName, rows);
    scannedSheets.push({ sheetName, rows, scoreInfo });
  }

  extractionDebug.sheetsScanned = scannedSheets.map((sheet) => sheet.scoreInfo);

  const bestSheet = [...scannedSheets].sort(
    (a, b) => b.scoreInfo.score - a.scoreInfo.score
  )[0];

  if (!bestSheet || bestSheet.scoreInfo.score <= 0) {
    return {
      success: false,
      error: "No valid ECM sheet found in primary file",
      extractionDebug,
    };
  }

  const headerRowIndex = bestSheet.scoreInfo.bestHeaderRowIndex;
  if (headerRowIndex === null || headerRowIndex === undefined) {
    return {
      success: false,
      error: "No ECM header row detected in selected sheet",
      extractionDebug,
    };
  }

  extractionDebug.selectedEcmSheet = bestSheet.sheetName;
  extractionDebug.headerRowIndex = headerRowIndex;

  console.log("[ECM_SHEET_SELECTED]", {
    sheetName: bestSheet.sheetName,
    score: bestSheet.scoreInfo.score,
    headerRowIndex,
    validRows: bestSheet.scoreInfo.validRows,
  });

  const headerRow = bestSheet.rows[headerRowIndex] || [];
  let columnMap = {};

  const forcedMapType = shouldForceKnownColumnMap(primaryFileName, headerRow);
  if (forcedMapType) {
    columnMap = buildForcedKnownColumnMap(forcedMapType, headerRow);
    console.log(`[FORCED_${forcedMapType.toUpperCase()}_ECM_COLUMN_MAP]`, columnMap);
  } else {
    const candidates = buildColumnCandidates(headerRow);
    const usedColumns = new Set();
    for (const field of [
      "ecmNo",
      "title",
      "investment",
      "annualSaving",
      "energySaving",
      "payback",
    ]) {
      columnMap[field] = pickColumn(candidates, field, usedColumns);
    }
  }

  extractionDebug.columnMap = columnMap;
  console.log("[DEVELOPER_PIPELINE_ECM_COLUMN_MAP]", columnMap);

  const projects = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < bestSheet.rows.length; rowIndex += 1) {
    const row = bestSheet.rows[rowIndex];
    if (!row || !row.some((cell) => String(cell || "").trim())) continue;
    if (!isLikelyProjectRow(row, columnMap)) continue;

    const project = buildProjectFromRow({
      row,
      rowIndex: rowIndex + 1,
      columnMap,
      fileName: primaryFileName,
      sheetName: bestSheet.sheetName,
    });

    if (!project.title) continue;
    if (/^(total|subtotal|summary)$/i.test(project.title)) continue;
    projects.push(project);
  }

  const dedupedProjects = dedupeProjectsByEcmNo(projects);
  const warnings = validateEcmExtraction(dedupedProjects);
  extractionDebug.validationWarnings.push(...warnings);
  extractionDebug.extractedProjectsSample = dedupedProjects.slice(0, 5);

  if (warnings.length) {
    console.warn("[ECM_EXTRACTION_VALIDATION_WARNINGS]", warnings);
  }

  const lowerNames = normalizedFiles.map((file) =>
    String(file?.filename || file?.originalname || file?.originalName || file?.name || "").toLowerCase()
  );
  extractionDebug.sourceUsage.powerAnalysisUsed = lowerNames.some((name) =>
    name.includes("power analysis")
  );
  extractionDebug.sourceUsage.equipmentListUsed = lowerNames.some((name) =>
    name.includes("equipment")
  );
  extractionDebug.sourceUsage.energyAuditDataUsed = lowerNames.some((name) =>
    name.includes("energy audit data")
  );

  return {
    success: true,
    parserUsed: "lightweight_xlsx_multi",
    fileName: primaryFileName,
    sheetNames,
    totalRows: bestSheet.rows.length,
    projects: dedupedProjects,
    projectCount: dedupedProjects.length,
    extractionDebug,
    warning: warnings[0]?.message,
  };
}

module.exports = {
  extractMultiFileExcelData,
  extractLightweightExcelData: extractMultiFileExcelData,
  parseNumberOrNull,
  validateEcmExtraction,
  isKnownMtlBaddiEcmFile,
  shouldForceKnownColumnMap,
};
