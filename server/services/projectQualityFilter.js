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

  if ((payback ?? 0) > 25) {
    return true;
  }

  if ((investment === null || investment <= 0) && Math.abs(annualSaving ?? 0) <= 1 && Math.abs(energySaving ?? 0) <= 1) {
    return true;
  }

  return false;
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
  const groups = normalizeGroups(reportData);
  const nextGroups = [];
  let sourceCount = 0;
  let rejectedCount = 0;
  const dedupeState = {
    seen: new Set(),
    titleSeen: new Set(),
  };

  groups.forEach((group, groupIndex) => {
    const groupProjects = safeArray(group?.projects).filter(
      (project) => !looksLikeFallbackEquipmentRow(project)
    );
    const dedupedProjects = dedupeProjects(groupProjects, dedupeState);
    const result = {
      projects: dedupedProjects,
      rejectedCount: safeArray(group?.projects).length - dedupedProjects.length,
      sourceCount: safeArray(group?.projects).length,
    };
    sourceCount += result.sourceCount;
    rejectedCount += result.rejectedCount;

    if (!result.projects.length) return;

    nextGroups.push({
      ...group,
      groupNo: group?.groupNo || `GR-${groupIndex + 1}`,
      groupTitle: group?.groupTitle || group?.title || `Group ${groupIndex + 1}`,
      projects: result.projects,
    });
  });

  const flatProjects = nextGroups.flatMap((group) => safeArray(group.projects));

  return {
    ...reportData,
    groups: nextGroups,
    groupedProjects: nextGroups,
    projects: flatProjects,
    executiveSummary: {
      ...(reportData.executiveSummary || {}),
      summaryOfIdentifiedProjects: flatProjects,
    },
    filteringMeta: {
      ...(reportData.filteringMeta || {}),
      sourceCount,
      rejectedCount,
      retainedCount: flatProjects.length,
    },
  };
}

module.exports = {
  filterReportProjects,
  looksLikeFallbackEquipmentRow,
};
