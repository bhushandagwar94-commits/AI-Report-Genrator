const { getLLMProvider } = require("../utils/helpers");

/**
 * Normalizes values to strings, safely extracts text from Excel objects,
 * prevents [object Object] output, and drops empty values to "Data required".
 */
function safeReportValue(value) {
  if (value === null || value === undefined || value === "") return "Data required";

  if (typeof value === "number") {
    if (Number.isNaN(value)) return "Data required";
    return String(value);
  }

  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString().split("T")[0];
    if (value.result !== undefined) return safeReportValue(value.result);
    if (value.text !== undefined) return safeReportValue(value.text);
    if (value.richText) {
      return safeReportValue(value.richText.map((rt) => rt.text).join(""));
    }
    if (value.value !== undefined) return safeReportValue(value.value);
    if (value.displayValue !== undefined) return safeReportValue(value.displayValue);
    
    // If it's still an unmapped object, drop it to prevent [object Object]
    return "Data required";
  }

  const str = String(value).trim();
  if (str.length === 0 || str.toLowerCase() === "null" || str.toLowerCase() === "undefined" || str.toLowerCase() === "[object object]") {
    return "Data required";
  }

  return str;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === "object") return [value];
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

const PROJECT_ARRAY_FIELDS = [
  "baselineData",
  "measurementData",
  "typicalGapTable",
  "scopeOfWork",
  "keyActivities",
  "savingRationaleTable",
  "energySavingCalculation",
  "keyMetrics",
  "technicalSpecifications",
  "schematicFramework",
  "implementationDurationTable",
  "precautions",
  "measurementVerificationPlan",
  "benefitsOtherThanEnergySaving",
  "caseStudies",
  "images"
];

function normalizeProjectForExport(project, projectIndex = 0) {
  const normalizedProject = {
    ...(project && typeof project === "object" ? project : {}),
  };

  normalizedProject.projectNo = safeReportValue(
    normalizedProject.projectNo || `Project ${projectIndex + 1}`
  );
  normalizedProject.projectTitle = safeReportValue(
    normalizedProject.projectTitle || normalizedProject.ecmName || normalizedProject.title
  );

  PROJECT_ARRAY_FIELDS.forEach((field) => {
    normalizedProject[field] = asArray(normalizedProject[field]);
  });

  if (normalizedProject.carbonFootprint && typeof normalizedProject.carbonFootprint !== "object") {
    normalizedProject.carbonFootprint = {};
  }

  return normalizedProject;
}

function getProjectsForQC(reportData) {
  if (asArray(reportData?.groupedProjects).length) {
    return asArray(reportData.groupedProjects).flatMap((group, groupIndex) =>
      asArray(group?.projects).map((project, projectIndex) => ({
            ...normalizeProjectForExport(project, projectIndex),
            __groupIndex: groupIndex,
            __projectIndex: projectIndex,
            __groupNo: group.groupNo,
            __groupTitle: group.groupTitle,
          }))
    );
  }

  if (Array.isArray(reportData?.projects)) {
    const hasGroupObjects = reportData.projects.some(
      (item) => item && Array.isArray(item.projects)
    );

    if (hasGroupObjects) {
      return reportData.projects.flatMap((group, groupIndex) =>
        asArray(group?.projects).map((project, projectIndex) => ({
              ...normalizeProjectForExport(project, projectIndex),
              __groupIndex: groupIndex,
              __projectIndex: projectIndex,
              __groupNo: group.groupNo,
              __groupTitle: group.groupTitle,
            }))
      );
    }

    return reportData.projects.map((project, projectIndex) => ({
      ...normalizeProjectForExport(project, projectIndex),
      __projectIndex: projectIndex,
    }));
  }

  return [];
}

