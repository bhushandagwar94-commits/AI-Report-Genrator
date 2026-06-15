function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

const FORBIDDEN_PATTERNS = [
  /data required/i,
  /\bundefined\b/i,
  /\bnull\b/i,
  /^\s*explain\b/i,
];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEcmNo(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? String(Number(match[1])) : "";
}

function wordCount(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function isPlaceholder(value) {
  const text = normalizeText(value).toLowerCase();
  return (
    !text ||
    text === "to be updated" ||
    text === "data required" ||
    text.includes("[to be updated") ||
    text.includes("[calculation pending") ||
    text === "null" ||
    text === "undefined"
  );
}

function isCleanText(value) {
  const text = normalizeText(value);
  if (!text) return false;
  return !FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

function ensureBulletText(value) {
  const text = normalizeText(value);
  if (!text) return "";
  if (text.includes("•")) return text;
  return text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `• ${line}`)
    .join("\n");
}

function mergeAdditively(existingValue, incomingValue) {
  const existing = normalizeText(existingValue);
  const incoming = ensureBulletText(incomingValue);

  if (!incoming) return existing;
  if (!existing || isPlaceholder(existing)) return incoming;
  if (incoming.toLowerCase().includes(existing.toLowerCase())) return incoming;
  if (existing.toLowerCase().includes(incoming.toLowerCase())) return existing;
  if (wordCount(incoming) >= wordCount(existing)) {
    return `${ensureBulletText(existing)}\n• Additional engineering analysis:\n${incoming}`;
  }
  return existing;
}

function mergeList(existing = [], incoming = []) {
  const result = safeArray(existing).map((item) => normalizeText(item)).filter(Boolean);
  safeArray(incoming)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .forEach((item) => {
      if (!result.some((entry) => entry.toLowerCase() === item.toLowerCase())) {
        result.push(item);
      }
    });
  return result;
}

function asList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|;|,(?=\s*[A-Z0-9])/)
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  return [];
}

function extractNumbers(value) {
  return (
    String(value || "").match(
      /[-+]?\d*\.?\d+(?:,\d{3})*(?:%|kwh|kw|rs|₹|inr|months|years)?/gi
    ) || []
  );
}

function numbersChanged(existingValue, newValue) {
  const oldNumbers = extractNumbers(existingValue).map((item) => item.toLowerCase());
  const newNumbers = extractNumbers(newValue).map((item) => item.toLowerCase());

  if (!oldNumbers.length) return false;
  return oldNumbers.some((num) => !newNumbers.includes(num));
}

