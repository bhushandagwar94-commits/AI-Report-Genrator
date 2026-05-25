const { reqBody, userFromSession } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { flexUserRoleValid, ROLES } = require("../utils/middleware/multiUserProtected");
const { handleFileUpload } = require("../utils/files/multer");
const { CollectorApi } = require("../utils/collectorApi");
const { buildCommercialBuildingEnergyAuditDocx } = require("../services/docxExportService");
const prisma = require("../utils/prisma");
const { getLLMProvider } = require("../utils/helpers");
const { getModelTag } = require("./utils");
const fs = require("fs");
const path = require("path");
const { directUploadsPath, hotdirPath } = require("../utils/files");
const extractJson = require("extract-json-from-string");
const ExcelJS = require("exceljs");
const multer = require("multer");
const { ensureAiReportGeneratorSeeded } = require("../utils/aiReportGeneratorSeed");
const {
  generateWithProvider,
  groupAndSortProjects,
  cleanAndDeduplicateProjects,
  buildProjectGroups,
  getProjectsForQC,
  normalizeReportForExport,
  runReportQC,
  buildCommercialBuildingEnergyAuditBaseData,
  validateCommercialBuildingEnergyAuditSchema,
  calculateReportAccuracyScore,
} = require("../services/llmProviderService");

const HIGH_RISK_FIELDS = new Set([
  "projectTitle",
  "system",
  "energySaving",
  "investment",
  "annualSaving",
  "payback",
]);

const MTL_BADDI_SIGNATURE_TITLES = [
  "ee improvement in chiller using ct segregation",
  "flow optimization for chw secondary pump",
  "asb 70 dph servo motor project",
  "compressed air measurement management",
];

function isValidProjectTitle(titleStr) {
  if (!titleStr || titleStr === "Data required") return false;
  const t = String(titleStr).toLowerCase().trim();
  
  // Rule 1: Reject pure duration patterns (e.g. "10 to 12 weeks", "2-4 months", "1 week")
  const durationPattern = /^(\d+([-\s]+to\s+\d+)?\s*(weeks?|months?|days?|yrs?|years?))$/i;
  if (durationPattern.test(t)) return false;

  // Rule 2: Reject known duration headers mapped as titles
  const forbiddenTitles = [
    "project lead time",
    "duration",
    "payback",
    "investment",
    "total",
    "notes"
  ];
  if (forbiddenTitles.includes(t)) return false;
  
  return true;
}

// ─── Slug → Template name mapping ──────────────────────────────────────────────
// Allows public clients to reference templates by slug (e.g. seetech-ea-001)
// instead of internal numeric DB ids.
const TEMPLATE_SLUG_MAP = {
  "commercial-building-energy-audit": "Commercial Building Energy Audit Report",
  "seetech-ea-001": "Detailed Energy Audit Report",
  "seetech-ba-001": "Boiler Audit Report",
  "seetech-mr-001": "Motor Retrofit Report",
  "seetech-apfc-001": "APFC Report",
  "seetech-solar-001": "Solar Report",
  "seetech-hvac-001": "HVAC Report",
};

/**
 * Resolve a template by either:
 *  - Numeric DB id (string "3" or number 3)
 *  - String slug (e.g. "seetech-ea-001")
 *  - Exact name (e.g. "Detailed Energy Audit Report")
 */
async function resolveTemplate(templateId) {
  if (!templateId) return null;

  // 1. Try as numeric DB id
  const asNum = parseInt(templateId, 10);
  if (!isNaN(asNum)) {
    return await prisma.report_templates.findFirst({ where: { id: asNum } });
  }

  // 2. Try as slug column
  const bySlug = await prisma.report_templates.findFirst({
    where: { slug: String(templateId) },
  });
  if (bySlug) return bySlug;

  // 3. Try slug→name map
  const mappedName = TEMPLATE_SLUG_MAP[String(templateId)];
  if (mappedName) {
    return await prisma.report_templates.findFirst({
      where: { name: mappedName },
    });
  }

  // 4. Try exact name match
  return await prisma.report_templates.findFirst({
    where: { name: String(templateId) },
  });
}

/**
 * Normalise the inbound generate request body.
 *
 * Supports two payload shapes:
 *
 * NEW — structured public payload:
 * {
 *   template_id: "seetech-ea-001",
 *   public_form: { client_name, facility_name, location, audit_period,
 *                  report_date, contact_person, output_format },
 *   uploaded_files: [...],
 *   generation_mode: "public",
 *   status: "submitted"
 * }
 *
 * LEGACY — original camelCase payload:
 * {
 *   templateId: 3,
 *   inputDetails: { ... },
 *   uploadedFiles: [...]
 * }
 */
function normaliseGenerateBody(body) {
  // Detect new structured payload by presence of template_id / public_form
  if (body.template_id !== undefined || body.public_form !== undefined) {
    const pf = body.public_form || {};
    // Merge public_form into inputDetails (camelCase for internal pipeline)
    const inputDetails = {
      clientName:    pf.client_name    || pf.clientName    || "",
      facilityName:  pf.facility_name  || pf.facilityName  || "",
      location:      pf.location       || "",
      auditPeriod:   pf.audit_period   || pf.auditPeriod   || "",
      reportDate:    pf.report_date    || pf.reportDate     || "",
      contactPerson: pf.contact_person || pf.contactPerson  || "",
      outputFormat:  pf.output_format  || pf.outputFormat   || "pdf",
    };
    return {
      templateId:     body.template_id,
      inputDetails,
      uploadedFiles:  body.uploaded_files  || [],
      generationMode: body.generation_mode || "public",
      publicForm:     pf,
      status:         body.status          || "submitted",
    };
  }

  // Legacy payload — pass through unchanged
  return {
    templateId:     body.templateId,
    inputDetails:   body.inputDetails   || {},
    uploadedFiles:  body.uploadedFiles  || [],
    generationMode: body.generationMode || "public",
    publicForm:     null,
    status:         "submitted",
  };
}

const excelUpload = multer({ storage: multer.memoryStorage() }).array("files");

const EXCEL_FIELD_SYNONYMS = {
  rowNumber: ["sr", "srno", "sr no", "ecm no", "ecmno"],
  projectTitle: [
    "project name", "energy saving project", "ecm name", "project title", "recommendation", "saving opportunity", "project", "ecm"
  ],
  proposedIntervention: [
    "energy saving project", "project description", "description"
  ],
  projectActivities: ["project activities", "activities", "scope of work"],
  system: ["section", "4 category", "category", "system", "area", "utility", "equipment type", "department", "project category"],
  investment: ["investment, rs.", "investment", "estimated investment", "project cost", "capex", "implementation cost", "investment rs", "cost", "inr"],
  annualSaving: [
    "savings in rs/year", "annual saving", "cost saving", "monetary saving", "yearly saving",
    "saving rs", "rs/year", "annual benefit", "annual savings"
  ],
  energySaving: [
    "saving kwh/year", "energy saving kwh/year", "saving kwh", "electricity saving", "annual energy saving",
    "energy savings (kwh/year)", "units saving"
  ],
  payback: ["payback period, years", "payback period", "simple payback", "roi", "payback", "years", "months"],
  priority: ["priority", "preority", "implementation priority", "ranking", "action priority", "priority phase i/ii/iii", "priority phase"],
  location: ["location", "area", "plant room", "floor", "building area"],
  equipmentCovered: ["equipment name", "equipment covered", "equipment", "machine", "asset", "load"],
  implementationDuration: ["project lead time", "implementation duration", "duration", "timeline", "weeks", "months"],
  co2Reduction: ["co2", "carbon", "emission", "emission reduction", "tco2", "tco2/year"],
  emissionFactor: ["emission factor", "grid emission", "grid emission factor"],
  rationale: ["rational for energy saving project", "rationale", "rational", "saving principle"],
  baselineDetails: ["notes (baseline details & others)", "baseline details", "baseline", "existing condition", "notes"],
  baselineConsumption: ["baseline consumption", "baseline kwhyear", "baselinekwhyear", "baseline kwh year", "baseline, kwh/year"]
};

const RECOMMENDED_EXCEL_COLUMNS = [
  "projectTitle",
  "system",
  "investment",
  "annualSaving",
  "energySaving",
  "payback",
  "priority",
  "location",
  "equipmentCovered",
  "implementationDuration",
  "co2Reduction",
  "rationale",
  "baselineDetails"
];

