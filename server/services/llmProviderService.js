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

function getBinaryFlag(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string" && value.trim() === "") return 0;
  if (typeof value === "string" && value.trim().toLowerCase() === "data required") return 0;
  if (Array.isArray(value) && value.length === 0) return 0;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    return 0;
  }

  return 1;
}

function setFieldFlag(fieldFlags, path, value, options = {}) {
  const flag = Number(getBinaryFlag(value));
  const source = flag === 0 ? "missing" : (options.source || "default");
  const inferredType = Array.isArray(value) ? "array" : typeof value;

  fieldFlags[path] = {
    flag,
    source,
    valueType: options.valueType || inferredType,
    label: options.label || path,
    sourceColumn: options.sourceColumn || null,
    message:
      flag === 1
        ? (options.successMessage || `Available from ${source}`)
        : (options.missingMessage || "Data required"),
  };
}

function buildMissingFieldSummary(fieldFlags = {}) {
  return Object.entries(fieldFlags)
    .filter(([, meta]) => Number(meta?.flag) === 0)
    .map(([path, meta]) => ({
      path,
      label: meta.label,
      sourceExpected: meta.source,
      message: meta.message,
    }));
}

function stripDebugMetadata(reportData) {
  const cloned = reportData && typeof structuredClone === "function"
    ? structuredClone(reportData)
    : JSON.parse(JSON.stringify(reportData || {}));

  delete cloned.fieldFlags;
  delete cloned.missingFieldSummary;
  delete cloned.providerAttempts;
  return cloned;
}

const FIELD_FLAG_FORM_FIELDS = [
  {
    path: "reportInfo.clientName",
    inputKey: "clientName",
    getter: (reportJson) => reportJson?.reportInfo?.clientName,
    label: "Client Name",
  },
  {
    path: "reportInfo.facilityName",
    inputKey: "facilityName",
    getter: (reportJson) => reportJson?.buildingProfile?.facilityName || reportJson?.reportInfo?.facilityName,
    label: "Facility Name",
  },
  {
    path: "reportInfo.location",
    inputKey: "location",
    getter: (reportJson) => reportJson?.reportInfo?.location,
    label: "Location",
  },
  {
    path: "reportInfo.auditPeriod",
    inputKey: "auditPeriod",
    getter: (reportJson) => reportJson?.reportInfo?.auditPeriod,
    label: "Audit Period",
  },
  {
    path: "reportInfo.reportDate",
    inputKey: "reportDate",
    getter: (reportJson) => reportJson?.reportInfo?.reportDate,
    label: "Report Date",
  },
  {
    path: "reportInfo.preparedBy",
    inputKey: "preparedBy",
    getter: (reportJson) => reportJson?.reportInfo?.preparedBy,
    label: "Prepared By",
  },
];

