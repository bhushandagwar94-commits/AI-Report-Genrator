const { reqBody, userFromSession } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { handleFileUpload } = require("../utils/files/multer");
const { CollectorApi } = require("../utils/collectorApi");
const {
  buildCommercialBuildingEnergyAuditDocx,
} = require("../services/docxExportService");
const prisma = require("../utils/prisma");
const { getLLMProvider } = require("../utils/helpers");
const { extractVrChennaiWorkbook } = require("../services/vrChennaiWorkbookExtractor");
const { normalizeReportGroups } = require("../utils/groupHelper");
const { getModelTag } = require("./utils");
const fs = require("fs");
const path = require("path");
const { hotdirPath } = require("../utils/files");
const extractJson = require("extract-json-from-string");
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const multer = require("multer");
const {
  createPipelineDebugCollector,
} = require("../utils/pipelineDebugCollector");
const {
  ensureAiReportGeneratorSeeded,
} = require("../utils/aiReportGeneratorSeed");
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
const {
  extractSupportingContext,
} = require("../services/supportingFileExtractor");
const { enforceReportQuality } = require("../services/reportQualityEnforcer");
const { sanitizeReportData } = require("../services/reportSanitizerService");
const { validateFinalReportQuality } = require("../services/finalReportQualityService");
const { buildExtractedDataContext } = require("../services/extractedDataContextService");
const {
  buildVrChennaiClientReadyModel,
  isVrChennaiReport,
  renderVrChennaiClientReadyDocx,
} = require("../services/vrChennaiClientReadyRenderer");
const {
  expandReportEngineeringNarratives,
  classifyEcm,
  countWords,
} = require("../services/engineeringNarrativeExpander");
const { filterReportProjects } = require("../services/projectQualityFilter");
const { formatInr, formatKwh, formatPercent, formatMonths, formatYears, formatIndianNumber } = require("../services/reportFormattingService");

let enhanceReportNarrativesWithAi = null;

try {
  ({ enhanceReportNarrativesWithAi } = require("../services/aiReportEnhancer"));
  console.log("[AI_ENHANCER_IMPORT_OK]");
} catch (error) {
  console.error("[AI_ENHANCER_IMPORT_FAILED]", error?.stack || error?.message || error);
}

let cleanupFinalReportData = (data) => data;

try {
  ({ cleanupFinalReportData } = require("../services/finalReportCleanupService"));
  console.log("[FINAL_REPORT_CLEANUP_SERVICE_READY]");
} catch (error) {
  console.warn("[FINAL_REPORT_CLEANUP_SERVICE_NOT_LOADED]", error.message);
}

function countInternalPhrases(reportData) {
  const text = JSON.stringify(reportData || {}).toLowerCase();
  const phrases = [
    "deterministic project data",
    "source of truth",
    "narrative enhancement",
    "must remain unchanged",
    "project team should document baseline condition",
    "engineering review should confirm site constraints"
  ];

  return phrases.reduce((count, phrase) => {
    return count + (text.includes(phrase) ? 1 : 0);
  }, 0);
}

function logSafeCleanupCheck(reportData, label) {
  console.log(`[SAFE_FINAL_CLEANUP_CHECK] [${label}]`, {
    projectCount: (reportData.groups || []).reduce((s, g) => s + ((g.projects || []).length), 0),
    internalPhraseCount: countInternalPhrases(reportData),
    ecm2System: (reportData.groups || [])
      .flatMap((g) => g.projects || [])
      .find((p) => String(p.ecmNo || "").includes("2"))?.system,
    finalCleanupApplied: reportData.finalCleanupApplied === true
  });
}

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
  const durationPattern =
    /^(\d+([-\s]+to\s+\d+)?\s*(weeks?|months?|days?|yrs?|years?))$/i;
  if (durationPattern.test(t)) return false;

  // Rule 2: Reject known duration headers mapped as titles
  const forbiddenTitles = [
    "project lead time",
    "duration",
    "payback",
    "investment",
    "total",
    "notes",
  ];
  if (forbiddenTitles.includes(t)) return false;

  return true;
}

function normalizeActiveReportData(reportData) {
  const normalized = normalizeReportForExport(reportData);
  let groupedProjects = Array.isArray(normalized?.groupedProjects)
    ? normalized.groupedProjects
    : Array.isArray(normalized?.groups)
    ? normalized.groups
    : [];

  // Fallback to top-level projects if groups is empty
  if (groupedProjects.length === 0) {
    const fallbackProjects = 
      normalized?.projects || 
      normalized?.executiveSummary?.summaryOfIdentifiedProjects || 
      [];
      
    if (Array.isArray(fallbackProjects) && fallbackProjects.length > 0) {
      groupedProjects = [{
        groupNo: "GR-1",
        groupName: "Energy Saving Projects",
        projects: fallbackProjects
      }];
    }
  }

  const groups = groupedProjects.map((group, index) => ({
    ...(group && typeof group === "object" ? group : {}),
    groupNo: group?.groupNo || `GR-${index + 1}`,
    groupTitle: group?.groupTitle || group?.groupName || group?.title || `Group ${index + 1}`,
    projects: Array.isArray(group?.projects) ? group.projects : [],
  }));

  const projects = groups.flatMap((group) =>
    Array.isArray(group?.projects) ? group.projects : []
  );

  return {
    ...normalized,
    groups,
    groupedProjects: groups,
    projects,
  };
}

function getActiveReportProjectCount(reportData) {
  return Array.isArray(reportData?.groups)
    ? reportData.groups.reduce(
        (sum, group) =>
          sum + (Array.isArray(group?.projects) ? group.projects.length : 0),
        0
      )
    : 0;
}

function getAllProjects(reportData) {
  return (reportData?.groups || []).flatMap((group) =>
    Array.isArray(group?.projects) ? group.projects : []
  );
}

function wordCount(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function enhancementSummary(reportData) {
  const firstProject = getAllProjects(reportData)[0];

  return {
    projectCount: getAllProjects(reportData).length,
    firstProjectTitle:
      firstProject?.title || firstProject?.ecmName || firstProject?.projectTitle || null,
    existingWords: wordCount(firstProject?.existingSystemDescription),
    problemWords: wordCount(firstProject?.problemGapIdentified),
    proposedWords: wordCount(
      firstProject?.proposedProject || firstProject?.proposedProjectDescription
    ),
    rationaleWords: wordCount(firstProject?.rationaleForEnergySaving),
    mvWords: wordCount(firstProject?.measurementVerificationPlan),
    benefitsWords: wordCount(firstProject?.benefitsOtherThanEnergySaving),
    conclusionWords: wordCount(firstProject?.conclusion || firstProject?.finalConclusion),
  };
}

function firstProjectSummary(reportData) {
  const firstProject = getAllProjects(reportData)[0];

  return {
    projectCount: getAllProjects(reportData).length,
    firstProjectNo: firstProject?.ecmNo || firstProject?.projectNo || null,
    firstProjectTitle:
      firstProject?.title || firstProject?.ecmName || firstProject?.projectTitle || null,
    firstProjectClassification: firstProject ? classifyEcm(firstProject) : null,
    existingWords: countWords(firstProject?.existingSystemDescription),
    problemWords: countWords(firstProject?.problemGapIdentified),
    proposedWords: countWords(firstProject?.proposedProject),
    rationaleWords: countWords(firstProject?.rationaleForEnergySaving),
    mvWords: countWords(firstProject?.measurementVerificationPlan),
    benefitsWords: countWords(firstProject?.benefitsOtherThanEnergySaving),
    conclusionWords: countWords(firstProject?.conclusion),
  };
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
  finalData.missingFieldSummary = buildMissingFieldSummary(
    finalData.fieldFlags
  );

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
      clientName: pf.client_name || pf.clientName || "[Client / Facility Name]",
      facilityName:
        pf.facility_name ||
        pf.facilityName ||
        "[To be updated after site data verification]",
      location: pf.location || "[To be updated after site data verification]",
      auditPeriod:
        pf.audit_period ||
        pf.auditPeriod ||
        "[To be updated after site data verification]",
      reportDate:
        pf.report_date ||
        pf.reportDate ||
        new Date().toLocaleDateString("en-IN"),
      contactPerson:
        pf.contact_person ||
        pf.contactPerson ||
        "[To be updated after site data verification]",
      outputFormat: pf.output_format || pf.outputFormat || "docx",
    };
    return {
      templateId: body.template_id,
      inputDetails,
      uploadedFiles: body.uploaded_files || [],
      generationMode: body.generation_mode || "public",
      publicForm: pf,
      status: body.status || "submitted",
    };
  }

  // Legacy payload — pass through unchanged
  return {
    templateId: body.templateId,
    inputDetails: {
      clientName: body.inputDetails?.clientName || "[Client / Facility Name]",
      facilityName:
        body.inputDetails?.facilityName ||
        "[To be updated after site data verification]",
      location:
        body.inputDetails?.location ||
        "[To be updated after site data verification]",
      auditPeriod:
        body.inputDetails?.auditPeriod ||
        "[To be updated after site data verification]",
      reportDate:
        body.inputDetails?.reportDate || new Date().toLocaleDateString("en-IN"),
      contactPerson:
        body.inputDetails?.contactPerson ||
        "[To be updated after site data verification]",
      outputFormat: body.inputDetails?.outputFormat || "docx",
    },
    uploadedFiles: body.uploadedFiles || [],
    generationMode: body.generationMode || "public",
    publicForm: null,
    status: "submitted",
  };
}

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 20 },
}).array("files");

