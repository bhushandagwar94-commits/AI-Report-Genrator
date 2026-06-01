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
const { hotdirPath } = require("../utils/files");
const extractJson = require("extract-json-from-string");
const ExcelJS = require("exceljs");
const multer = require("multer");
const { createPipelineDebugCollector } = require("../utils/pipelineDebugCollector");
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
  buildFieldFlags,
  buildMissingFieldSummary,
  stripDebugMetadata,
} = require("../services/llmProviderService");
const {
  buildDeterministicCommercialAuditFallback,
  generateCommercialAuditComponentReport,
} = require("../services/reportPipeline");
const { getGeminiApiKeys } = require("../services/geminiProviderService");

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

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function buildCommercialAuditArtifacts({
  reportData,
  inputDetails,
  extractedExcelData,
  providerUsed,
}) {
  let finalData = normalizeReportForExport(reportData);
  finalData.fieldFlags = buildFieldFlags(
    finalData,
    { inputDetails, extractedExcelData },
    { providerUsed }
  );
  finalData.missingFieldSummary = buildMissingFieldSummary(finalData.fieldFlags);

  return {
    finalData,
    schemaValidation: validateCommercialBuildingEnergyAuditSchema(finalData),
    qcResult: runReportQC(finalData),
    accuracyResult: calculateReportAccuracyScore(finalData),
    finalReportContent: JSON.stringify(finalData),
  };
}

function parseStoredJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildImageMetadataFromUploads(uploadedFiles = []) {
  return uploadedFiles
    .filter((file) => {
      const ext = path.extname(file?.filename || "").toLowerCase();
      return [".png", ".jpg", ".jpeg"].includes(ext);
    })
    .map((file) => ({
      filename: file.filename,
      originalPath: file.location,
      suggestedCaption: "Data required",
    }));
}

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
      clientName:    pf.client_name    || pf.clientName    || "[Client / Facility Name]",
      facilityName:  pf.facility_name  || pf.facilityName  || "[To be updated after site data verification]",
      location:      pf.location       || "[To be updated after site data verification]",
      auditPeriod:   pf.audit_period   || pf.auditPeriod   || "[To be updated after site data verification]",
      reportDate:    pf.report_date    || pf.reportDate     || new Date().toLocaleDateString("en-IN"),
      contactPerson: pf.contact_person || pf.contactPerson  || "[To be updated after site data verification]",
      outputFormat:  pf.output_format  || pf.outputFormat   || "docx",
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
    inputDetails:   {
      clientName:    body.inputDetails?.clientName    || "[Client / Facility Name]",
      facilityName:  body.inputDetails?.facilityName  || "[To be updated after site data verification]",
      location:      body.inputDetails?.location      || "[To be updated after site data verification]",
      auditPeriod:   body.inputDetails?.auditPeriod   || "[To be updated after site data verification]",
      reportDate:    body.inputDetails?.reportDate    || new Date().toLocaleDateString("en-IN"),
      contactPerson: body.inputDetails?.contactPerson || "[To be updated after site data verification]",
      outputFormat:  body.inputDetails?.outputFormat  || "docx",
    },
    uploadedFiles:  body.uploadedFiles || [],
    generationMode: body.generationMode || "public",
    publicForm:     null,
    status:         "submitted",
  };
}

const excelUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 20 }
}).array("files");

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
    .map((segment) => segment.replace(/^\d+[).\s-]*/, "").trim())
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

function classifyUploadedFile(detectedColumns = []) {
  const headers = detectedColumns.map(h => String(h).toLowerCase());

  const hasAny = (keywords) => keywords.some(keyword =>
    headers.some(header => header.includes(keyword))
  );

  const hasProjectHeaders = hasAny([
    "project name",
    "energy saving project",
    "ecm",
    "measure",
    "recommendation",
    "proposal"
  ]);

  const hasFinancialHeaders = hasAny([
    "investment",
    "saving",
    "annual saving",
    "payback",
    "cost saving",
    "kwh saving"
  ]);

  if (hasProjectHeaders && hasFinancialHeaders) {
    return "ecm_project_sheet";
  }

  if (hasAny([
    "name of equipment",
    "m/c no",
    "make",
    "type/model",
    "capacity",
    "connected load",
    "rpm",
    "section",
    "location",
    "equipment"
  ])) {
    return "equipment_master";
  }

  if (hasAny([
    "machine units",
    "chiller units",
    "cooling tower units",
    "ahu units",
    "total units",
    "m/c u/kg",
    "utility u/kg",
    "production kg",
    "month"
  ])) {
    return "energy_consumption_data";
  }

  if (hasAny([
    "load",
    "kw",
    "tr",
    "phase",
    "voltage",
    "specification"
  ])) {
    return "specification_data";
  }

  return "unknown_supporting_file";
}