function buildFieldFlags(reportJson, mappingContext = {}, providerInfo = {}) {
  const normalizedReport = normalizeReportForExport(stripDebugMetadata(reportJson));
  const fieldFlags = {};
  const projects = asArray(normalizedReport.projects);
  const formData = mappingContext?.inputDetails || mappingContext?.formData || {};
  const narrativeSource = ["deterministic-fallback", "deterministic"].includes(providerInfo?.providerUsed)
    ? "deterministic"
    : "ai";

  FIELD_FLAG_FORM_FIELDS.forEach(({ path, getter, label, inputKey }) => {
    const hasRawFormValue = inputKey && Object.prototype.hasOwnProperty.call(formData, inputKey);
    const rawValue = hasRawFormValue ? formData[inputKey] : undefined;
    const resolvedValue = hasRawFormValue ? rawValue : getter(normalizedReport);
    const resolvedSource = hasRawFormValue ? "form" : "default";

    setFieldFlag(fieldFlags, path, resolvedValue, {
      source: resolvedSource,
      valueType: "text",
      label,
      successMessage: resolvedSource === "form" ? "Fetched from form input" : "Applied default value",
      missingMessage: resolvedSource === "form" ? "Missing from form input" : "Data required",
    });
  });

  setFieldFlag(
    fieldFlags,
    "executiveSummary.totalEnergySavingPotential",
    normalizedReport?.executiveSummary?.totalEnergySavingPotential,
    {
      source: "calculated",
      valueType: "number",
      label: "Total Energy Saving Potential",
      successMessage: "Calculated from Excel project values",
    }
  );
  setFieldFlag(
    fieldFlags,
    "executiveSummary.totalAnnualCostSavingPotential",
    normalizedReport?.executiveSummary?.totalAnnualCostSavingPotential,
    {
      source: "calculated",
      valueType: "number",
      label: "Total Annual Cost Saving Potential",
      successMessage: "Calculated from Excel project savings",
    }
  );
  setFieldFlag(
    fieldFlags,
    "executiveSummary.totalEstimatedInvestment",
    normalizedReport?.executiveSummary?.totalEstimatedInvestment,
    {
      source: "calculated",
      valueType: "number",
      label: "Total Estimated Investment",
      successMessage: "Calculated from Excel project investments",
    }
  );
  setFieldFlag(
    fieldFlags,
    "executiveSummary.simplePaybackPeriod",
    normalizedReport?.executiveSummary?.simplePaybackPeriod,
    {
      source: "calculated",
      valueType: "number",
      label: "Simple Payback Period",
      successMessage: "Calculated from Excel project totals",
    }
  );

  projects.forEach((project, index) => {
    setFieldFlag(fieldFlags, `projects[${index}].projectNo`, project.projectNo, {
      source: "excel",
      sourceColumn: "Sr.",
      valueType: "text",
      label: "ECM Number",
      successMessage: "Fetched from Excel",
    });
    setFieldFlag(fieldFlags, `projects[${index}].projectTitle`, project.projectTitle, {
      source: "excel",
      sourceColumn: "Project Name",
      valueType: "text",
      label: "Project Title",
      successMessage: "Fetched from Excel",
    });
    setFieldFlag(fieldFlags, `projects[${index}].equipmentCovered`, project.equipmentCovered, {
      source: "excel",
      sourceColumn: "Equipment Name",
      valueType: "text",
      label: "Equipment Covered",
      successMessage: "Fetched from Excel",
    });
    setFieldFlag(fieldFlags, `projects[${index}].expectedEnergySaving`, project.expectedEnergySaving, {
      source: "excel",
      sourceColumn: "Saving, kWh/ Year",
      valueType: "number",
      label: "Expected Energy Saving",
      successMessage: "Fetched from Excel",
    });
    setFieldFlag(fieldFlags, `projects[${index}].expectedAnnualCostSaving`, project.expectedAnnualCostSaving, {
      source: "excel",
      sourceColumn: "Savings in Rs/Year",
      valueType: "number",
      label: "Expected Annual Cost Saving",
      successMessage: "Fetched from Excel",
    });
    setFieldFlag(fieldFlags, `projects[${index}].estimatedInvestment`, project.estimatedInvestment, {
      source: "excel",
      sourceColumn: "Investment, Rs.",
      valueType: "number",
      label: "Estimated Investment",
      successMessage: "Fetched from Excel",
    });
    setFieldFlag(fieldFlags, `projects[${index}].simplePaybackPeriod`, project.simplePaybackPeriod, {
      source: "excel",
      sourceColumn: "Payback Period, Years",
      valueType: "number",
      label: "Simple Payback Period",
      successMessage: "Fetched from Excel",
    });
    setFieldFlag(fieldFlags, `projects[${index}].implementationDuration`, project.implementationDuration, {
      source: "excel",
      sourceColumn: "Project Lead Time",
      valueType: "text",
      label: "Implementation Duration",
      successMessage: "Fetched from Excel",
    });
    setFieldFlag(
      fieldFlags,
      `projects[${index}].co2Reduction`,
      project?.co2Reduction || project?.carbonFootprint?.estimatedCO2Reduction,
      {
        source: "calculated",
        valueType: "number",
        label: "CO2 Reduction",
        successMessage: "Calculated from energy saving data",
      }
    );
    setFieldFlag(fieldFlags, `projects[${index}].proposedProjectDescription`, project.proposedProjectDescription, {
      source: narrativeSource,
      valueType: "text",
      label: "Proposed Project Description",
      successMessage: narrativeSource === "ai" ? "Generated by AI" : "Generated by deterministic fallback",
    });
    setFieldFlag(fieldFlags, `projects[${index}].rationaleForEnergySaving`, project.rationaleForEnergySaving, {
      source: narrativeSource,
      valueType: "text",
      label: "Rationale for Energy Saving",
      successMessage: narrativeSource === "ai" ? "Generated by AI" : "Generated by deterministic fallback",
    });
  });

  return fieldFlags;
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
  let numericSystemCount = 0;
  let wrongEnergySavingCount = 0;
  let missingEquipmentCount = 0;

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

    const systemValue = safeReportValue(p?.system);
    if (systemValue !== "Data required" && /^[\d.,]+$/.test(systemValue)) {
      qcErrors.push({
        code: "NUMERIC_SYSTEM",
        message: "System/category contains a numeric value and appears to be mapped from the wrong Excel column.",
        path: groupIndex !== null
          ? `groupedProjects[${groupIndex}].projects[${projectIndex}].system`
          : `projects[${projectIndex}].system`,
        value: p?.system,
      });
      numericSystemCount++;
    }

    const equipmentValue = safeReportValue(p?.equipmentCovered);
    if (equipmentValue === "Data required") {
      qcErrors.push({
        code: "MISSING_EQUIPMENT",
        message: "Equipment covered is missing or invalid.",
        path: groupIndex !== null
          ? `groupedProjects[${groupIndex}].projects[${projectIndex}].equipmentCovered`
          : `projects[${projectIndex}].equipmentCovered`,
        value: p?.equipmentCovered,
      });
      missingEquipmentCount++;
    }

    const energySavingValue = numberOrZero(p?.expectedEnergySaving);
    const projectNoDigits = Number(String(p?.projectNo || "").replace(/[^\d.-]/g, ""));
    if (
      energySavingValue > 0 &&
      projectNoDigits > 0 &&
      Math.abs(energySavingValue - projectNoDigits) < 0.0001
    ) {
      qcErrors.push({
        code: "SUSPICIOUS_ENERGY_SAVING",
        message: "Energy saving appears to be mapped from ECM number or serial number instead of the Excel saving column.",
        path: groupIndex !== null
          ? `groupedProjects[${groupIndex}].projects[${projectIndex}].expectedEnergySaving`
          : `projects[${projectIndex}].expectedEnergySaving`,
        value: p?.expectedEnergySaving,
      });
      wrongEnergySavingCount++;
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

  const expectedProjectCount = Number(reportData?.qcSummary?.expectedProjectCount || 0);
  if (expectedProjectCount > 0 && expectedProjectCount !== projectsForQC.length) {
    qcErrors.push({
      code: "PROJECT_COUNT_MISMATCH",
      message: `Final ECM count (${projectsForQC.length}) does not match expected count (${expectedProjectCount}).`,
      path: "qcSummary.expectedProjectCount",
      value: expectedProjectCount,
    });
  }

  const datasetProfile = reportData?.qcSummary?.datasetProfile || null;
  if (datasetProfile?.expectedGroups) {
    const actualGroupCounts = Object.fromEntries(
      groupedProjects.map((group) => [group.groupTitle, asArray(group.projects).length])
    );
    Object.entries(datasetProfile.expectedGroups).forEach(([groupTitle, expectedCount]) => {
      if ((actualGroupCounts[groupTitle] || 0) !== expectedCount) {
        qcErrors.push({
          code: "GROUP_COUNT_MISMATCH",
          message: `Group "${groupTitle}" has ${(actualGroupCounts[groupTitle] || 0)} ECMs but expected ${expectedCount}.`,
          path: `groupedProjects.${groupTitle}`,
          value: actualGroupCounts[groupTitle] || 0,
        });
      }
    });
  }

  const hardErrorCount = qcErrors.length;
  
  const shouldBlockExport = 
    hardErrorCount > 0 || 
    validTitleCount === 0 || 
    groupedProjects.length === 0 || 
    !reportData || 
    !reportData.projects?.length;

  const qcPassed = !shouldBlockExport;

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
      numericSystemCount,
      wrongEnergySavingCount,
      missingEquipmentCount,
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
  
  // Preserve authoritative ECM numbers from Excel when available.
  finalProjects.forEach((p, index) => {
    if (!p.projectNo || String(p.projectNo).trim() === "" || String(p.projectNo).toLowerCase() === "data required") {
      p.projectNo = `Project ${index + 1}`;
    }
  });
  
  return finalProjects;
}

function buildProjectGroups(projects) {
  const groups = [
    { no: "GR-1", title: "Cooling System Performance Improvement", keywords: ["chiller", "cooling tower", "\\bct\\b", "\\bchw\\b", "chilled water", "condenser", "pump flow", "free cooling", "primary pump", "secondary pump"] },
    { no: "GR-2", title: "Production Machines", keywords: ["\\basb\\b", "\\bebm\\b", "servo", "moulding", "molding", "dryer", "heater", "barrel", "insulation", "duct", "ir heater", "band heater", "production machine", "heat recovery"] },
    { no: "GR-3", title: "Air Compressors", keywords: ["air compressor", "compressed air", "booster compressor", "\\bcfm\\b", "leakage", "\\bfad\\b"] },
    { no: "GR-4", title: "Auxiliary Systems & Machine Improvement", keywords: ["\\bahu\\b", "plug fan", "grinder", "blower", "auxiliary", "fan retrofit", "motor retrofit", "\\bapfc\\b", "power factor", "relay"] }
  ];

  const groupAliasMap = {
    "cooling system performance improvement": "Cooling System Performance Improvement",
    "energy saving projects for cooling system": "Cooling System Performance Improvement",
    "cooling system": "Cooling System Performance Improvement",
    "production machines": "Production Machines",
    "energy saving projects for production machines": "Production Machines",
    "production machine": "Production Machines",
    "air compressors": "Air Compressors",
    "energy saving projects for air compressors": "Air Compressors",
    "air compressor": "Air Compressors",
    "auxiliary systems & machine improvement": "Auxiliary Systems & Machine Improvement",
    "auxiliary systems / machine improvement": "Auxiliary Systems & Machine Improvement",
    "energy saving projects for auxiliary systems & machine improvement": "Auxiliary Systems & Machine Improvement"
  };

  const otherGroup = { no: "GR-5", title: "Other Energy Saving Opportunities", keywords: [] };
  
  const mappedGroups = groups.map(g => ({ groupNo: g.no, groupTitle: g.title, projects: [], totalInvestment: 0, totalAnnualSaving: 0, totalEnergySaving: 0, weightedPayback: "Data required" }));
  const mappedOther = { groupNo: otherGroup.no, groupTitle: otherGroup.title, projects: [], totalInvestment: 0, totalAnnualSaving: 0, totalEnergySaving: 0, weightedPayback: "Data required" };

  for (const p of projects) {
    const text = ((p.projectTitle || "") + " " + (p.equipmentCovered || "") + " " + (p.system || "")).toLowerCase();
    
    let matchedGroup = null;
    const explicitGroup = String(p.groupTitle || p.categoryGroup || "").toLowerCase().trim();
    if (explicitGroup && groupAliasMap[explicitGroup]) {
      matchedGroup = mappedGroups.find((m) => m.groupTitle === groupAliasMap[explicitGroup]);
    }
    for (const g of groups) {
      if (matchedGroup) break;
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

function numberOrZero(value) {
  if (value === null || value === undefined || value === "" || value === "Data required") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitNarrativeItems(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => splitNarrativeItems(item))
      .filter(Boolean);
  }

  const text = safeReportValue(value);
  if (text === "Data required") return [];

  return text
    .split(/\r?\n|;|•|·/)
    .map((item) => item.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function mapNarrativeList(value, key = "value") {
  const items = splitNarrativeItems(value);
  if (!items.length) return [];
  return items.map((item) => ({ [key]: item }));
}

function inferProjectNarrativeContext(project) {
  const title = `${project.projectTitle || ""} ${project.equipmentCovered || ""} ${project.system || ""}`.toLowerCase();

  if (title.includes("ct segregation")) {
    return {
      existing: "The existing cooling system shares common cooling tower and condenser water infrastructure, which prevents optimized condenser water temperature control and leads to avoidable chiller kW/TR and pumping energy consumption.",
      problem: "Without segregation and control refinement, the cooling system continues operating at higher condenser water temperatures and suboptimal flow conditions, increasing compressor and pump energy use.",
      proposed: "Segregate the cooling tower circuit and optimize condenser water control so the chiller and associated pumping system operate at improved approach temperatures and lower specific energy consumption.",
      rationale: "Improved cooling tower segregation and condenser water control reduce heat rejection losses, improve chiller operating efficiency, and lower auxiliary pumping demand.",
      mv: "Measure pre- and post-implementation chiller kW/TR, condenser water temperature, pump kW, and operating hours under similar production and ambient conditions.",
    };
  }

  if (title.includes("free cooling")) {
    return {
      existing: "The present system relies on mechanical cooling even during favorable winter ambient conditions, limiting the opportunity to bypass the chiller during low-temperature operation.",
      problem: "Available ambient cooling potential is not fully utilized, so the chiller continues consuming power when free cooling could satisfy part of the thermal load.",
      proposed: "Introduce chiller bypass and free-cooling logic using condenser or tower water during winter conditions, supported by temperature-based control and suitable heat-exchange arrangements.",
      rationale: "Using ambient-assisted cooling during winter reduces compressor runtime while maintaining process cooling requirements.",
      mv: "Track chiller runtime hours, bypass operating hours, condenser or sump temperatures, and total cooling energy before and after commissioning.",
    };
  }

  if (title.includes("servo motor")) {
    return {
      existing: "The existing machine drive arrangement relies on conventional motor-hydraulic operation with avoidable idle losses and reduced controllability during part-load conditions.",
      problem: "Conventional drive operation causes excess energy consumption during idle and low-load periods while limiting process-response precision.",
      proposed: "Retrofit the machine with a servo-driven system integrated into machine controls to reduce idle-load demand and improve motion efficiency.",
      rationale: "Servo drive control better matches output to process demand, reducing motor losses, hydraulic throttling, and idle energy draw.",
      mv: "Compare machine cycle energy, idle kW, and production-normalized energy use before and after retrofit across representative operating shifts.",
    };
  }

  if (title.includes("insulation")) {
    return {
      existing: "The existing heated ducting arrangement experiences surface heat loss to surrounding air, increasing heater duty and causing unnecessary thermal energy waste.",
      problem: "Uninsulated or poorly insulated hot ducts lose useful heat before it reaches the process, increasing electrical heating consumption.",
      proposed: "Install suitable thermal insulation across the identified hot flexible ducts to reduce surface heat loss and maintain process air temperature more efficiently.",
      rationale: "Lower thermal losses reduce heater energy input while improving temperature retention and process stability.",
      mv: "Record heater load, outlet temperature stability, and operating hours before and after insulation under similar production conditions.",
    };
  }

  if (title.includes("apfc")) {
    return {
      existing: "The present power-factor correction arrangement does not maintain the desired reactive power compensation performance consistently across changing electrical loading conditions.",
      problem: "Suboptimal APFC operation can increase reactive power draw, reduce power factor, and expose the facility to avoidable demand-related penalties or inefficiencies.",
      proposed: "Replace or upgrade the APFC relay and restore correct staged capacitor control to maintain healthier power factor performance across the plant load profile.",
      rationale: "Improved reactive power management reduces avoidable electrical losses and supports stronger utilization of the connected electrical infrastructure.",
      mv: "Track pre- and post-implementation power factor, kvar demand, capacitor stage health, and utility billing indicators over the next billing cycle.",
    };
  }

  if (title.includes("compressed air") || title.includes("air compressor") || title.includes("booster compressor")) {
    return {
      existing: "The compressed air system operates without full measurement visibility and optimization, which can mask leakage, part-load inefficiency, and pressure-management losses.",
      problem: "Insufficient system measurement and control can increase specific power consumption, leakage losses, and unloaded compressor operation.",
      proposed: "Improve compressed air measurement, control, and equipment efficiency through monitoring, pressure optimization, and targeted retrofit of the identified compressor assets.",
      rationale: "Better compressor efficiency and air-demand management reduce specific energy consumption while maintaining required pressure and flow reliability.",
      mv: "Measure compressor kW, FAD or flow, header pressure, leak load, and specific power before and after implementation.",
    };
  }

  if (title.includes("ie5") || title.includes("motor retrofit") || title.includes("pmsm")) {
    return {
      existing: "The existing motor-driven system operates with standard-efficiency equipment and associated losses that are higher than currently available premium-efficiency alternatives.",
      problem: "Motor losses and drive inefficiencies increase running energy consumption across the operating profile.",
      proposed: "Retrofit the identified drive with an IE5 or equivalent high-efficiency motor configuration compatible with the duty and control arrangement.",
      rationale: "Higher motor efficiency reduces electrical losses at the same load output and supports lower lifecycle energy cost.",
      mv: "Verify before and after motor input kW, operating current, and load conditions while confirming process throughput remains unchanged.",
    };
  }

  return {
    existing: "The existing system operates under current process conditions but exhibits opportunities for measurable energy-performance improvement.",
    problem: "The present operating approach results in avoidable energy losses or control inefficiencies during normal plant operation.",
    proposed: "Implement the identified energy conservation measure to improve equipment efficiency, operating control, and overall system performance.",
    rationale: "The proposed intervention reduces avoidable losses and aligns energy consumption more closely with actual process demand.",
    mv: "Establish before-and-after measurement of energy use, operating hours, and key process parameters to verify savings performance.",
  };
}

function buildDeterministicProject(project, index = 0) {
  const narrative = inferProjectNarrativeContext(project);
  const baselineDetails = safeReportValue(
    project.baselineDetails || project.existingOperatingCondition || project.existingSystemDescription
  );
  const proposedIntervention = safeReportValue(
    project.proposedIntervention || project.proposedProjectDescription || project.projectTitle
  );
  const rationale = safeReportValue(project.rationale || project.rationaleForEnergySaving);
  const activities = splitNarrativeItems(project.projectActivitiesText || project.keyActivities);
  const system = safeReportValue(project.system || project.groupTitle);

  const normalizedProject = normalizeProjectForExport(
    {
      ...project,
      projectNo: safeReportValue(project.projectNo) !== "Data required"
        ? safeReportValue(project.projectNo)
        : `ECM-${index + 1}`,
      projectTitle: safeReportValue(project.projectTitle || project.title),
      system,
      equipmentCovered: safeReportValue(project.equipmentCovered),
      existingOperatingCondition: baselineDetails !== "Data required" ? baselineDetails : narrative.existing,
      existingSystemDescription: baselineDetails !== "Data required" ? baselineDetails : narrative.existing,
      problemGapIdentified: safeReportValue(project.problemGapIdentified) !== "Data required"
        ? safeReportValue(project.problemGapIdentified)
        : narrative.problem,
      proposedIntervention,
      proposedProjectDescription: safeReportValue(project.proposedProjectDescription) !== "Data required"
        ? safeReportValue(project.proposedProjectDescription)
        : proposedIntervention,
      scopeOfWork: asArray(project.scopeOfWork).length
        ? asArray(project.scopeOfWork)
        : mapNarrativeList(project.projectActivitiesText || project.scopeOfWork, "scopeItem"),
      keyActivities: asArray(project.keyActivities).length
        ? asArray(project.keyActivities)
        : mapNarrativeList(project.projectActivitiesText, "activity"),
      rationaleForEnergySaving: rationale !== "Data required" ? rationale : narrative.rationale,
      energySavingCalculation: asArray(project.energySavingCalculation).length
        ? asArray(project.energySavingCalculation)
        : [
            {
              parameter: "Annual energy saving",
              unit: "kWh/year",
              value: safeReportValue(project.expectedEnergySaving),
            },
            {
              parameter: "Annual cost saving",
              unit: "₹/year",
              value: safeReportValue(project.expectedAnnualCostSaving),
            },
            {
              parameter: "Estimated investment",
              unit: "₹",
              value: safeReportValue(project.estimatedInvestment),
            },
            {
              parameter: "Simple payback",
              unit: "years",
              value: safeReportValue(project.simplePaybackPeriod),
            },
          ],
      technicalSpecifications: asArray(project.technicalSpecifications).length
        ? asArray(project.technicalSpecifications)
        : [
            {
              parameter: "Equipment covered",
              details: safeReportValue(project.equipmentCovered),
            },
            {
              parameter: "Implementation duration",
              details: safeReportValue(project.implementationDuration),
            },
          ],
      precautions: asArray(project.precautions).length
        ? asArray(project.precautions)
        : [
            "Ensure safe shutdown and isolation before modification work.",
            "Verify mechanical and electrical compatibility before commissioning.",
          ],
      aspectsToBeTakenCareOf: asArray(project.aspectsToBeTakenCareOf).length
        ? asArray(project.aspectsToBeTakenCareOf)
        : (asArray(project.precautions).length
            ? asArray(project.precautions)
            : [
                "Ensure safe shutdown and isolation before modification work.",
                "Verify mechanical and electrical compatibility before commissioning.",
              ]),
      measurementVerificationPlan: asArray(project.measurementVerificationPlan).length
        ? asArray(project.measurementVerificationPlan)
        : [{ step: 1, action: narrative.mv }],
      benefitsOtherThanEnergySaving: asArray(project.benefitsOtherThanEnergySaving).length
        ? asArray(project.benefitsOtherThanEnergySaving)
        : [
            "Improved process reliability",
            "Reduced maintenance burden",
            "Better operational control",
          ],
      implementationDurationTable: asArray(project.implementationDurationTable).length
        ? asArray(project.implementationDurationTable)
        : [
            { activity: "Engineering and procurement", duration: safeReportValue(project.implementationDuration) },
            { activity: "Installation and commissioning", duration: safeReportValue(project.implementationDuration) },
          ],
      caseStudies: asArray(project.caseStudies).length
        ? asArray(project.caseStudies)
        : [
            {
              title: safeReportValue(project.projectTitle),
              clientType: "Industrial facility",
              system,
              implementedMeasure: proposedIntervention,
              result: `Expected energy saving of ${safeReportValue(project.expectedEnergySaving)}.`,
              relevance: "Prepared directly from the uploaded ECM workbook and aligned to the proposed intervention.",
            },
          ],
      finalConclusion: safeReportValue(project.finalConclusion) !== "Data required"
        ? safeReportValue(project.finalConclusion)
        : "This ECM is recommended for implementation because it addresses an observed operating inefficiency, supports more stable and efficient system operation, and can be carried forward through disciplined engineering, commissioning, and post-implementation verification.",
      carbonFootprint: {
        ...(project.carbonFootprint && typeof project.carbonFootprint === "object" ? project.carbonFootprint : {}),
        annualEnergySaving: safeReportValue(project.expectedEnergySaving),
        emissionFactor: safeReportValue(project.carbonFootprint?.emissionFactor),
        estimatedCO2Reduction: safeReportValue(project.carbonFootprint?.estimatedCO2Reduction || project.co2Reduction),
        calculationBasis: safeReportValue(project.carbonFootprint?.calculationBasis) !== "Data required"
          ? safeReportValue(project.carbonFootprint?.calculationBasis)
          : "Annual energy saving from Excel x applicable grid emission factor",
        remarks: safeReportValue(project.carbonFootprint?.remarks),
      },
    },
    index
  );

  if (!activities.length && !asArray(normalizedProject.keyActivities).length) {
    normalizedProject.keyActivities = [
      { activity: "Detailed engineering and procurement" },
      { activity: "Installation and commissioning" },
      { activity: "Performance verification" },
    ];
  }

  return normalizedProject;
}

function buildCommercialBuildingEnergyAuditBaseData({
  inputDetails = {},
  extractedExcelData = {},
  uploadedFiles = [],
}) {
  const cleanedProjects = cleanAndDeduplicateProjects(extractedExcelData?.projects || [])
    .map((project, index) => buildDeterministicProject(project, index));
  const groupedProjects = buildProjectGroups(cleanedProjects);

  const totalEnergySaving = cleanedProjects.reduce((sum, project) => sum + numberOrZero(project.expectedEnergySaving), 0);
  const totalAnnualSaving = cleanedProjects.reduce((sum, project) => sum + numberOrZero(project.expectedAnnualCostSaving), 0);
  const totalInvestment = cleanedProjects.reduce((sum, project) => sum + numberOrZero(project.estimatedInvestment), 0);
  const simplePayback = totalAnnualSaving > 0 ? Number((totalInvestment / totalAnnualSaving).toFixed(2)) : "Data required";

  const categorySummary = groupedProjects.map((group) => ({
    groupNo: group.groupNo,
    groupTitle: group.groupTitle,
    projectCount: group.projects.length,
    totalEnergySaving: group.totalEnergySaving || 0,
    totalAnnualCostSaving: group.totalAnnualSaving || 0,
    totalEstimatedInvestment: group.totalInvestment || 0,
    weightedPayback: group.weightedPayback || "Data required",
  }));
  const datasetProfile = extractedExcelData?.datasetProfile || null;

  return {
    reportInfo: {
      reportTitle: "Detailed Energy Audit Report",
      clientName: inputDetails.clientName || inputDetails.facilityName || "Data required",
      buildingType: inputDetails.buildingType || "Industrial Facility",
      location: inputDetails.location || "Data required",
      auditPeriod: inputDetails.auditPeriod || "Data required",
      reportDate: inputDetails.reportDate || "Data required",
      preparedBy: "SEE-Tech Solutions",
      documentVersion: "Draft",
    },
    executiveSummary: {
      purposeText:
        "The detailed energy audit identifies energy conservation measures directly from the uploaded Excel workbook and evaluates them for technical feasibility, implementation practicality, and financial attractiveness.",
      totalAnnualElectricityConsumption: extractedExcelData?.annualElectricityConsumption || "Data required",
      annualElectricityCost: extractedExcelData?.annualElectricityCost || "Data required",
      averageTariff: extractedExcelData?.averageTariff || "Data required",
      numberOfProjects: cleanedProjects.length,
      totalEnergySavingPotential: totalEnergySaving,
      totalAnnualCostSavingPotential: totalAnnualSaving,
      totalEstimatedInvestment: totalInvestment,
      simplePaybackPeriod: simplePayback,
      co2ReductionPotential: extractedExcelData?.co2Reduction || "Data required",
      keyObservations: groupedProjects.map((group) =>
        `${group.groupTitle} includes ${group.projects.length} ECMs with combined annual saving of ${group.totalAnnualSaving || 0}.`
      ),
      conclusionAndWayForward: [
        { step: 1, action: "Validate the extracted ECM list against the uploaded workbook." },
        { step: 2, action: "Prioritize ECMs based on savings, implementation complexity, and project phasing." },
        { step: 3, action: "Proceed with detailed engineering, procurement, and implementation planning." },
        { step: 4, action: "Monitor post-implementation performance and document verified savings." },
      ],
      categorySummary,
    },
    buildingProfile: {
      facilityName: inputDetails.facilityName || inputDetails.clientName || "Data required",
      address: inputDetails.address || inputDetails.location || "Data required",
      typeOfBuilding: inputDetails.buildingType || "Industrial Facility",
      facilityContactPerson: inputDetails.contactPerson || "Data required",
      fileInputs: uploadedFiles.map((file) => file.filename),
    },
    annexures: [],
    qcSummary: {
      expectedProjectCount: cleanedProjects.length,
      extractedProjectCount: extractedExcelData?.projects?.length || 0,
      finalProjectCount: cleanedProjects.length,
      groupCount: groupedProjects.length,
      groupWiseCount: Object.fromEntries(groupedProjects.map((group) => [group.groupTitle, group.projects.length])),
      datasetProfile,
      mappingConfidence: extractedExcelData?.mappingConfidence || [],
      excelTruthLocked: true,
    },
    projects: cleanedProjects,
    groupedProjects,
  };
}

const PROJECT_NARRATIVE_FIELDS = [
  "existingOperatingCondition",
  "existingSystemDescription",
  "problemGapIdentified",
  "proposedIntervention",
  "proposedProjectDescription",
  "scopeOfWork",
  "keyActivities",
  "rationaleForEnergySaving",
  "energySavingCalculation",
  "technicalSpecifications",
  "schematicFramework",
  "precautions",
  "measurementVerificationPlan",
  "benefitsOtherThanEnergySaving",
  "caseStudies",
  "finalConclusion",
];

function mergeNarrativeProject(baseProject, aiProject, index = 0) {
  const merged = { ...baseProject };
  const candidate = aiProject && typeof aiProject === "object" ? aiProject : {};

  for (const field of PROJECT_NARRATIVE_FIELDS) {
    const value = candidate[field];
    if (value === undefined || value === null || value === "") continue;

    if (Array.isArray(baseProject[field])) {
      merged[field] = asArray(value).length ? asArray(value) : baseProject[field];
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const safeValue = safeReportValue(value);
      if (safeValue !== "Data required") {
        merged[field] = safeValue;
      }
    } else if (typeof value === "object") {
      merged[field] = value;
    }
  }

  return buildDeterministicProject(merged, index);
}

function mergeNarrativesIntoBaseReport(baseReportData, aiReportData) {
  const base = normalizeReportForExport(baseReportData);
  const ai = aiReportData && typeof aiReportData === "object" ? aiReportData : {};
  const aiProjects = getProjectsForQC(ai);

  const aiByProjectNo = new Map();
  const aiByTitle = new Map();
  aiProjects.forEach((project) => {
    const projectNo = safeReportValue(project.projectNo);
    const title = safeReportValue(project.projectTitle || project.title).toLowerCase();
    if (projectNo !== "Data required") aiByProjectNo.set(projectNo, project);
    if (title && title !== "data required") aiByTitle.set(title, project);
  });

  const mergedProjects = base.projects.map((project, index) => {
    const byNo = aiByProjectNo.get(safeReportValue(project.projectNo));
    const byTitle = aiByTitle.get(safeReportValue(project.projectTitle).toLowerCase());
    return mergeNarrativeProject(project, byNo || byTitle, index);
  });

  const groupedProjects = buildProjectGroups(mergedProjects);
  const aiExecutiveSummary = ai.executiveSummary && typeof ai.executiveSummary === "object" ? ai.executiveSummary : {};

  return {
    ...base,
    reportInfo: {
      ...base.reportInfo,
      ...(ai.reportInfo && typeof ai.reportInfo === "object" ? {
        preparedBy: safeReportValue(ai.reportInfo.preparedBy) !== "Data required" ? safeReportValue(ai.reportInfo.preparedBy) : base.reportInfo.preparedBy,
        documentVersion: safeReportValue(ai.reportInfo.documentVersion) !== "Data required" ? safeReportValue(ai.reportInfo.documentVersion) : base.reportInfo.documentVersion,
      } : {}),
    },
    executiveSummary: {
      ...base.executiveSummary,
      purposeText: safeReportValue(aiExecutiveSummary.purposeText) !== "Data required"
        ? safeReportValue(aiExecutiveSummary.purposeText)
        : base.executiveSummary.purposeText,
      keyObservations: asArray(aiExecutiveSummary.keyObservations).length
        ? asArray(aiExecutiveSummary.keyObservations)
        : base.executiveSummary.keyObservations,
      conclusionAndWayForward: asArray(aiExecutiveSummary.conclusionAndWayForward).length
        ? asArray(aiExecutiveSummary.conclusionAndWayForward)
        : base.executiveSummary.conclusionAndWayForward,
      overallObservations: asArray(aiExecutiveSummary.overallObservations).length
        ? asArray(aiExecutiveSummary.overallObservations)
        : asArray(base.executiveSummary.overallObservations),
    },
    projects: mergedProjects,
    groupedProjects,
    qcSummary: {
      ...(base.qcSummary || {}),
      finalProjectCount: mergedProjects.length,
      groupCount: groupedProjects.length,
      groupWiseCount: Object.fromEntries(groupedProjects.map((group) => [group.groupTitle, group.projects.length])),
      excelTruthLocked: true,
      aiNarrativeStatus: aiProjects.length ? "merged" : "deterministic_fallback",
    },
  };
}

function calculateReportAccuracyScore(reportData) {
  const normalized = normalizeReportForExport(reportData);
  const qc = runReportQC(normalized);
  const mappingConfidence = asArray(normalized?.qcSummary?.mappingConfidence);
  const datasetProfile = normalized?.qcSummary?.datasetProfile || null;
  const groupWiseCount = normalized?.qcSummary?.groupWiseCount || {};
  let score = 0;
  const breakdown = [];

  const expectedCountMatched = datasetProfile
    ? Number(normalized?.projects?.length || 0) === Number(datasetProfile.expectedEcmCount || 0)
    : Number(normalized?.projects?.length || 0) > 0;
  if (expectedCountMatched) score += 20;
  breakdown.push({ label: "Expected ECM count achieved", points: expectedCountMatched ? 20 : 0, max: 20 });

  const criticalFields = mappingConfidence.filter((item) =>
    ["projectTitle", "system", "energySaving", "annualSaving", "investment", "payback"].includes(item.fieldName)
  );
  const highConfidenceMapped = criticalFields.length > 0 && criticalFields.every((item) => item.accepted && item.confidence >= 85);
  if (highConfidenceMapped) score += 15;
  breakdown.push({ label: "Critical columns mapped with high confidence", points: highConfidenceMapped ? 15 : 0, max: 15 });

  const noCrossFieldErrors =
    (qc.summary?.numericSystemCount || 0) === 0 &&
    (qc.summary?.wrongEnergySavingCount || 0) === 0 &&
    (qc.summary?.missingEquipmentCount || 0) === 0;
  if (noCrossFieldErrors) score += 15;
  breakdown.push({ label: "No cross-field sanity errors", points: noCrossFieldErrors ? 15 : 0, max: 15 });

  const groupCountsMatch = datasetProfile
    ? Object.entries(datasetProfile.expectedGroups || {}).every(([groupTitle, count]) => groupWiseCount[groupTitle] === count)
    : Object.keys(groupWiseCount).length > 0;
  if (groupCountsMatch) score += 15;
  breakdown.push({ label: "Group-wise count correct", points: groupCountsMatch ? 15 : 0, max: 15 });

  const equipmentMapped = asArray(normalized.projects).every((project) => safeReportValue(project.equipmentCovered) !== "Data required");
  if (equipmentMapped) score += 10;
  breakdown.push({ label: "Equipment names mapped", points: equipmentMapped ? 10 : 0, max: 10 });

  const narrativesSpecific = asArray(normalized.projects).every((project) => {
    const text = [
      project.existingOperatingCondition,
      project.proposedIntervention,
      project.rationaleForEnergySaving,
      project.finalConclusion,
    ]
      .map((value) => safeReportValue(value).toLowerCase())
      .join(" ");
    return !text.includes("the existing system operates at standard efficiency levels");
  });
  if (narrativesSpecific) score += 10;
  breakdown.push({ label: "Project-specific narratives generated", points: narrativesSpecific ? 10 : 0, max: 10 });

  const excelTruthPreserved = normalized?.qcSummary?.excelTruthLocked === true;
  if (excelTruthPreserved) score += 10;
  breakdown.push({ label: "Excel truth preserved after AI", points: excelTruthPreserved ? 10 : 0, max: 10 });

  if (qc.qcPassed) score += 5;
  breakdown.push({ label: "Export QC passed", points: qc.qcPassed ? 5 : 0, max: 5 });

  return {
    score,
    passed: !datasetProfile ? score >= 75 : score >= 85,
    breakdown,
    qcSummary: qc.summary,
  };
}

function validateCommercialBuildingEnergyAuditSchema(reportData) {
  const normalized = normalizeReportForExport(reportData);
  const errors = [];

  if (!normalized.reportInfo || typeof normalized.reportInfo !== "object") {
    errors.push("reportInfo is missing.");
  }
  if (!normalized.executiveSummary || typeof normalized.executiveSummary !== "object") {
    errors.push("executiveSummary is missing.");
  }
  if (!Array.isArray(normalized.projects)) {
    errors.push("projects must be an array.");
  }
  if (!Array.isArray(normalized.groupedProjects)) {
    errors.push("groupedProjects must be an array.");
  }
  if (!Array.isArray(normalized.annexures || [])) {
    errors.push("annexures must be an array when present.");
  }

  normalized.projects.forEach((project, index) => {
    if (safeReportValue(project.projectTitle) === "Data required") {
      errors.push(`projects[${index}].projectTitle is missing.`);
    }
    if (safeReportValue(project.equipmentCovered) === "Data required") {
      errors.push(`projects[${index}].equipmentCovered is missing.`);
    }
  });

  return {
    success: errors.length === 0,
    errors,
  };
}

/**
 * Deterministic local fallback mapper for the Commercial Building Energy Audit Template
 */
function buildCommercialBuildingEnergyAuditFallback({
  inputDetails = {},
  extractedExcelData = {},
  uploadedFiles = [],
}) {
  return buildCommercialBuildingEnergyAuditBaseData({
    inputDetails,
    extractedExcelData,
    uploadedFiles,
  });
}

/**
 * Cleans the raw text response to ensure valid JSON is returned
 */
function stripMarkdownFences(rawText = "") {
  let cleaned = String(rawText || "").trim();
  cleaned = cleaned.replace(/^```(json)?/im, "");
  cleaned = cleaned.replace(/```$/im, "");
  return cleaned.trim();
}

function safeParseAiJson(content) {
  if (!content || typeof content !== "string") {
    throw new Error("AI returned empty content");
  }

  const cleaned = content
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in AI response");
  }

  const jsonText = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`AI JSON parse failed: ${error.message}`);
  }
}

function cleanJsonResponse(rawText) {
  return safeParseAiJson(rawText);
}

function getOpenRouterModels() {
  const models = process.env.OPENROUTER_MODELS
    ? process.env.OPENROUTER_MODELS.split(",").map((m) => m.trim()).filter(Boolean)
    : process.env.OPENROUTER_MODEL
      ? [process.env.OPENROUTER_MODEL]
      : [];
      
  console.log("[OPENROUTER MODELS PARSED]", models);
  
  if (!models || models.length === 0) {
    console.error("OPENROUTER_MODELS missing in runtime env");
  }
  
  return models;
}

async function callOpenRouterModel(model, messages, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS || 30000);

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "SEE-Tech AI Report Generator"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: Number(process.env.OPENROUTER_TEMPERATURE || 0.2),
        max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 12000)
      }),
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenRouter returned no message content");
    }

    return {
      content,
      raw: data
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithOpenRouterFallback(messages, options = {}) {
  const skipLlmForDev =
    process.env.NODE_ENV === "development" &&
    String(process.env.SKIP_LLM_FOR_DEV || "false").toLowerCase() === "true";
  const models = getOpenRouterModels();
  const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS || 30000);

  if (!process.env.OPENROUTER_API_KEY) {
    return {
      success: false,
      providerUsed: "deterministic-fallback",
      providerStatus: "fallback",
      modelUsed: null,
      providerAttempts: [],
      error: "OPENROUTER_API_KEY missing"
    };
  }

  if (!models.length) {
    return {
      success: false,
      providerUsed: "deterministic-fallback",
      providerStatus: "fallback",
      modelUsed: null,
      providerAttempts: [],
      error: "No OpenRouter models configured"
    };
  }

  if (skipLlmForDev && !options?.isManualEnhancement) {
    return {
      success: false,
      providerUsed: "deterministic-fallback",
      providerStatus: "fallback",
      modelUsed: null,
      providerAttempts: [],
      error: "SKIP_LLM_FOR_DEV enabled",
    };
  }

  const attempts = [];
  console.log(`[LLM OPENROUTER] Using models ${models.join(",")} with timeout ${timeoutMs}ms`);

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const attempt = {
      order: i + 1,
      model,
      status: "started",
      startedAt: new Date().toISOString()
    };
    attempts.push(attempt);

    try {
      console.log(`[LLM] Trying model ${i + 1}/${models.length}: ${model}`);
      const result = await callOpenRouterModel(model, messages, options);

      if (result && result.content) {
        let parsedData = null;
        try {
          parsedData = cleanJsonResponse(result.content);
        } catch (parseError) {
          console.warn(`[LLM] OpenRouter model ${model} returned invalid JSON: ${parseError.message}`);
          attempt.status = "failed";
          attempt.reason = `Invalid JSON returned: ${parseError.message}`;
          attempt.jsonValid = false;
          attempt.finishedAt = new Date().toISOString();
          continue;
        }

        console.log(`[LLM] OpenRouter model succeeded: ${model}`);
        attempt.status = "success";
        attempt.finishedAt = new Date().toISOString();
        attempt.jsonValid = true;
        return {
          success: true,
          providerUsed: "openrouter",
          providerStatus: "success",
          modelUsed: model,
          providerAttempts: attempts,
          content: result.content,
          parsedData: parsedData,
          raw: result.raw,
          attempts
        };
      }

      attempt.status = "failed";
      attempt.reason = "Empty content returned";
      attempt.jsonValid = false;
      attempt.finishedAt = new Date().toISOString();
    } catch (error) {
      if (error.message.includes("timed out")) {
        console.warn(`[LLM] Model timed out after ${timeoutMs}ms: ${model}`);
      } else {
        console.warn(`[LLM] OpenRouter model failed: ${model}`, error.message);
      }
      attempt.status = "failed";
      attempt.reason = error.message;
      attempt.jsonValid = false;
      attempt.finishedAt = new Date().toISOString();
      continue;
    }
  }

  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODELS && attempts.length === 0) {
    console.error("[BUG] OpenRouter configured but providerAttempts is empty. Provider flow was skipped.");
  }

  return {
    success: false,
    providerUsed: "deterministic-fallback",
    providerStatus: "fallback",
    modelUsed: null,
    providerAttempts: attempts,
    error: "All OpenRouter models failed",
    attempts
  };
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
  baseReportData,
}) {
  let providerUsed = "none";
  let fallbackReason = "";
  let finalReportData = null;
  const metadata = {};

  console.log("[LLM] Provider:", process.env.LLM_PROVIDER);
  console.log("[LLM] OpenRouter key present:", Boolean(process.env.OPENROUTER_API_KEY));
  console.log("[LLM] OpenRouter model:", process.env.OPENROUTER_MODEL);

  const preferredProvider = process.env.LLM_PROVIDER;

  // A. Try AnythingLLM if explicitly enabled and configured
  if (
    (preferredProvider === "anythingllm" || templateConfig?.useAnythingLLM === true) &&
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
  if (!finalReportData && (!preferredProvider || preferredProvider === "openrouter") && process.env.OPENROUTER_API_KEY) {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];
    const openRouterResult = await generateWithOpenRouterFallback(messages);
    
    if (openRouterResult.success) {
      finalReportData = openRouterResult.parsedData;
      providerUsed = "openrouter";
      metadata.modelUsed = openRouterResult.modelUsed;
      metadata.providerStatus = openRouterResult.providerStatus || "success";
      metadata.providerAttempts = openRouterResult.providerAttempts || openRouterResult.attempts || [];
    } else {
      console.warn(`[generateWithProvider] OpenRouter models failed. Fallback reason: ${openRouterResult.error}`);
      fallbackReason += `OpenRouter: ${openRouterResult.error}; `;
      metadata.providerStatus = openRouterResult.providerStatus || "fallback";
      metadata.providerAttempts = openRouterResult.providerAttempts || openRouterResult.attempts || [];
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
      finalReportData = baseReportData || buildCommercialBuildingEnergyAuditFallback({
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
    finalReportData = mergeNarrativesIntoBaseReport(
      baseReportData || buildCommercialBuildingEnergyAuditFallback({
        inputDetails,
        extractedExcelData,
        uploadedFiles,
      }),
      finalReportData
    );
  }

  return {
    reportData: finalReportData,
    metadata: {
      providerUsed,
      providerStatus: metadata.providerStatus || (providerUsed === "deterministic_fallback" ? "fallback" : "success"),
      fallbackReason,
      ...metadata,
    },
  };
}

module.exports = {
  generateWithProvider,
  buildCommercialBuildingEnergyAuditFallback,
  buildCommercialBuildingEnergyAuditBaseData,
  mergeNarrativesIntoBaseReport,
  validateCommercialBuildingEnergyAuditSchema,
  calculateReportAccuracyScore,
  cleanJsonResponse,
  generateWithOpenRouterFallback,
  asArray,
  safeReportValue,
  groupAndSortProjects,
  cleanAndDeduplicateProjects,
  buildProjectGroups,
  getProjectsForQC,
  normalizeReportForExport,
  runReportQC,
  getBinaryFlag,
  setFieldFlag,
  buildFieldFlags,
  buildMissingFieldSummary,
  stripDebugMetadata
};