const EXCEL_COLUMN_LABELS = {
  projectTitle: "Project title / ECM name",
  system: "System / category",
  investment: "Investment ₹",
  annualSaving: "Annual saving ₹/year",
  energySaving: "Energy saving kWh/year",
  payback: "Payback",
  priority: "Priority",
  location: "Location",
  equipmentCovered: "Equipment covered",
  implementationDuration: "Implementation duration",
  co2Reduction: "CO2 reduction",
  rationale: "Rationale / saving principle",
  baselineDetails: "Baseline / existing condition",
};

const EXCEL_FIELD_MATCH_ORDER = [
  "rowNumber",
  "emissionFactor",
  "co2Reduction",
  "annualSaving",
  "energySaving",
  "payback",
  "investment",
  "priority",
  "implementationDuration",
  "equipmentCovered",
  "system",
  "location",
  "projectTitle",
  "proposedIntervention",
  "projectActivities",
  "rationale",
  "baselineConsumption",
  "baselineDetails"
];

function normalizeExcelHeader(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[₹$€£]/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function cellText(cell) {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") {
    if (cell.text) return String(cell.text);
    if (cell.result !== undefined) return String(cell.result);
    if (cell.richText) return cell.richText.map((part) => part.text || "").join("");
    if (cell.hyperlink && cell.text) return String(cell.text);
  }
  return String(cell);
}

function mapHeaderToField(header) {
  const normalized = normalizeExcelHeader(header);
  if (!normalized) return null;

  for (const field of EXCEL_FIELD_MATCH_ORDER) {
    const synonyms = EXCEL_FIELD_SYNONYMS[field] || [];
    if (
      synonyms.some((synonym) => {
        const normalizedSynonym = normalizeExcelHeader(synonym);
        return normalized === normalizedSynonym || normalized.includes(normalizedSynonym);
      })
    ) {
      return field;
    }
  }
  return null;
}

function levenshteinDistance(a = "", b = "") {
  const left = String(a);
  const right = String(b);
  const rows = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= right.length; j++) rows[0][j] = j;
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost
      );
    }
  }
  return rows[left.length][right.length];
}

function stringSimilarityScore(a = "", b = "") {
  const left = normalizeExcelHeader(a);
  const right = normalizeExcelHeader(b);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) return 90;
  const distance = levenshteinDistance(left, right);
  const longest = Math.max(left.length, right.length) || 1;
  return Math.max(0, Math.round((1 - distance / longest) * 100));
}

function getHeaderMatchForField(header, field) {
  const normalizedHeader = normalizeExcelHeader(header);
  const synonyms = EXCEL_FIELD_SYNONYMS[field] || [];
  let best = {
    fieldName: field,
    matchedColumn: header,
    confidence: 0,
    matchType: "not_found",
    approvedSynonym: "",
  };

  for (const synonym of synonyms) {
    const normalizedSynonym = normalizeExcelHeader(synonym);
    let confidence = 0;
    let matchType = "not_found";
    if (normalizedHeader === normalizedSynonym) {
      confidence = 100;
      matchType = "exact";
    } else if (normalizedHeader.includes(normalizedSynonym) || normalizedSynonym.includes(normalizedHeader)) {
      confidence = 90;
      matchType = "synonym";
    } else {
      confidence = stringSimilarityScore(normalizedHeader, normalizedSynonym);
      matchType = confidence >= 70 ? "fuzzy" : "not_found";
    }

    if (confidence > best.confidence) {
      best = {
        fieldName: field,
        matchedColumn: header,
        confidence,
        matchType,
        approvedSynonym: synonym,
      };
    }
  }

  return best;
}

function analyzeColumnSampleType(values = []) {
  const normalizedValues = values
    .map((value) => cellText(value).trim())
    .filter(Boolean)
    .slice(0, 8);

  let numericCount = 0;
  let textCount = 0;
  let durationCount = 0;
  let projectStyleCount = 0;
  let smallIntegerCount = 0;

  normalizedValues.forEach((value) => {
    const lower = value.toLowerCase();
    if (/^-?[\d,]+(\.\d+)?$/.test(value.replace(/,/g, ""))) {
      numericCount++;
      const numericValue = Number(value.replace(/,/g, ""));
      if (Number.isFinite(numericValue) && numericValue > 0 && numericValue < 100) {
        smallIntegerCount++;
      }
    } else {
      textCount++;
    }

    if (/^\d+\s*(to|-)?\s*\d*\s*(weeks|months|days|hrs|hours|yrs|years)$/i.test(lower)) {
      durationCount++;
    }

    if (/(project|retrofit|improvement|optimization|saving|heater|compressor|pump|motor|chiller|fan|blower|dryer|insulation|servo|apfc)/i.test(lower)) {
      projectStyleCount++;
    }
  });

  return {
    sampleValues: normalizedValues,
    numericCount,
    textCount,
    durationCount,
    projectStyleCount,
    smallIntegerCount,
    totalSamples: normalizedValues.length,
  };
}

function validateColumnAgainstField(field, analysis) {
  const samples = analysis.totalSamples || 0;
  if (!samples) {
    return { accepted: false, reason: "No usable sample values found for mapped column." };
  }

  const mostlyNumeric = analysis.numericCount >= Math.max(2, Math.ceil(samples * 0.6));
  const mostlyText = analysis.textCount >= Math.max(2, Math.ceil(samples * 0.6));

  switch (field) {
    case "projectTitle":
      if (!mostlyText || analysis.projectStyleCount === 0 || analysis.durationCount >= Math.ceil(samples / 2)) {
        return { accepted: false, reason: "Project title column does not look like ECM/project titles." };
      }
      return { accepted: true, reason: "Column sample values look like ECM titles." };
    case "system":
      if (!mostlyText || analysis.numericCount > analysis.textCount) {
        return { accepted: false, reason: "System/category column appears numeric or financially typed." };
      }
      return { accepted: true, reason: "Column sample values look like system/category text." };
    case "energySaving":
      if (!mostlyNumeric) {
        return { accepted: false, reason: "Energy saving column is not predominantly numeric." };
      }
      if (analysis.smallIntegerCount >= Math.ceil(samples / 2)) {
        return { accepted: false, reason: "Energy saving column resembles ECM numbers or serial numbers." };
      }
      return { accepted: true, reason: "Column sample values look like annual kWh savings." };
    case "annualSaving":
    case "investment":
      if (!mostlyNumeric) {
        return { accepted: false, reason: `${field} column is not predominantly numeric.` };
      }
      return { accepted: true, reason: "Column sample values look like financial figures." };
    case "payback":
      if (!mostlyNumeric) {
        return { accepted: false, reason: "Payback column is not predominantly numeric." };
      }
      return { accepted: true, reason: "Column sample values look like payback values." };
    case "equipmentCovered":
      if (!mostlyText) {
        return { accepted: false, reason: "Equipment column is not predominantly text." };
      }
      return { accepted: true, reason: "Column sample values look like equipment names." };
    case "implementationDuration":
      if (analysis.durationCount === 0 && !mostlyText) {
        return { accepted: false, reason: "Implementation duration column does not resemble duration text." };
      }
      return { accepted: true, reason: "Column sample values look like duration text." };
    default:
      return { accepted: true, reason: "No additional type restrictions failed." };
  }
}

function getColumnSampleValues(worksheet, headerRowNumber, columnIndex) {
  const values = [];
  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount && values.length < 8; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const cellValue = row.values?.[columnIndex];
    if (isBlankExcelRow(row.values || []) || isTotalExcelRow(row.values || [])) continue;
    if (cellText(cellValue).trim()) values.push(cellValue);
  }
  return values;
}

