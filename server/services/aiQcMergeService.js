function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

const ALLOWED_PROJECT_FIELDS = [
  "existingSystemDescription",
  "problemGapIdentified",
  "proposedProject",
  "scopeOfWork",
  "keyActivities",
  "rationaleForEnergySaving",
  "energySavingCalculation",
  "technicalSpecifications",
  "implementationDuration",
  "measurementVerificationPlan",
  "benefitsOtherThanEnergySaving",
  "carbonFootprintReduction",
  "conclusion"
];

const FORBIDDEN_PATTERNS = [
  /data required/i,
  /\[draft\]/i,
  /\bundefined\b/i,
  /\bnull\b/i,
  /^explain\b/i
];

function normalizeText(value) {
  return String(value || "").trim();
}

function wordCount(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function isPlaceholder(value) {
  const text = normalizeText(value).toLowerCase();

  return (
    !text ||
    text.includes("[to be updated") ||
    text.includes("[calculation pending") ||
    text === "null" ||
    text === "undefined" ||
    text === "data required"
  );
}

function ensureBulletFormat(value) {
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
  const incoming = ensureBulletFormat(incomingValue);

  if (!incoming) return existing;
  if (!existing || isPlaceholder(existing)) return incoming;

  const existingWords = wordCount(existing);
  const incomingWords = wordCount(incoming);

  // Never accept shorter AI output as replacement.
  if (incomingWords < existingWords) {
    return existing;
  }

  // If incoming already contains existing, accept incoming.
  if (incoming.toLowerCase().includes(existing.toLowerCase())) {
    return incoming;
  }

  // If existing already contains incoming, keep existing.
  if (existing.toLowerCase().includes(incoming.toLowerCase())) {
    return existing;
  }

  // Additive merge: preserve original text, append engineering expansion.
  return `${ensureBulletFormat(existing)}\n• Additional engineering analysis:\n${incoming}`;
}

function extractNumbers(value) {
  return String(value || "").match(/[-+]?\d*\.?\d+(?:,\d{3})*(?:%|kwh|kw|rs|₹|inr|months|years)?/gi) || [];
}

function numbersChanged(existingValue, newValue) {
  const oldNumbers = extractNumbers(existingValue).map((item) => item.toLowerCase());
  const newNumbers = extractNumbers(newValue).map((item) => item.toLowerCase());

  if (!oldNumbers.length) return false;

  return oldNumbers.some((num) => !newNumbers.includes(num));
}

function mergeObservationArrays(existing = [], incoming = []) {
  const result = [...existing];

  for (const item of incoming) {
    const text = normalizeText(item);
    if (!text) continue;

    const duplicate = result.some((old) =>
      normalizeText(old).toLowerCase() === text.toLowerCase()
    );

    if (!duplicate) result.push(text);
  }

  return result;
}

function isCleanText(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text) return false;
  return !FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s.-]/g, "")
    .trim();
}

function findEnhancementForProject(project, enhancements) {
  const projectEcm = normalizeKey(project.ecmNo);
  const projectTitle = normalizeKey(project.title || project.ecmName);

  return enhancements.find((item) => {
    const itemEcm = normalizeKey(item.ecmNo);
    const itemTitle = normalizeKey(item.title || item.ecmName);

    return (
      (projectEcm && itemEcm && projectEcm === itemEcm) ||
      (projectTitle && itemTitle && projectTitle === itemTitle) ||
      (projectTitle && itemTitle && (projectTitle.includes(itemTitle) || itemTitle.includes(projectTitle)))
    );
  });
}

function qcMergeAiEnhancement({ baseReportData, aiOutput, providerAttempts = [] }) {
  const reportData = JSON.parse(JSON.stringify(baseReportData || {}));

  let fieldsAccepted = 0;
  let fieldsDropped = 0;
  let forbiddenStringsDetected = 0;
  let changedNumbersDetected = 0;

  let executiveFieldsAccepted = 0;
  let projectEnhancementsMatched = 0;
  const dropReasons = {};

  function recordDrop(reason) {
    fieldsDropped += 1;
    dropReasons[reason] = (dropReasons[reason] || 0) + 1;
  }

  if (aiOutput?.executiveSummaryEnhancement && reportData.executiveSummary) {
    const exec = aiOutput.executiveSummaryEnhancement;

    if (isCleanText(exec.purposeText)) {
      if (isPlaceholder(reportData.executiveSummary.purposeText)) {
        reportData.executiveSummary.purposeText = exec.purposeText;
      } else {
        reportData.executiveSummary.purposeText = mergeAdditively(reportData.executiveSummary.purposeText, exec.purposeText);
      }
      executiveFieldsAccepted += 1;
    } else if (exec.purposeText) {
      recordDrop("forbidden_or_empty_purposeText");
    }

    if (Array.isArray(exec.keyObservations)) {
      const cleanItems = exec.keyObservations.filter(isCleanText);
      if (cleanItems.length) {
        reportData.executiveSummary.keyObservations = mergeObservationArrays(
          safeArray(reportData.executiveSummary.keyObservations),
          cleanItems
        );
        executiveFieldsAccepted += cleanItems.length;
      }
      if (exec.keyObservations.length !== cleanItems.length) {
        recordDrop("forbidden_keyObservations");
      }
    }

    if (isCleanText(exec.conclusionAndWayForward)) {
      if (isPlaceholder(reportData.executiveSummary.conclusionAndWayForward)) {
        reportData.executiveSummary.conclusionAndWayForward = exec.conclusionAndWayForward;
      } else {
        reportData.executiveSummary.conclusionAndWayForward = mergeAdditively(reportData.executiveSummary.conclusionAndWayForward, exec.conclusionAndWayForward);
      }
      executiveFieldsAccepted += 1;
    } else if (exec.conclusionAndWayForward) {
      recordDrop("forbidden_or_empty_conclusionAndWayForward");
    }
  }

  fieldsAccepted += executiveFieldsAccepted;

  const projectEnhancements = safeArray(aiOutput?.projectEnhancements);

  for (const group of safeArray(reportData.groups)) {
    for (const project of safeArray(group.projects)) {
      const enhancement = findEnhancementForProject(project, projectEnhancements);

      if (!enhancement) {
        recordDrop("unmatched_project_" + (project.ecmNo || project.title || "unknown"));
        continue;
      }

      projectEnhancementsMatched += 1;

      for (const field of ALLOWED_PROJECT_FIELDS) {
        if (enhancement[field] === undefined) continue;

        if (isCleanText(enhancement[field])) {
          const mergedValue = mergeAdditively(project[field], enhancement[field]);

          if (numbersChanged(project[field], mergedValue)) {
            changedNumbersDetected += 1;
            recordDrop("numeric_values_changed_" + field);
            continue;
          }

          project[field] = mergedValue;
          fieldsAccepted += 1;
        } else {
          forbiddenStringsDetected += 1;
          recordDrop("forbidden_or_empty_" + field);
        }
      }
    }
  }

  return {
    reportData,
    aiEnhancementStatus: {
      status: fieldsAccepted > 0 ? "success" : "failed_non_blocking",
      finalEnhancerUsed: fieldsAccepted > 0 ? "ai" : "deterministic",
      fieldsAccepted,
      fieldsDropped,
      changedNumbersDetected,
      forbiddenStringsDetected,
      projectEnhancementsReceived: projectEnhancements.length,
      projectEnhancementsMatched,
      executiveFieldsAccepted,
      dropReasons,
      providerAttempts
    }
  };
}

module.exports = {
  qcMergeAiEnhancement,
  mergeAdditively,
  extractNumbers
};
