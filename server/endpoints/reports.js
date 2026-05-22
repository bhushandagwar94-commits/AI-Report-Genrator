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
const { generateWithProvider, groupAndSortProjects, cleanAndDeduplicateProjects, buildProjectGroups, runReportQC } = require("../services/llmProviderService");

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
  projectTitle: [
    "project name", "energy saving project", "ecm name", "project title", "recommendation", "saving opportunity", "project", "ecm"
  ],
  proposedIntervention: [
    "project activities", "description"
  ],
  system: ["section", "4 category", "category", "system", "area", "utility", "equipment type", "department", "project category"],
  investment: ["investment, rs.", "investment", "estimated investment", "project cost", "capex", "implementation cost", "investment rs", "cost", "inr"],
  annualSaving: [
    "savings in rs/year", "annual saving", "cost saving", "monetary saving", "yearly saving",
    "saving rs", "rs/year", "annual benefit", "annual savings"
  ],
  energySaving: [
    "saving kwh/year", "kwh/year", "energy saving kwh/year", "saving kwh", "electricity saving", "annual energy saving",
    "units saving", "kwh"
  ],
  payback: ["payback period, years", "payback period", "simple payback", "roi", "payback", "years", "months"],
  priority: ["priority", "preority", "implementation priority", "ranking", "action priority", "priority phase i/ii/iii", "priority phase"],
  location: ["location", "area", "plant room", "floor", "building area"],
  equipmentCovered: ["equipment name", "equipment covered", "equipment", "machine", "asset", "load"],
  implementationDuration: ["project lead time", "implementation duration", "duration", "timeline", "weeks", "months"],
  co2Reduction: ["co2", "carbon", "emission", "emission reduction", "tco2", "tco2/year"],
  emissionFactor: ["emission factor", "grid emission", "grid emission factor"],
  rationale: ["rational for energy saving project", "rationale", "rational", "saving principle"],
  baselineDetails: ["notes (baseline details & others)", "baseline details", "baseline", "existing condition", "notes"]
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
  "rationale",
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

function mappedColumnsFromRow(values) {
  const mappedByIndex = {};
  const mappedColumns = {};
  const detectedColumns = [];

  values.forEach((value, index) => {
    const header = cellText(value).trim();
    if (!header) return;
    detectedColumns.push(header);
    const field = mapHeaderToField(header);
    if (!field || mappedColumns[field]) return;
    mappedByIndex[index] = field;
    mappedColumns[field] = header;
  });

  return { mappedByIndex, mappedColumns, detectedColumns };
}

function isBlankExcelRow(values) {
  return !values.some((value, index) => index > 0 && cellText(value).trim());
}