function buildHeaderConfidenceReport(worksheet, rowNumber, values) {
  const fieldReports = {};
  const fieldBestIndexes = {};
  const detectedColumns = [];

  values.forEach((value, index) => {
    const header = cellText(value).trim();
    if (!header) return;
    detectedColumns.push(header);
    let bestCandidate = null;

    for (const field of EXCEL_FIELD_MATCH_ORDER) {
      const candidate = getHeaderMatchForField(header, field);
      if (!bestCandidate || candidate.confidence > bestCandidate.confidence) {
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) return;

    const sampleValues = getColumnSampleValues(worksheet, rowNumber, index);
    const analysis = analyzeColumnSampleType(sampleValues);
    const fieldValidation = validateColumnAgainstField(bestCandidate.fieldName, analysis);
    const threshold = HIGH_RISK_FIELDS.has(bestCandidate.fieldName) ? 85 : 70;
    const accepted = bestCandidate.confidence >= threshold && fieldValidation.accepted;

    const report = {
      fieldName: bestCandidate.fieldName,
      matchedColumn: header,
      confidence: accepted ? bestCandidate.confidence : Math.min(bestCandidate.confidence, threshold - 1),
      matchType: bestCandidate.matchType,
      sampleValues: analysis.sampleValues,
      accepted,
      rejected: !accepted,
      reason: fieldValidation.reason,
      approvedSynonym: bestCandidate.approvedSynonym,
    };

    if (!fieldReports[bestCandidate.fieldName] || report.confidence > fieldReports[bestCandidate.fieldName].confidence) {
      fieldReports[bestCandidate.fieldName] = report;
      fieldBestIndexes[bestCandidate.fieldName] = index;
    }
  });

  const mappedByIndex = {};
  const mappedColumns = {};
  Object.entries(fieldReports).forEach(([fieldName, report]) => {
    if (!report.accepted) return;
    const index = fieldBestIndexes[fieldName];
    mappedByIndex[index] = fieldName;
    mappedColumns[fieldName] = report.matchedColumn;
  });

  return { mappedByIndex, mappedColumns, detectedColumns, fieldReports };
}

function mappedColumnsFromRow(values, worksheet = null, rowNumber = 0) {
  if (worksheet && rowNumber) {
    return buildHeaderConfidenceReport(worksheet, rowNumber, values);
  }

  const mappedByIndex = {};
  const mappedColumns = {};
  const detectedColumns = [];
  const fieldReports = {};

  values.forEach((value, index) => {
    const header = cellText(value).trim();
    if (!header) return;
    detectedColumns.push(header);
    const field = mapHeaderToField(header);
    if (!field || mappedColumns[field]) return;
    mappedByIndex[index] = field;
    mappedColumns[field] = header;
    fieldReports[field] = {
      fieldName: field,
      matchedColumn: header,
      confidence: 100,
      matchType: "exact",
      sampleValues: [],
      accepted: true,
      rejected: false,
      reason: "Fallback header mapping without sheet context.",
      approvedSynonym: header,
    };
  });

  return { mappedByIndex, mappedColumns, detectedColumns, fieldReports };
}

function isBlankExcelRow(values) {
  return !values.some((value, index) => index > 0 && cellText(value).trim());
}

function isTotalExcelRow(values) {
  const meaningfulCells = values
    .map((value) => cellText(value).trim())
    .filter(Boolean);
  if (!meaningfulCells.length) return false;
  const leadingCells = meaningfulCells.slice(0, 3).join(" ").toLowerCase();
  return /^(total|grand total|subtotal)\b/.test(leadingCells);
}

function normalizeProjectAuditTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(project|nos|no)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberCell(value) {
  const text = cellText(value).trim();
  if (!text) return "";
  const numeric = text.replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(numeric) ? numeric : text;
}

function preferredFieldValue(rowMap, ...fields) {
  for (const field of fields) {
    const value = cellText(rowMap[field]).trim();
    if (value) return value;
  }
  return "";
}

function buildStructuredList(text, primaryKey, secondaryKeys = []) {
  const cleaned = String(text || "").replace(/\r/g, "\n").trim();
  if (!cleaned) return [];

  const segments = cleaned
    .split(/\n+|(?<=\.)\s+(?=\d+\.)/g)
    .map((segment) => segment.replace(/^\d+[\).\s-]*/, "").trim())
    .filter(Boolean);

  const rows = (segments.length ? segments : [cleaned]).map((segment, index) => {
    const row = { [primaryKey]: segment };
    secondaryKeys.forEach((key) => {
      row[key] = segment;
    });
    if (!row.srNo) row.srNo = index + 1;
    return row;
  });

  return rows;
}

function normalizeGroupTitle(rawValue) {
  const text = String(rawValue || "").toLowerCase().trim();
  if (!text) return "";
  if (text.includes("cooling")) return "Cooling System Performance Improvement";
  if (text.includes("production")) return "Production Machines";
  if (text.includes("air compressor")) return "Air Compressors";
  if (text.includes("auxiliary")) return "Auxiliary Systems & Machine Improvement";
  return String(rawValue || "").trim();
}

function extractGroupTitleMap(workbook) {
  const titleToGroup = {};

  workbook.eachSheet((worksheet) => {
    let currentGroupTitle = "";
    let inGroupTable = false;

    worksheet.eachRow((row) => {
      const values = (row.values || []).slice(1).map((value) => cellText(value).trim());
      const joined = values.join(" ").toLowerCase();

      if (joined.includes("energy saving projects for")) {
        currentGroupTitle = normalizeGroupTitle(values.find((value) => /energy saving projects for/i.test(value)));
        inGroupTable = false;
        return;
      }

      if (values.some((value) => /ecm name/i.test(value)) && values.some((value) => /investment/i.test(value))) {
        inGroupTable = true;
        return;
      }

      if (!currentGroupTitle || !inGroupTable) return;
      if (values.some((value) => /^total$/i.test(value))) {
        inGroupTable = false;
        return;
      }

      const ecmName = values[1];
      if (!ecmName || /^ecm name$/i.test(ecmName)) return;
      titleToGroup[normalizeProjectAuditTitle(ecmName)] = currentGroupTitle;
    });
  });

  return titleToGroup;
}

function scoreAuthoritativeHeader(mapping) {
  const required = ["projectTitle", "equipmentCovered", "system", "energySaving", "annualSaving", "investment", "payback"];
  const optional = ["baselineDetails", "rationale", "implementationDuration", "priority", "proposedIntervention"];
  let score = required.reduce((sum, field) => {
    const confidence = mapping.fieldReports?.[field]?.accepted ? mapping.fieldReports[field].confidence : 0;
    return sum + Math.round(confidence / 10);
  }, 0);
  score += optional.reduce((sum, field) => {
    const confidence = mapping.fieldReports?.[field]?.accepted ? mapping.fieldReports[field].confidence : 0;
    return sum + Math.round(confidence / 25);
  }, 0);
  return score;
}

function detectDatasetProfile(projects = []) {
  const normalizedTitles = projects.map((project) => normalizeProjectAuditTitle(project.projectTitle));
  const matchedSignatureCount = MTL_BADDI_SIGNATURE_TITLES.filter((title) =>
    normalizedTitles.some((projectTitle) => projectTitle.includes(title))
  ).length;

  if (matchedSignatureCount >= 3) {
    return {
      datasetName: "MTL Baddi ECM",
      expectedEcmCount: 22,
      expectedGroups: {
        "Cooling System Performance Improvement": 7,
        "Production Machines": 8,
        "Air Compressors": 2,
        "Auxiliary Systems & Machine Improvement": 5,
      },
    };
  }

  return null;
}