function normalizeReportForExport(reportData) {
  const source = reportData && typeof reportData === "object" ? reportData : {};
  const groupedProjects = asArray(source.groupedProjects);
  const rawProjects = asArray(source.projects);
  const flattenedProjects = groupedProjects.flatMap((group) => asArray(group?.projects));
  const projectCandidates = rawProjects.some((project) => project && Array.isArray(project.projects))
    ? flattenedProjects
    : (rawProjects.length ? rawProjects : flattenedProjects);
  const cleanedProjects = projectCandidates
    .filter((project) => project && typeof project === "object" && !Array.isArray(project.projects))
    .map((project, index) => normalizeProjectForExport(project, index));

  const normalizedGroups = groupedProjects.length
    ? groupedProjects.map((group) => ({
        ...(group && typeof group === "object" ? group : {}),
        groupTitle: safeReportValue(group?.groupTitle || group?.title),
        groupNo: safeReportValue(group?.groupNo || group?.no),
        projects: asArray(group?.projects).map((project, index) => normalizeProjectForExport(project, index)),
      }))
    : buildProjectGroups(cleanedProjects);

  return {
    ...source,
    projects: cleanedProjects,
    groupedProjects: normalizedGroups,
    executiveSummary: source.executiveSummary && typeof source.executiveSummary === "object"
      ? {
          ...source.executiveSummary,
          keyObservations: asArray(source.executiveSummary.keyObservations),
          conclusionAndWayForward: asArray(source.executiveSummary.conclusionAndWayForward),
        }
      : {},
  };
}