function isTotalExcelRow(values) {
  return values.some((value) => /\b(total|grand total|subtotal)\b/i.test(cellText(value)));
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

                workbook.eachSheet((worksheet) => {
                  let headerMap = {};
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

                    if (
                      rowStr.includes('project') ||
                      rowStr.includes('ecm') ||
                      rowStr.includes('investment') ||
                      rowStr.includes('co2') ||
                      rowStr.includes('carbon') ||
                      rowStr.includes('emission') ||
                      rowStr.includes('tco2')
                    ) {
                      values.forEach((v, idx) => {
                        const s = String(v || '').toLowerCase();
                        if (s === 'project lead time' || s.includes('duration') || s.includes('timeline') || s.includes('weeks') || s.includes('months')) headerMap[idx] = 'implementationDuration';
                        else if (s.includes('project name') || s.includes('project title') || s.includes('ecm name') || s.includes('energy conservation measure') || s.includes('saving opportunity') || s.includes('recommendation') || s.includes('proposed energy saving project') || s === 'project' || s === 'ecm' || s === 'title') headerMap[idx] = 'projectTitle';
                        else if (s.includes('system') || s.includes('category') || s.includes('group')) headerMap[idx] = 'system';
                        else if (s.includes('emission factor') || s.includes('grid emission')) headerMap[idx] = 'carbonFootprint.emissionFactor';
                        else if (s.includes('co2') || s.includes('carbon') || s.includes('emission') || s.includes('tco2')) headerMap[idx] = 'carbonFootprint.estimatedCO2Reduction';
                        else if (s === 'investment' || s.includes('investment, rs') || s.includes('investment rs') || s.includes('estimated investment') || s.includes('project cost') || s.includes('capex') || s.includes('implementation cost')) headerMap[idx] = 'investment';
                        else if (s.includes('annual saving') || s.includes('cost saving')) headerMap[idx] = 'annualSaving';
                        else if (s.includes('energy saving') || s.includes('saving kwh/year') || s.includes('saving')) headerMap[idx] = 'saving';
                        else if (s.includes('payback')) headerMap[idx] = 'payback';
                        else if (s.includes('priority')) headerMap[idx] = 'priority';
                        else if (s.includes('notes')) headerMap[idx] = 'baselineDetails';
                      });
                    } else if (Object.keys(headerMap).length >= 2) {
                      const project = {};
                      let hasData = false;
                      Object.keys(headerMap).forEach(idx => {
                        const val = values[idx];
                        if (val) {
                          const field = headerMap[idx];
                          // Do not map Notes to investment
                          if (field === 'investment' && headerMap[idx] === 'baselineDetails') return;

                          // Only map numeric values to numeric fields if possible
                          if (['saving', 'annualSaving', 'investment', 'payback'].includes(field)) {
                             if (typeof val === 'object' && val.result !== undefined) {
                               project[field] = project[field] ? project[field] : String(val.result);
                               hasData = true;
                             } else if (typeof val === 'number') {
                               project[field] = String(val);
                               hasData = true;
                             } else if (typeof val === 'string' && val.trim() !== '') {
                               // Only overwrite if it wasn't already set by a numeric column
                               if (!project[field] || isNaN(Number(project[field]))) {
                                 project[field] = val;
                                 hasData = true;
                               }
                             }
                          } else if (field.startsWith('carbonFootprint.')) {
                            project.carbonFootprint = project.carbonFootprint || {};
                            project.carbonFootprint[field.split('.')[1]] = typeof val === 'object' ? String(val.result || val.text || val) : String(val);
                            hasData = true;
                          } else {
                            project[field] = typeof val === 'object' ? String(val.result || val.text || val) : String(val);
                            hasData = true;
                          }
                        }
                      });
                      
                      // Title Validation
                      if (hasData && project.projectTitle) {
                        if (!isValidProjectTitle(project.projectTitle)) {
                          // Shift to duration if it looks like one, clear title
                          project.implementationDuration = project.projectTitle;
                          project.projectTitle = "Data required";
                        }
                        
                        if (project.projectTitle.toLowerCase() !== 'total' && !project.projectTitle.toLowerCase().includes('project')) {
                          project.projectNo = `Project ${extractedExcelData.projects.length + 1}`;
                          extractedExcelData.projects.push(project);
                        }
                      }
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
            templateConfig: template
          });
          
          if (template.slug === "commercial-building-energy-audit") {
            if (providerResult.reportData && Array.isArray(providerResult.reportData.projects) && extractedExcelData && Array.isArray(extractedExcelData.projects)) {
              const llmProjects = providerResult.reportData.projects;
              const deterministicProjects = extractedExcelData.projects;
              
              const llmByNo = {};
              const llmByTitle = {};
              for (const lp of llmProjects) {
                 if (lp.projectNo) llmByNo[lp.projectNo] = lp;
                 if (lp.projectTitle) llmByTitle[String(lp.projectTitle).toLowerCase().trim()] = lp;
              }
              
              const mergedProjects = [];
              for (const dp of deterministicProjects) {
                 const normTitle = String(dp.projectTitle).toLowerCase().trim();
                 const lp = llmByNo[dp.projectNo] || llmByTitle[normTitle] || {};
                 
                 const merged = {
                    ...lp,
                    ...dp,
                    projectTitle: dp.projectTitle
                 };
                 mergedProjects.push(merged);
              }
              
              const cleaned = cleanAndDeduplicateProjects(mergedProjects);
              providerResult.reportData.projects = buildProjectGroups(cleaned);
            }
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

        await prisma.generated_reports.update({
          where: { id: reportRecord.id },
          data: {
            extractedData: JSON.stringify({ providerUsed, fallbackReason }),
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

        // Re-run cleanup and deduplication
        const rawProjects = reportData.projects || [];
        const cleanedProjects = cleanAndDeduplicateProjects(rawProjects);
        reportData.projects = cleanedProjects;
        reportData.groupedProjects = buildProjectGroups(cleanedProjects);

        // Save cleaned data back to DB
        await prisma.generated_reports.update({
          where: { id },
          data: { outputContent: JSON.stringify(reportData) }
        });

        const qcResult = runReportQC(reportData);
        
        response.status(200).json({
          success: true,
          ...qcResult,
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

        // Just-in-time migration for old reports without groupedProjects
        if (!reportData.groupedProjects || reportData.groupedProjects.length === 0) {
          const rawProjects = reportData.projects || [];
          const cleanedProjects = cleanAndDeduplicateProjects(rawProjects);
          reportData.projects = cleanedProjects;
          reportData.groupedProjects = buildProjectGroups(cleanedProjects);
        }

        // Quality Check (QC) Gate
        const qcResult = runReportQC(reportData);
        const allowDraft = request.query.allowDraft === "true";
        const isDev = process.env.NODE_ENV === "development" || process.env.VITE_ALLOW_DRAFT_EXPORT === "true";

        if (!qcResult.qcPassed) {
          console.error(`[QC FAILED] Report ID: ${id}`, JSON.stringify(qcResult, null, 2));
          if (!(allowDraft && isDev)) {
            return response.status(400).json({ 
              qcFailed: true, 
              error: "Report requires review before final export.",
              ...qcResult
            });
          }
        }

        if (allowDraft && isDev && reportData.reportInfo) {
          reportData.reportInfo.clientName = "[DRAFT - QC REVIEW REQUIRED] " + (reportData.reportInfo.clientName || "");
        }

        const buffer = await buildCommercialBuildingEnergyAuditDocx(reportData);
        
        const clientName = reportData.reportInfo?.clientName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "client";
        const filename = `SEE-Tech_Detailed_Energy_Audit_Report_${clientName}.docx`;

        response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        response.send(buffer);
      } catch (e) {
        console.error(e.message, e);
        response.status(500).json({ error: e.message });
      }
    }
  );
}

module.exports = { reportEndpoints };