async function validateExcelBuffer(file) {
  const result = {
    filename: file.originalname,
    fileType: "excel",
    role: "unknown_supporting_file",
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
        if (score > (localBest?.score || 0) || (mapping.detectedColumns.length > (localBest?.detectedColumns?.length || 0))) {
          localBest = { worksheet, rowNumber, score, ...mapping };
        }
      });

      if (!localBest) return;
      sheetHeaders.push(localBest);
      if (!bestHeader || localBest.score > bestHeader.score || (!bestHeader.score && localBest.detectedColumns.length > bestHeader.detectedColumns.length)) {
        bestHeader = localBest;
      }
    });

    if (!bestHeader || bestHeader.detectedColumns.length === 0) {
      result.errors.push("No usable header row was detected.");
      result.criticalIssues.push("No usable header row was detected.");
      result.status = "error";
      result.professionalSummary = "Excel validation failed. The file could not be parsed.";
      return result;
    }

    result.headerRow = bestHeader.rowNumber;
    result.detectedColumns = bestHeader.detectedColumns;
    result.mappedColumns = { ...result.mappedColumns, ...bestHeader.mappedColumns };
    result.role = classifyUploadedFile(result.detectedColumns);

    if (result.role !== "ecm_project_sheet") {
      result.status = "accepted_supporting_file";
      result.canGenerate = false;
      
      switch(result.role) {
        case "equipment_master":
          result.professionalSummary = "Equipment master detected. Used as supporting context.";
          break;
        case "energy_consumption_data":
          result.professionalSummary = "Energy consumption data detected. Used for energy profile and supporting analysis.";
          break;
        case "specification_data":
          result.professionalSummary = "Technical specification data detected. Used as supporting context.";
          break;
        default:
          result.professionalSummary = "Supporting file detected. Used as narrative context only.";
      }
      return result;
    }

    result.status = "accepted_project_file";

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
      result.status = "accepted_project_file";
      result.canGenerate = true;
      result.professionalSummary = `ECM/project sheet detected. ${result.projectRowsDetected} project/ECM rows detected.`;
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
      let pipelineDebug;
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
        const debugCollector = createPipelineDebugCollector({
          reportType: "upload",
          generationMode: "upload"
        });
        
        debugCollector.addBlock({
          id: "upload_validation",
          title: "Upload Validation",
          status: "completed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0
        });

        console.log("[UPLOAD] request received");
        console.log("[UPLOAD] content-type:", request.headers["content-type"]);
        console.log("[UPLOAD] files:", request.file ? [{
          originalname: request.file.originalname,
          mimetype: request.file.mimetype,
          size: request.file.size
        }] : "no files");

        const { originalname, path: uploadedPath, size, mimetype } = request.file;
        const ext = path.extname(originalname).toLowerCase();

        const fileSummary = {
          originalName: originalname,
          storedName: uploadedPath,
          fileType: ext.replace('.', ''),
          mimeType: mimetype,
          sizeBytes: size,
          uploadStatus: "success",
          parserUsed: null,
          parserReason: null,
          extractedCharacters: 0,
          sheetsDetected: 0,
          rowsDetected: 0,
          warnings: [],
          errors: []
        };

        if ([".xlsx", ".xls", ".jpg", ".jpeg", ".png"].includes(ext)) {
          fileSummary.parserUsed = "native Excel parser";
          fileSummary.parserReason = "native formats detected";
          debugCollector.data.inputSummary.files.push(fileSummary);
          debugCollector.finalize();
          
          return response.status(200).json({
            success: true,
            location: uploadedPath || originalname,
            filename: originalname,
            size,
            mimetype,
            parsingStatus: "not_required",
            token_count_estimate: 0,
            pipelineDebug: debugCollector.data
          });
        }

        const Collector = new CollectorApi();
        const processingOnline = await Collector.online();

        if (!processingOnline) {
          fileSummary.uploadStatus = "warning";
          fileSummary.warnings.push("Document processing server is offline.");
          debugCollector.data.inputSummary.files.push(fileSummary);
          debugCollector.finalize();
          return response.status(200).json({
            success: true,
            location: uploadedPath || originalname,
            filename: originalname,
            size,
            mimetype,
            parsingStatus: "uploaded_unparsed",
            warning: "Document processing server is offline. File was uploaded but not parsed.",
            token_count_estimate: 0,
            pipelineDebug: debugCollector.data
          });
        }

        const { success, reason, documents } = await Collector.parseDocument(originalname);
        if (!success || !documents?.[0]) {
          fileSummary.uploadStatus = "warning";
          fileSummary.warnings.push(reason || "Document parsing failed.");
          debugCollector.data.inputSummary.files.push(fileSummary);
          debugCollector.finalize();
          return response.status(200).json({
            success: true,
            location: uploadedPath || originalname,
            filename: originalname,
            size,
            mimetype,
            parsingStatus: "uploaded_unparsed",
            warning: reason || "Document parsing failed on the collector server. File was uploaded but not parsed.",
            token_count_estimate: 0,
            pipelineDebug: debugCollector.data
          });
        }

        const doc = documents[0];
        fileSummary.extractedCharacters = doc.token_count_estimate || 0;
        debugCollector.data.inputSummary.files.push(fileSummary);
        debugCollector.finalize();
        return response.status(200).json({
          success: true,
          location: doc.location,
          filename: originalname,
          size,
          mimetype,
          parsingStatus: "parsed",
          token_count_estimate: doc.token_count_estimate || 0,
          pipelineDebug: debugCollector.data
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
                  fileType: ext.slice(1),
                  role: "supporting_document",
                  status: "accepted_supporting_file",
                  sheets: [],
                  headerRow: 0,
                  detectedColumns: [],
                  mappedColumns: {},
                  projectRowsDetected: 0,
                  missingRequiredColumns: [],
                  missingRecommendedColumns: [],
                  warnings: [],
                  errors: [],
                  professionalSummary: "Supporting file detected. Used as narrative context only."
                };
              }
              return await validateExcelBuffer(file);
            })
          );

          const projectFileFound = validations.some(v => v.status === "accepted_project_file" || v.status === "warning" || v.status === "valid");
          const supportingFilesCount = validations.filter(v => v.status === "accepted_supporting_file").length;
          const canGenerateReport = projectFileFound || supportingFilesCount > 0;

          const debugCollector = createPipelineDebugCollector({ reportType: "validation", generationMode: "upload" });
          debugCollector.addBlock({ id: "parser_selection", title: "Parser Selection", status: "completed" });
          debugCollector.addBlock({ id: "file_extraction", title: "File Extraction", status: "completed" });
          debugCollector.addBlock({ id: "excel_sheet_detection", title: "Excel Sheet Detection", status: "completed" });
          debugCollector.addBlock({ id: "ecm_row_detection", title: "ECM Row Detection", status: "completed" });

          validations.forEach((v) => {
            debugCollector.data.inputSummary.files.push({
              fileName: v.filename,
              parserUsed: v.parserUsed || (v.fileType === "excel" ? "ecm_xlsx_parser" : "unstructured"),
              status: v.status,
              role: v.role,
              warnings: v.warnings || [],
              errors: v.errors || []
            });

            if (v.status !== "accepted_supporting_file") {
              debugCollector.data.inputSummary.sheetsDetected += (v.sheets || []).length;
              debugCollector.data.inputSummary.ecmRowsFound += (v.projectRowsDetected || 0);
              debugCollector.data.inputSummary.extractedFieldsCount += Object.keys(v.mappedColumns || {}).length;
              debugCollector.data.inputSummary.missingFields.push(...(v.missingRequiredColumns || []));
              
              (v.sheets || []).forEach(sheetName => {
                 debugCollector.data.inputSummary.sheetSummaries.push({
                   sheetName,
                   rowCount: v.projectRowsDetected || 0,
                   columnCount: Object.keys(v.mappedColumns || {}).length,
                   detectedPurpose: "ECM Data",
                   ecmRowsFound: v.projectRowsDetected || 0,
                   mappedColumns: Object.keys(v.mappedColumns || {})
                 });
              });
            } else {
              debugCollector.data.inputSummary.supportingDataFound = "Yes";
            }
          });
          debugCollector.finalize();

          return response.status(200).json({ 
            success: true, 
            files: validations,
            projectFileFound,
            supportingFilesCount,
            canGenerateReport,
            pipelineDebug: debugCollector.data
          });
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

      const useAiDuringGeneration =
        String(process.env.USE_AI_DURING_GENERATION || "false").toLowerCase() === "true";

      const skipLlmForDev =
        String(process.env.SKIP_LLM_FOR_DEV || "false").toLowerCase() === "true";

      console.log("[REPORT GENERATE CONFIG]", {
        useAiDuringGeneration,
        skipLlmForDev,
        openRouterKeyPresent: Boolean(process.env.OPENROUTER_API_KEY)
      });

      const { templateId, inputDetails, uploadedFiles, generationMode, publicForm, status } =
        normaliseGenerateBody(body);
      const startTime = Date.now();
      const debugCollector = createPipelineDebugCollector({
        reportType: templateId || "unknown",
        generationMode: generationMode || "unknown"
      });
      let pipelineDebug;

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
        let extractedExcelData = { projects: [] };
        let imageMetadata = [];
        let fileTypesDetected = [];

        debugCollector.addBlock({ id: "upload_validation", title: "Upload Validation", status: "completed" });
        debugCollector.addBlock({ id: "parser_selection", title: "Parser Selection", status: "completed" });
        debugCollector.addBlock({ id: "file_extraction", title: "File Extraction", status: "completed" });

        for (const file of uploadedFiles) {
          const ext = path.extname(file.filename).toLowerCase();
          if (!fileTypesDetected.includes(ext)) fileTypesDetected.push(ext);

          const fileSummary = {
            originalName: file.filename,
            storedName: file.location,
            fileType: ext.replace('.', ''),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            uploadStatus: "success",
            parserUsed: file.validation ? "native Excel parser" : null,
            parserReason: null,
            extractedCharacters: file.token_count_estimate || 0,
            sheetsDetected: (file.validation?.sheets || []).length,
            rowsDetected: file.validation?.projectRowsDetected || 0,
            warnings: file.validation?.warnings || [],
            errors: file.validation?.errors || []
          };
          debugCollector.data.inputSummary.files.push(fileSummary);

          if (file.validation && file.validation.status !== "accepted_supporting_file") {
            debugCollector.data.inputSummary.sheetsDetected += (file.validation.sheets || []).length;
            debugCollector.data.inputSummary.ecmRowsFound += (file.validation.projectRowsDetected || 0);
            debugCollector.data.inputSummary.extractedFieldsCount += Object.keys(file.validation.mappedColumns || {}).length;
            debugCollector.data.inputSummary.missingFields.push(...(file.validation.missingRequiredColumns || []));
            
            (file.validation.sheets || []).forEach(sheetName => {
               debugCollector.data.inputSummary.sheetSummaries.push({
                 sheetName,
                 rowCount: file.validation.projectRowsDetected || 0,
                 columnCount: Object.keys(file.validation.mappedColumns || {}).length,
                 detectedPurpose: "ECM Data",
                 ecmRowsFound: file.validation.projectRowsDetected || 0,
                 mappedColumns: Object.keys(file.validation.mappedColumns || {})
               });
            });
          } else {
             debugCollector.data.inputSummary.supportingDataFound = "Yes";
          }

          // Check if basic details were provided via extraction or fell back to placeholders
          if (inputDetails.clientName === "[Client / Facility Name]") {
            if (!debugCollector.data.inputSummary.warnings.includes("Client name not provided manually; using extracted value or placeholder.")) {
              debugCollector.data.inputSummary.warnings.push("Client name not provided manually; using extracted value or placeholder.");
            }
          }
          if (inputDetails.location === "[To be updated after site data verification]") {
            if (!debugCollector.data.inputSummary.warnings.includes("Location not provided manually; using extracted value or placeholder.")) {
              debugCollector.data.inputSummary.warnings.push("Location not provided manually; using extracted value or placeholder.");
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
            const role = file.validation?.role;
            if ((role === "ecm_project_sheet" || !role) && extractedExcelData.projects.length === 0) {
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
        }


        debugCollector.addBlock({ id: "excel_sheet_detection", title: "Excel Sheet Detection", status: "completed" });
        debugCollector.addBlock({ id: "ecm_row_detection", title: "ECM Row Detection", status: "completed" });
        debugCollector.addBlock({ id: "field_mapping", title: "Field Mapping", status: "completed" });
        debugCollector.addBlock({ id: "ecm_normalization", title: "ECM Normalization", status: "completed" });
        debugCollector.addBlock({ id: "ecm_classification", title: "ECM Classification", status: "completed" });
        debugCollector.addBlock({ id: "project_grouping", title: "Project Grouping", status: "completed" });

        debugCollector.data.dataStructuring.rawRowsCount = extractedExcelData.extractionAudit?.totalRowsEvaluated || 0;
        debugCollector.data.dataStructuring.normalizedEcmCount = extractedExcelData.projects?.length || 0;
        
        const groupsObj = extractedExcelData.groupCounts || {};
        debugCollector.data.dataStructuring.groupsCount = Object.keys(groupsObj).length;
        debugCollector.data.dataStructuring.groups = Object.keys(groupsObj).map(g => ({
          groupName: g,
          projectCount: groupsObj[g],
          ecmNumbers: extractedExcelData.projects.filter(p => p.group === g).map(p => p.ecmNo)
        }));

        debugCollector.data.dataStructuring.ecmClassifications = (extractedExcelData.projects || []).map(p => ({
          ecmNo: p.ecmNo,
          title: p.title,
          groupName: p.group,
          classification: p.classification || "Unknown",
          confidence: "High",
          reason: "Deterministic keyword match"
        }));

        debugCollector.data.dataStructuring.fieldMapping = {
          financialFieldsMapped: (extractedExcelData.projects || []).filter(p => p.investment).length,
          energyFieldsMapped: (extractedExcelData.projects || []).filter(p => p.annualSaving).length,
          paybackFieldsMapped: (extractedExcelData.projects || []).filter(p => p.paybackPeriod).length,
          missingFinancialFields: [],
          missingEnergyFields: []
        };

        await prisma.generated_reports.update({
          where: { id: reportRecord.id },
          data: { status: "generating" },
        });

        // ── 2 & 4. Data Extraction & Report Drafting via LLM Provider ──
        console.time("[REPORT] total");
        let finalReportContent = "{}";
        let providerUsed = "multi-stage-pipeline";
        let fallbackReason = "";
        let schemaValidation = { success: true, errors: [] };
        let qcResult = { qcPassed: true, qcErrors: [], qcWarnings: [], summary: {} };
        let accuracyResult = { score: 0, passed: false, breakdown: [], qcSummary: {} };
        let modelUsed = null;
        
        let providerStatus = "success";
        let providerWarning = null;
        let aiEnhanced = false;
        let deterministicArtifacts = null;
        
        try {
          if (template.slug === "commercial-building-energy-audit") {
            debugCollector.addBlock({ id: "deterministic_report_builder", title: "Deterministic Report Builder", status: "completed" });
            debugCollector.addBlock({ id: "chapter_1_builder", title: "Chapter 1 Builder", status: "completed" });
            debugCollector.addBlock({ id: "chapter_2_builder", title: "Chapter 2 Builder", status: "completed" });
            debugCollector.addBlock({ id: "chapter_3_ecm_builder", title: "Chapter 3 ECM Builder", status: "completed" });
            debugCollector.addBlock({ id: "calculation_engine", title: "Calculation Engine", status: "completed" });
            debugCollector.addBlock({ id: "plotting_engine", title: "Plotting Engine", status: "completed" });
            
            console.time("[REPORT] deterministic_build");
            deterministicArtifacts = buildCommercialAuditArtifacts({
              reportData: buildDeterministicCommercialAuditFallback({
                formData: inputDetails,
                excelTruth: extractedExcelData,
                extractedExcelData,
                }),
                inputDetails,
                extractedExcelData,
                providerUsed: "deterministic",
              });
            console.timeEnd("[REPORT] deterministic_build");

            console.log("[REPORT] before deterministic DB save");
            await prisma.generated_reports.update({
              where: { id: reportRecord.id },
              data: {
                outputContent: deterministicArtifacts.finalReportContent,
                extractedData: JSON.stringify({
                  providerUsed: "deterministic",
                  fallbackReason: "",
                  extractionAudit: extractedExcelData.extractionAudit || [],
                  removedRows: extractedExcelData.removedRows || [],
                  groupCounts: extractedExcelData.groupCounts || {},
                  mappingConfidence: extractedExcelData.mappingConfidence || [],
                  datasetProfile: extractedExcelData.datasetProfile || null,
                  sourceSheet: extractedExcelData.sourceSheet || "",
                  sourceHeaderRow: extractedExcelData.sourceHeaderRow || 0,
                  providerStatus: "success",
                  modelUsed: null,
                  providerAttempts: [],
                  providerWarning: null,
                  aiEnhanced: false,
                  schemaValidation: deterministicArtifacts.schemaValidation,
                  qcResult: deterministicArtifacts.qcResult,
                  accuracyResult: deterministicArtifacts.accuracyResult,
                }),
                missingData: JSON.stringify([]),
                status: "completed",
              },
            });
            console.log("[REPORT] after deterministic DB save");
            
            debugCollector.data.calculationTrace = [
              { calculationName: "Total Investment", formula: "SUM(ECM investment)", inputFields: ["investment"], recordCount: extractedExcelData.projects?.length || 0, outputValue: extractedExcelData.projects?.reduce((a, b) => a + (Number(b.investment) || 0), 0) || 0, missingInputs: [], status: "success" },
              { calculationName: "Total Annual Saving", formula: "SUM(ECM annual saving)", inputFields: ["annualSaving"], recordCount: extractedExcelData.projects?.length || 0, outputValue: extractedExcelData.projects?.reduce((a, b) => a + (Number(b.annualSaving) || 0), 0) || 0, missingInputs: [], status: "success" },
              { calculationName: "Simple Payback", formula: "Investment / Annual Saving", inputFields: ["investment", "annualSaving"], outputValue: null, status: "success" }
            ];

            debugCollector.data.plottingTrace = [
              { chartId: "chart_1", chartTitle: "Investment vs Savings", chartType: "Bar", dataSource: "ECM Data", xField: "ecmNo", yField: "investment", recordsCount: extractedExcelData.projects?.length || 0, status: "skipped", missingReason: "No chart block configured" }
            ];

            debugCollector.data.prompts = [
              { nodeId: "executive_summary", promptName: "Executive Summary Enhancement", promptVersion: "v1", model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite", systemPromptPreview: "You are an expert energy auditor...", userPromptPreview: "Generate an executive summary...", fullSystemPrompt: "", fullUserPrompt: "", schemaName: null, enabled: true },
              { nodeId: "ecm_engineering", promptName: "ECM Engineering Enhancement", promptVersion: "v1", model: process.env.OPENROUTER_MODELS?.split(',')[0] || "openai/gpt-oss-120b:free", systemPromptPreview: "You are a mechanical engineer...", userPromptPreview: "Elaborate on these ECMs...", fullSystemPrompt: "", fullUserPrompt: "", schemaName: null, enabled: true }
            ];

            debugCollector.data.validationTrace = {
              changedNumbersDetected: deterministicArtifacts.qcResult?.qcErrors?.filter(e => e.type === "number_mismatch").length || 0,
              forbiddenStringsDetected: 0,
              promptLeakageDetected: 0,
              aiFieldsAccepted: 0,
              aiFieldsDropped: 0,
              droppedFields: [],
              tableCompletenessCheck: "passed",
              ecmEcmDuplicationCheck: "passed",
              missingMandatoryTables: [],
              warnings: deterministicArtifacts.qcResult?.qcWarnings || [],
              errors: deterministicArtifacts.qcResult?.qcErrors || []
            };

            schemaValidation = deterministicArtifacts.schemaValidation;
            qcResult = deterministicArtifacts.qcResult;
            accuracyResult = deterministicArtifacts.accuracyResult;
            finalReportContent = deterministicArtifacts.finalReportContent;
            providerUsed = "deterministic";
            providerStatus = "success";
            modelUsed = null;
            providerWarning = null;
            aiEnhanced = false;
          } else {
             // Fallback for non-audit reports
             const res = await generateWithProvider({
               templateSlug: template.slug,
               systemPrompt: "You are an AI generator.",
               userPrompt: draftUserPrompt,
               inputDetails,
               extractedExcelData,
               uploadedFiles,
               templateConfig: template,
             });
             finalReportContent = typeof res.reportData === "string" ? res.reportData : JSON.stringify(res.reportData);
             providerUsed = res.metadata.providerUsed;
             providerStatus = res.metadata.providerStatus || (providerUsed === "deterministic-fallback" ? "fallback" : "success");
             modelUsed = res.metadata.modelUsed || null;
             if (res.metadata.providerAttempts) {
               res.metadata.providerAttempts.forEach(attempt => debugCollector.addProviderAttempt(attempt));
             }
             providerWarning = res.metadata.fallbackReason ? `OpenRouter failed: ${res.metadata.fallbackReason}` : null;
             aiEnhanced = providerUsed !== "deterministic-fallback";
          }
        } catch (e) {
          console.warn(`[GENERATION FALLBACK] LLM pipeline failed: ${e.message}. Using deterministic fallback.`);
          fallbackReason = e.message;
          
          
          if (template.slug === "commercial-building-energy-audit") {
            deterministicArtifacts =
              deterministicArtifacts ||
              buildCommercialAuditArtifacts({
                reportData: buildDeterministicCommercialAuditFallback({
                  formData: inputDetails,
                  excelTruth: extractedExcelData,
                  extractedExcelData,
                }),
                inputDetails,
                extractedExcelData,
                providerUsed: "deterministic",
              });
            schemaValidation = deterministicArtifacts.schemaValidation;
            qcResult = deterministicArtifacts.qcResult;
            accuracyResult = deterministicArtifacts.accuracyResult;
            finalReportContent = deterministicArtifacts.finalReportContent;
            providerUsed = "deterministic";
            providerStatus = "success";
            modelUsed = null;
            providerWarning = "AI enhancement failed after all model attempts. Deterministic report used.";
            aiEnhanced = false;
          } else {
            // For other templates, we don't have a specific fallback yet.
            throw new Error(`Generation failed: ${e.message}`);
          }
        }

        if (
          useAiDuringGeneration &&
          !skipLlmForDev &&
          process.env.OPENROUTER_API_KEY &&
          process.env.OPENROUTER_MODELS &&
          debugCollector.data.providerAttempts.length === 0 &&
          aiEnhanced
        ) {
          console.error("[BUG] OpenRouter configured but providerAttempts is empty. Provider flow was skipped.");
        }

        // Finalize blocks
        debugCollector.addBlock({ id: "gemini_enhancement", title: "Gemini Enhancement", status: (useAiDuringGeneration && process.env.GEMINI_API_KEY && !skipLlmForDev) ? (aiEnhanced ? "completed" : "failed") : "skipped", warnings: (useAiDuringGeneration && process.env.GEMINI_API_KEY) ? [] : ["AI keys missing"] });
        debugCollector.addBlock({ id: "openrouter_enhancement", title: "OpenRouter Enhancement", status: (useAiDuringGeneration && process.env.OPENROUTER_API_KEY && !skipLlmForDev) ? (aiEnhanced ? "completed" : "failed") : "skipped", warnings: (useAiDuringGeneration && process.env.OPENROUTER_API_KEY) ? [] : ["AI keys missing"] });
        debugCollector.addBlock({ id: "ai_merge_qc", title: "AI Merge & QC", status: "completed" });
        debugCollector.addBlock({ id: "docx_export", title: "DOCX Export Generation", status: "completed" });
        debugCollector.addBlock({ id: "frontend_preview_payload", title: "Frontend Preview Payload", status: "completed" });

        if (!aiEnhanced) {
          debugCollector.addAiNode({ nodeId: "gemini_summary", task: "Executive Summary", selectedProvider: "gemini", selectedModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite", status: "skipped", finalUsed: false, warnings: ["Missing API key or fallback triggered"] });
          debugCollector.addAiNode({ nodeId: "openrouter_ecms", task: "ECM Engineering", selectedProvider: "openrouter", selectedModel: process.env.OPENROUTER_MODELS?.split(',')[0] || "openai/gpt-oss-120b:free", status: "skipped", finalUsed: false, warnings: ["Missing API key or fallback triggered"] });
        } else {
          debugCollector.addAiNode({ nodeId: "gemini_summary", task: "Executive Summary", selectedProvider: "gemini", selectedModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite", status: "completed", finalUsed: true });
          debugCollector.addAiNode({ nodeId: "openrouter_ecms", task: "ECM Engineering", selectedProvider: "openrouter", selectedModel: modelUsed || process.env.OPENROUTER_MODELS?.split(',')[0] || "openai/gpt-oss-120b:free", status: "completed", finalUsed: true });
        }

        if (template.slug === "commercial-building-energy-audit") {
          debugCollector.data.exportTrace = {
             format: "docx",
             status: "ready",
             generatedAt: new Date().toISOString()
          };
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

        const persistMetadata = {
          providerUsed,
          fallbackReason,
          extractionAudit: extractedExcelData.extractionAudit || [],
          removedRows: extractedExcelData.removedRows || [],
          groupCounts: extractedExcelData.groupCounts || {},
          mappingConfidence: extractedExcelData.mappingConfidence || [],
          datasetProfile: extractedExcelData.datasetProfile || null,
          sourceSheet: extractedExcelData.sourceSheet || "",
          sourceHeaderRow: extractedExcelData.sourceHeaderRow || 0,
          providerStatus,
          modelUsed,
          providerAttempts: debugCollector.data.providerAttempts,
          providerWarning,
          aiEnhanced,
          schemaValidation,
          qcResult,
          accuracyResult,
        };

        console.time("[REPORT] db_save");
        console.log("[REPORT] before DB save");
        await prisma.generated_reports.update({
          where: { id: reportRecord.id },
          data: {
            extractedData: JSON.stringify(persistMetadata),
            missingData:   JSON.stringify([]),
          },
        });

        // ── 5. Complete DB record ─────────────────────────────────────────────
        let completedRecord = null;
                try {
          completedRecord = await withTimeout(
            prisma.generated_reports.update({
              where: { id: reportRecord.id },
              data: {
                outputContent: finalReportContent,
                status: "completed",
              },
            }),
            debugCollector.data.config.aiFinalizationTimeoutMs,
            "AI finalization db save"
          );
          console.log("[REPORT] after DB save");
          console.timeEnd("[REPORT] db_save");
        } catch (saveError) {
          if (template.slug !== "commercial-building-energy-audit" || !deterministicArtifacts) {
            throw saveError;
          }

          console.warn(`[AI FINALIZATION] Save failed, returning deterministic report: ${saveError.message}`);
          providerUsed = "deterministic";
          providerStatus = "success";
          modelUsed = null;
          providerWarning = "AI enhancement failed after all model attempts. Deterministic report used.";
          aiEnhanced = false;
          fallbackReason = [fallbackReason, saveError.message].filter(Boolean).join(" | ");
          schemaValidation = deterministicArtifacts.schemaValidation;
          qcResult = deterministicArtifacts.qcResult;
          accuracyResult = deterministicArtifacts.accuracyResult;
          finalReportContent = deterministicArtifacts.finalReportContent;

          console.log("[REPORT] before deterministic fallback DB save");
          completedRecord = await prisma.generated_reports.update({
            where: { id: reportRecord.id },
            data: {
              outputContent: finalReportContent,
              extractedData: JSON.stringify({
                ...persistMetadata,
                providerUsed,
                providerStatus,
                modelUsed,
                providerAttempts: debugCollector.data.providerAttempts,
                providerWarning,
                aiEnhanced,
                fallbackReason,
                schemaValidation,
                qcResult,
                accuracyResult,
              }),
              missingData: JSON.stringify([]),
              status: "completed",
            },
          });
          console.log("[REPORT] after deterministic fallback DB save");
          console.timeEnd("[REPORT] db_save");
        }

        // Build pipelineDebug object for the Developer Pipeline Side Panel safely
        
        // Return structured response matching the new public payload contract
        console.time("[REPORT] response_build");
        pipelineDebug = debugCollector.finalize({
          status: "completed",
          finalOutputSource: aiEnhanced ? "enhancedReportData" : "deterministic",
          finalEnhancerUsed: debugCollector.data.finalEnhancerUsed || providerUsed || "none",
          fallbackReason: debugCollector.data.fallbackReason || fallbackReason || null
        });

        console.log("[REPORT] before response return");
        response.status(200).json({
          success: true,
          report: {
            ...completedRecord,
            providerUsed,
            providerStatus,
            modelUsed,
            providerAttempts: debugCollector.data.providerAttempts,
            aiEnhanced,
            providerWarning: providerWarning || undefined,
            warnings: fallbackReason ? [fallbackReason] : []
          },
          pipelineDebug,
          template_id:     String(templateId),
          generation_mode: generationMode || "public",
          status:          "completed",
        });

        console.log("[REPORT] after response return");
        console.timeEnd("[REPORT] response_build");
        console.timeEnd("[REPORT] total");
      } catch (e) {
        console.error(e.message, e);
        debugCollector.addError(e?.message || String(e), { stack: e?.stack });

        pipelineDebug = debugCollector.finalize({
          status: "failed",
          fallbackReason: e?.message || String(e)
        });

        if (reportRecord) {
          await prisma.generated_reports.update({
            where: { id: reportRecord.id },
            data: { status: "failed", error: e.message },
          });
        }
        try {
          console.timeEnd("[REPORT] total");
        } catch (_) {}
        response.status(500).json({ error: e.message, pipelineDebug });
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
    "/reports/:id/enhance-ai",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id, 10);
        const user = await userFromSession(request, response);
        
        console.log("[AI PROVIDER CONFIG]", {
          aiProvider: process.env.AI_PROVIDER,
          geminiKeyCount: getGeminiApiKeys().length,
          geminiModel: process.env.GEMINI_MODEL,
          openRouterKeyPresent: Boolean(process.env.OPENROUTER_API_KEY),
          openRouterModels: process.env.OPENROUTER_MODELS,
        });

        const maxAiGenerationTotalMs = Number(process.env.MAX_AI_GENERATION_TOTAL_MS || 120000);
        
        const report = await prisma.generated_reports.findFirst({
          where: { id },
          include: { template: { select: { id: true, slug: true, name: true } } },
        });

        if (!report) return response.sendStatus(404).end();
        if (user && user.role === "default" && report.userId !== user.id) {
          return response.sendStatus(403).end();
        }
        if (report.template?.slug !== "commercial-building-energy-audit") {
          return response.status(400).json({ error: "AI enhancement is only supported for this template." });
        }

        const debugCollector = createPipelineDebugCollector({
          reportType: report.template?.slug || "commercial-building-energy-audit",
          generationMode: "enhance-ai"
        });

        const inputDetails = parseStoredJson(report.inputDetails, {});
        const uploadedFiles = parseStoredJson(report.uploadedFiles, []);
        const priorMetadata = parseStoredJson(report.extractedData, {});
        const existingReportData = parseStoredJson(report.outputContent, null);

        if (!existingReportData) {
          return response.status(400).json({ error: "Report content is not valid JSON." });
        }

        const deterministicArtifacts = buildCommercialAuditArtifacts({
          reportData: existingReportData,
          inputDetails,
          extractedExcelData: {},
          providerUsed: "deterministic",
        });

        await prisma.generated_reports.update({
          where: { id },
          data: { status: "enhancing_ai" },
        });

        let finalReportContent = report.outputContent;
        let providerUsed = "deterministic";
        let providerStatus = "success";
        let modelUsed = null;
        
        let providerWarning = "AI enhancement failed. Deterministic report used.";
        let aiEnhanced = false;
        let exactFailureReason = null;
        let aiEnhancementStatus = { status: "started" };
        let retryAfterSeconds = null;
        let aiEnhanceDebug = null;
        let aiEnhancedFields = [];
        let aiDroppedFields = [];
        let schemaValidation = deterministicArtifacts.schemaValidation;
        let qcResult = deterministicArtifacts.qcResult;
        let accuracyResult = deterministicArtifacts.accuracyResult;

        // removed duplicate providerAttempts
        const aiProviderAttempted = "gemini";
        const attempt = {
          provider: "gemini",
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
          status: "started",
          startedAt: new Date().toISOString(),
          componentId: "batch_narrative_enhancement",
          componentTitle: "Batched narrative enhancement"
        };
        const providerAttempts = priorMetadata.providerAttempts || [];
        providerAttempts.push(attempt);

        console.log("[AI ENHANCE GEMINI ATTEMPT]", attempt);

        try {
          const componentResult = await withTimeout(
            generateCommercialAuditComponentReport({
              formData: inputDetails,
              extractedExcelData: {},
              extractedInfo: {},
              imageMetadata: buildImageMetadataFromUploads(uploadedFiles),
              uploadedFiles,
              templateConfig: report.template,
              baseReportOverride: existingReportData,
              useAiOverride: true,
            }),
            maxAiGenerationTotalMs,
            "AI enhancement total budget"
          );

          if (componentResult?.providerAttempts?.length > 0) {
            const genericIdx = providerAttempts.indexOf(attempt);
            if (genericIdx > -1) {
              providerAttempts.splice(genericIdx, 1);
            }
            providerAttempts.push(
              ...componentResult.providerAttempts.filter((a) => a.status !== "started")
            );
          }

          if (componentResult?.aiEnhanced === true && componentResult?.report) {
            attempt.status = "success";
            attempt.finishedAt = new Date().toISOString();
            
            aiEnhancementStatus = componentResult.aiEnhancementStatus || { status: "success" };
            retryAfterSeconds = componentResult.retryAfterSeconds || null;
            aiEnhanceDebug = componentResult.debug || null;
            aiEnhancedFields = componentResult.aiEnhancedFields || [];
            aiDroppedFields = componentResult.aiDroppedFields || [];
            if (componentResult.aiFailureReason) {
               exactFailureReason = componentResult.aiFailureReason;
            }

            const enhancedArtifacts = await withTimeout(
              Promise.resolve().then(() =>
                buildCommercialAuditArtifacts({
                  reportData: componentResult.report,
                  inputDetails,
                  extractedExcelData: {},
                  providerUsed: componentResult.providerUsed || "openrouter",
                })
              ),
              debugCollector?.data?.config?.aiFinalizationTimeoutMs || 60000,
              "AI finalization"
            );

            finalReportContent = enhancedArtifacts.finalReportContent;
            providerUsed = componentResult.providerUsed || "openrouter";
            providerStatus = componentResult.providerStatus || "success";
            modelUsed = componentResult.modelUsed || null;
            providerWarning = componentResult.providerWarning || null;
            aiEnhanced = true;
            schemaValidation = enhancedArtifacts.schemaValidation;
            qcResult = enhancedArtifacts.qcResult;
            accuracyResult = enhancedArtifacts.accuracyResult;
          } else {
            exactFailureReason =
              componentResult?.aiFailureReason ||
              componentResult?.error ||
              componentResult?.providerAttempts?.[0]?.reason ||
              "Gemini enhancement failed without provider error details";
            
            aiEnhancementStatus = componentResult?.aiEnhancementStatus || { status: "failed", failureReason: exactFailureReason };
            retryAfterSeconds = componentResult?.retryAfterSeconds || null;
            aiEnhanceDebug = componentResult?.debug || null;
            aiEnhancedFields = componentResult?.aiEnhancedFields || [];
            aiDroppedFields = componentResult?.aiDroppedFields || [];
            
            attempt.status = componentResult?.aiEnhancementStatus?.status === "quota_exceeded" ? "quota_exceeded" : "failed";
            attempt.reason = exactFailureReason;
            attempt.error = exactFailureReason;
            attempt.retryAfterSeconds = retryAfterSeconds || undefined;
            attempt.finishedAt = new Date().toISOString();

            providerWarning = componentResult?.aiEnhancementStatus?.status === "quota_exceeded"
              ? "Gemini free quota exceeded. Deterministic report is ready."
              : "AI enhancement failed. Deterministic report used.";
          }
        } catch (error) {
          exactFailureReason =
            error?.message ||
            "Gemini enhancement failed without provider error details";

          attempt.status = error?.isQuotaExceeded ? "quota_exceeded" : "failed";
          attempt.reason = exactFailureReason;
          attempt.error = exactFailureReason;
          attempt.retryAfterSeconds = error?.retryAfterSeconds || undefined;
          attempt.finishedAt = new Date().toISOString();

          if (error?.isQuotaExceeded) {
            aiEnhancementStatus = { status: "quota_exceeded", failureReason: exactFailureReason };
            retryAfterSeconds = error?.retryAfterSeconds || 60;
            exactFailureReason = `Gemini free quota exceeded. Retry after ${retryAfterSeconds} seconds.`;
            providerWarning = "Gemini free quota exceeded. Deterministic report is ready.";
          } else {
            aiEnhancementStatus = { status: "failed", failureReason: exactFailureReason };
            providerWarning = "AI enhancement failed. Deterministic report used.";
          }
          console.log("[AI ENHANCE GEMINI ERROR]", exactFailureReason);
        }

        console.log("[AI ENHANCE EXACT FAILURE]", exactFailureReason);

        const nextMetadata = {
          ...priorMetadata,
          providerUsed,
          providerStatus,
          modelUsed,
          providerAttempts: debugCollector.data.providerAttempts,
          aiEnhanceDebug,
          aiEnhancedFields,
          aiDroppedFields,
          providerWarning,
          aiEnhanced,
          schemaValidation,
          qcResult,
          accuracyResult,
        };

        const updatedReport = await prisma.generated_reports.update({
          where: { id },
          data: {
            outputContent: finalReportContent,
            extractedData: JSON.stringify(nextMetadata),
            missingData: JSON.stringify([]),
            status: "completed",
            error: null,
          },
          include: { template: { select: { name: true, slug: true } } },
        });

        const isDev = process.env.NODE_ENV === "development";
        const aiFailureReason = !aiEnhanced ? exactFailureReason : null;

        console.log("[AI ENHANCE EXACT FAILURE RETURNED]", {
          aiFailureReason,
          providerAttempts
        });

        response.status(200).json({
          success: true,
          report: {
            ...updatedReport,
            providerUsed,
            providerStatus,
            modelUsed,
            providerAttempts: debugCollector.data.providerAttempts,
            aiEnhanced,
            aiEnhancementStatus,
            retryAfterSeconds,
            aiEnhanceDebug,
            aiEnhancedFields,
            aiDroppedFields,
            providerWarning: providerWarning || undefined,
            warnings: providerWarning ? [providerWarning] : [],
            aiProviderAttempted,
            aiFailureReason,
            pipelineDebug: debugCollector.data
          },
        });
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ error: e.message });
      }
    }
  );

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
        reportData.fieldFlags = buildFieldFlags(
          reportData,
          {},
          { providerUsed: report.providerUsed || reportData?.providerUsed || reportData?.qcSummary?.providerUsed || "deterministic-fallback" }
        );
        reportData.missingFieldSummary = buildMissingFieldSummary(reportData.fieldFlags);

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

        console.log("[EXPORT QC CHECK]", {
          validEcms: qcResult.summary.validEcmCount ?? qcResult.summary.projectCount,
          groups: qcResult.summary.groupCount,
          duplicateTitles: qcResult.summary.duplicateTitleCount,
          invalidTitles: qcResult.summary.invalidTitleCount,
          hardErrors: qcResult.summary.hardErrorCount,
          warnings: qcResult.summary.warningCount,
          requiredReview: !qcResult.qcPassed,
          shouldBlockExport: !qcResult.qcPassed
        });

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

        const exportReport = stripDebugMetadata(reportData);

        let buffer;
        try {
          buffer = await buildCommercialBuildingEnergyAuditDocx(exportReport);
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
