const { normalizeReportGroups } = require("../utils/groupHelper");
function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(project|ecm|measure)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value ?? "")
    .replace(/[,₹$%]/g, "")
    .replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

const ECM_ACTION_KEYWORDS = [
  "replace",
  "retrofit",
  "optimization",
  "optimisation",
  "improvement",
  "recovery",
  "reduce",
  "reduction",
  "control",
  "management",
  "segregation",
  "bypass",
  "upgrade",
  "install",
  "installation",
  "vfd",
  "ie5",
  "ie4",
  "apfc",
  "servo",
  "fan",
  "pump",
  "motor",
  "chiller",
  "cooling tower",
  "compressed air",
  "blower",
];

function titleLooksLikeEquipmentOnly(title) {
  const normalized = normalizeText(title);
  if (!normalized) return true;
  if (/^(total|subtotal|grand total|summary|remarks|note|notes)$/.test(normalized)) {
    return true;
  }
  if (/^\d+(\.\d+)?\s*(kw|hp|tr|m3 min|cfm|dph|mb|m)$/i.test(String(title || "").trim())) {
    return true;
  }
  if (/^\d+\s/.test(String(title || "").trim()) && !ECM_ACTION_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length < 3 && !ECM_ACTION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function looksLikeFallbackEquipmentRow(project = {}) {
  const title = String(
    project.projectTitle ||
      project.title ||
      project.ecmName ||
      project.description ||
      ""
  ).trim();
  const normalizedTitle = normalizeText(title);
  const normalizedSystem = normalizeText(project.system || project.category || "");

  const investment = toNumber(
    project.estimatedInvestment ?? project.investment ?? project.investmentRaw
  );
  const annualSaving = toNumber(
    project.expectedAnnualCostSaving ?? project.annualSaving ?? project.annualSavingRaw
  );
  const energySaving = toNumber(
    project.expectedEnergySaving ?? project.energySaving ?? project.energySavingRaw
  );
  const payback = toNumber(
    project.simplePaybackPeriod ?? project.payback ?? project.paybackRaw
  );

  if (
    project.fallbackGenerated === true ||
    project.isFallback === true ||
    normalizedSystem.includes("fallback")
  ) {
    return true;
  }

  if (
    normalizedTitle.includes("fallback") ||
    normalizedTitle.includes("data required") ||
    normalizedTitle === "na"
  ) {
    return true;
  }

  if (titleLooksLikeEquipmentOnly(title)) {
    return true;
  }

  if ((annualSaving ?? 0) < 0 || (energySaving ?? 0) < 0) {
    return true;
  }

  if ((payback ?? 0) > 150) {
    return true;
  }

  if ((investment === null || investment <= 0) && Math.abs(annualSaving ?? 0) <= 1 && Math.abs(energySaving ?? 0) <= 1) {
    return true;
  }

  return false;
}

function isValidEcmProject(ecm) {
  const title = String(ecm?.projectTitle || ecm?.title || ecm?.measure || ecm?.ecmName || "").trim();

  const hasEcmNo =
    ecm?.ecmNo !== null &&
    ecm?.ecmNo !== undefined &&
    String(ecm.ecmNo).trim() !== "";

  const hasTitle = title.length > 3;

  const hasSavingKwh = Number(ecm?.energySavingKwh || ecm?.savingKwh || ecm?.energySavingRaw || ecm?.expectedEnergySaving || ecm?.energySaving || 0) > 0;
  const hasAnnualSaving = Number(ecm?.annualSavingRs || ecm?.annualSaving || ecm?.annualSavingRaw || ecm?.expectedAnnualCostSaving || 0) > 0;

  const investmentVal = ecm?.investmentRs ?? ecm?.investmentRaw ?? ecm?.estimatedInvestment ?? ecm?.investment;
  const hasInvestment = investmentVal !== null && investmentVal !== undefined && !Number.isNaN(Number(investmentVal));

  const hasPayback = Number(ecm?.paybackMonths || ecm?.paybackMonthsRaw || ecm?.simplePaybackPeriod || ecm?.paybackRaw || ecm?.payback || 0) > 0;

  return hasEcmNo || hasTitle || hasSavingKwh || hasAnnualSaving || hasInvestment || hasPayback;
}

function calculatePaybackMonths(investmentRs, annualSavingRs) {
  const investment = Number(investmentRs || 0);
  const annualSaving = Number(annualSavingRs || 0);

  if (investment === 0 && annualSaving > 0) return 0;
  if (investment > 0 && annualSaving > 0) return Number(((investment / annualSaving) * 12).toFixed(2));
  return null;
}

function projectStableKey(project = {}) {
  const projectNo = normalizeText(project.projectNo || project.ecmNo || "");
  const title = normalizeText(
    project.projectTitle || project.title || project.ecmName || project.description || ""
  );
  const system = normalizeText(project.system || project.category || "");
  const equipment = normalizeText(project.equipmentCovered || project.equipment || "");
  return [projectNo, title, system || equipment].filter(Boolean).join("|");
}

function dedupeProjects(projects = [], state = {}) {
  const seen = state.seen || new Set();
  const titleSeen = state.titleSeen || new Set();
  const deduped = [];

  for (const project of safeArray(projects)) {
    const stableKey = projectStableKey(project);
    const titleKey = normalizeText(
      project.projectTitle || project.title || project.ecmName || project.description || ""
    );

    if (stableKey && seen.has(stableKey)) {
      continue;
    }

    if (titleKey) {
      const duplicateTitleKey = `${normalizeText(project.projectNo || project.ecmNo || "")}|${titleKey}`;
      console.log(`[DEDUPE_FILTER] ecmNo=${project.ecmNo}, projectNo=${project.projectNo}, duplicateTitleKey=${duplicateTitleKey}`);
      if (titleSeen.has(duplicateTitleKey)) {
        continue;
      }
      titleSeen.add(duplicateTitleKey);
    }

    if (stableKey) {
      seen.add(stableKey);
    }

    deduped.push(project);
  }

  return deduped;
}

function filterAndStabilizeProjects(projects = []) {
  const accepted = [];
  const rejected = [];

  for (const project of safeArray(projects)) {
    if (looksLikeFallbackEquipmentRow(project)) {
      console.log("[DEBUG] Filter dropped project:", project.ecmNo, project.title);
      rejected.push(project);
      continue;
    }
    accepted.push(project);
  }

  const deduped = dedupeProjects(accepted);
  const dedupeRejectedCount = accepted.length - deduped.length;

  return {
    projects: deduped,
    rejectedCount: rejected.length + dedupeRejectedCount,
    sourceCount: safeArray(projects).length,
  };
}

function normalizeGroups(reportData = {}) {
      return normalizeReportGroups(reportData).groups;
    }

function filterReportProjects(reportData = {}) {
  const isGrouped = reportData.hasExplicitEcmGrouping === true;
  const projectsToFilter = isGrouped && Array.isArray(reportData.groups) && reportData.groups.length > 0
    ? reportData.groups.flatMap(g => g.projects || [])
    : (reportData.projects || []);

  const accepted = [];
  const rejected = [];

  console.log("[ECM_BEFORE_QUALITY_FILTER]", {
    count: projectsToFilter.length,
    rows: projectsToFilter.map(e => ({
      ecmNo: e.ecmNo,
      projectTitle: e.projectTitle || e.title,
      energySavingKwh: e.energySavingRaw || e.energySaving,
      annualSavingRs: e.annualSavingRaw || e.annualSaving,
      investmentRs: e.investmentRaw || e.investment,
      groupName: e.groupName,
      groupNo: e.groupNo,
      source: e.sourceTrace?.extractionMethod
    }))
  });

  for (const project of projectsToFilter) {
    if (isValidEcmProject(project)) {
      // Calculate missing payback
      const investment = project.investmentRaw ?? project.investment;
      const annualSaving = project.annualSavingRaw ?? project.annualSaving;
      const paybackCalculated = calculatePaybackMonths(investment, annualSaving);
      if (paybackCalculated !== null && project.paybackMonthsRaw == null && !project.simplePaybackPeriod) {
        project.paybackMonthsRaw = paybackCalculated;
        project.simplePaybackPeriod = paybackCalculated > 0 ? (paybackCalculated / 12).toFixed(2) : 0;
      }
      accepted.push(project);
    } else {
      console.log("[ECM_REJECTED_BY_QUALITY_FILTER]", {
        ecmNo: project.ecmNo,
        projectTitle: project.projectTitle || project.title,
        reason: "Failed relaxed validation",
        row: project
      });
      rejected.push(project);
    }
  }

  let filteredEcms = accepted; // No aggressive dedupe for now

  if (!filteredEcms.length && projectsToFilter.length > 0) {
    console.warn("[ECM_FILTER_REMOVED_ALL_ROWS_RESTORING_ORIGINALS]", { originalCount: projectsToFilter.length });
    filteredEcms = projectsToFilter;
  }

  console.log("[ECM_AFTER_QUALITY_FILTER]", {
    count: filteredEcms.length,
    rows: filteredEcms.map(e => ({
      ecmNo: e.ecmNo,
      projectTitle: e.projectTitle || e.title,
      energySavingKwh: e.energySavingRaw || e.energySaving,
      annualSavingRs: e.annualSavingRaw || e.annualSaving,
      investmentRs: e.investmentRaw || e.investment,
      groupName: e.groupName,
      groupNo: e.groupNo
    }))
  });

  let nextGroups = [];
  if (isGrouped && Array.isArray(reportData.groups)) {
    reportData.groups.forEach((group, groupIndex) => {
      const groupProjs = filteredEcms.filter(p => p.groupNo === group.groupNo || (group.projects || []).includes(p));
      if (groupProjs.length > 0) {
        nextGroups.push({
          ...group,
          projects: groupProjs
        });
      }
    });
  }

  const finalProjects = isGrouped ? nextGroups.flatMap(g => g.projects) : filteredEcms;

  console.log("[FINAL_ECM_COUNT_BEFORE_RESPONSE]", {
    ecmCount: finalProjects.length,
    hasExplicitEcmGrouping: reportData.hasExplicitEcmGrouping,
    groupCount: nextGroups.length
  });

  return {
    ...reportData,
    groups: nextGroups,
    groupedProjects: nextGroups,
    projects: finalProjects,
    executiveSummary: {
      ...(reportData.executiveSummary || {}),
      summaryOfIdentifiedProjects: finalProjects,
    },
    filteringMeta: {
      ...(reportData.filteringMeta || {}),
      sourceCount: projectsToFilter.length,
      rejectedCount: rejected.length,
      retainedCount: finalProjects.length,
    },
  };
}

module.exports = {
  filterReportProjects,
  looksLikeFallbackEquipmentRow,
};
