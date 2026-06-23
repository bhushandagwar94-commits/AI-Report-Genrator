
function normalizeReportGroups(reportData) {
  if (!reportData || typeof reportData !== "object") {
    return {
      templateId: "commercial-building-energy-audit",
      extractionFormat: "safe_empty_report",
      groups: [],
      projects: [],
      summary: {},
      executiveSummary: {},
      validationWarnings: ["Report data was empty or null before group normalization."]
    };
  }

  const normalized = { ...reportData };

  if (!Array.isArray(normalized.groups)) {
    if (Array.isArray(normalized.projects) && normalized.projects.length > 0) {
      normalized.groups = [];
    } else {
      normalized.groups = [];
    }
  }

  normalized.groups = normalized.groups.map((group, index) => ({
    groupNo: group.groupNo || "",
    groupName: group.groupName || group.name || group.groupTitle || "",
    projects: Array.isArray(group.projects) ? group.projects : []
  }));

  return normalized;
}

module.exports = {
  normalizeReportGroups
};