function buildEnhancedNarrative(enhancement) {
  const parts = [
    enhancement.existingCondition,
    enhancement.problemGap,
    enhancement.proposedProject,
    safeArray(enhancement.projectActivities).join(". "),
    safeArray(enhancement.benefits).join(". "),
    enhancement.conclusion,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  return parts.join("\n\n");
}

function normalizeEnhancementProject(project = {}, index = 0) {
  return {
    sourceIndex: index,
    ecmNo:
      project.ecmNo ||
      project.projectNo ||
      project.serialNo ||
      project.ecmNumber ||
      null,
    projectTitle:
      project.projectTitle ||
      project.title ||
      project.ecmName ||
      project.project ||
      null,
    existingCondition:
      project.existingCondition ||
      project.existingSystemDescription ||
      project.existingSystemBaselineCondition ||
      project.enhancedExistingCondition ||
      project.enhancedNarrative ||
      null,
    problemGap:
      project.problemGap ||
      project.problemGapIdentified ||
      project.rationaleForEnergySaving ||
      null,
    proposedProject:
      project.proposedProject ||
      project.proposedProjectDescription ||
      project.proposedEnergyConservationMeasure ||
      null,
    projectActivities:
      project.projectActivities ||
      project.keyActivities ||
      project.scopeOfWork ||
      [],
    benefits:
      project.benefits ||
      project.benefitsOtherThanEnergySaving ||
      [],
    conclusion:
      project.conclusion ||
      project.projectConclusion ||
      null,
    enhancedNarrative: project.enhancedNarrative || null,
    aiTextConverted: project.aiTextConverted === true,
  };
}

function findEnhancementForProject(project, enhancements, sequenceIndex = 0) {
  const projectEcm = normalizeEcmNo(project.ecmNo || project.projectNo);
  const projectTitle = normalizeKey(
    project.projectTitle || project.title || project.ecmName
  );

  const exactEcmMatch = enhancements.find(
    (item) => projectEcm && normalizeEcmNo(item.ecmNo) === projectEcm
  );
  if (exactEcmMatch) return exactEcmMatch;

  const titleMatch = enhancements.find((item) => {
    const itemTitle = normalizeKey(item.projectTitle);
    return (
      projectTitle &&
      itemTitle &&
      (projectTitle === itemTitle ||
        projectTitle.includes(itemTitle) ||
        itemTitle.includes(projectTitle))
    );
  });
  if (titleMatch) return titleMatch;

  return enhancements[sequenceIndex] || null;
}

function applyProjectText(project, fieldName, incomingValue) {
  if (!isCleanText(incomingValue)) return { accepted: false, changed: false };
  const mergedValue = mergeAdditively(project[fieldName], incomingValue);
  if (!mergedValue || mergedValue === normalizeText(project[fieldName])) {
    return { accepted: false, changed: false };
  }
  if (numbersChanged(project[fieldName], mergedValue)) {
    return { accepted: false, changed: false };
  }
  project[fieldName] = mergedValue;
  return { accepted: true, changed: true };
}

function applyProjectList(project, fieldName, incomingValue) {
  const incomingList = asList(incomingValue);
  if (!incomingList.length) return { accepted: false, changed: false };
  const mergedList = mergeList(project[fieldName], incomingList);
  if (mergedList.length === safeArray(project[fieldName]).length) {
    return { accepted: false, changed: false };
  }
  project[fieldName] = mergedList;
  return { accepted: true, changed: true };
}

function qcMergeAiEnhancement({
  baseReportData,
  aiOutput,
  providerAttempts = [],
  providerUsed = "ai",
  modelUsed = null,
}) {
  const reportData = JSON.parse(JSON.stringify(baseReportData || {}));
  const rawEnhancements = safeArray(aiOutput?.projectEnhancements).map(
    normalizeEnhancementProject
  );

  let fieldsAccepted = 0;
  let fieldsDropped = 0;
  let projectEnhancementsMatched = 0;
  let aiAppliedCount = 0;

  for (const [groupIndex, group] of safeArray(reportData.groups).entries()) {
    for (const [projectIndex, project] of safeArray(group.projects).entries()) {
      const enhancement = findEnhancementForProject(
        project,
        rawEnhancements,
        projectIndex
      );

      if (!enhancement) {
        fieldsDropped += 1;
        continue;
      }

      projectEnhancementsMatched += 1;
      let projectChanged = false;

      const textFields = [
        ["existingSystemDescription", enhancement.existingCondition],
        ["existingCondition", enhancement.existingCondition],
        ["problemGapIdentified", enhancement.problemGap],
        ["problemGap", enhancement.problemGap],
        ["rationaleForEnergySaving", enhancement.problemGap],
        ["proposedProject", enhancement.proposedProject],
        ["proposedProjectDescription", enhancement.proposedProject],
        ["conclusion", enhancement.conclusion],
      ];

      textFields.forEach(([fieldName, value]) => {
        const result = applyProjectText(project, fieldName, value);
        if (result.accepted) {
          fieldsAccepted += 1;
          projectChanged = true;
        }
      });

      const activitiesResult = applyProjectList(
        project,
        "keyActivities",
        enhancement.projectActivities
      );
      if (activitiesResult.accepted) {
        fieldsAccepted += 1;
        projectChanged = true;
      }
      if (project.keyActivities?.length) {
        project.projectActivities = mergeList(
          project.projectActivities,
          project.keyActivities
        );
      }

      const benefitsText = safeArray(enhancement.benefits)
        .map((item) => `• ${normalizeText(item)}`)
        .join("\n");
      const benefitsResult = applyProjectText(
        project,
        "benefitsOtherThanEnergySaving",
        benefitsText
      );
      if (benefitsResult.accepted) {
        fieldsAccepted += 1;
        projectChanged = true;
      }
      project.benefits = mergeList(project.benefits, enhancement.benefits);

      const enhancedNarrative = buildEnhancedNarrative(enhancement);
      if (isCleanText(enhancedNarrative)) {
        project.enhancedNarrative = mergeAdditively(
          project.enhancedNarrative,
          enhancedNarrative
        );
      }

      if (projectChanged) {
        aiAppliedCount += 1;
        project.aiEnhanced = true;
        project.enhancementMode = enhancement.aiTextConverted
          ? "ai-text-converted"
          : "ai-engineering";
        project.providerUsed = providerUsed;
        project.modelUsed = modelUsed;
      }

      reportData.groups[groupIndex].projects[projectIndex] = project;
    }
  }

  reportData.providerUsed = fieldsAccepted > 0 ? providerUsed : "deterministic-fallback";
  reportData.modelUsed = fieldsAccepted > 0 ? modelUsed : null;
  reportData.enhancementMode =
    fieldsAccepted > 0 ? "ai-engineering" : "deterministic-engineering-fallback";
  reportData.aiEnhancedCount = aiAppliedCount;

  return {
    reportData,
    aiEnhancementStatus: {
      status: fieldsAccepted > 0 ? "success" : "failed_non_blocking",
      finalEnhancerUsed:
        fieldsAccepted > 0 ? providerUsed : "local_deterministic_narrative",
      fieldsAccepted,
      fieldsDropped,
      projectEnhancementsReceived: rawEnhancements.length,
      projectEnhancementsMatched,
      aiAppliedCount,
      providerAttempts,
      providerUsed,
      modelUsed,
      enhancementMode:
        fieldsAccepted > 0
          ? "ai-engineering"
          : "deterministic-engineering-fallback",
    },
  };
}

module.exports = {
  qcMergeAiEnhancement,
  mergeAdditively,
  extractNumbers,
};