function scanForRenderedObjectStrings(value, path, qcErrors) {
  if (typeof value === "string") {
    if (value.toLowerCase().includes("[object object]")) {
      qcErrors.push({
        code: "OBJECT_FOUND",
        message: "Found [object Object] in report content.",
        path,
        value
      });
      return 1;
    }
    return 0;
  }

  if (Array.isArray(value)) {
    return value.reduce(
      (count, item, index) => count + scanForRenderedObjectStrings(item, `${path}[${index}]`, qcErrors),
      0
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce(
      (count, [key, nested]) => count + scanForRenderedObjectStrings(nested, `${path}.${key}`, qcErrors),
      0
    );
  }

  return 0;
}

function runReportQC(reportData) {
  reportData = normalizeReportForExport(reportData);
  const qcErrors = [];
  const qcWarnings = [];
  let invalidTitleCount = 0;
  let dataRequiredTitleCount = 0;
  let objectObjectCount = 0;
  let malformedGroupCount = 0;

  if (!reportData) {
    qcErrors.push({ code: "NO_DATA", message: "Report data is missing.", path: "reportData", value: null });
    return { qcPassed: false, qcErrors, qcWarnings, summary: { projectCount: 0, validEcmCount: 0, groupCount: 0 } };
  }

  const groupedProjects = Array.isArray(reportData.groupedProjects) ? reportData.groupedProjects : [];
  const flatProjects = Array.isArray(reportData.projects) ? reportData.projects : [];
  const projectsForQC = getProjectsForQC(reportData);
  const hasGroupObjectsInProjects = flatProjects.some((item) => item && Array.isArray(item.projects));

  // 1. Check groupedProjects
  if (groupedProjects.length === 0) {
    qcErrors.push({ code: "MISSING_GROUPS", message: "Report has no grouped projects.", path: "groupedProjects", value: null });
  }

  groupedProjects.forEach((group, groupIndex) => {
    const groupTitle = safeReportValue(group?.groupTitle);
    if (!group?.groupTitle || groupTitle === "Data required") {
      qcErrors.push({
        code: "INVALID_GROUP",
        message: "Group title is missing or invalid.",
        path: `groupedProjects[${groupIndex}].groupTitle`,
        value: group?.groupTitle
      });
      malformedGroupCount++;
    }

    if (!Array.isArray(group?.projects)) {
      qcErrors.push({
        code: "INVALID_GROUP",
        message: "Group projects must be an array.",
        path: `groupedProjects[${groupIndex}].projects`,
        value: group?.projects
      });
      malformedGroupCount++;
      return;
    }

    if (group.projects.length === 0) {
      qcErrors.push({
        code: "INVALID_GROUP",
        message: "Group must contain at least one ECM.",
        path: `groupedProjects[${groupIndex}].projects`,
        value: group.projects
      });
      malformedGroupCount++;
    }
  });

  // 2. Check individual projects
  const seenTitles = new Set();
  let duplicateTitleCount = 0;
  let validTitleCount = 0;

  projectsForQC.forEach((p, idx) => {
    const title = p?.projectTitle || p?.ecmName || p?.title;
    const groupIndex = Number.isInteger(p.__groupIndex) ? p.__groupIndex : null;
    const projectIndex = Number.isInteger(p.__projectIndex) ? p.__projectIndex : idx;
    const path = groupIndex !== null
      ? `groupedProjects[${groupIndex}].projects[${projectIndex}].projectTitle`
      : `projects[${projectIndex}].projectTitle`;

    if (!title) {
      qcErrors.push({ code: "INVALID_PROJECT_TITLE", message: "Project title is missing or invalid.", path, value: title });
      invalidTitleCount++;
    } else {
      const lower = String(title).toLowerCase().trim();
      if (lower === "data required") {
        qcErrors.push({ code: "INVALID_PROJECT_TITLE", message: "Project title is missing or invalid.", path, value: title });
        dataRequiredTitleCount++;
      } else if (lower === "[object object]") {
        qcErrors.push({ code: "INVALID_PROJECT_TITLE", message: "Project title is missing or invalid.", path, value: title });
      } else if (lower.includes("project project")) {
        qcErrors.push({ code: "INVALID_PROJECT_TITLE", message: "Project title is missing or invalid.", path, value: title });
        invalidTitleCount++;
      } else if (seenTitles.has(lower)) {
        qcErrors.push({ code: "DUPLICATE_TITLE", message: "Duplicate project title found.", path, value: title });
        duplicateTitleCount++;
      } else {
        seenTitles.add(lower);
        validTitleCount++;
      }
    }
  });

  objectObjectCount += scanForRenderedObjectStrings(reportData, "reportData", qcErrors);

  if (projectsForQC.length === 0) {
    qcErrors.push({ code: "NO_PROJECTS", message: "No valid ECMs found.", path: "projects", value: null });
  }

  if (groupedProjects.length > 0 && flatProjects.length > 0 && !hasGroupObjectsInProjects && flatProjects.length !== projectsForQC.length) {
    qcWarnings.push({
      code: "PROJECT_COUNT_MISMATCH",
      message: `Flat projects count (${flatProjects.length}) does not match grouped ECM count (${projectsForQC.length}).`,
      path: "projects"
    });
  }

  if (hasGroupObjectsInProjects) {
    qcWarnings.push({
      code: "PROJECTS_CONTAIN_GROUPS",
      message: "reportData.projects contains group objects and should be normalized to a flat ECM list.",
      path: "projects"
    });
  }

  const qcPassed = qcErrors.length === 0;

  return {
    qcPassed,
    qcErrors,
    qcWarnings,
    summary: {
      projectCount: projectsForQC.length,
      validEcmCount: validTitleCount,
      groupCount: groupedProjects.length,
      invalidTitleCount,
      duplicateTitleCount,
      dataRequiredTitleCount,
      objectObjectCount,
      malformedGroupCount,
      hardErrorCount: qcErrors.length,
      warningCount: qcWarnings.length
    }
  };
}

const CATEGORY_ORDER = [
  "Cooling System / HVAC",
  "Production Machines",
  "Air Compressors",
  "Pumps and Motors",
  "Lighting",
  "Electrical / APFC",
  "Hot Water / Thermal",
  "Renewable / Solar",
  "Monitoring / BMS",
  "Auxiliary Systems"
];

const PRIORITY_ORDER = {
  "high": 1,
  "medium": 2,
  "low": 3
};

function assignCategory(project) {
  const t = (project.system + " " + project.projectTitle + " " + project.equipmentCovered).toLowerCase();
  if (t.includes("hvac") || t.includes("chiller") || t.includes("cooling") || t.includes("ahu") || t.includes("vrf")) return "Cooling System / HVAC";
  if (t.includes("machine") || t.includes("production") || t.includes("cnc") || t.includes("injection") || t.includes("molding")) return "Production Machines";
  if (t.includes("compressor") || t.includes("compressed air") || t.includes("pneumatic") || t.includes("air")) return "Air Compressors";
  if (t.includes("pump") || t.includes("motor") || t.includes("fan") || t.includes("blower")) return "Pumps and Motors";
  if (t.includes("light") || t.includes("led") || t.includes("luminaire")) return "Lighting";
  if (t.includes("apfc") || t.includes("capacitor") || t.includes("transformer") || t.includes("electrical") || t.includes("power factor")) return "Electrical / APFC";
  if (t.includes("boiler") || t.includes("hot water") || t.includes("thermal") || t.includes("heater") || t.includes("furnace") || t.includes("steam")) return "Hot Water / Thermal";
  if (t.includes("solar") || t.includes("pv") || t.includes("renewable")) return "Renewable / Solar";
  if (t.includes("bms") || t.includes("monitor") || t.includes("iot") || t.includes("meter")) return "Monitoring / BMS";
  return "Auxiliary Systems";
}

function parseNumber(val) {
  if (!val || val === "Data required") return 0;
  const num = Number(String(val).replace(/[^\d.-]/g, ""));
  return isNaN(num) ? 0 : num;
}

function groupAndSortProjects(projects) {
  // 1. Assign normalized category
  projects.forEach(p => {
    p.categoryGroup = assignCategory(p);
  });

  // 2. Sort projects
  projects.sort((a, b) => {
    // A. By Category Group
    const catA = CATEGORY_ORDER.indexOf(a.categoryGroup);
    const catB = CATEGORY_ORDER.indexOf(b.categoryGroup);
    if (catA !== catB) return (catA === -1 ? 99 : catA) - (catB === -1 ? 99 : catB);

    // B. By Priority (High > Medium > Low)
    const prioA = PRIORITY_ORDER[String(a.implementationPriority).toLowerCase()] || 99;
    const prioB = PRIORITY_ORDER[String(b.implementationPriority).toLowerCase()] || 99;
    if (prioA !== prioB) return prioA - prioB;

    // C. By Payback (Shortest first)
    const payA = parseNumber(a.simplePaybackPeriod);
    const payB = parseNumber(b.simplePaybackPeriod);
    if (payA !== payB && (payA > 0 && payB > 0)) return payA - payB;

    // D. By Annual Saving (Highest first)
    const savA = parseNumber(a.expectedAnnualCostSaving);
    const savB = parseNumber(b.expectedAnnualCostSaving);
    return savB - savA; // descending
  });

  // 3. Re-assign Project No based on sorted order
  projects.forEach((p, index) => {
    p.projectNo = `Project ${index + 1}`;
  });

  return projects;
}

function cleanAndDeduplicateProjects(projects) {
  if (!Array.isArray(projects)) return [];
  const ECM_KEYWORDS = [
    "improvement", "optimization", "retrofit", "replacement", "installation",
    "upgrade", "energy saving", "heat recovery", "insulation", "vfd", "ie5",
    "apfc", "compressed air", "chiller", "pump", "cooling tower", "ahu",
    "motor", "servo", "lighting", "solar", "automation", "monitoring"
  ];

  const isValidTitle = (t) => {
    if (!t) return false;
    const lower = String(t).toLowerCase().trim();
    if (lower === "data required" || lower === "total" || lower === "summary") return false;
    
    // Explicit whitelist for valid titles that might otherwise trigger filters
    const validTitles = [
      "asb 70 dph servo motor project",
      "asb 50 mb servo motor project",
      "ebm cmp old 7.5 kw servo motor project",
      "ebm cmp old 5.5 kw servo motor project",
      "ebm cmp old 3.7 kw servo motor project",
      "ebm cmp old 7.5 kw each servo motor project",
      "ebm cmp old 5.5 kw each servo motor project",
      "ebm cmp old 3.7 kw each servo motor project",
      "ee improvement in chiller using ct segregation",
      "flow optimization for chw secondary pump"
    ];
    if (validTitles.includes(lower)) return true;
    
    if (/^[\d.,]+$/.test(lower)) return false;
    // duration only
    if (/^\d+\s*(to|-)?\s*\d*\s*(weeks|months|days|hrs|hours|yrs|years)$/.test(lower)) return false;
    // equipment only
    if (lower === "70 dph" || lower === "12m" || lower === "50mb") return false;
    
    const words = lower.split(/\s+/);
    const hasKeyword = ECM_KEYWORDS.some(k => lower.includes(k));
    if (words.length < 4 && !hasKeyword) return false;

    return true;
  };

  const normalizeTitle = (t) => {
    return String(t)
      .toLowerCase()
      .replace(/[^\w\s]/gi, "")
      .replace(/\b(project|ecm)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const validProjects = projects.filter(p => isValidTitle(p.projectTitle || p.title));
  
  const merged = {};
  for (const p of validProjects) {
    const rawTitle = p.projectTitle || p.title;
    const norm = normalizeTitle(rawTitle);
    
    if (!merged[norm]) {
      merged[norm] = { ...p };
    } else {
      const exist = merged[norm];
      for (const k of Object.keys(p)) {
        if (!exist[k] || exist[k] === "Data required" || exist[k] === "[object Object]") {
          exist[k] = p[k];
        }
      }
    }
  }

  const finalProjects = Object.values(merged);
  console.log(`[QC] Raw rows: ${projects.length} | Valid: ${validProjects.length} | Final Merged ECMs: ${finalProjects.length}`);
  
  // Reassign Project No
  finalProjects.forEach((p, index) => {
    p.projectNo = `Project ${index + 1}`;
  });
  
  return finalProjects;
}

function buildProjectGroups(projects) {
  const groups = [
    { no: "GR-1", title: "Cooling System Performance Improvement", keywords: ["chiller", "cooling tower", "\\bct\\b", "\\bchw\\b", "chilled water", "condenser", "pump flow", "free cooling", "primary pump", "secondary pump"] },
    { no: "GR-2", title: "Production Machines", keywords: ["\\basb\\b", "\\bebm\\b", "servo", "moulding", "molding", "dryer", "heater", "barrel", "insulation", "duct", "ir heater", "band heater", "production machine"] },
    { no: "GR-3", title: "Air Compressors", keywords: ["air compressor", "compressed air", "booster compressor", "\\bcfm\\b", "leakage", "\\bfad\\b"] },
    { no: "GR-4", title: "Auxiliary Systems & Machine Improvement", keywords: ["\\bahu\\b", "plug fan", "grinder", "blower", "auxiliary", "fan retrofit", "motor retrofit"] },
    { no: "GR-5", title: "Electrical / Power Quality", keywords: ["transformer", "\\bapfc\\b", "power factor", "\\bkva\\b", "\\bkvar\\b", "electrical"] },
    { no: "GR-6", title: "Renewable / Solar", keywords: ["solar", "\\bpv\\b", "renewable"] },
    { no: "GR-7", title: "Monitoring / BMS", keywords: ["\\bbms\\b", "monitoring", "sensor", "dashboard", "cloud monitoring"] }
  ];

  const otherGroup = { no: "GR-8", title: "Other Energy Saving Opportunities", keywords: [] };
  
  const mappedGroups = groups.map(g => ({ groupNo: g.no, groupTitle: g.title, projects: [], totalInvestment: 0, totalAnnualSaving: 0, totalEnergySaving: 0, weightedPayback: "Data required" }));
  const mappedOther = { groupNo: otherGroup.no, groupTitle: otherGroup.title, projects: [], totalInvestment: 0, totalAnnualSaving: 0, totalEnergySaving: 0, weightedPayback: "Data required" };

  for (const p of projects) {
    const text = ((p.projectTitle || "") + " " + (p.equipmentCovered || "") + " " + (p.system || "")).toLowerCase();
    
    let matchedGroup = null;
    for (const g of groups) {
      if (g.keywords.some(k => new RegExp(k, 'i').test(text))) {
        matchedGroup = mappedGroups.find(m => m.groupNo === g.no);
        break;
      }
    }
    
    if (!matchedGroup) matchedGroup = mappedOther;
    matchedGroup.projects.push(p);
  }
  
  const allGroups = [...mappedGroups, mappedOther].filter(g => g.projects.length > 0);

  for (const g of allGroups) {
    g.projects.sort((a, b) => {
      const ecmA = parseInt(String(a.projectNo).replace(/\D/g, "")) || 99;
      const ecmB = parseInt(String(b.projectNo).replace(/\D/g, "")) || 99;
      if (ecmA !== ecmB) return ecmA - ecmB;
      const prioA = PRIORITY_ORDER[String(a.implementationPriority).toLowerCase()] || 99;
      const prioB = PRIORITY_ORDER[String(b.implementationPriority).toLowerCase()] || 99;
      if (prioA !== prioB) return prioA - prioB;
      const payA = parseNumber(a.simplePaybackPeriod);
      const payB = parseNumber(b.simplePaybackPeriod);
      if (payA !== payB && payA > 0 && payB > 0) return payA - payB;
      const savA = parseNumber(a.expectedAnnualCostSaving);
      const savB = parseNumber(b.expectedAnnualCostSaving);
      return savB - savA;
    });

    g.totalInvestment = g.projects.reduce((sum, p) => sum + parseNumber(p.estimatedInvestment), 0);
    g.totalAnnualSaving = g.projects.reduce((sum, p) => sum + parseNumber(p.expectedAnnualCostSaving), 0);
    g.totalEnergySaving = g.projects.reduce((sum, p) => sum + parseNumber(p.expectedEnergySaving), 0);
    g.weightedPayback = (g.totalInvestment && g.totalAnnualSaving) ? (g.totalInvestment / g.totalAnnualSaving).toFixed(2) : "Data required";
  }

  return allGroups;
}

/**
 * Deterministic local fallback mapper for the Commercial Building Energy Audit Template
 */
function buildCommercialBuildingEnergyAuditFallback({
  inputDetails = {},
  extractedExcelData = {},
  uploadedFiles = [],
}) {
  const mapExtractedProjectsToTemplateProjects = (projects = []) => {
    return projects.map((p, i) => {
      const category = p.categoryGroup || assignCategory(p);
      const isHVAC = category === "Cooling System / HVAC";
      const isMotor = category === "Pumps and Motors";
      const isLighting = category === "Lighting";
      const isAirComp = category === "Air Compressors";
      
      const defaultExisting = isHVAC ? "The existing cooling system operates at a suboptimal efficiency and utilizes outdated control mechanisms." :
                              isMotor ? "The existing motors are standard efficiency and operate without variable speed drives." :
                              isLighting ? "The facility currently uses conventional lighting fixtures which consume higher power." :
                              isAirComp ? "The compressed air system operates with standard load/unload controls leading to part-load inefficiencies." :
                              "The existing system operates at standard efficiency levels.";
                              
      const defaultProposed = isHVAC ? "Install high-efficiency chillers or VRF systems with optimized chilled water pumping and BMS integration." :
                              isMotor ? "Replace standard motors with IE3/IE4 premium efficiency motors and install VFDs where applicable." :
                              isLighting ? "Retrofit all conventional lighting with high-lumen-per-watt LED fixtures." :
                              isAirComp ? "Install VFD air compressors or permanent magnet synchronous motor (PMSM) compressors with advanced master controllers." :
                              "Implement the proposed energy conservation measure to optimize system efficiency.";

      return {
        projectNo: safeReportValue(p.projectNo) !== "Data required" ? safeReportValue(p.projectNo) : `Project ${i + 1}`,
        projectTitle: safeReportValue(p.projectTitle || p.title),
        system: safeReportValue(p.system),
        location: safeReportValue(p.location),
        equipmentCovered: safeReportValue(p.equipmentCovered),
        
        // Narrative Fields
        existingOperatingCondition: safeReportValue(p.baselineDetails || p.existingCondition) !== "Data required" ? safeReportValue(p.baselineDetails || p.existingCondition) : defaultExisting,
        problemGapIdentified: "Significant energy losses are occurring due to outdated equipment and lack of dynamic operational controls.",
        proposedIntervention: safeReportValue(p.proposedIntervention) !== "Data required" ? safeReportValue(p.proposedIntervention) : defaultProposed,
        scopeOfWork: "1. Dismantling of existing equipment. 2. Installation of new energy-efficient equipment. 3. Integration with control panels. 4. Testing and commissioning.",
        keyActivities: ["Procurement", "Installation", "Testing", "Commissioning"],
        rationaleForEnergySaving: safeReportValue(p.rationale) !== "Data required" ? safeReportValue(p.rationale) : "The new equipment operates at a higher efficiency, directly reducing kW drawn for the same output.",
        energySavingCalculation: "Calculated based on operating hours, baseline load, and expected efficiency improvement percentage.",
        technicalSpecifications: "Refer to vendor datasheets for exact dimensions and electrical specifications.",
        schematicFramework: "Standard operational integration with existing electrical panels.",
        precautions: ["Ensure proper lockout/tagout during installation", "Verify voltage compatibility prior to commissioning"],
        measurementVerificationPlan: "Compare pre- and post-installation energy consumption using sub-meters for a period of one week.",
        benefitsOtherThanEnergySaving: ["Reduced maintenance costs", "Improved equipment reliability", "Lower thermal emissions"],
        caseStudies: "Similar implementations in the sector have shown performance improvements aligning with the calculated payback periods.",
        finalConclusion: "The project is technically feasible and financially viable. Immediate implementation is recommended.",
        
        // Financials & Excel Source of Truth
        expectedEnergySaving: safeReportValue(p.energySaving || p.saving),
        expectedAnnualCostSaving: safeReportValue(p.annualSaving || p.costSaving),
        estimatedInvestment: safeReportValue(p.investment),
        simplePaybackPeriod: safeReportValue(p.payback),
        implementationDuration: safeReportValue(p.implementationDuration),
        implementationPriority: safeReportValue(p.priority),
        
        carbonFootprint: {
          estimatedCO2Reduction: safeReportValue(p.carbonFootprint?.estimatedCO2Reduction || p.co2Reduction),
          annualEnergySaving: safeReportValue(p.energySaving),
          emissionFactor: safeReportValue(p.carbonFootprint?.emissionFactor)
        }
      };
    });
  };

  let projects = mapExtractedProjectsToTemplateProjects(extractedExcelData?.projects || []);
  projects = groupAndSortProjects(projects);

  if (projects.length === 0) {
    projects.push({
      projectNo: "Project 1",
      projectTitle: "Data required",
      system: "Data required",
      location: "Data required",
      equipmentCovered: "Data required",
      existingOperatingCondition: "Data required",
      proposedIntervention: "Data required",
      expectedEnergySaving: "Data required",
      expectedAnnualCostSaving: "Data required",
      estimatedInvestment: "Data required",
      simplePaybackPeriod: "Data required",
      implementationDuration: "Data required",
      implementationPriority: "Data required",
      rationaleForEnergySaving: "Data required",
      carbonFootprint: {
        estimatedCO2Reduction: "Data required",
        annualEnergySaving: "Data required",
        emissionFactor: "Data required"
      }
    });
  }

  return {
    reportInfo: {
      reportTitle: "Detailed Energy Audit Report",
      clientName: inputDetails.clientName || inputDetails.facilityName || "Data required",
      buildingType: inputDetails.buildingType || "Commercial Building",
      location: inputDetails.location || "Data required",
      auditPeriod: inputDetails.auditPeriod || "Data required",
      reportDate: inputDetails.reportDate || "Data required",
      preparedBy: "SEE-Tech Solutions",
      documentVersion: "Draft",
    },
    executiveSummary: {
      purposeText:
        "The purpose of this energy audit is to identify technically feasible, financially attractive and practically implementable energy-saving projects for the facility.",
      totalAnnualElectricityConsumption: extractedExcelData?.annualElectricityConsumption || "Data required",
      annualElectricityCost: extractedExcelData?.annualElectricityCost || "Data required",
      averageTariff: extractedExcelData?.averageTariff || "Data required",
      numberOfProjects: extractedExcelData?.projects?.length || "Data required",
      totalEnergySavingPotential: extractedExcelData?.totalEnergySaving || "Data required",
      totalAnnualCostSavingPotential: extractedExcelData?.totalAnnualSaving || "Data required",
      totalEstimatedInvestment: extractedExcelData?.totalInvestment || "Data required",
      simplePaybackPeriod: extractedExcelData?.simplePayback || "Data required",
      co2ReductionPotential: extractedExcelData?.co2Reduction || "Data required",
      keyObservations: ["Data required"],
      conclusionAndWayForward: [
        { step: 1, action: "Client review of identified projects" },
        { step: 2, action: "Joint selection of projects for implementation" },
        { step: 3, action: "Detailed engineering and vendor finalization" },
        { step: 4, action: "Implementation, commissioning and performance monitoring" },
      ],
    },
    buildingProfile: {
      facilityName: inputDetails.facilityName || inputDetails.clientName || "Data required",
      address: inputDetails.address || inputDetails.location || "Data required",
      typeOfBuilding: inputDetails.buildingType || "Commercial Building",
      facilityContactPerson: inputDetails.contactPerson || "Data required",
    },
    electricalSupplyDetails: {},
    specificEnergyBenchmark: {},
    buildingOperationDetails: [],
    utilityAndEnergySources: [],
    electricityBillingSummary: [],
    majorEnergyConsumingSystems: [],
    hvacSystemDetails: [],
    lightingSystemDetails: [],
    pumpsAndMotors: [],
    buildingAutomationControls: [],
    auditObservations: [],
    projects: projects,
  };
}

/**
 * Cleans the raw text response to ensure valid JSON is returned
 */
function cleanJsonResponse(rawText) {
  let cleaned = rawText.trim();
  // Remove markdown fences
  cleaned = cleaned.replace(/^```(json)?/im, "");
  cleaned = cleaned.replace(/```$/im, "");
  cleaned = cleaned.trim();
  
  // Try finding the first JSON object array or curly braces block if extra text exists
  const startIndex = cleaned.indexOf("{");
  const lastIndex = cleaned.lastIndexOf("}");
  if (startIndex !== -1 && lastIndex !== -1 && lastIndex > startIndex) {
    cleaned = cleaned.substring(startIndex, lastIndex + 1);
  }
  
  return JSON.parse(cleaned);
}

/**
 * OpenRouter direct generation function
 */
async function generateWithOpenRouter(systemPrompt, userPrompt) {
  const endpoint = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions";
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "SEE-Tech AI Report Generator",
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API failed with status ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textResponse = data?.choices?.[0]?.message?.content;
  if (!textResponse) throw new Error("OpenRouter API returned empty content");
  return textResponse;
}

/**
 * Provider-agnostic wrapper with priority fallback sequence
 */
async function generateWithProvider({
  templateSlug,
  systemPrompt,
  userPrompt,
  inputDetails,
  extractedExcelData,
  uploadedFiles,
  templateConfig,
}) {
  let providerUsed = "none";
  let fallbackReason = "";
  let finalReportData = null;

  // A. Try AnythingLLM if explicitly enabled and configured
  if (
    templateConfig?.useAnythingLLM === true &&
    process.env.ANYTHING_LLM_WORKSPACE_SLUG
  ) {
    try {
      // using the existing utility
      const llmProvider = getLLMProvider(); 
      const result = await llmProvider.getChatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.1 }
      );
      if (result && result.textResponse) {
        finalReportData = cleanJsonResponse(result.textResponse);
        providerUsed = "anythingllm";
      }
    } catch (e) {
      console.error("[generateWithProvider] AnythingLLM failed:", e.message);
      fallbackReason += `AnythingLLM: ${e.message}; `;
    }
  }

  // B. Try OpenRouter if configured
  if (!finalReportData && process.env.OPENROUTER_API_KEY) {
    try {
      const textResponse = await generateWithOpenRouter(systemPrompt, userPrompt);
      finalReportData = cleanJsonResponse(textResponse);
      providerUsed = "openrouter";
    } catch (e) {
      console.error("[generateWithProvider] OpenRouter failed:", e.message);
      fallbackReason += `OpenRouter: ${e.message}; `;
    }
  }

  // C. Try OpenAI if configured
  if (!finalReportData && process.env.OPENAI_API_KEY) {
    try {
      const llmProvider = getLLMProvider({ provider: "openai" });
      const result = await llmProvider.getChatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.1 }
      );
      if (result && result.textResponse) {
        finalReportData = cleanJsonResponse(result.textResponse);
        providerUsed = "openai";
      }
    } catch (e) {
      console.error("[generateWithProvider] OpenAI failed:", e.message);
      fallbackReason += `OpenAI: ${e.message}; `;
    }
  }

  // D. Deterministic Fallback if everything failed or was unconfigured
  if (!finalReportData) {
    console.log("[generateWithProvider] LLM unavailable. Deterministic fallback used.");
    if (templateSlug === "commercial-building-energy-audit") {
      finalReportData = buildCommercialBuildingEnergyAuditFallback({
        inputDetails,
        extractedExcelData,
        uploadedFiles,
      });
      providerUsed = "deterministic_fallback";
      fallbackReason = fallbackReason || "No APIs available or all failed.";
    } else {
      // Fallback for non-structured reports
      finalReportData = { content: "Report generation failed. No AI provider available." };
      providerUsed = "deterministic_fallback";
      fallbackReason = "No provider for unstructured template.";
    }
  }

  if (finalReportData && templateSlug === "commercial-building-energy-audit") {
    const rawProjects = finalReportData.projects || [];
    const cleanedProjects = cleanAndDeduplicateProjects(rawProjects);
    const groupedProjects = buildProjectGroups(cleanedProjects);
    finalReportData.projects = cleanedProjects;
    finalReportData.groupedProjects = groupedProjects;
  }

  return {
    reportData: finalReportData,
    metadata: {
      providerUsed,
      fallbackReason,
    },
  };
}

module.exports = {
  generateWithProvider,
  buildCommercialBuildingEnergyAuditFallback,
  cleanJsonResponse,
  generateWithOpenRouter,
  asArray,
  safeReportValue,
  groupAndSortProjects,
  cleanAndDeduplicateProjects,
  buildProjectGroups,
  getProjectsForQC,
  normalizeReportForExport,
  runReportQC
};