function extractAuthoritativeExcelProjects(workbook) {
  const groupTitleMap = extractGroupTitleMap(workbook);
  let bestSheet = null;
  let bestHeader = null;

  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row, rowNumber) => {
      const values = row.values || [];
      const mapping = mappedColumnsFromRow(values, worksheet, rowNumber);
      const score = scoreAuthoritativeHeader(mapping);
      if (score > (bestHeader?.score || 0)) {
        bestHeader = { worksheet, rowNumber, score, ...mapping };
        bestSheet = worksheet;
      }
    });
  });

  if (!bestHeader || !bestSheet) {
    return {
      sheetName: "",
      headerRow: 0,
      rawRowCount: 0,
      projects: [],
      auditRows: [],
      removedRows: [],
      mergedCount: 0,
      groupCounts: {},
      mappingConfidence: [],
      datasetProfile: null,
    };
  }

  const auditRows = [];
  const removedRows = [];
  const projects = [];

  bestSheet.eachRow((row, rowNumber) => {
    if (rowNumber <= bestHeader.rowNumber) return;
    const values = row.values || [];
    if (isBlankExcelRow(values) || isTotalExcelRow(values)) return;

    const rowMap = {};
    Object.entries(bestHeader.mappedByIndex).forEach(([idx, field]) => {
      rowMap[field] = values[Number(idx)];
    });

    const projectTitle = preferredFieldValue(rowMap, "projectTitle", "proposedIntervention");
    const equipmentCovered = preferredFieldValue(rowMap, "equipmentCovered");
    const system = preferredFieldValue(rowMap, "system");
    const proposedIntervention = preferredFieldValue(rowMap, "proposedIntervention", "projectTitle");
    const rationale = preferredFieldValue(rowMap, "rationale");
    const baselineDetails = preferredFieldValue(rowMap, "baselineDetails");
    const baselineConsumption = preferredFieldValue(rowMap, "baselineConsumption");
    const energySaving = preferredFieldValue(rowMap, "energySaving");
    const annualSaving = preferredFieldValue(rowMap, "annualSaving");
    const investment = preferredFieldValue(rowMap, "investment");
    const payback = preferredFieldValue(rowMap, "payback");
    const implementationDuration = preferredFieldValue(rowMap, "implementationDuration");
    const priority = preferredFieldValue(rowMap, "priority");
    const projectActivities = preferredFieldValue(rowMap, "projectActivities");
    const rowNumberText = preferredFieldValue(rowMap, "rowNumber");

    const audit = {
      rowNumber,
      projectTitleSourceColumn: bestHeader.mappedColumns.projectTitle || "",
      projectTitle,
      equipmentName: equipmentCovered,
      systemCategory: system,
      confidence: Object.values(bestHeader.fieldReports || {}).reduce((sum, item) => sum + (item.accepted ? item.confidence : 0), 0),
      missingCriticalFields: [],
      investment,
      annualSaving,
      energySaving,
      payback,
      duration: implementationDuration,
      mappedValues: {
        projectNo: rowNumberText,
        projectTitle,
        equipmentCovered,
        system,
        energySaving,
        annualSaving,
        investment,
        payback,
        implementationDuration,
      },
      action: "removed",
      reason: "",
    };

    if (!projectTitle) audit.missingCriticalFields.push("projectTitle");
    if (!energySaving && !annualSaving && !investment && !payback) {
      audit.missingCriticalFields.push("financialOrSavingValue");
    }

    if (!projectTitle) {
      audit.reason = "Missing project title.";
      auditRows.push(audit);
      removedRows.push(audit);
      return;
    }

    if (!isValidProjectTitle(projectTitle)) {
      audit.reason = "Invalid project title.";
      auditRows.push(audit);
      removedRows.push(audit);
      return;
    }

    if (/^[\d.,]+$/.test(system) || /^[\d.,]+$/.test(projectTitle)) {
      audit.reason = "Numeric-only value detected in title or system.";
      auditRows.push(audit);
      removedRows.push(audit);
      return;
    }

    if (!energySaving && !annualSaving && !investment && !payback) {
      audit.reason = "Row does not contain any usable saving or financial value.";
      auditRows.push(audit);
      removedRows.push(audit);
      return;
    }

    const normalizedTitle = normalizeProjectAuditTitle(projectTitle);
    const explicitGroupTitle = groupTitleMap[normalizedTitle] || "";

    const project = {
      sourceRowNumber: rowNumber,
      projectNo: rowNumberText || String(projects.length + 1),
      projectTitle,
      equipmentCovered: equipmentCovered || "Data required",
      system: system || explicitGroupTitle || "Data required",
      groupTitle: explicitGroupTitle,
      proposedIntervention,
      proposedProjectDescription: proposedIntervention || projectTitle,
      rationale: rationale || "Data required",
      rationaleForEnergySaving: rationale || "Data required",
      baselineDetails: baselineDetails || "Data required",
      existingOperatingCondition: baselineDetails || "Data required",
      existingSystemDescription: baselineDetails || "Data required",
      baselineConsumption,
      expectedEnergySaving: parseNumberCell(energySaving),
      expectedAnnualCostSaving: parseNumberCell(annualSaving),
      estimatedInvestment: parseNumberCell(investment),
      simplePaybackPeriod: parseNumberCell(payback),
      implementationDuration: implementationDuration || "Data required",
      implementationPriority: priority || "Data required",
      projectActivitiesText: projectActivities || "Data required",
      scopeOfWork: buildStructuredList(projectActivities, "scopeItem"),
      keyActivities: buildStructuredList(projectActivities, "activity", ["details"]),
      baselineData: baselineConsumption
        ? [{ parameter: "Baseline consumption", unit: "kWh/year", value: parseNumberCell(baselineConsumption) }]
        : [],
    };

    audit.action = "kept";
    audit.reason = "Mapped from authoritative Excel columns.";
    auditRows.push(audit);
    projects.push(project);
  });

  const groupCounts = {};
  projects.forEach((project) => {
    const key = project.groupTitle || project.system || "Ungrouped";
    groupCounts[key] = (groupCounts[key] || 0) + 1;
  });
  const datasetProfile = detectDatasetProfile(projects);

  const rawProjectRowCount = auditRows.filter(
    (row) => row.projectTitle || row.reason === "Invalid project title."
  ).length;

  return {
    sheetName: bestSheet.name,
    headerRow: bestHeader.rowNumber,
    rawRowCount: rawProjectRowCount,
    projects,
    auditRows,
    removedRows,
    mergedCount: 0,
    groupCounts,
    mappingConfidence: Object.values(bestHeader.fieldReports || {}),
    datasetProfile,
  };
}

function generateRecommendations(mappedColumns) {
  const recommendations = {
    highPriority: [],
    mediumPriority: [],
    optional: []
  };

  if (!mappedColumns.system) {
    recommendations.highPriority.push({
      field: "System / Category",
      priority: "high",
      whyItMatters: "Helps the report group ECMs correctly under the category-wise financial summary.",
      suggestedColumnNames: ["System", "Category", "Utility", "Project Category"],
      exampleValues: ["HVAC", "Lighting", "Pumps", "Electrical", "Solar"]
    });
  }

  if (!mappedColumns.investment) {
    recommendations.highPriority.push({
      field: "Investment ₹",
      priority: "high",
      whyItMatters: "Required for financial summary and payback calculation.",
      suggestedColumnNames: ["Investment", "Estimated Cost", "Project Cost"],
      exampleValues: ["100000", "50000"]
    });
  }

  if (!mappedColumns.annualSaving) {
    recommendations.highPriority.push({
      field: "Annual Saving ₹/year",
      priority: "high",
      whyItMatters: "Required for management summary and ROI evaluation.",
      suggestedColumnNames: ["Annual Saving", "Cost Saving", "Monetary Saving"],
      exampleValues: ["50000", "20000"]
    });
  }

  if (!mappedColumns.energySaving) {
    recommendations.highPriority.push({
      field: "Energy Saving kWh/year",
      priority: "high",
      whyItMatters: "Required for energy saving calculation, key metrics and carbon footprint estimation.",
      suggestedColumnNames: ["Energy Saving kWh/year", "Saving kWh", "Electricity Saving"],
      exampleValues: ["10000", "5000"]
    });
  }

  if (!mappedColumns.payback) {
    recommendations.highPriority.push({
      field: "Payback Period",
      priority: "high",
      whyItMatters: "Helps the report rank projects and justify implementation priority.",
      suggestedColumnNames: ["Payback", "Simple Payback", "ROI"],
      exampleValues: ["2.5", "1.2"]
    });
  }

  if (!mappedColumns.priority) {
    recommendations.highPriority.push({
      field: "Implementation Priority",
      priority: "high",
      whyItMatters: "Helps generate the Recommended Implementation Priority section.",
      suggestedColumnNames: ["Priority", "Phase", "Implementation Priority"],
      exampleValues: ["High", "Medium", "Low"]
    });
  }

  if (!mappedColumns.equipmentCovered) {
    recommendations.highPriority.push({
      field: "Equipment Covered",
      priority: "high",
      whyItMatters: "Improves Project Summary, Existing System Description and Technical Specifications.",
      suggestedColumnNames: ["Equipment Covered", "Asset", "Machine"],
      exampleValues: ["AHU-1", "Chiller 2"]
    });
  }

  if (!mappedColumns.baselineDetails) {
    recommendations.highPriority.push({
      field: "Baseline / Existing Condition",
      priority: "high",
      whyItMatters: "Crucial for describing the current state before the proposed measure.",
      suggestedColumnNames: ["Baseline", "Existing Condition", "Notes"],
      exampleValues: ["Old 15W CFL bulbs currently installed"]
    });
  }

  if (!mappedColumns.location) {
    recommendations.mediumPriority.push({
      field: "Location",
      priority: "medium",
      whyItMatters: "Improves the project summary and implementation planning sections.",
      suggestedColumnNames: ["Location", "Plant Room", "Floor"],
      exampleValues: ["AHU Room", "Ground Floor"]
    });
  }

  if (!mappedColumns.implementationDuration) {
    recommendations.mediumPriority.push({
      field: "Implementation Duration",
      priority: "medium",
      whyItMatters: "Improves the implementation roadmap section.",
      suggestedColumnNames: ["Implementation Duration", "Project Lead Time", "Timeline"],
      exampleValues: ["2 weeks", "3 months"]
    });
  }

  if (!mappedColumns.co2Reduction) {
    recommendations.mediumPriority.push({
      field: "CO2 Reduction",
      priority: "medium",
      whyItMatters: "Highlights environmental impact. (If not provided, the system will try to calculate it).",
      suggestedColumnNames: ["CO2 Reduction", "tCO2/year", "Carbon Saving"],
      exampleValues: ["15.5", "120"]
    });
  }

  if (!mappedColumns.rationale) {
    recommendations.mediumPriority.push({
      field: "Rationale / Saving Principle",
      priority: "medium",
      whyItMatters: "Explains the engineering logic behind the savings.",
      suggestedColumnNames: ["Rationale", "Saving Principle"],
      exampleValues: ["VFD optimizes part load efficiency"]
    });
  }

  recommendations.optional.push({
    field: "Additional Fields",
    priority: "optional",
    whyItMatters: "Adding fields like 'Case study reference', 'Measurement data', or 'Implementation risks' will enhance report depth.",
    suggestedColumnNames: [],
    exampleValues: []
  });

  return recommendations;
}