const EXCEL_FIELD_SYNONYMS = {
  rowNumber: ["sr", "srno", "sr no", "ecm no", "ecmno"],
  projectTitle: [
    "project name",
    "energy saving project",
    "ecm name",
    "project title",
    "recommendation",
    "saving opportunity",
    "project",
    "ecm",
  ],
  proposedIntervention: [
    "energy saving project",
    "project description",
    "description",
  ],
  projectActivities: ["project activities", "activities", "scope of work"],
  system: [
    "section",
    "4 category",
    "category",
    "system",
    "area",
    "utility",
    "equipment type",
    "department",
    "project category",
  ],
  investment: [
    "investment, rs.",
    "investment",
    "estimated investment",
    "project cost",
    "capex",
    "implementation cost",
    "investment rs",
    "cost",
    "inr",
  ],
  annualSaving: [
    "savings in rs/year",
    "annual saving",
    "cost saving",
    "monetary saving",
    "yearly saving",
    "saving rs",
    "rs/year",
    "annual benefit",
    "annual savings",
  ],
  energySaving: [
    "saving kwh/year",
    "energy saving kwh/year",
    "saving kwh",
    "electricity saving",
    "annual energy saving",
    "energy savings (kwh/year)",
    "units saving",
  ],
  payback: [
    "payback period, years",
    "payback period",
    "simple payback",
    "roi",
    "payback",
    "years",
    "months",
  ],
  priority: [
    "priority",
    "preority",
    "implementation priority",
    "ranking",
    "action priority",
    "priority phase i/ii/iii",
    "priority phase",
  ],
  location: ["location", "area", "plant room", "floor", "building area"],
  equipmentCovered: [
    "equipment name",
    "equipment covered",
    "equipment",
    "machine",
    "asset",
    "load",
  ],
  implementationDuration: [
    "project lead time",
    "implementation duration",
    "duration",
    "timeline",
    "weeks",
    "months",
  ],
  co2Reduction: [
    "co2",
    "carbon",
    "emission",
    "emission reduction",
    "tco2",
    "tco2/year",
  ],
  emissionFactor: ["emission factor", "grid emission", "grid emission factor"],
  rationale: [
    "rational for energy saving project",
    "rationale",
    "rational",
    "saving principle",
  ],
  baselineDetails: [
    "notes (baseline details & others)",
    "baseline details",
    "baseline",
    "existing condition",
    "notes",
  ],
  baselineConsumption: [
    "baseline consumption",
    "baseline kwhyear",
    "baselinekwhyear",
    "baseline kwh year",
    "baseline, kwh/year",
  ],
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
  "baselineDetails",
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
  "baselineDetails",
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
    if (cell.richText)
      return cell.richText.map((part) => part.text || "").join("");
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
        return (
          normalized === normalizedSynonym ||
          normalized.includes(normalizedSynonym)
        );
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
    } else if (
      normalizedHeader.includes(normalizedSynonym) ||
      normalizedSynonym.includes(normalizedHeader)
    ) {
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
      if (
        Number.isFinite(numericValue) &&
        numericValue > 0 &&
        numericValue < 100
      ) {
        smallIntegerCount++;
      }
    } else {
      textCount++;
    }

    if (
      /^\d+\s*(to|-)?\s*\d*\s*(weeks|months|days|hrs|hours|yrs|years)$/i.test(
        lower
      )
    ) {
      durationCount++;
    }

    if (
      /(project|retrofit|improvement|optimization|saving|heater|compressor|pump|motor|chiller|fan|blower|dryer|insulation|servo|apfc)/i.test(
        lower
      )
    ) {
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
    return {
      accepted: false,
      reason: "No usable sample values found for mapped column.",
    };
  }

  const mostlyNumeric =
    analysis.numericCount >= Math.max(2, Math.ceil(samples * 0.6));
  const mostlyText =
    analysis.textCount >= Math.max(2, Math.ceil(samples * 0.6));

  switch (field) {
    case "projectTitle":
      if (
        !mostlyText ||
        analysis.projectStyleCount === 0 ||
        analysis.durationCount >= Math.ceil(samples / 2)
      ) {
        return {
          accepted: false,
          reason: "Project title column does not look like ECM/project titles.",
        };
      }
      return {
        accepted: true,
        reason: "Column sample values look like ECM titles.",
      };
    case "system":
      if (!mostlyText || analysis.numericCount > analysis.textCount) {
        return {
          accepted: false,
          reason:
            "System/category column appears numeric or financially typed.",
        };
      }
      return {
        accepted: true,
        reason: "Column sample values look like system/category text.",
      };
    case "energySaving":
      if (!mostlyNumeric) {
        return {
          accepted: false,
          reason: "Energy saving column is not predominantly numeric.",
        };
      }
      if (analysis.smallIntegerCount >= Math.ceil(samples / 2)) {
        return {
          accepted: false,
          reason:
            "Energy saving column resembles ECM numbers or serial numbers.",
        };
      }
      return {
        accepted: true,
        reason: "Column sample values look like annual kWh savings.",
      };
    case "annualSaving":
    case "investment":
      if (!mostlyNumeric) {
        return {
          accepted: false,
          reason: `${field} column is not predominantly numeric.`,
        };
      }
      return {
        accepted: true,
        reason: "Column sample values look like financial figures.",
      };
    case "payback":
      if (!mostlyNumeric) {
        return {
          accepted: false,
          reason: "Payback column is not predominantly numeric.",
        };
      }
      return {
        accepted: true,
        reason: "Column sample values look like payback values.",
      };
    case "equipmentCovered":
      if (!mostlyText) {
        return {
          accepted: false,
          reason: "Equipment column is not predominantly text.",
        };
      }
      return {
        accepted: true,
        reason: "Column sample values look like equipment names.",
      };
    case "implementationDuration":
      if (analysis.durationCount === 0 && !mostlyText) {
        return {
          accepted: false,
          reason:
            "Implementation duration column does not resemble duration text.",
        };
      }
      return {
        accepted: true,
        reason: "Column sample values look like duration text.",
      };
    default:
      return {
        accepted: true,
        reason: "No additional type restrictions failed.",
      };
  }
}

function getColumnSampleValues(worksheet, headerRowNumber, columnIndex) {
  const values = [];
  for (
    let rowNumber = headerRowNumber + 1;
    rowNumber <= worksheet.rowCount && values.length < 8;
    rowNumber++
  ) {
    const row = worksheet.getRow(rowNumber);
    const cellValue = row.values?.[columnIndex];
    if (isBlankExcelRow(row.values || []) || isTotalExcelRow(row.values || []))
      continue;
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
    const fieldValidation = validateColumnAgainstField(
      bestCandidate.fieldName,
      analysis
    );
    const threshold = HIGH_RISK_FIELDS.has(bestCandidate.fieldName) ? 85 : 70;
    const accepted =
      bestCandidate.confidence >= threshold && fieldValidation.accepted;

    const report = {
      fieldName: bestCandidate.fieldName,
      matchedColumn: header,
      confidence: accepted
        ? bestCandidate.confidence
        : Math.min(bestCandidate.confidence, threshold - 1),
      matchType: bestCandidate.matchType,
      sampleValues: analysis.sampleValues,
      accepted,
      rejected: !accepted,
      reason: fieldValidation.reason,
      approvedSynonym: bestCandidate.approvedSynonym,
    };

    if (
      !fieldReports[bestCandidate.fieldName] ||
      report.confidence > fieldReports[bestCandidate.fieldName].confidence
    ) {
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
  const cleaned = String(text || "")
    .replace(/\r/g, "\n")
    .trim();
  if (!cleaned) return [];

  const segments = cleaned
    .split(/\n+|(?<=\.)\s+(?=\d+\.)/g)
    .map((segment) => segment.replace(/^\d+[).\s-]*/, "").trim())
    .filter(Boolean);

  const rows = (segments.length ? segments : [cleaned]).map(
    (segment, index) => {
      const row = { [primaryKey]: segment };
      secondaryKeys.forEach((key) => {
        row[key] = segment;
      });
      if (!row.srNo) row.srNo = index + 1;
      return row;
    }
  );

  return rows;
}

function normalizeGroupTitle(rawValue) {
  const text = String(rawValue || "")
    .toLowerCase()
    .trim();
  if (!text) return "";
  if (text.includes("cooling")) return "Cooling System Performance Improvement";
  if (text.includes("production")) return "Production Machines";
  if (text.includes("air compressor")) return "Air Compressors";
  if (text.includes("auxiliary"))
    return "Auxiliary Systems & Machine Improvement";
  return String(rawValue || "").trim();
}

function extractGroupTitleMap(workbook) {
  const titleToGroup = {};

  workbook.eachSheet((worksheet) => {
    let currentGroupTitle = "";
    let inGroupTable = false;

    worksheet.eachRow((row) => {
      const values = (row.values || [])
        .slice(1)
        .map((value) => cellText(value).trim());
      const joined = values.join(" ").toLowerCase();

      if (joined.includes("energy saving projects for")) {
        currentGroupTitle = normalizeGroupTitle(
          values.find((value) => /energy saving projects for/i.test(value))
        );
        inGroupTable = false;
        return;
      }

      if (
        values.some((value) => /ecm name/i.test(value)) &&
        values.some((value) => /investment/i.test(value))
      ) {
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
  const required = [
    "projectTitle",
    "equipmentCovered",
    "system",
    "energySaving",
    "annualSaving",
    "investment",
    "payback",
  ];
  const optional = [
    "baselineDetails",
    "rationale",
    "implementationDuration",
    "priority",
    "proposedIntervention",
  ];
  let score = required.reduce((sum, field) => {
    const confidence = mapping.fieldReports?.[field]?.accepted
      ? mapping.fieldReports[field].confidence
      : 0;
    return sum + Math.round(confidence / 10);
  }, 0);
  score += optional.reduce((sum, field) => {
    const confidence = mapping.fieldReports?.[field]?.accepted
      ? mapping.fieldReports[field].confidence
      : 0;
    return sum + Math.round(confidence / 25);
  }, 0);
  return score;
}

function detectDatasetProfile(projects = []) {
  const normalizedTitles = projects.map((project) =>
    normalizeProjectAuditTitle(project.projectTitle)
  );
  const matchedSignatureCount = MTL_BADDI_SIGNATURE_TITLES.filter((title) =>
    normalizedTitles.some((projectTitle) => projectTitle.includes(title))
  ).length;

  if (matchedSignatureCount >= 3) {
    return {
      datasetName: "MTL Baddi ECM",
      expectedEcmCount: 22,
      expectedGroups: {
        "Cooling System Performance Improvement": 7,
        "Production Machines": 7,
        "Air Compressors": 3,
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

    const projectTitle = preferredFieldValue(
      rowMap,
      "projectTitle",
      "proposedIntervention"
    );
    const equipmentCovered = preferredFieldValue(rowMap, "equipmentCovered");
    const system = preferredFieldValue(rowMap, "system");
    const proposedIntervention = preferredFieldValue(
      rowMap,
      "proposedIntervention",
      "projectTitle"
    );
    const rationale = preferredFieldValue(rowMap, "rationale");
    const baselineDetails = preferredFieldValue(rowMap, "baselineDetails");
    const baselineConsumption = preferredFieldValue(
      rowMap,
      "baselineConsumption"
    );
    const energySaving = preferredFieldValue(rowMap, "energySaving");
    const annualSaving = preferredFieldValue(rowMap, "annualSaving");
    const investment = preferredFieldValue(rowMap, "investment");
    const payback = preferredFieldValue(rowMap, "payback");
    const implementationDuration = preferredFieldValue(
      rowMap,
      "implementationDuration"
    );
    const priority = preferredFieldValue(rowMap, "priority");
    const projectActivities = preferredFieldValue(rowMap, "projectActivities");
    const rowNumberText = preferredFieldValue(rowMap, "rowNumber");

    // Engineering Context Extraction
    const department = preferredFieldValue(rowMap, "department") || "";
    const area = preferredFieldValue(rowMap, "area") || preferredFieldValue(rowMap, "location") || "";
    const observation = preferredFieldValue(rowMap, "observation") || "";
    const recommendation = preferredFieldValue(rowMap, "recommendation") || "";

    const audit = {
      rowNumber,
      projectTitleSourceColumn: bestHeader.mappedColumns.projectTitle || "",
      projectTitle,
      equipmentName: equipmentCovered,
      systemCategory: system,
      confidence: Object.values(bestHeader.fieldReports || {}).reduce(
        (sum, item) => sum + (item.accepted ? item.confidence : 0),
        0
      ),
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
      audit.reason =
        "Row does not contain any usable saving or financial value.";
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
      department,
      area,
      observation,
      recommendation,
      sheetName: bestSheet.name,
      projectActivitiesText: projectActivities || "Data required",
      scopeOfWork: buildStructuredList(projectActivities, "scopeItem"),
      keyActivities: buildStructuredList(projectActivities, "activity", [
        "details",
      ]),
      baselineData: baselineConsumption
        ? [
            {
              parameter: "Baseline consumption",
              unit: "kWh/year",
              value: parseNumberCell(baselineConsumption),
            },
          ]
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
    optional: [],
  };

  if (!mappedColumns.system) {
    recommendations.highPriority.push({
      field: "System / Category",
      priority: "high",
      whyItMatters:
        "Helps the report group ECMs correctly under the category-wise financial summary.",
      suggestedColumnNames: [
        "System",
        "Category",
        "Utility",
        "Project Category",
      ],
      exampleValues: ["HVAC", "Lighting", "Pumps", "Electrical", "Solar"],
    });
  }

  if (!mappedColumns.investment) {
    recommendations.highPriority.push({
      field: "Investment ₹",
      priority: "high",
      whyItMatters: "Required for financial summary and payback calculation.",
      suggestedColumnNames: ["Investment", "Estimated Cost", "Project Cost"],
      exampleValues: ["100000", "50000"],
    });
  }

  if (!mappedColumns.annualSaving) {
    recommendations.highPriority.push({
      field: "Annual Saving ₹/year",
      priority: "high",
      whyItMatters: "Required for management summary and ROI evaluation.",
      suggestedColumnNames: ["Annual Saving", "Cost Saving", "Monetary Saving"],
      exampleValues: ["50000", "20000"],
    });
  }

  if (!mappedColumns.energySaving) {
    recommendations.highPriority.push({
      field: "Energy Saving kWh/year",
      priority: "high",
      whyItMatters:
        "Required for energy saving calculation, key metrics and carbon footprint estimation.",
      suggestedColumnNames: [
        "Energy Saving kWh/year",
        "Saving kWh",
        "Electricity Saving",
      ],
      exampleValues: ["10000", "5000"],
    });
  }

  if (!mappedColumns.payback) {
    recommendations.highPriority.push({
      field: "Payback Period",
      priority: "high",
      whyItMatters:
        "Helps the report rank projects and justify implementation priority.",
      suggestedColumnNames: ["Payback", "Simple Payback", "ROI"],
      exampleValues: ["2.5", "1.2"],
    });
  }

  if (!mappedColumns.priority) {
    recommendations.highPriority.push({
      field: "Implementation Priority",
      priority: "high",
      whyItMatters:
        "Helps generate the Recommended Implementation Priority section.",
      suggestedColumnNames: ["Priority", "Phase", "Implementation Priority"],
      exampleValues: ["High", "Medium", "Low"],
    });
  }

  if (!mappedColumns.equipmentCovered) {
    recommendations.highPriority.push({
      field: "Equipment Covered",
      priority: "high",
      whyItMatters:
        "Improves Project Summary, Existing System Description and Technical Specifications.",
      suggestedColumnNames: ["Equipment Covered", "Asset", "Machine"],
      exampleValues: ["AHU-1", "Chiller 2"],
    });
  }

  if (!mappedColumns.baselineDetails) {
    recommendations.highPriority.push({
      field: "Baseline / Existing Condition",
      priority: "high",
      whyItMatters:
        "Crucial for describing the current state before the proposed measure.",
      suggestedColumnNames: ["Baseline", "Existing Condition", "Notes"],
      exampleValues: ["Old 15W CFL bulbs currently installed"],
    });
  }

  if (!mappedColumns.location) {
    recommendations.mediumPriority.push({
      field: "Location",
      priority: "medium",
      whyItMatters:
        "Improves the project summary and implementation planning sections.",
      suggestedColumnNames: ["Location", "Plant Room", "Floor"],
      exampleValues: ["AHU Room", "Ground Floor"],
    });
  }

  if (!mappedColumns.implementationDuration) {
    recommendations.mediumPriority.push({
      field: "Implementation Duration",
      priority: "medium",
      whyItMatters: "Improves the implementation roadmap section.",
      suggestedColumnNames: [
        "Implementation Duration",
        "Project Lead Time",
        "Timeline",
      ],
      exampleValues: ["2 weeks", "3 months"],
    });
  }

  if (!mappedColumns.co2Reduction) {
    recommendations.mediumPriority.push({
      field: "CO2 Reduction",
      priority: "medium",
      whyItMatters:
        "Highlights environmental impact. (If not provided, the system will try to calculate it).",
      suggestedColumnNames: ["CO2 Reduction", "tCO2/year", "Carbon Saving"],
      exampleValues: ["15.5", "120"],
    });
  }

  if (!mappedColumns.rationale) {
    recommendations.mediumPriority.push({
      field: "Rationale / Saving Principle",
      priority: "medium",
      whyItMatters: "Explains the engineering logic behind the savings.",
      suggestedColumnNames: ["Rationale", "Saving Principle"],
      exampleValues: ["VFD optimizes part load efficiency"],
    });
  }

  recommendations.optional.push({
    field: "Additional Fields",
    priority: "optional",
    whyItMatters:
      "Adding fields like 'Case study reference', 'Measurement data', or 'Implementation risks' will enhance report depth.",
    suggestedColumnNames: [],
    exampleValues: [],
  });

  return recommendations;
}

function classifyUploadedFile(detectedColumns = []) {
  const headers = detectedColumns.map((h) => String(h).toLowerCase());

  const hasAny = (keywords) =>
    keywords.some((keyword) =>
      headers.some((header) => header.includes(keyword))
    );

  const hasProjectHeaders = hasAny([
    "project name",
    "energy saving project",
    "ecm",
    "measure",
    "recommendation",
    "proposal",
  ]);

  const hasFinancialHeaders = hasAny([
    "investment",
    "saving",
    "annual saving",
    "payback",
    "cost saving",
    "kwh saving",
  ]);

  if (hasProjectHeaders && hasFinancialHeaders) {
    return "ecm_project_sheet";
  }

  if (
    hasAny([
      "name of equipment",
      "m/c no",
      "make",
      "type/model",
      "capacity",
      "connected load",
      "rpm",
      "section",
      "location",
      "equipment",
    ])
  ) {
    return "equipment_master";
  }

  if (
    hasAny([
      "machine units",
      "chiller units",
      "cooling tower units",
      "ahu units",
      "total units",
      "m/c u/kg",
      "utility u/kg",
      "production kg",
      "month",
    ])
  ) {
    return "energy_consumption_data";
  }

  if (hasAny(["load", "kw", "tr", "phase", "voltage", "specification"])) {
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
      baselineDetails: "",
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
        if (
          score > (localBest?.score || 0) ||
          mapping.detectedColumns.length >
            (localBest?.detectedColumns?.length || 0)
        ) {
          localBest = { worksheet, rowNumber, score, ...mapping };
        }
      });

      if (!localBest) return;
      sheetHeaders.push(localBest);
      if (
        !bestHeader ||
        localBest.score > bestHeader.score ||
        (!bestHeader.score &&
          localBest.detectedColumns.length > bestHeader.detectedColumns.length)
      ) {
        bestHeader = localBest;
      }
    });

    if (!bestHeader || bestHeader.detectedColumns.length === 0) {
      result.errors.push("No usable header row was detected.");
      result.criticalIssues.push("No usable header row was detected.");
      result.status = "error";
      result.professionalSummary =
        "Excel validation failed. The file could not be parsed.";
      return result;
    }

    result.headerRow = bestHeader.rowNumber;
    result.detectedColumns = bestHeader.detectedColumns;
    result.mappedColumns = {
      ...result.mappedColumns,
      ...bestHeader.mappedColumns,
    };
    result.role = classifyUploadedFile(result.detectedColumns);

    if (result.role !== "ecm_project_sheet") {
      result.status = "accepted_supporting_file";
      result.canGenerate = false;

      switch (result.role) {
        case "equipment_master":
          result.professionalSummary =
            "Equipment master detected. Used as supporting context.";
          break;
        case "energy_consumption_data":
          result.professionalSummary =
            "Energy consumption data detected. Used for energy profile and supporting analysis.";
          break;
        case "specification_data":
          result.professionalSummary =
            "Technical specification data detected. Used as supporting context.";
          break;
        default:
          result.professionalSummary =
            "Supporting file detected. Used as narrative context only.";
      }
      return result;
    }

    result.status = "accepted_project_file";

    for (const header of sheetHeaders) {
      if (!header.mappedColumns.projectTitle) continue;
      const projectColumnIndex = Number(
        Object.entries(header.mappedByIndex).find(
          ([, field]) => field === "projectTitle"
        )?.[0]
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
    const hasUsableMetric = [
      "investment",
      "annualSaving",
      "energySaving",
      "payback",
    ].some((field) => !!result.mappedColumns[field]);

    if (!hasProjectColumn) {
      result.criticalIssues.push(
        "Project / ECM / Measure / Recommendation column is missing."
      );
    }
    if (!hasUsableMetric) {
      result.criticalIssues.push(
        "At least one financial/saving column (Investment, Annual Saving, Energy Saving, or Payback) is missing."
      );
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
      result.professionalSummary =
        "Excel validation failed. The file does not contain enough project/ECM data for report generation.";
    } else if (
      result.readinessScore < 80 ||
      result.highPriorityRecommendations.length > 0
    ) {
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
    result.errors.push(
      `File is unreadable as an Excel workbook: ${error.message}`
    );
    result.professionalSummary =
      "Excel validation failed due to file reading error.";
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
          return response
            .status(400)
            .json({ error: "Name and Prompt are required fields." });
        }

        const template = await prisma.report_templates.create({
          data: {
            name,
            slug: slug || null,
            prompt,
            model: model || null,
            rules: rules || null,
            jsonSchema: jsonSchema || null,
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

        const exists = await prisma.report_templates.findFirst({
          where: { id },
        });
        if (!exists) return response.sendStatus(404).end();

        const template = await prisma.report_templates.update({
          where: { id },
          data: {
            name: name !== undefined ? name : exists.name,
            slug: slug !== undefined ? slug : exists.slug,
            prompt: prompt !== undefined ? prompt : exists.prompt,
            model: model !== undefined ? model : exists.model,
            rules: rules !== undefined ? rules : exists.rules,
            jsonSchema:
              jsonSchema !== undefined ? jsonSchema : exists.jsonSchema,
            reportFormat:
              reportFormat !== undefined ? reportFormat : exists.reportFormat,
            componentPath:
              componentPath !== undefined
                ? componentPath
                : exists.componentPath,
            status: status !== undefined ? status : exists.status,
            showInPublic:
              showInPublic !== undefined ? !!showInPublic : exists.showInPublic,
            publicBadge:
              publicBadge !== undefined ? publicBadge : exists.publicBadge,
            category: category !== undefined ? category : exists.category,
            allowedFileTypes:
              allowedFileTypes !== undefined
                ? allowedFileTypes
                : exists.allowedFileTypes,
            outputFormats:
              outputFormats !== undefined
                ? outputFormats
                : exists.outputFormats,
            inputRules:
              inputRules !== undefined ? inputRules : exists.inputRules,
            sampleData:
              sampleData !== undefined ? sampleData : exists.sampleData,
            versionHistory:
              versionHistory !== undefined
                ? versionHistory
                : exists.versionHistory,
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
        const exists = await prisma.report_templates.findFirst({
          where: { id },
        });
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
          id: t.id,
          slug: t.slug,
          name: t.name,
          status: t.status,
          publicBadge: t.publicBadge,
          category: t.category,
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
          generationMode: "upload",
        });

        debugCollector.addBlock({
          id: "upload_validation",
          title: "Upload Validation",
          status: "completed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
        });

        console.log("[UPLOAD] request received");
        console.log("[UPLOAD] content-type:", request.headers["content-type"]);
        console.log(
          "[UPLOAD] files:",
          request.file
            ? [
                {
                  originalname: request.file.originalname,
                  mimetype: request.file.mimetype,
                  size: request.file.size,
                },
              ]
            : "no files"
        );

        const {
          originalname,
          path: uploadedPath,
          size,
          mimetype,
        } = request.file;
        const ext = path.extname(originalname).toLowerCase();

        const fileSummary = {
          originalName: originalname,
          storedName: uploadedPath,
          fileType: ext.replace(".", ""),
          mimeType: mimetype,
          sizeBytes: size,
          uploadStatus: "success",
          parserUsed: null,
          parserReason: null,
          extractedCharacters: 0,
          sheetsDetected: 0,
          rowsDetected: 0,
          warnings: [],
          errors: [],
        };

        const ACCEPTED_EXTENSIONS = [
          ".xlsx",
          ".xls",
          ".csv",
          ".pdf",
          ".docx",
          ".doc",
          ".pptx",
          ".ppt",
          ".jpg",
          ".jpeg",
          ".png",
          ".webp",
        ];

        fileSummary.parserUsed = "direct_upload";
        fileSummary.parserReason = "validation_removed";
        debugCollector.data.inputSummary.files.push(fileSummary);
        debugCollector.finalize();

        return response.status(200).json({
          success: true,
          location: uploadedPath || originalname,
          filename: originalname,
          size,
          mimetype,
          parsingStatus: "uploaded",
          token_count_estimate: 0,
          pipelineDebug: debugCollector.data,
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
                  professionalSummary:
                    "Supporting file detected. Used as narrative context only.",
                };
              }
              return await validateExcelBuffer(file);
            })
          );

          const projectFileFound = validations.some(
            (v) =>
              v.status === "accepted_project_file" ||
              v.status === "warning" ||
              v.status === "valid"
          );
          const supportingFilesCount = validations.filter(
            (v) => v.status === "accepted_supporting_file"
          ).length;
          const canGenerateReport =
            projectFileFound || supportingFilesCount > 0;

          const debugCollector = createPipelineDebugCollector({
            reportType: "validation",
            generationMode: "upload",
          });
          debugCollector.addBlock({
            id: "parser_selection",
            title: "Parser Selection",
            status: "completed",
          });
          debugCollector.addBlock({
            id: "file_extraction",
            title: "File Extraction",
            status: "completed",
          });
          debugCollector.addBlock({
            id: "excel_sheet_detection",
            title: "Excel Sheet Detection",
            status: "completed",
          });
          debugCollector.addBlock({
            id: "ecm_row_detection",
            title: "ECM Row Detection",
            status: "completed",
          });

          validations.forEach((v) => {
            debugCollector.data.inputSummary.files.push({
              fileName: v.filename,
              parserUsed:
                v.parserUsed ||
                (v.fileType === "excel" ? "ecm_xlsx_parser" : "unstructured"),
              status: v.status,
              role: v.role,
              warnings: v.warnings || [],
              errors: v.errors || [],
            });

            if (v.status !== "accepted_supporting_file") {
              debugCollector.data.inputSummary.sheetsDetected += (
                v.sheets || []
              ).length;
              debugCollector.data.inputSummary.ecmRowsFound +=
                v.projectRowsDetected || 0;
              debugCollector.data.inputSummary.extractedFieldsCount +=
                Object.keys(v.mappedColumns || {}).length;
              debugCollector.data.inputSummary.missingFields.push(
                ...(v.missingRequiredColumns || [])
              );

              (v.sheets || []).forEach((sheetName) => {
                debugCollector.data.inputSummary.sheetSummaries.push({
                  sheetName,
                  rowCount: v.projectRowsDetected || 0,
                  columnCount: Object.keys(v.mappedColumns || {}).length,
                  detectedPurpose: "ECM Data",
                  ecmRowsFound: v.projectRowsDetected || 0,
                  mappedColumns: Object.keys(v.mappedColumns || {}),
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
            pipelineDebug: debugCollector.data,
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

  // HELPER FUNCTIONS TO ADD AT TOP OF FILE OR ABOVE ENDPOINT
  const withTimeout = (promise, ms, timeoutMessage) => {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() =>
      clearTimeout(timer)
    );
  };

  const {
    extractLightweightExcelData,
  } = require("../services/lightweightExcelExtractor");

  function getUploadedFilesFromPayload(body) {
    if (body.uploadedFiles) return body.uploadedFiles;
    if (body.uploaded_files) return body.uploaded_files;
    return [];
  }

  function sortExcelFilesByPriority(files) {
    return files
      .filter((f) => f.filename && f.filename.match(/\.(xlsx|xls|csv)$/i))
      .sort((a, b) => {
        const aName = a.filename.toLowerCase();
        const bName = b.filename.toLowerCase();
        if (aName.includes("ecm") || aName.includes("project")) return -1;
        if (bName.includes("ecm") || bName.includes("project")) return 1;
        return 0;
      });
  }

  function nullishNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function sumNumbers(values = []) {
    return values.reduce((sum, value) => {
      const parsed = nullishNumber(value);
      return parsed === null ? sum : sum + parsed;
    }, 0);
  }

  function buildLightweightReportData(projects, reportDetails) {
    const mappedProjects = projects.map((p, i) => ({
      ...p,
      projectNo: p.ecmNo || p.projectNo || `ECM ${i + 1}`,
      projectTitle: p.description || p.title || p.projectTitle || `Project ${i + 1}`,
      title: p.description || p.title || p.projectTitle || `Project ${i + 1}`,
      system: p.system || "Other",
      category: p.system || "Other",
      expectedEnergySaving: p.energySavingRaw ?? nullishNumber(p.energySaving),
      expectedAnnualCostSaving: p.annualSavingRaw ?? nullishNumber(p.annualSaving),
      estimatedInvestment: p.investmentRaw ?? nullishNumber(p.investment),
      simplePaybackPeriod: p.paybackRaw ?? nullishNumber(p.payback),
      energySavingRaw: p.energySavingRaw ?? nullishNumber(p.energySaving),
      annualSavingRaw: p.annualSavingRaw ?? nullishNumber(p.annualSaving),
      investmentRaw: p.investmentRaw ?? nullishNumber(p.investment),
      paybackRaw: p.paybackRaw ?? nullishNumber(p.payback),
      energySaving: p.energySaving,
      annualSaving: p.annualSaving,
      investment: p.investment,
      payback: p.payback,
      equipmentCovered: p.equipmentCovered || p.equipment || "Various",
      groupTitle: p.groupTitle || "",
      sourceFile: p.sourceFile || "",
      fallbackGenerated: p.fallbackGenerated,
      isFallback: p.isFallback,
      sourceSheet: p.sourceSheet || p.sheetName || "",
      sourceRow: p.sourceRow || null,
      department: p.department || "",
      area: p.area || "",
      observation: p.observation || "",
      recommendation: p.recommendation || "",
    }));

    const cleaned = cleanAndDeduplicateProjects(mappedProjects);
    const grouped = buildProjectGroups(cleaned);
    const totalEstimatedInvestment = Number(sumNumbers(
      cleaned.map((project) => project.investmentRaw ?? project.estimatedInvestment)
    ).toFixed(0));
    const totalAnnualCostSavingPotential = Number(sumNumbers(
      cleaned.map((project) => project.annualSavingRaw ?? project.expectedAnnualCostSaving)
    ).toFixed(0));
    const totalEnergySavingPotential = Number(sumNumbers(
      cleaned.map((project) => project.energySavingRaw ?? project.expectedEnergySaving)
    ).toFixed(0));
    const simplePaybackPeriod =
      totalAnnualCostSavingPotential > 0
        ? Number((totalEstimatedInvestment / totalAnnualCostSavingPotential).toFixed(2))
        : null;

    let finalGroups = grouped;
    if ((!finalGroups || finalGroups.length === 0) && mappedProjects.length > 0) {
      finalGroups = [
        {
          groupNo: "GR-1",
          groupName: "Energy Saving Projects",
          projects: mappedProjects
        }
      ];
    }

    return {
      reportInfo: {
        clientName: reportDetails.clientName || "Client Name",
        facilityName: reportDetails.facilityName || "Facility Name",
        location: reportDetails.location || "Location",
        auditPeriod: reportDetails.auditPeriod || "Audit Period",
        reportDate: reportDetails.reportDate || new Date().toISOString(),
      },
      executiveSummary: {
        summaryOfIdentifiedProjects: cleaned,
        numberOfProjects: cleaned.length,
        totalEstimatedInvestment,
        totalAnnualCostSavingPotential,
        totalEnergySavingPotential,
        simplePaybackPeriod,
      },
      groups: finalGroups,
      groupedProjects: grouped,
      projects: cleaned, // fallback
    };
  }

  function compactUploadedFiles(files = []) {
    return files.map((file) => ({
      filename: file.filename || file.originalName || file.name,
      originalName: file.originalName || file.name || file.filename,
      sizeBytes: file.sizeBytes || file.size || 0,
      mimeType: file.mimeType || file.mimetype || file.type || "unknown",
      fileType: file.fileType || "unknown",
    }));
  }

  async function safeCreateGeneratedReport(prisma, data) {
    try {
      if (!prisma?.generated_reports?.create) {
        throw new Error("Prisma generated_reports model is not available.");
      }

      return await prisma.generated_reports.create({ data });
    } catch (error) {
      console.error("[DB_SAVE_WARNING] generated_reports.create failed:", {
        message: error?.message || String(error),
        code: error?.code,
        meta: error?.meta,
      });

      return {
        id: `temp_${Date.now()}`,
        isTemporary: true,
        dbSaveFailed: true,
        dbSaveError: error?.message || String(error),
      };
    }
  }

  // REPLACE APP.POST("/reports/generate") WITH THIS EXACT FLOW
  app.post(
    "/reports/generate",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      console.log("FUNCTION ENTERED:\nserver/endpoints/reports.js\napp.post(/reports/generate)");
      console.log("CACHE MISS: report generation is always live.");
      const startedAt = Date.now();
      try {
        const body = reqBody(request);
        const uploadedFiles = getUploadedFilesFromPayload(body);
        const reportDetails = body.publicForm || body.inputDetails || {};
        const templateId = body.templateId || body.template_id;

        if (!templateId) {
          return response
            .status(400)
            .json({ error: "template_id is a required field." });
        }

        // 1. Get user session (lightweight)
        let user = null;
        try {
          user = await userFromSession(request, response);
        } catch (e) {}

        // 2. Take all Excel files
        const excelFiles = uploadedFiles.filter(f => {
          const ext = path.extname(f.filename || f.originalName || f.name || "").toLowerCase();
          return [".xlsx", ".xls"].includes(ext);
        });
        
        let extractedProjects = [];
        let extractionAttempts = [];
        let extractionDebug = null;

        // 3. Fast deterministic multi-file extraction
        if (excelFiles.length > 0) {
          const baseStorageDir = path.resolve(__dirname, "../../storage");
          try {
            const extraction = await withTimeout(
              Promise.resolve(extractLightweightExcelData(excelFiles, baseStorageDir)),
              15000,
              `Extraction timed out`
            );
            
            console.log("[DEBUG] Extracted projects count:", extraction.projects?.length);

            extractionAttempts.push({
              filename: extraction.fileName || "multi-file",
              status: extraction.success ? "success" : "failed",
              projectsFound: extraction.projectCount || 0,
              warning: extraction.warning
            });

            if (extraction.success && extraction.projects && extraction.projects.length > 0) {
              extractedProjects = extraction.projects;
              extractionDebug = extraction.extractionDebug;
            }
          } catch (e) {
            extractionAttempts.push({
              filename: "multi-file",
              status: "timeout or error",
              error: e.message,
            });
          }
        }

        // 4. Require at least one extracted project for success
        if (!Array.isArray(extractedProjects) || extractedProjects.length === 0) {
          return response.status(422).json({
            error:
              "No valid ECM rows found. Fallback rows were rejected.",
            extractionAttempts,
          });
        }

        let vrChennaiAuxData = null;
        let isVrChennai = false;
        const vrChennaiFile = excelFiles.find(f => 
          String(f.filename || f.originalname || f.name || "").toLowerCase().includes("vr chennai")
        );

        if (vrChennaiFile) {
          isVrChennai = true;
          console.log("[VR_CHENNAI_PROJECTS_LOCKED]", {
            projectCount: extractedProjects.length,
            ecmNos: extractedProjects.map(p => p.ecmNo),
            totalEnergySaving: extractedProjects.reduce((s,p)=>s+(Number(p.energySavingRaw)||0),0),
            totalAnnualSaving: extractedProjects.reduce((s,p)=>s+(Number(p.annualSavingRaw)||0),0),
            totalInvestment: extractedProjects.reduce((s,p)=>s+(Number(p.investmentRaw)||0),0)
          });
          
          const systemMap = {
            1: "Electrical Billing / Demand Management",
            2: "Cooling Tower / Chiller Condenser System",
            3: "Cooling Tower Fan System",
            4: "Chiller Plant Controls / CHW Set Point",
            5: "Chiller Plant Automation and Sequencing",
            6: "Condenser Water Pumping System",
            7: "Primary CHW Pumping System",
            8: "Secondary CHW Pumping System",
            9: "STP Blower / Motor Drive System",
            10: "AHU Plug Fan System",
            11: "Air Washer Plug Fan System",
            12: "Heat Recovery Wheel / Ventilation Fan System",
            13: "Scrubber Ventilation Motor System",
            18: "Chiller Operational Practice Improvement"
          };
          
          extractedProjects.forEach(p => {
             let num = p.serialNo || Number(String(p.ecmNo || "").replace(/\D/g, ""));
             if (!num && p.projectNo) num = Number(String(p.projectNo).replace(/\D/g, ""));
             if (num && systemMap[num]) {
               p.system = systemMap[num];
             }
             
             p.existingSystemDescription = (p.equipmentName || "") + " " + (p.baselineNotes || "");
             p.problemIdentified = p.rationaleForEnergySaving || "";
             p.proposedProjectDescription = (p.projectTitle || p.title || "") + " " + (p.briefInformationAdvantages || "");
             p.projectActivitiesText = p.projectActivities ? String(p.projectActivities).split("\n").filter(Boolean).map(a => a.replace(/^- /, "")).join("\n") : "";
             p.rationaleForSaving = (p.rationaleForEnergySaving || "") + " " + (p.savingPotentialRange || "");
             
             p.savingCalculation = `Baseline energy consumption is estimated. Based on the project implementation, the energy saving is expected to be ${p.savingPercentRaw ? (p.savingPercentRaw * 100).toFixed(0) + "%" : "significant"}. ` + 
                 `Annual energy saving is calculated as ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(p.energySavingRaw || 0)} kWh/year resulting in cost savings of ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.annualSavingRaw || 0)}/year with an estimated investment of ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.investmentRaw || 0)} and simple payback of ${p.paybackMonthsRaw ? (p.paybackMonthsRaw/12).toFixed(2) : "N/A"} years.`;
             p.mvPlan = `M&V Plan: Measure ${p.system || "the system"} parameters before and after implementation to verify energy savings over time.`;
             p.fallbackGenerated = false;
             p.isFallback = false;
             
             // Formatting explicitly for DOCX
             p.energySaving = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(p.energySavingRaw || 0);
             p.annualSaving = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.annualSavingRaw || 0);
             p.investment = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.investmentRaw || 0);
             p.payback = p.paybackMonthsRaw ? `${(p.paybackMonthsRaw/12).toFixed(2)} years` : "N/A";
             p.baselineKwhPerYear = p.baselineKwhPerYearRaw ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(p.baselineKwhPerYearRaw) : "";
             p.savingPercent = p.savingPercentRaw ? `${(p.savingPercentRaw * 100).toFixed(1)}%` : "";
             
             p.expectedEnergySaving = p.energySaving;
             p.expectedAnnualCostSaving = p.annualSaving;
             p.estimatedInvestment = p.investment;
             p.simplePaybackPeriod = p.payback;
          });
          
          const baseStorageDir = path.resolve(__dirname, "../../storage");
          const fName = vrChennaiFile.filename || vrChennaiFile.originalname || vrChennaiFile.name;
          const primaryFilePath = vrChennaiFile.location || vrChennaiFile.path || path.join(baseStorageDir, fName);
          const pdfFiles = uploadedFiles.filter(f => path.extname(f.filename || f.originalname || f.name || "").toLowerCase() === ".pdf");
          
          console.log("[VR_CHENNAI_AUX_EXTRACTION]", { primaryFilePath, exists: fs.existsSync(primaryFilePath), pdfCount: pdfFiles.length });
          
          if (fs.existsSync(primaryFilePath)) {
            const workbook = XLSX.readFile(primaryFilePath, { cellDates: true, sheetStubs: true });
            vrChennaiAuxData = await extractVrChennaiWorkbook(workbook, primaryFilePath, pdfFiles, path.dirname(primaryFilePath));
            console.log("[VR_CHENNAI_AUX_DATA_EXTRACTED]", { hasEnergyProfile: !!vrChennaiAuxData.energyProfile, hasConnectedLoad: !!vrChennaiAuxData.connectedLoad });
          }
        }

        let reportData = buildLightweightReportData(
          extractedProjects,
          reportDetails
        );

        if (!reportData) {
          console.error("[GENERATE_REPORTDATA_NULL]", {
            uploadedFiles: request.files?.map(f => f.originalname || f.filename),
            message: "Extraction returned null reportData"
          });

          return response.status(400).json({
            success: false,
            error: "Report generation failed because no report data was built from uploaded files.",
            details: "Extractor returned null reportData. Please check file format or extraction logs."
          });
        }
        reportData = filterReportProjects(reportData);
        reportData = enforceReportQuality(reportData);

        const { autoFillMissingReportFields } = require("../services/reportAutoFillService");
        
        const extractedDataContext = buildExtractedDataContext(uploadedFiles, {
          reportDetails,
          projectInfo: {
            clientName: reportDetails?.clientName || reportDetails?.facilityName,
            facilityName: reportDetails?.facilityName || reportDetails?.clientName,
            location: reportDetails?.location,
            buildingType: reportDetails?.buildingType,
            auditPeriod: reportDetails?.auditPeriod,
            reportDate: reportDetails?.reportDate,
          },
          energyProfile: isVrChennai ? (vrChennaiAuxData?.energyProfile || reportData.energyProfile) : reportData.energyProfile,
          connectedLoad: isVrChennai ? (vrChennaiAuxData?.connectedLoad || reportData.connectedLoad) : reportData.connectedLoad,
          projects: extractedProjects,
          costing: isVrChennai ? (vrChennaiAuxData?.costing || vrChennaiAuxData?.costingData || {}) : {},
          costingData: isVrChennai ? (vrChennaiAuxData?.costingData || {}) : {},
          pdfBillExtraction: isVrChennai ? (vrChennaiAuxData?.pdfBillExtraction || {}) : {},
          pdfBills: isVrChennai ? (vrChennaiAuxData?.pdfBills || []) : [],
          validationWarnings: vrChennaiAuxData?.validationWarnings || [],
        });

        const autoFillResult = autoFillMissingReportFields(reportData, extractedDataContext);
        reportData = autoFillResult.reportData;
        const finalExtractedDataContext = autoFillResult.extractedDataContext || extractedDataContext;
        console.log("[REPORT_AUTO_FILL_SUMMARY]", autoFillResult.autoFillSummary);
        
        // 6. Final Data Formatting (override Raw numbers with formatted for DOCX)
        if (isVrChennai) {
           reportData.groups.forEach(g => {
              g.projects.forEach(p => {
                 p.expectedEnergySaving = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(p.energySavingRaw || 0);
                 p.expectedAnnualCostSaving = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.annualSavingRaw || 0);
                 p.estimatedInvestment = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.investmentRaw || 0);
                 p.simplePaybackPeriod = p.paybackMonthsRaw ? `${(p.paybackMonthsRaw/12).toFixed(2)} years` : "N/A";
                 
                 // Also ensure the basic fields are formatted to avoid decimals
                 p.energySaving = p.expectedEnergySaving;
                 p.annualSaving = p.expectedAnnualCostSaving;
                 p.investment = p.estimatedInvestment;
                 p.payback = p.simplePaybackPeriod;
              });
           });
           
           // Recursively round any remaining raw floats in reportData to max 2 decimals
           const roundDeep = (obj) => {
              if (Array.isArray(obj)) return obj.forEach(roundDeep);
              if (obj && typeof obj === 'object') {
                 for (let k in obj) {
                    if (typeof obj[k] === 'number' && !Number.isInteger(obj[k])) {
                       obj[k] = Math.round(obj[k] * 100) / 100;
                    } else if (typeof obj[k] === 'string' && /^\d+\.\d{3,}$/.test(obj[k])) {
                       obj[k] = (Math.round(parseFloat(obj[k]) * 100) / 100).toString();
                    } else if (typeof obj[k] === 'object') {
                       roundDeep(obj[k]);
                    }
                 }
              }
           };
           roundDeep(reportData);
        }
        
        console.log("[DEBUG] Final projects count:", reportData.groups?.flatMap(g => g.projects)?.length);
        reportData = normalizeReportGroups(reportData);
        
        console.log("[GENERATE_REPORTDATA_NORMALIZED]", {
          hasReportData: !!reportData,
          groupCount: reportData.groups.length,
          projectCount: reportData.groups.reduce((sum, g) => sum + (g.projects || []).length, 0),
          extractionFormat: reportData.extractionFormat
        });

        if (extractionDebug) {
          reportData.extractionDebug = extractionDebug;
          if (!reportData.extractionSummary) reportData.extractionSummary = {};
          reportData.extractionSummary.validationWarnings = extractionDebug.validationWarnings || [];
        }

        const projectCount = reportData.groups.reduce(
          (sum, group) => sum + group.projects.length,
          0
        );

        const anyWarning = extractionAttempts.find(a => a.warning)?.warning;
        if (anyWarning && reportData.extractionSummary) {
          reportData.extractionSummary.warning = anyWarning;
        }

        console.log("[BACKEND_GENERATE_FILTERED]", {
          extractedProjectCount: extractedProjects.length,
          retainedProjectCount: projectCount,
          rejectedProjectCount: reportData?.filteringMeta?.rejectedCount || 0,
          firstProject: firstProjectSummary(reportData),
        });

        if (projectCount <= 0) {
          return response.status(422).json({
            success: false,
            error: "No valid ECM projects remained after quality filtering. Fallback/invalid rows were rejected.",
            extractionSummary: reportData.extractionSummary
          });
        }
        
        const sanitizedResult = sanitizeReportData(reportData);
        reportData = sanitizedResult.sanitizedReportData;
        reportData.extractedDataContext = finalExtractedDataContext;
        
        // --- FINAL RENDERING FIXES ---
        function getEcmNumberValueLocal(value) {
          const match = String(value || "").match(/(\d+)/);
          return match ? Number(match[1]) : null;
        }

        function sortProjectsByEcmNumber(projects = []) {
          return [...projects].sort((a, b) => {
            const an = getEcmNumberValueLocal(a.ecmNo || a.serialNo || a.projectNo);
            const bn = getEcmNumberValueLocal(b.ecmNo || b.serialNo || b.projectNo);
            return (an || 9999) - (bn || 9999);
          });
        }
        
        function applyFinalDisplayFormatting(data) {
          const cloned = JSON.parse(JSON.stringify(data || {}));
          const projects = (cloned.groups || []).flatMap((g) => g.projects || []);
          for (const project of projects) {
            const investment = Number(project.investmentRaw || project.investment || 0);
            const annualSaving = Number(project.annualSavingRaw || project.annualSaving || 0);

            if (!project.paybackMonthsRaw && investment > 0 && annualSaving > 0) {
              project.paybackMonthsRaw = (investment / annualSaving) * 12;
            }
            if (!project.paybackYearsRaw && project.paybackMonthsRaw) {
              project.paybackYearsRaw = project.paybackMonthsRaw / 12;
            }

            project.energySavingFormatted = formatKwh(project.energySavingRaw || project.energySaving);
            project.annualSavingFormatted = formatInr(project.annualSavingRaw || project.annualSaving);
            project.investmentFormatted = formatInr(project.investmentRaw || project.investment);
            
            project.paybackMonthsFormatted = investment === 0 && annualSaving > 0
                ? "Immediate / No investment"
                : project.paybackMonthsRaw ? `${formatIndianNumber(project.paybackMonthsRaw, 2)} months` : "";
                
            project.paybackYearsFormatted = investment === 0 && annualSaving > 0
                ? "Immediate / No investment"
                : project.paybackYearsRaw ? `${formatIndianNumber(project.paybackYearsRaw, 2)} years` : "";
                
            project.baselineKwhFormatted = formatKwh(project.baselineKwhPerYearRaw);
            project.savingPercentFormatted = formatPercent(project.savingPercentRaw);

            project.energySaving = project.energySavingFormatted;
            project.annualSaving = project.annualSavingFormatted;
            project.investment = project.investmentFormatted;
            project.payback = project.paybackYearsFormatted || project.paybackMonthsFormatted || project.payback;
          }
          return cloned;
        }

        function replacePlaceholders(obj) {
          if (Array.isArray(obj)) return obj.map(replacePlaceholders);
          if (!obj || typeof obj !== "object") {
            const text = String(obj || "");
            if (
              text.includes("[To be updated") ||
              text.includes("after site data verification") ||
              text.includes("[Calculation pending]") ||
              text.trim() === "Client Name"
            ) {
              return "Not available in uploaded data";
            }
            return obj;
          }
          const out = {};
          for (const [key, value] of Object.entries(obj)) {
             out[key] = replacePlaceholders(value);
          }
          return out;
        }

        function groupMissingInputs(missingInputs = []) {
          const map = new Map();
          for (const item of missingInputs) {
            const ecmMatch = String(item.missingInput || "").match(/ECM\s+(\d+)/i);
            const baseInput = ecmMatch ? String(item.missingInput).replace(/for ECM\s+\d+/i, "").trim() : item.missingInput;
            const key = `${item.section}|${baseInput}|${item.whyRequired}|${item.suggestedSource}|${item.criticality}`;
            
            if (!map.has(key)) {
              map.set(key, { ...item, ecmList: [] });
            }
            if (ecmMatch) {
              map.get(key).ecmList.push(ecmMatch[1]);
            }
          }
          
          return Array.from(map.values()).map(item => {
            if (item.ecmList.length > 0) {
              const ecmNumbers = [...new Set(item.ecmList)].sort((a, b) => Number(a) - Number(b));
              const baseInput = String(item.missingInput).replace(/for ECM\s+\d+/i, "").trim();
              item.missingInput = `${baseInput} for ECMs: ${ecmNumbers.join(", ")}`;
            }
            delete item.ecmList;
            return item;
          });
        }

        if (reportData.groups) {
          reportData.groups.forEach(g => {
             g.projects = sortProjectsByEcmNumber(g.projects);
          });
        }
        reportData = applyFinalDisplayFormatting(reportData);
        reportData = replacePlaceholders(reportData);
        
        const originalMissingInputsCount = (reportData.missingInputs || []).length;
        if (reportData.missingInputs) {
          reportData.missingInputs = groupMissingInputs(reportData.missingInputs);
        }
        reportData._originalMissingInputsCount = originalMissingInputsCount;
        reportData._groupedMissingInputsCount = (reportData.missingInputs || []).length;
        // --- END FINAL RENDERING FIXES ---
        
        if (isVrChennaiReport(reportData, finalExtractedDataContext)) {
          reportData.vrChennaiClientReadyReport = buildVrChennaiClientReadyModel(reportData, finalExtractedDataContext);
        }

        const finalQuality = validateFinalReportQuality(reportData, finalExtractedDataContext);
        console.log("[FINAL_REPORT_QUALITY_GATE]", finalQuality.gateLog);

        if (!finalQuality.passed) {
          return response.status(422).json({
            success: false,
            error: `Quality gate failed:\n${finalQuality.failures.join("\n")}`,
            failures: finalQuality.failures,
            warnings: finalQuality.warnings,
            gateDetails: finalQuality.gateLog,
            accuracySummary: finalQuality.accuracySummary,
          });
        }

        reportData.qcSummary = {
          ...(reportData.qcSummary || {}),
          ...finalQuality.gateLog,
          badPhraseCount: sanitizedResult.badPhraseCount,
          passed: finalQuality.passed,
        };
        reportData.accuracySummary = finalQuality.accuracySummary;
        if (finalQuality.model) {
          reportData.vrChennaiClientReadyReport = finalQuality.model;
        }

        // 6. Save fast record to DB safely
        const reportRecordData = {
          templateId: Number(templateId) || 1, // Ensure integer
          generationMode: "public",
          status: "ready",
          publicForm: JSON.stringify(reportDetails || {}),
          uploadedFiles: JSON.stringify(compactUploadedFiles(uploadedFiles)),
          outputContent: JSON.stringify(reportData || {}),
          userId: user?.id || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const reportRecord = await safeCreateGeneratedReport(
          prisma,
          reportRecordData
        );
        
        console.log("[GENERATE_BACKEND_RETURN]", {
          hasReportData: Boolean(reportData),
          groups: reportData?.groups?.length || 0,
          projects: projectCount,
          firstProject: firstProjectSummary(reportData),
          extractionAttempts: extractionAttempts?.map((item) => ({
            fileName: item.filename,
            status: item.status,
            projectsFound: item.projectsFound
          }))
        });

        // 7. Return immediately. DO NOT CALL DOCX EXPORT OR AI.
        console.log("API RESPONSE GROUPS");
        console.log(JSON.stringify(reportData.groupedProjects?.map(g => ({ groupNo: g.groupNo, title: g.groupTitle, ecmCount: g.projects?.length })) || []));

        reportData = cleanupFinalReportData(reportData);
        logSafeCleanupCheck(reportData, "Generate");

        return response.json({
          success: true,
          previewReady: true,
          reportReady: true,
          reportId: reportRecord.id,
          dbSaveFailed: Boolean(reportRecord.dbSaveFailed),
          warning: reportRecord.dbSaveFailed
            ? "Report generated but database save failed. Preview is available."
            : null,
          reportData,
          previewData: reportData,
          extractionSummary: reportData.extractionSummary,
          extractionAttempts,
          aiEnhancementStatus: {
            status: "not_started",
            reason: "AI enhancement is optional after deterministic preview.",
          },
          elapsedMs: Date.now() - startedAt,
          report: {
            id: reportRecord.id,
            status: "ready",
            outputContent: JSON.stringify(reportData),
            providerUsed: "deterministic",
          },
        });
      } catch (error) {
        console.error("[REPORT_GENERATION_FAILED]", {
          message: error.message,
          stack: error.stack
        });

        return response.status(500).json({
          success: false,
          error: error.message || "Report generation failed"
        });
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
          return response.status(400).json({
            error: "DOCX export not supported for this template yet.",
          });
        }

        const requestBody = reqBody(request);
        let dbReportData = null;
        try {
          dbReportData = JSON.parse(report.outputContent);
        } catch (e) {}

        let exportReportData =
          requestBody?.reportData ||
          requestBody?.previewData ||
          requestBody?.generatedReportData ||
          dbReportData ||
          null;

        if (!exportReportData) {
          return response.status(400).json({
            success: false,
            error: "No reportData available for DOCX export."
          });
        }

        if (requestBody?.reportData || requestBody?.previewData) {
          console.log(
            "[DOCX_EXPORT_REQUEST_BODY_DEBUG]",
            enhancementSummary(normalizeActiveReportData(exportReportData))
          );
        }

        const normalizedExport = cleanupFinalReportData(normalizeActiveReportData(exportReportData));
        const exportExtractedDataContext =
          normalizedExport.extractedDataContext ||
          buildExtractedDataContext({
            reportData: normalizedExport,
            workbookExtractions: exportReportData?.extractedDataContext || {},
          });

        if (isVrChennaiReport(normalizedExport, exportExtractedDataContext)) {
          const sanitizedVrExport = sanitizeReportData(normalizedExport).sanitizedReportData;
          const finalQuality = validateFinalReportQuality(sanitizedVrExport, exportExtractedDataContext);
          console.log("[FINAL_REPORT_QUALITY_GATE]", finalQuality.gateLog);

          if (!finalQuality.passed) {
            return response.status(400).json({
              qcFailed: true,
              error: "Final report quality gate failed.",
              ...finalQuality,
            });
          }

          const buffer = await renderVrChennaiClientReadyDocx(sanitizedVrExport, exportExtractedDataContext);
          const clientName =
            exportExtractedDataContext.projectInfo?.facilityName
              ?.replace(/[^a-z0-9]/gi, "_")
              .toLowerCase() || "client";
          const filename = `SEE-Tech_Detailed_Energy_Audit_Report_${clientName}.docx`;

          response.setHeader(
            "Content-Disposition",
            `attachment; filename=\"${filename}\"`
          );
          response.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          );
          return response.send(buffer);
        }

        exportReportData = normalizeActiveReportData(exportReportData);
        exportReportData = filterReportProjects(exportReportData);
        exportReportData = expandReportEngineeringNarratives(exportReportData);
        exportReportData = cleanupFinalReportData(exportReportData);
        const sanitizedExport = sanitizeReportData(exportReportData);
        exportReportData = sanitizedExport.sanitizedReportData;
        logSafeCleanupCheck(exportReportData, "DOCX");

        if (getAllProjects(exportReportData).length <= 0) {
          return response.status(400).json({
            error: "DOCX export requires at least one valid ECM project after filtering.",
          });
        }

        console.log("[DOCX_FILTERED_PROJECTS]", {
          retainedProjectCount: getAllProjects(exportReportData).length,
          rejectedProjectCount: exportReportData?.filteringMeta?.rejectedCount || 0,
        });
        console.log("[DOCX_FORCED_EXPANSION_SUMMARY]", firstProjectSummary(exportReportData));
        console.log("[FINAL_ECM_SPECIFIC_EXPORT]", firstProjectSummary(exportReportData));

        // Quality Check (QC) Gate
        const qcResult = runReportQC(exportReportData);
        const accuracyResult = calculateReportAccuracyScore(exportReportData);
        const finalQuality = validateFinalReportQuality(
          exportReportData,
          exportReportData.extractedDataContext || {}
        );
        const allowDraft = request.query.allowDraft === "true";
        const isDev =
          process.env.NODE_ENV === "development" ||
          process.env.VITE_ALLOW_DRAFT_EXPORT === "true";

        console.log("[EXPORT QC CHECK]", {
          validEcms:
            qcResult.summary.validEcmCount ?? qcResult.summary.projectCount,
          groups: qcResult.summary.groupCount,
          duplicateTitles: qcResult.summary.duplicateTitleCount,
          invalidTitles: qcResult.summary.invalidTitleCount,
          hardErrors: qcResult.summary.hardErrorCount,
          warnings: qcResult.summary.warningCount,
          requiredReview: !qcResult.qcPassed,
          shouldBlockExport: !qcResult.qcPassed,
        });

        if (!qcResult.qcPassed || !accuracyResult.passed || !finalQuality.passed) {
          console.error(
            `[QC FAILED] Report ID: ${id}`,
            JSON.stringify({ qcResult, accuracyResult, finalQuality }, null, 2)
          );
          if (!(allowDraft && isDev)) {
            return response.status(400).json({
              qcFailed: true,
              error: !finalQuality.passed
                ? "Final report quality gate failed."
                : !qcResult.qcPassed
                ? "Report requires review before final export."
                : "Report accuracy score is below the required threshold for final export.",
              ...qcResult,
              accuracyResult,
              finalQuality,
            });
          }
        }

        if (allowDraft && isDev && exportReportData.reportInfo) {
          exportReportData.reportInfo.clientName =
            "[DRAFT - QC REVIEW REQUIRED] " +
            (exportReportData.reportInfo.clientName || "");
        }

        const exportReport = stripDebugMetadata(exportReportData);

        let buffer;
        try {
          buffer = await buildCommercialBuildingEnergyAuditDocx(exportReport);
        } catch (docxError) {
          console.error(
            `[DOCX EXPORT FAILED] Report ID: ${id}`,
            docxError.stack || docxError
          );
          throw docxError;
        }

        const clientName =
          exportReportData.reportInfo?.clientName
            ?.replace(/[^a-z0-9]/gi, "_")
            .toLowerCase() || "client";
        const filename = `SEE-Tech_Detailed_Energy_Audit_Report_${clientName}.docx`;

        response.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
        response.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        response.send(buffer);
      } catch (error) {
        console.error("[DOCX_EXPORT_FAILED]", {
          message: error.message,
          stack: error.stack
        });

        return response.status(500).json({
          success: false,
          error: "Failed to generate Word document.",
          details: error.message
        });
      }
    }
  );

  async function enhanceAiHandler(req, res) {
    console.log("FUNCTION ENTERED:\nserver/endpoints/reports.js\nenhanceAiHandler");
    console.log("CACHE MISS: AI Enhancement generates a new report.");
    try {
      const reportId = req.params.reportId || req.body.reportId || null;

      const rawReportData =
        req.body.reportData ||
        req.body.previewData ||
        req.body.generatedReportData ||
        req.body.report?.reportData ||
        req.body.report ||
        null;

      if (!rawReportData) {
        return res.status(422).json({
          success: false,
          error: "AI enhancement requires reportData.",
          receivedKeys: Object.keys(req.body || {}),
          debug: {
            bodyType: typeof req.body,
            hasReportData: Boolean(req.body?.reportData),
            hasPreviewData: Boolean(req.body?.previewData),
            hasGeneratedReportData: Boolean(req.body?.generatedReportData)
          }
        });
      }

      let reportData = normalizeActiveReportData(rawReportData);
      reportData = filterReportProjects(reportData);
      const projectCount = getActiveReportProjectCount(reportData);

      console.log("[BACKEND_ENHANCE_RECEIVE_DEBUG]", {
        reportId,
        groups: reportData?.groups?.length || 0,
        projects: projectCount,
        rejectedProjects: reportData?.filteringMeta?.rejectedCount || 0,
        firstProject: firstProjectSummary(reportData),
        receivedKeys: Object.keys(req.body || {}),
      });

      if (projectCount <= 0) {
        return res.status(422).json({
          success: false,
          error: "AI enhancement requires reportData with at least one extracted project.",
          receivedKeys: Object.keys(req.body || {}),
          debug: {
            hasReportData: Boolean(reportData),
            reportDataKeys: reportData ? Object.keys(reportData) : [],
            groups: reportData?.groups?.length || 0,
            projectCount
          }
        });
      }

      if (typeof enhanceReportNarrativesWithAi !== "function") {
        let finalReportData = expandReportEngineeringNarratives(reportData);
        finalReportData = cleanupFinalReportData(finalReportData);
        logSafeCleanupCheck(finalReportData, "Enhance Fallback");

        const expansionSummary = firstProjectSummary(finalReportData);

        console.log("[FORCED_ENGINEERING_EXPANSION_SUMMARY]", expansionSummary);
        console.log("[FINAL_ECM_SPECIFIC_EXPANSION]", expansionSummary);

        return res.status(200).json({
          success: true,
          aiEnhanced: false,
          fallbackEnhanced: true,
          reportData: finalReportData,
          previewData: finalReportData,
          enhancementSummary: expansionSummary,
          aiEnhancementStatus: {
            status: "engineering_expansion_success",
            finalEnhancerUsed: "forced_engineering_narrative_expander",
            userMessage: "Report engineering narrative expanded successfully.",
            providerAttempts: [],
          },
        });
      }

      const result = await enhanceReportNarrativesWithAi({
        reportData,
        force: req.body.force === true
      });

      let finalReportData = normalizeActiveReportData(result.reportData || reportData);
      finalReportData = filterReportProjects(finalReportData);
      finalReportData = enforceReportQuality(finalReportData);
      if (getActiveReportProjectCount(finalReportData) <= 0) {
        return res.status(422).json({
          success: false,
          error: "AI enhancement produced no valid ECM projects after filtering.",
        });
      }
      finalReportData = expandReportEngineeringNarratives(finalReportData);
      finalReportData = cleanupFinalReportData(finalReportData);
      logSafeCleanupCheck(finalReportData, "Enhance AI");

      const expansionSummary = firstProjectSummary(finalReportData);
      const finalEnhancementSummary = enhancementSummary(finalReportData);
      finalReportData.enhancementMeta = {
        enhancedAt: new Date().toISOString(),
        enhancerUsed:
          result.aiEnhancementStatus?.finalEnhancerUsed ||
          (result.fallbackEnhanced ? "local_deterministic_narrative" : "ai"),
        enhancementApplied: true,
        summary: finalEnhancementSummary,
      };

      console.log("[ENHANCE_RESPONSE_SUMMARY]", finalEnhancementSummary);
      console.log("[FORCED_ENGINEERING_EXPANSION_SUMMARY]", expansionSummary);
      console.log("[FINAL_ECM_SPECIFIC_EXPANSION]", expansionSummary);

      return res.status(200).json({
        success: true,
        aiEnhanced: result.aiEnhanced === true,
        fallbackEnhanced: true,
        reportId,
        reportData: finalReportData,
        previewData: finalReportData,
        enhancementSummary: expansionSummary,
        aiEnhancementStatus: {
          ...(result.aiEnhancementStatus || {}),
          status: "engineering_expansion_success",
          finalEnhancerUsed: "forced_engineering_narrative_expander",
          userMessage: "Report engineering narrative expanded successfully.",
        },
        providerAttempts:
          result.providerAttempts ||
          result.aiEnhancementStatus?.providerAttempts ||
          [],
        extractionSummary: finalReportData.extractionSummary
      });
    } catch (error) {
      console.error("[enhance-ai] failed:", error);

      return res.status(200).json({
        success: true,
        aiEnhanced: false,
        error: error?.message || String(error),
        reportData: normalizeActiveReportData(
          req.body.reportData || req.body.previewData || {}
        ),
        previewData: normalizeActiveReportData(
          req.body.reportData || req.body.previewData || {}
        ),
        aiEnhancementStatus: {
          status: "failed_non_blocking",
          finalEnhancerUsed: "deterministic",
          failureReason: "ai_enhancement_error",
          developerMessage: error?.stack || error?.message || String(error),
          userMessage:
            "AI enhancement could not be applied. Deterministic report is ready.",
        },
      });
    }
  }

  app.post("/reports/enhance-ai", enhanceAiHandler);
  app.post("/reports/:reportId/enhance-ai", enhanceAiHandler);
}

module.exports = { reportEndpoints, extractAuthoritativeExcelProjects };