async function validateExcelBuffer(file) {
  const result = {
    filename: file.originalname,
    fileType: "excel",
    status: "error",
    canGenerate: false,
    readinessScore: 0,
    professionalSummary: "",
    sheets: [],
    headerRow: 0,
    detectedColumns: [],
    mappedColumns: {
      projectTitle: "",
      system: "",
      investment: "",
      annualSaving: "",
      energySaving: "",
      payback: "",
      priority: "",
      location: "",
      equipmentCovered: "",
      implementationDuration: "",
      co2Reduction: "",
      rationale: "",
      baselineDetails: ""
    },
    projectRowsDetected: 0,
    criticalIssues: [],
    highPriorityRecommendations: [],
    mediumPriorityRecommendations: [],
    optionalRecommendations: [],
    technicalDetails: {},
    errors: [],
  };

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    result.sheets = workbook.worksheets.map((sheet) => sheet.name);

    let bestHeader = null;
    const sheetHeaders = [];

    workbook.eachSheet((worksheet) => {
      let localBest = null;
      worksheet.eachRow((row, rowNumber) => {
        const values = row.values || [];
        const mapping = mappedColumnsFromRow(values);
        const score = Object.keys(mapping.mappedColumns).length;
        if (score > (localBest?.score || 0)) {
          localBest = { worksheet, rowNumber, score, ...mapping };
        }
      });

      if (!localBest || localBest.score === 0) return;
      sheetHeaders.push(localBest);
      if (!bestHeader || localBest.score > bestHeader.score) bestHeader = localBest;
    });

    if (!bestHeader) {
      result.errors.push("No usable header row was detected.");
      result.criticalIssues.push("No usable header row was detected.");
      result.status = "error";
      result.professionalSummary = "Excel validation failed. The file does not contain enough project/ECM data for report generation.";
      return result;
    }

    result.headerRow = bestHeader.rowNumber;
    result.detectedColumns = bestHeader.detectedColumns;
    result.mappedColumns = { ...result.mappedColumns, ...bestHeader.mappedColumns };

    for (const header of sheetHeaders) {
      if (!header.mappedColumns.projectTitle) continue;
      const projectColumnIndex = Number(
        Object.entries(header.mappedByIndex).find(([, field]) => field === "projectTitle")?.[0]
      );
      header.worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= header.rowNumber) return;
        const values = row.values || [];
        if (isBlankExcelRow(values) || isTotalExcelRow(values)) return;
        const projectValue = cellText(values[projectColumnIndex]).trim();
        if (projectValue) result.projectRowsDetected += 1;
      });
    }

    let readinessScore = 0;
    if (result.mappedColumns.projectTitle) readinessScore += 20;
    if (
      result.mappedColumns.investment || 
      result.mappedColumns.annualSaving || 
      result.mappedColumns.energySaving || 
      result.mappedColumns.payback
    ) {
      readinessScore += 20;
    }
    
    if (result.mappedColumns.energySaving) readinessScore += 15;
    if (result.mappedColumns.annualSaving) readinessScore += 15;
    if (result.mappedColumns.investment) readinessScore += 10;
    if (result.mappedColumns.payback) readinessScore += 10;
    if (result.mappedColumns.system) readinessScore += 5;
    if (result.mappedColumns.priority) readinessScore += 3;
    if (result.mappedColumns.location) readinessScore += 1;
    if (result.mappedColumns.co2Reduction) readinessScore += 1;
    
    result.readinessScore = Math.min(100, readinessScore);

    const hasProjectColumn = !!result.mappedColumns.projectTitle;
    const hasUsableMetric = ["investment", "annualSaving", "energySaving", "payback"].some(
      (field) => !!result.mappedColumns[field]
    );

    if (!hasProjectColumn) {
      result.criticalIssues.push("Project / ECM / Measure / Recommendation column is missing.");
    }
    if (!hasUsableMetric) {
      result.criticalIssues.push("At least one financial/saving column (Investment, Annual Saving, Energy Saving, or Payback) is missing.");
    }
    if (result.projectRowsDetected === 0) {
      result.criticalIssues.push("No project/ECM data rows were detected.");
    }

    const recs = generateRecommendations(result.mappedColumns);
    result.highPriorityRecommendations = recs.highPriority;
    result.mediumPriorityRecommendations = recs.mediumPriority;
    result.optionalRecommendations = recs.optional;

    result.technicalDetails = {
      sheetsScanned: result.sheets,
      headerRow: result.headerRow,
      rowsDetected: result.projectRowsDetected,
      rawColumns: result.detectedColumns,
    };

    if (result.criticalIssues.length > 0) {
      result.status = "error";
      result.canGenerate = false;
      result.professionalSummary = "Excel validation failed. The file does not contain enough project/ECM data for report generation.";
    } else if (result.readinessScore < 80 || result.highPriorityRecommendations.length > 0) {
      result.status = "warning";
      result.canGenerate = true;
      result.professionalSummary = `Your Excel file is usable for report generation. ${result.projectRowsDetected} project/ECM rows were detected. However, adding the missing recommended fields below will improve the quality of the Executive Summary, Project Grouping and Project Chapter sections.`;
    } else {
      result.status = "valid";
      result.canGenerate = true;
      result.professionalSummary = `Excel validation passed. The file contains sufficient project data for report generation. ${result.projectRowsDetected} project/ECM rows detected.`;
    }

    return result;
  } catch (error) {
    result.errors.push(`File is unreadable as an Excel workbook: ${error.message}`);
    result.professionalSummary = "Excel validation failed due to file reading error.";
    return result;
  }
}

function reportEndpoints(app) {
  if (!app) return;

  // ── ADMIN: Get all templates (full details) ──────────────────────────────────
  app.get(
    "/reports/templates",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const templates = await prisma.report_templates.findMany({
          orderBy: { createdAt: "desc" },
        });
        response.status(200).json({ templates });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── ADMIN: Create template ───────────────────────────────────────────────────
  app.post(
    "/reports/templates",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const {
          name,
          slug,
          prompt,
          model,
          rules,
          jsonSchema,
          reportFormat,
          componentPath,
          status,
          showInPublic,
          publicBadge,
          category,
          allowedFileTypes,
          outputFormats,
          inputRules,
          sampleData,
          versionHistory,
        } = reqBody(request);
        if (!name || !prompt) {
          return response.status(400).json({ error: "Name and Prompt are required fields." });
        }

        const template = await prisma.report_templates.create({
          data: {
            name,
            slug:         slug         || null,
            prompt,
            model:        model        || null,
            rules:        rules        || null,
            jsonSchema:   jsonSchema   || null,
            reportFormat: reportFormat || null,
            componentPath: componentPath || null,
            status: status || "active",
            showInPublic: showInPublic !== undefined ? !!showInPublic : true,
            publicBadge: publicBadge || null,
            category: category || null,
            allowedFileTypes: allowedFileTypes || null,
            outputFormats: outputFormats || null,
            inputRules: inputRules || null,
            sampleData: sampleData || null,
            versionHistory: versionHistory || null,
          },
        });
        response.status(201).json({ template });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── ADMIN: Update template ───────────────────────────────────────────────────
  app.put(
    "/reports/templates/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id);
        const {
          name,
          slug,
          prompt,
          model,
          rules,
          jsonSchema,
          reportFormat,
          componentPath,
          status,
          showInPublic,
          publicBadge,
          category,
          allowedFileTypes,
          outputFormats,
          inputRules,
          sampleData,
          versionHistory,
        } = reqBody(request);

        const exists = await prisma.report_templates.findFirst({ where: { id } });
        if (!exists) return response.sendStatus(404).end();

        const template = await prisma.report_templates.update({
          where: { id },
          data: {
            name:         name         !== undefined ? name         : exists.name,
            slug:         slug         !== undefined ? slug         : exists.slug,
            prompt:       prompt       !== undefined ? prompt       : exists.prompt,
            model:        model        !== undefined ? model        : exists.model,
            rules:        rules        !== undefined ? rules        : exists.rules,
            jsonSchema:   jsonSchema   !== undefined ? jsonSchema   : exists.jsonSchema,
            reportFormat: reportFormat !== undefined ? reportFormat : exists.reportFormat,
            componentPath: componentPath !== undefined ? componentPath : exists.componentPath,
            status: status !== undefined ? status : exists.status,
            showInPublic: showInPublic !== undefined ? !!showInPublic : exists.showInPublic,
            publicBadge: publicBadge !== undefined ? publicBadge : exists.publicBadge,
            category: category !== undefined ? category : exists.category,
            allowedFileTypes: allowedFileTypes !== undefined ? allowedFileTypes : exists.allowedFileTypes,
            outputFormats: outputFormats !== undefined ? outputFormats : exists.outputFormats,
            inputRules: inputRules !== undefined ? inputRules : exists.inputRules,
            sampleData: sampleData !== undefined ? sampleData : exists.sampleData,
            versionHistory: versionHistory !== undefined ? versionHistory : exists.versionHistory,
          },
        });
        response.status(200).json({ template });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── ADMIN: Delete template ───────────────────────────────────────────────────
  app.delete(
    "/reports/templates/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id);
        const exists = await prisma.report_templates.findFirst({ where: { id } });
        if (!exists) return response.sendStatus(404).end();

        await prisma.report_templates.delete({ where: { id } });
        response.status(200).json({ success: true });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── PUBLIC: Get public-facing templates (redacted — no prompt/rules/model) ──
  app.get(
    "/reports/public-templates",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const requiredTemplate = await prisma.report_templates.findFirst({
          where: { slug: "commercial-building-energy-audit" },
        });

        if (!requiredTemplate && process.env.NODE_ENV !== "production") {
          await ensureAiReportGeneratorSeeded(prisma);
        }

        const templates = await prisma.report_templates.findMany({
          where: {
            status: "active",
            showInPublic: true,
          },
          orderBy: { createdAt: "desc" },
        });

        const publicTemplates = templates.map((t) => ({
          id:           t.id,
          slug:         t.slug,
          name:         t.name,
          status:       t.status,
          publicBadge:  t.publicBadge,
          category:     t.category,
          allowedFileTypes: t.allowedFileTypes,
          outputFormats: t.outputFormats,
        }));

        if (!publicTemplates.length) {
          return response.status(503).json({
            error:
              "No public report templates are configured. Run `yarn setup:dev` or `cd server && npx prisma db seed` to seed the AI Report Generator templates.",
            templates: [],
          });
        }

        response.status(200).json({ templates: publicTemplates });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── PUBLIC: Upload document files for parsing ────────────────────────────────
  app.post(
    "/reports/upload",
    [validatedRequest, flexUserRoleValid([ROLES.all]), handleFileUpload],
    async function (request, response) {
      try {
        const { originalname, path: uploadedPath, size, mimetype } = request.file;
        const ext = path.extname(originalname).toLowerCase();

        if ([".xlsx", ".xls", ".jpg", ".jpeg", ".png"].includes(ext)) {
          return response.status(200).json({
            success: true,
            location: uploadedPath || originalname,
            filename: originalname,
            size,
            mimetype,
            parsingStatus: "not_required",
            token_count_estimate: 0,
          });
        }

        const Collector = new CollectorApi();
        const processingOnline = await Collector.online();

        if (!processingOnline) {
          return response.status(200).json({
            success: true,
            location: uploadedPath || originalname,
            filename: originalname,
            size,
            mimetype,
            parsingStatus: "uploaded_unparsed",
            warning: "Document processing server is offline. File was uploaded but not parsed.",
            token_count_estimate: 0,
          });
        }

        const { success, reason, documents } = await Collector.parseDocument(originalname);
        if (!success || !documents?.[0]) {
          return response.status(200).json({
            success: true,
            location: uploadedPath || originalname,
            filename: originalname,
            size,
            mimetype,
            parsingStatus: "uploaded_unparsed",
            warning: reason || "Document parsing failed on the collector server. File was uploaded but not parsed.",
            token_count_estimate: 0,
          });
        }

        const doc = documents[0];
        return response.status(200).json({
          success: true,
          location: doc.location,
          filename: originalname,
          size,
          mimetype,
          parsingStatus: "parsed",
          token_count_estimate: doc.token_count_estimate || 0,
        });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/reports/validate-upload",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    function (request, response) {
      excelUpload(request, response, async function (err) {
        if (err) {
          return response.status(400).json({
            success: false,
            files: [],
            error: `Invalid file upload. ${err.message}`,
          });
        }

        try {
          const files = request.files || [];
          const validations = await Promise.all(
            files.map(async (file) => {
              const ext = path.extname(file.originalname).toLowerCase();
              if (![".xlsx", ".xls"].includes(ext)) {
                return {
                  filename: file.originalname,
                  fileType: "other",
                  status: "valid",
                  sheets: [],
                  headerRow: 0,
                  detectedColumns: [],
                  mappedColumns: {},
                  projectRowsDetected: 0,
                  missingRequiredColumns: [],
                  missingRecommendedColumns: [],
                  warnings: [],
                  errors: [],
                };
              }
              return await validateExcelBuffer(file);
            })
          );

          return response.status(200).json({ success: true, files: validations });
        } catch (e) {
          console.error(e.message, e);
          return response.status(500).json({
            success: false,
            files: [],
            error: "Upload validation failed.",
          });
        }
      });
    }
  );

  // ── PUBLIC / ADMIN: Generate Report Pipeline ─────────────────────────────────
  //
  // Accepts BOTH payload formats:
  //   NEW  → { template_id, public_form, uploaded_files, generation_mode, status }
  //   OLD  → { templateId, inputDetails, uploadedFiles }
  //
  app.post(
    "/reports/generate",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      const body = reqBody(request);
      const { templateId, inputDetails, uploadedFiles, generationMode, publicForm, status } =
        normaliseGenerateBody(body);

      if (!templateId) {
        return response
          .status(400)
          .json({ error: "template_id (or templateId) is a required field." });
      }

      let reportRecord = null;
      try {
        // ── Resolve template (slug, numeric id, or name) ───────────────────────
        const template = await resolveTemplate(templateId);
        if (!template) {
          return response.status(404).json({
            error: `Template not found for identifier: ${templateId}`,
          });
        }

        const user = await userFromSession(request, response);

        // ── Initialise DB record ───────────────────────────────────────────────
        reportRecord = await prisma.generated_reports.create({
          data: {
            templateId:     template.id,
            generationMode: generationMode || "public",
            publicForm:     publicForm ? JSON.stringify(publicForm) : null,
            inputDetails:   JSON.stringify(inputDetails),
            uploadedFiles:  JSON.stringify(uploadedFiles),
            status:         "parsing",
            userId:         user?.id || null,
          },
        });

        // ── 1. Data Parsing & Consolidation ───────────────────────────────────
        let consolidatedText = "";
        let extractedExcelData = { projects: [] };
        let imageMetadata = [];
        let fileTypesDetected = [];

        for (const file of uploadedFiles) {
          const ext = path.extname(file.filename).toLowerCase();
          if (!fileTypesDetected.includes(ext)) fileTypesDetected.push(ext);

          // PDF/DOCX/PPT text extraction (already handled by CollectorApi -> .json in directUploadsPath)
          const sourceFile = path.join(directUploadsPath, path.basename(file.location));
          if (fs.existsSync(sourceFile)) {
            try {
              const fileContent = fs.readFileSync(sourceFile, "utf-8");
              const parsedJSON = JSON.parse(fileContent);
              if (parsedJSON.pageContent) {
                consolidatedText += `\n--- Document Text (${file.filename}) ---\n${parsedJSON.pageContent}\n`;
              }
            } catch (err) {
              console.error(`Failed to read parsed file from direct uploads: ${file.filename}`, err);
            }
          }

          // Image Metadata Collection
          if (['.png', '.jpg', '.jpeg'].includes(ext)) {
            imageMetadata.push({
              filename: file.filename,
              originalPath: file.location,
              suggestedCaption: "Data required",
            });
          }

          // Stage 1: Excel Extraction
          if (template.slug === "commercial-building-energy-audit" && (ext === ".xlsx" || ext === ".xls")) {
            const originalFilePath = path.join(hotdirPath, file.filename);
            if (fs.existsSync(originalFilePath)) {
              try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(originalFilePath);
                const extraction = extractAuthoritativeExcelProjects(workbook);
                extractedExcelData.projects = extraction.projects;
                extractedExcelData.extractionAudit = extraction.auditRows;
                extractedExcelData.removedRows = extraction.removedRows;
                extractedExcelData.groupCounts = extraction.groupCounts;
                extractedExcelData.mappingConfidence = extraction.mappingConfidence;
                extractedExcelData.datasetProfile = extraction.datasetProfile;
                extractedExcelData.sourceSheet = extraction.sheetName;
                extractedExcelData.sourceHeaderRow = extraction.headerRow;

                workbook.eachSheet((worksheet) => {
                  worksheet.eachRow((row) => {
                    const values = row.values || [];
                    const rowStr = values.map(v => String(v || '').toLowerCase()).join(' ');

                    if (rowStr.includes('annual electricity consumption')) {
                      const val = values.find(v => typeof v === 'number');
                      if (val) extractedExcelData.annualElectricityConsumption = val;
                    }
                    if (rowStr.includes('annual electricity cost')) {
                      const val = values.find(v => typeof v === 'number');
                      if (val) extractedExcelData.annualElectricityCost = val;
                    }
                    if (rowStr.includes('average tariff')) {
                      const val = values.find(v => typeof v === 'number');
                      if (val) extractedExcelData.averageTariff = val;
                    }
                  });
                });
              } catch (err) {
                console.error(`Failed to read Excel file: ${file.filename}`, err);
              }
            }
          }
        }


        await prisma.generated_reports.update({
          where: { id: reportRecord.id },
          data: { status: "generating" },
        });

        // ── 2 & 4. Data Extraction & Report Drafting via LLM Provider ──
        let finalReportContent = "{}";
        let providerUsed = "none";
        let fallbackReason = "";
        let schemaValidation = { success: true, errors: [] };
        let qcResult = { qcPassed: true, qcErrors: [], qcWarnings: [], summary: {} };
        let accuracyResult = { score: 0, passed: false, breakdown: [], qcSummary: {} };
        const deterministicBaseReportData = template.slug === "commercial-building-energy-audit"
          ? buildCommercialBuildingEnergyAuditBaseData({
              inputDetails,
              extractedExcelData,
              uploadedFiles,
            })
          : null;
        
        let draftSystemPrompt;
        if (template.slug === "commercial-building-energy-audit") {
          draftSystemPrompt = `You are SEE-Tech Solutions’ Commercial Building Energy Audit JSON generator.

Return valid JSON only.
Do not return Markdown.
Do not wrap output in \`\`\`json fences.
Do not include explanations.
Output must match CommercialBuildingEnergyAuditData.
If data is missing, write "Data required".
Use ₹ for financial values.
Use units like kWh/year, ₹/year, kW, TR, CFM, m3/hr, bar, deg C.

CRITICAL DIRECTIVE ON NARRATIVE GENERATION:
1. You MUST generate professional, explanatory prose for narrative fields:
   - existingOperatingCondition
   - problemGapIdentified
   - proposedIntervention
   - scopeOfWork
   - keyActivities
   - rationaleForEnergySaving
   - energySavingCalculation
   - carbonFootprint explanation
   - technicalSpecifications
   - schematicFramework
   - precautions
   - measurementVerificationPlan
   - benefitsOtherThanEnergySaving
   - caseStudies
   - finalConclusion
2. Base the narrative on project-type-specific engineering principles (HVAC, Lighting, Pumps, etc.) and any unstructured text provided in the prompt.

CRITICAL DIRECTIVE ON EXCEL NUMBERS:
1. You MUST NOT overwrite, change, or invent numeric values for 'expectedEnergySaving', 'expectedAnnualCostSaving', 'estimatedInvestment', 'simplePaybackPeriod'.
2. The provided 'Extracted Excel Data' is the absolute mathematical truth. Use it verbatim.
3. The LLM MUST NOT create, remove, merge, split, reorder, or rename ECMs.
4. The authoritative Excel projects array is the only valid source for:
   - ECM count
   - project number
   - project title
   - equipment covered
   - system/category/group
   - energy saving
   - annual cost saving
   - investment
   - payback
   - implementation duration
5. You may only improve narrative wording using these Excel-derived fields:
   - proposedProjectDescription
   - rationaleForEnergySaving
   - keyActivities
   - scopeOfWork
   - existingSystemDescription
   - existingOperatingCondition
6. When Excel narrative text exists, do not replace it with generic wording.

### System Prompt & Prompt Instructions:
${template.prompt}

### Custom rules:
${template.rules || "None specified."}`;
        } else {
          draftSystemPrompt = `You are the SEE-Tech Solutions AI Technical Report Generation Engine.
Generate a professional technical report in standard Markdown format.

### System Prompt & Prompt Instructions:
${template.prompt}

### Report Formatting & Specific Guidelines:
1. Adhere strictly to the requested markdown layout.
2. Ensure all financial values use the Indian Rupee symbol (₹).
3. Use proper technical/engineering units.
4. Keep the tone strictly formal, technical, and client-ready.
5. Never output conversational elements, greetings, helper text, or AI dialogue. Start immediately with the report markdown.
6. If a required value was missing, output "Data required" inside the report where that field is placed. Do not invent values.
7. Observe the following custom rules:
${template.rules || "None specified."}`;
        }

        const draftUserPrompt = `### Basic Details (User Supplied — Public Form):
Client / Facility Name : ${inputDetails.clientName   || "Data required"}
Facility / Plant Name  : ${inputDetails.facilityName || "Data required"}
Location               : ${inputDetails.location     || "Data required"}
Audit Period           : ${inputDetails.auditPeriod  || "Data required"}
Report Date            : ${inputDetails.reportDate   || "Data required"}
Contact Person         : ${inputDetails.contactPerson || "N/A"}
Output Format          : ${inputDetails.outputFormat  || "PDF"}

### Consolidated Document Text:
${consolidatedText || "[No document files uploaded — use form details only.]"}

${template.slug === "commercial-building-energy-audit" ? `### Extracted Excel Data (Structured):
${JSON.stringify(extractedExcelData, null, 2)}

### Deterministic Base Report JSON (Excel Truth):
${JSON.stringify(deterministicBaseReportData, null, 2)}

### Important Instruction:
Return only narrative enrichment JSON for the deterministic base report. Do not return or modify project counts, equipment, system, savings, investment, payback, duration, or grouping.

### Uploaded Image Metadata:
${JSON.stringify(imageMetadata, null, 2)}` : ""}

### Target Report Layout Structure:
${template.reportFormat || "No structure defined. Output a standard structured engineering report."}

Please generate the final technical report now:`;

        try {
          const providerResult = await generateWithProvider({
            templateSlug: template.slug,
            systemPrompt: draftSystemPrompt,
            userPrompt: draftUserPrompt,
            inputDetails,
            extractedExcelData,
            uploadedFiles,
            templateConfig: template,
            baseReportData: deterministicBaseReportData,
          });
          
          if (template.slug === "commercial-building-energy-audit") {
            providerResult.reportData = normalizeReportForExport(providerResult.reportData);
            schemaValidation = validateCommercialBuildingEnergyAuditSchema(providerResult.reportData);
            qcResult = runReportQC(providerResult.reportData);
            accuracyResult = calculateReportAccuracyScore(providerResult.reportData);
            finalReportContent = JSON.stringify(providerResult.reportData);
          } else {
            // For markdown reports, it's just content
            finalReportContent = typeof providerResult.reportData === "string" 
               ? providerResult.reportData 
               : JSON.stringify(providerResult.reportData);
          }
          
          providerUsed = providerResult.metadata.providerUsed;
          fallbackReason = providerResult.metadata.fallbackReason;
        } catch (e) {
          throw new Error(`Generation failed: ${e.message}`);
        }

        // Internal server logging for admin/debug only
        console.log(`[GENERATION SUMMARY]
Template: ${template.slug}
Uploaded Files: ${uploadedFiles.length}
File Types: ${fileTypesDetected.join(", ")}
Excel Projects Extracted: ${extractedExcelData.projects ? extractedExcelData.projects.length : 0}
Provider Used: ${providerUsed}
Fallback Reason: ${fallbackReason}
Image Metadata Collected: ${imageMetadata ? imageMetadata.length : 0}`);

        if (template.slug === "commercial-building-energy-audit" && extractedExcelData.extractionAudit) {
          const firstFiveAudit = extractedExcelData.extractionAudit.slice(0, 5);
          console.log(`[EXCEL EXTRACTION AUDIT]
Source Sheet: ${extractedExcelData.sourceSheet}
Header Row: ${extractedExcelData.sourceHeaderRow}
Raw Row Count: ${extractedExcelData.extractionAudit.length}
Extracted ECM Count: ${extractedExcelData.projects.length}
Removed Row Count: ${extractedExcelData.removedRows?.length || 0}
Group Counts: ${JSON.stringify(extractedExcelData.groupCounts || {}, null, 2)}
Column Mapping Confidence: ${JSON.stringify(extractedExcelData.mappingConfidence || [], null, 2)}
Dataset Profile: ${JSON.stringify(extractedExcelData.datasetProfile || null, null, 2)}
First Five Rows: ${JSON.stringify(firstFiveAudit, null, 2)}
Removed Rows: ${JSON.stringify(extractedExcelData.removedRows || [], null, 2)}`);
        }
        if (template.slug === "commercial-building-energy-audit") {
          console.log(`[REPORT SCHEMA VALIDATION]
Schema Passed: ${schemaValidation.success}
Schema Errors: ${JSON.stringify(schemaValidation.errors || [], null, 2)}
QC Passed: ${qcResult.qcPassed}
QC Summary: ${JSON.stringify(qcResult.summary || {}, null, 2)}
QC Errors: ${JSON.stringify(qcResult.qcErrors || [], null, 2)}
QC Warnings: ${JSON.stringify(qcResult.qcWarnings || [], null, 2)}
Accuracy Score: ${accuracyResult.score}
Accuracy Passed: ${accuracyResult.passed}
Accuracy Breakdown: ${JSON.stringify(accuracyResult.breakdown || [], null, 2)}`);
        }

        await prisma.generated_reports.update({
          where: { id: reportRecord.id },
          data: {
            extractedData: JSON.stringify({
              providerUsed,
              fallbackReason,
              extractionAudit: extractedExcelData.extractionAudit || [],
              removedRows: extractedExcelData.removedRows || [],
              groupCounts: extractedExcelData.groupCounts || {},
              mappingConfidence: extractedExcelData.mappingConfidence || [],
              datasetProfile: extractedExcelData.datasetProfile || null,
              sourceSheet: extractedExcelData.sourceSheet || "",
              sourceHeaderRow: extractedExcelData.sourceHeaderRow || 0,
              schemaValidation,
              qcResult,
              accuracyResult,
            }),
            missingData:   JSON.stringify([]),
          },
        });

        // ── 5. Complete DB record ─────────────────────────────────────────────
        const completedRecord = await prisma.generated_reports.update({
          where: { id: reportRecord.id },
          data: {
            outputContent: finalReportContent,
            status:        "completed",
          },
        });

        // Return structured response matching the new public payload contract
        response.status(200).json({
          report: completedRecord,
          template_id:     String(templateId),
          generation_mode: generationMode || "public",
          status:          "completed",
        });
      } catch (e) {
        console.error(e.message, e);
        if (reportRecord) {
          await prisma.generated_reports.update({
            where: { id: reportRecord.id },
            data: { status: "failed", error: e.message },
          });
        }
        response.status(500).json({ error: e.message });
      }
    }
  );

  // ── PUBLIC / ADMIN: List historical reports ──────────────────────────────────
  app.get(
    "/reports/list",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const query =
          user && user.role === "default" ? { userId: user.id } : {};

        const reports = await prisma.generated_reports.findMany({
          where: query,
          include: { template: { select: { name: true, slug: true } } },
          orderBy: { createdAt: "desc" },
        });

        response.status(200).json({ reports });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── PUBLIC / ADMIN: Get report details ───────────────────────────────────────
  app.get(
    "/reports/:id",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id);
        const user = await userFromSession(request, response);

        const report = await prisma.generated_reports.findFirst({
          where: { id },
          include: { template: { select: { name: true, slug: true } } },
        });

        if (!report) return response.sendStatus(404).end();

        if (user && user.role === "default" && report.userId !== user.id) {
          return response.sendStatus(403).end();
        }

        response.status(200).json({ report });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── PUBLIC / ADMIN: Delete report ────────────────────────────────────────────
  app.delete(
    "/reports/:id",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id);
        const user = await userFromSession(request, response);

        const report = await prisma.generated_reports.findFirst({ where: { id } });
        if (!report) return response.sendStatus(404).end();

        if (user && user.role === "default" && report.userId !== user.id) {
          return response.sendStatus(403).end();
        }

        await prisma.generated_reports.delete({ where: { id } });
        response.status(200).json({ success: true });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── PUBLIC / ADMIN: Re-run QC and Cleanup ──────────────────────────────────
  app.post(
    "/reports/:id/qc/recheck",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id);
        const user = await userFromSession(request, response);

        const report = await prisma.generated_reports.findFirst({
          where: { id },
          include: { template: { select: { slug: true } } },
        });

        if (!report) return response.sendStatus(404).end();
        if (user && user.role === "default" && report.userId !== user.id) {
          return response.sendStatus(403).end();
        }

        let reportData = {};
        try {
          reportData = JSON.parse(report.outputContent);
        } catch (e) {
          return response.status(400).json({ error: "Report content is not valid JSON." });
        }

        reportData = normalizeReportForExport(reportData);
        const rawProjects = getProjectsForQC(reportData);
        const cleanedProjects = cleanAndDeduplicateProjects(rawProjects);
        reportData.projects = cleanedProjects;
        reportData.groupedProjects = buildProjectGroups(cleanedProjects);

        // Save cleaned data back to DB
        await prisma.generated_reports.update({
          where: { id },
          data: { outputContent: JSON.stringify(reportData) }
        });

        const qcResult = runReportQC(reportData);
        const accuracyResult = calculateReportAccuracyScore(reportData);
        
        response.status(200).json({
          success: true,
          ...qcResult,
          accuracyResult,
          reportData
        });
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ error: e.message });
      }
    }
  );
  // ── PUBLIC / ADMIN: Export DOCX ────────────────────────────────────────────
  app.post(
    "/reports/:id/export/docx",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id);
        const user = await userFromSession(request, response);

        const report = await prisma.generated_reports.findFirst({
          where: { id },
          include: { template: { select: { slug: true } } },
        });

        if (!report) return response.sendStatus(404).end();

        if (user && user.role === "default" && report.userId !== user.id) {
          return response.sendStatus(403).end();
        }

        if (report.template?.slug !== "commercial-building-energy-audit") {
          return response.status(400).json({ error: "DOCX export not supported for this template yet." });
        }

        let reportData = {};
        try {
          reportData = JSON.parse(report.outputContent);
        } catch (e) {
          return response.status(400).json({ error: "Report content is not valid JSON." });
        }

        reportData = normalizeReportForExport(reportData);

        // Quality Check (QC) Gate
        const qcResult = runReportQC(reportData);
        const accuracyResult = calculateReportAccuracyScore(reportData);
        const allowDraft = request.query.allowDraft === "true";
        const isDev = process.env.NODE_ENV === "development" || process.env.VITE_ALLOW_DRAFT_EXPORT === "true";

        if (!qcResult.qcPassed || !accuracyResult.passed) {
          console.error(`[QC FAILED] Report ID: ${id}`, JSON.stringify({ qcResult, accuracyResult }, null, 2));
          if (!(allowDraft && isDev)) {
            return response.status(400).json({ 
              qcFailed: true, 
              error: !qcResult.qcPassed
                ? "Report requires review before final export."
                : "Report accuracy score is below the required threshold for final export.",
              ...qcResult,
              accuracyResult,
            });
          }
        }

        if (allowDraft && isDev && reportData.reportInfo) {
          reportData.reportInfo.clientName = "[DRAFT - QC REVIEW REQUIRED] " + (reportData.reportInfo.clientName || "");
        }

        let buffer;
        try {
          buffer = await buildCommercialBuildingEnergyAuditDocx(reportData);
        } catch (docxError) {
          console.error(`[DOCX EXPORT FAILED] Report ID: ${id}`, docxError.stack || docxError);
          throw docxError;
        }
        
        const clientName = reportData.reportInfo?.clientName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "client";
        const filename = `SEE-Tech_Detailed_Energy_Audit_Report_${clientName}.docx`;

        response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        response.send(buffer);
      } catch (e) {
        console.error(e.stack || e.message, e);
        response.status(500).json({ error: e.message });
      }
    }
  );
}

module.exports = { reportEndpoints, extractAuthoritativeExcelProjects };
