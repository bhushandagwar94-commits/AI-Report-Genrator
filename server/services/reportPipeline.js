const { getLLMProvider } = require("../utils/helpers");
const {
  cleanJsonResponse,
  generateWithOpenRouterFallback,
} = require("./llmProviderService");
const { generateWithGemini } = require("./geminiProviderService");
const _ = require("lodash");
const crypto = require("crypto");

const {
  buildCommercialBuildingEnergyAuditBaseData,
  cleanAndDeduplicateProjects,
  buildProjectGroups,
  normalizeReportForExport,
  safeReportValue,
} = require("./llmProviderService");
const {
  REPORT_COMPONENTS,
  getReportComponentDefinition,
} = require("./reportComponentRegistry");

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

function stableStringifyForHash(value) {
  if (value === null || value === undefined) return "";

  if (typeof value !== "object") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringifyForHash).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${key}:${stableStringifyForHash(value[key])}`)
    .join(",")}}`;
}

function pickNarrativeFieldsFromReportData(reportData) {
  const fields = [];

  const pushText = (path, value) => {
    if (value !== null && value !== undefined) {
      fields.push(`${path}=${String(value)}`);
    }
  };

  const data = reportData || {};

  pushText("executiveSummary.purposeText", data?.executiveSummary?.purposeText);
  pushText(
    "executiveSummary.keyObservations",
    data?.executiveSummary?.keyObservations
  );
  pushText(
    "executiveSummary.conclusionAndWayForward",
    data?.executiveSummary?.conclusionAndWayForward
  );

  const groups = Array.isArray(data?.groups) ? data.groups : [];
  groups.forEach((group, groupIndex) => {
    pushText(
      `groups.${groupIndex}.groupIntroduction`,
      group?.groupIntroduction
    );
    pushText(`groups.${groupIndex}.groupObservation`, group?.groupObservation);

    const projects = Array.isArray(group?.projects) ? group.projects : [];
    projects.forEach((ecm, ecmIndex) => {
      const base = `groups.${groupIndex}.projects.${ecmIndex}`;

      pushText(
        `${base}.existingSystemDescription`,
        ecm?.existingSystemDescription
      );
      pushText(
        `${base}.existingSystemBaselineCondition`,
        ecm?.existingSystemBaselineCondition
      );
      pushText(`${base}.problemGapIdentified`, ecm?.problemGapIdentified);
      pushText(
        `${base}.proposedProjectDescription`,
        ecm?.proposedProjectDescription
      );
      pushText(
        `${base}.proposedEnergyConservationMeasure`,
        ecm?.proposedEnergyConservationMeasure
      );
      pushText(
        `${base}.rationaleForEnergySaving`,
        ecm?.rationaleForEnergySaving
      );
      pushText(
        `${base}.measurementVerificationPlanNarrative`,
        ecm?.measurementVerificationPlanNarrative
      );
      pushText(
        `${base}.benefitsOtherThanEnergySaving`,
        ecm?.benefitsOtherThanEnergySaving
      );
      pushText(`${base}.precautions`, ecm?.precautions);
      pushText(`${base}.aspectsToBeTakenCareOf`, ecm?.aspectsToBeTakenCareOf);
      pushText(`${base}.projectConclusion`, ecm?.projectConclusion);
      pushText(`${base}.conclusion`, ecm?.conclusion);
      pushText(
        `${base}.schematicConceptualFramework`,
        ecm?.schematicConceptualFramework
      );
    });
  });

  return fields;
}

function hashNarrativeFields(reportData) {
  try {
    const narrativeFields = pickNarrativeFieldsFromReportData(reportData);
    return stableStringifyForHash(narrativeFields);
  } catch (error) {
    console.warn(
      "[AI enhancement] hashNarrativeFields failed:",
      error?.message || error
    );
    return `hash_fallback_${Date.now()}`;
  }
}

function safeHashNarrativeFields(reportData) {
  try {
    return hashNarrativeFields(reportData);
  } catch (error) {
    console.warn(
      "[AI enhancement] narrative hash skipped:",
      error?.message || error
    );
    return null;
  }
}

/**
 * Helper to call the active LLM provider for a prompt stage
 */
async function runPromptStage(
  systemPrompt,
  userPrompt,
  templateConfig,
  options = {}
) {
  let providerUsed = "none";
  let providerStatus = "idle";
  let fallbackReason = "";
  let jsonResult = null;
  let modelUsed = null;
  let providerAttempts = [];
  let retryAfterSeconds = null;

  const provider = (
    process.env.AI_PROVIDER ||
    process.env.LLM_PROVIDER ||
    "openrouter"
  ).toLowerCase();
  const useProviderFallbackChain = provider === "fallback_chain";

  console.log("[runPromptStage] Selected provider:", provider);

  // A. Try AnythingLLM if explicitly enabled
  if (
    templateConfig?.useAnythingLLM === true &&
    process.env.ANYTHING_LLM_WORKSPACE_SLUG
  ) {
    try {
      const llmProvider = getLLMProvider();
      const result = await llmProvider.getChatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.1 }
      );
      if (result && result.textResponse) {
        jsonResult = cleanJsonResponse(result.textResponse);
        providerUsed = "anythingllm";
        providerStatus = "success";
        return {
          result: jsonResult,
          providerUsed,
          providerStatus,
          fallbackReason,
          modelUsed,
          providerAttempts,
        };
      }
    } catch (e) {
      console.error("[runPromptStage] AnythingLLM failed:", e.message);
      fallbackReason += `AnythingLLM: ${e.message}; `;
    }
  }

  // Sequence: Gemini first, OpenRouter second
  let geminiResult = null;
  let openRouterResult = null;
  let geminiJson = null;
  let openRouterJson = null;

  // 1. Try Gemini
  try {
    console.log("[runPromptStage] Executing Gemini enhancement");
    const promptText = `System:\n${systemPrompt}\n\nUser:\n${userPrompt}`;
    geminiResult = await generateWithGemini(promptText);

    if (geminiResult.providerAttempts) {
      providerAttempts.push(...geminiResult.providerAttempts);
    } else {
      providerAttempts.push({
        provider: "gemini",
        model: geminiResult.modelUsed || "gemini-2.5-flash-lite",
        status: geminiResult.success ? "success" : "failed",
        reason: geminiResult.error || null,
        error: geminiResult.error || null,
      });
    }

    if (geminiResult.success) {
      try {
        geminiJson = cleanJsonResponse(geminiResult.content);
      } catch (parseError) {
        console.warn(
          `[runPromptStage] Initial Gemini JSON parse failed, attempting repair...`
        );
        const repairPrompt = `System:\nFix this into valid JSON only. Do not change values. Do not add fields.\n\nUser:\n${geminiResult.content}`;
        const repairResult = await generateWithGemini(repairPrompt);

        providerAttempts.push({
          provider: "gemini",
          model: repairResult.modelUsed || "gemini-2.5-flash-lite",
          status: repairResult.success ? "success" : "failed",
          reason: repairResult.error || "Repair attempt failed",
          error: repairResult.error || "Repair attempt failed",
        });

        if (repairResult.success) {
          try {
            geminiJson = cleanJsonResponse(repairResult.content);
          } catch (repairParseError) {
            console.warn(
              `[runPromptStage] Gemini repair failed: ${repairParseError.message}`
            );
          }
        }
      }
    }
  } catch (error) {
    providerAttempts.push({
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      status: "failed",
      error: error?.message || String(error),
    });
  }

  // 2. Try OpenRouter
  if (!process.env.OPENROUTER_API_KEY) {
    providerAttempts.push({
      provider: "openrouter",
      model: "openai/gpt-oss-120b:free",
      status: "skipped",
      reason: "OPENROUTER_API_KEY is not configured",
      error: null,
    });
  } else {
    try {
      console.log("[runPromptStage] Executing OpenRouter enhancement");
      let openRouterUserPrompt = userPrompt;
      if (geminiJson) {
        openRouterUserPrompt += `\n\n--- INITIAL AI DRAFT ---\nAn initial AI has generated a draft output. Use it as a foundation and deepen the engineering explanation, ensuring the output strictly adheres to the requested JSON format:\n\n${JSON.stringify(geminiJson, null, 2)}`;
      }

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: openRouterUserPrompt },
      ];
      openRouterResult = await generateWithOpenRouterFallback(messages);

      if (openRouterResult.providerAttempts) {
        providerAttempts.push(...openRouterResult.providerAttempts);
      } else {
        providerAttempts.push({
          provider: "openrouter",
          model: openRouterResult.modelUsed || "openai/gpt-oss-120b:free",
          status: openRouterResult.success ? "success" : "failed",
          reason: openRouterResult.error || null,
          error: openRouterResult.error || null,
        });
      }

      if (openRouterResult.success) {
        try {
          openRouterJson = cleanJsonResponse(openRouterResult.content);
        } catch (parseError) {
          console.warn(`[runPromptStage] OpenRouter JSON parse failed.`);
        }
      }
    } catch (error) {
      providerAttempts.push({
        provider: "openrouter",
        model: "openai/gpt-oss-120b:free",
        status: "failed",
        error: error?.message || String(error),
      });
    }
  }

  // Selection Logic
  if (openRouterJson) {
    return {
      result: openRouterJson,
      providerUsed: "openrouter",
      providerStatus: "success",
      modelUsed: openRouterResult?.modelUsed || "openai/gpt-oss-120b:free",
      fallbackReason: "",
      providerAttempts,
      retryAfterSeconds: null,
    };
  } else if (geminiJson) {
    return {
      result: geminiJson,
      providerUsed: "gemini",
      providerStatus: "success",
      modelUsed: geminiResult?.modelUsed || "gemini-2.5-flash-lite",
      fallbackReason: "OpenRouter failed or disabled",
      providerAttempts,
      retryAfterSeconds: null,
    };
  }

  // Both failed
  const isQuotaExceeded = providerAttempts.some(
    (a) => a.status === "quota_exceeded"
  );
  return {
    success: false,
    result: null,
    providerUsed: "none",
    providerStatus: isQuotaExceeded ? "quota_exceeded" : "failed",
    error: "All providers failed to return valid JSON",
    providerAttempts,
    retryAfterSeconds: null,
    isQuotaExceeded,
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function finalizeCommercialAuditReport({
  report,
  componentPayloads,
  extractedExcelData,
  llmSuccessCount,
  llmFailureCount,
  aiEnhanced,
  useAiDuringGeneration,
}) {
  let finalizedReport = normalizeReportForExport(report);
  const priorGroupNarratives = new Map(
    (finalizedReport.groupedProjects || []).map((group) => [
      `${group.groupNo}::${group.groupTitle}`,
      {
        summaryParagraph: group.summaryParagraph,
        technicalObservation: group.technicalObservation,
        implementationStrategy: group.implementationStrategy,
        groupConclusion: group.groupConclusion,
      },
    ])
  );

  finalizedReport.groupedProjects = buildProjectGroups(
    cleanAndDeduplicateProjects(finalizedReport.projects || [])
  ).map((group) => ({
    ...group,
    ...(priorGroupNarratives.get(`${group.groupNo}::${group.groupTitle}`) ||
      {}),
  }));

  finalizedReport.qcSummary = {
    ...(finalizedReport.qcSummary || {}),
    componentCount: componentPayloads.length,
    llmEligibleComponentCount: componentPayloads.filter(
      (component) => component.allowLLM
    ).length,
    llmSuccessCount,
    llmFailureCount,
    componentRegistry: REPORT_COMPONENTS.map((component) => component.id),
    excelCalculationContext: buildExcelCalculationContext(
      finalizedReport,
      extractedExcelData
    ),
    aiEnhanced,
    useAiDuringGeneration,
  };

  return finalizedReport;
}

function buildComponentInstanceKey(payload) {
  if (payload?.mergeTarget?.type === "project_detail") {
    return `${payload.id}:${payload.mergeTarget.projectIndex}`;
  }
  if (payload?.mergeTarget?.type === "project_group") {
    return `${payload.id}:${payload.mergeTarget.groupIndex}`;
  }
  return `${payload?.id}:${payload?.mergeTarget?.type || "static"}`;
}

function getComponentLockedSnapshot(component, lockedFields = []) {
  const snapshot = {};
  lockedFields.forEach((field) => {
    snapshot[field] = component?.[field];
  });
  return snapshot;
}

function mergeNarrativeOnly(baseComponent, llmOutput, allowedOutputFields) {
  const merged = Array.isArray(baseComponent)
    ? [...baseComponent]
    : { ...(baseComponent || {}) };
  const safeOutput =
    llmOutput && typeof llmOutput === "object" ? llmOutput : {};

  for (const field of allowedOutputFields || []) {
    if (safeOutput[field] !== undefined) {
      merged[field] = safeOutput[field];
    }
  }

  return merged;
}

function assertLockedFieldsUnchanged(
  before,
  after,
  lockedFields = [],
  componentLabel = "component"
) {
  for (const field of lockedFields) {
    if (String(before?.[field] ?? "") !== String(after?.[field] ?? "")) {
      throw new Error(
        `LLM attempted to modify locked field: ${componentLabel}.${field}`
      );
    }
  }
}

function collectApprovedNumericTokens(report) {
  const tokens = new Set();

  function walk(value) {
    if (value === null || value === undefined) return;

    if (typeof value === "number") {
      tokens.add(String(value));
      tokens.add(Number(value).toLocaleString("en-IN"));
      return;
    }

    if (typeof value === "string") {
      const matches = value.match(/₹?\s?\d[\d,]*(?:\.\d+)?%?/g) || [];
      matches.forEach((m) => {
        const clean = m.replace(/[₹,\s%]/g, "");
        if (clean) tokens.add(clean);
        tokens.add(m.trim());
      });
      return;
    }

    if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === "object") Object.values(value).forEach(walk);
  }

  walk(report.reportInfo);
  walk(report.executiveSummary);
  walk(report.projects);
  walk(report.groupedProjects);

  return tokens;
}

function findUnapprovedNumbers(text, approvedTokens) {
  if (!text || typeof text !== "string") return [];

  const matches = text.match(/₹?\s?\d[\d,]*(?:\.\d+)?%?/g) || [];

  return matches.filter((m) => {
    const clean = m.replace(/[₹,\s%]/g, "");

    // Ignore small integers (<=12) and valid years (1990-2100)
    const num = Number(clean);
    if (!Number.isNaN(num) && Number.isInteger(num)) {
      if (num <= 12) return false;
      if (num >= 1990 && num <= 2100) return false;
    }

    return !approvedTokens.has(clean) && !approvedTokens.has(m.trim());
  });
}

function validateNarrativeNumbers(value, approvedTokens, path) {
  if (typeof value === "string") {
    const unapproved = findUnapprovedNumbers(value, approvedTokens);
    return unapproved.map((num) => ({ path, num, text: value }));
  }

  if (Array.isArray(value)) {
    const bad = [];
    value.forEach((item, index) => {
      bad.push(
        ...validateNarrativeNumbers(item, approvedTokens, `${path}[${index}]`)
      );
    });
    return bad;
  }

  if (value && typeof value === "object") {
    const bad = [];
    Object.entries(value).forEach(([k, v]) => {
      bad.push(...validateNarrativeNumbers(v, approvedTokens, `${path}.${k}`));
    });
    return bad;
  }

  return [];
}

const GENERIC_NARRATIVE_PHRASES = [
  "this project saves energy",
  "this will improve efficiency",
  "it will improve efficiency",
  "this measure will save energy",
  "this can save energy",
  "this improves reliability",
  "this improves performance",
  "this is recommended",
  "implementation can be carried out",
];

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function previewValue(value, maxLength = 160) {
  const text =
    typeof value === "string"
      ? normalizeWhitespace(value)
      : normalizeWhitespace(JSON.stringify(value));
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function wordCount(text) {
  return normalizeWhitespace(text).split(/\s+/).filter(Boolean).length;
}

function hasMeaningfulNarrativeContext(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulNarrativeContext(item));
  }
  if (typeof value === "object") {
    return Object.values(value).some((item) =>
      hasMeaningfulNarrativeContext(item)
    );
  }
  const text = normalizeWhitespace(value);
  return Boolean(text) && text.toLowerCase() !== "data required";
}

function isGenericNarrative(text) {
  const normalized = normalizeWhitespace(text).toLowerCase();
  return GENERIC_NARRATIVE_PHRASES.some(
    (phrase) => normalized === phrase || normalized.includes(phrase)
  );
}

function getFieldQualityRule(field) {
  const bulletFieldRule = {
    minItems: 2,
    minWordsPerItem: 5,
  };

  switch (field) {
    case "scopeOfWork":
    case "keyActivities":
      return { ...bulletFieldRule, minItems: 3 };
    case "measurementVerificationPlan":
    case "benefitsOtherThanEnergySaving":
      return { ...bulletFieldRule };
    case "keyObservations":
      return { ...bulletFieldRule, minItems: 2 };
    case "conclusionAndWayForward":
      return { minItems: 2, minWordsPerItem: 4, allowObjectItems: true };
    default:
      return { minWords: 25 };
  }
}

function validateNarrativeFieldQuality(field, value, sourceContextAvailable) {
  if (value === undefined) return null;

  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    if (!normalized) return "empty value";
    if (normalized === "Data required") {
      return sourceContextAvailable
        ? "used Data required despite available context"
        : null;
    }
    if (isGenericNarrative(normalized)) return "generic wording";
    if (wordCount(normalized) < (getFieldQualityRule(field).minWords || 0)) {
      return "too short";
    }
    return null;
  }

  if (Array.isArray(value)) {
    const rule = getFieldQualityRule(field);
    if (value.length < (rule.minItems || 1)) {
      return "too few bullets";
    }

    for (const item of value) {
      const itemText =
        typeof item === "object" && item !== null
          ? normalizeWhitespace(item.action || item.text || "")
          : normalizeWhitespace(item);

      if (!itemText) return "empty bullet";
      if (itemText === "Data required") {
        if (sourceContextAvailable)
          return "used Data required despite available context";
        continue;
      }
      if (isGenericNarrative(itemText)) return "generic wording";
      if (wordCount(itemText) < (rule.minWordsPerItem || 0)) {
        return "bullet too short";
      }
    }

    return null;
  }

  return null;
}

function enforceNarrativeQuality(payload, llmOutput, warnings) {
  if (!llmOutput || typeof llmOutput !== "object") return;

  const sourceContext = payload?.qualityContext || {};

  Object.entries(llmOutput).forEach(([field, value]) => {
    const sourceContextAvailable = hasMeaningfulNarrativeContext(
      sourceContext[field]
    );
    const qualityIssue = validateNarrativeFieldQuality(
      field,
      value,
      sourceContextAvailable
    );
    if (qualityIssue) {
      warnings.push(
        `Removed AI field ${payload.componentId}.${field} because the narrative was ${qualityIssue}.`
      );
      delete llmOutput[field];
    }
  });
}

function validateNarrativeOutputShape(
  payload,
  llmOutput,
  approvedTokens,
  warnings
) {
  if (!llmOutput || typeof llmOutput !== "object" || Array.isArray(llmOutput)) {
    throw new Error(
      `Invalid narrative response for ${payload.componentId}. Expected JSON object.`
    );
  }

  const allowed = new Set(payload.allowedOutputFields || []);
  const locked = new Set(payload.lockedFields || []);

  Object.keys(llmOutput).forEach((field) => {
    if (locked.has(field)) {
      throw new Error(
        `Locked field returned by LLM for ${payload.componentId}: ${field}`
      );
    }
    if (!allowed.has(field)) {
      throw new Error(
        `Unexpected field returned by LLM for ${payload.componentId}: ${field}`
      );
    }
  });

  Object.entries(llmOutput).forEach(([field, value]) => {
    const badNums = validateNarrativeNumbers(
      value,
      approvedTokens,
      `${payload.componentId}.${field}`
    );
    if (badNums.length > 0) {
      warnings.push(
        `Removed AI field ${payload.componentId}.${field} because it contained unapproved numeric token: ${badNums[0].num}`
      );
      delete llmOutput[field];
    }
  });

  enforceNarrativeQuality(payload, llmOutput, warnings);
}

function buildSupportingContext({
  extractedInfo = {},
  uploadedFiles = [],
  imageMetadata = [],
}) {
  const observationLines = [
    ...(Array.isArray(extractedInfo?.facilityObservations)
      ? extractedInfo.facilityObservations
      : []),
    ...(Array.isArray(extractedInfo?.utilityObservations)
      ? extractedInfo.utilityObservations
      : []),
    ...(Array.isArray(extractedInfo?.projectSupportingNotes)
      ? extractedInfo.projectSupportingNotes.flatMap((note) => [
          note?.existingConditionNotes,
          note?.implementationNotes,
        ])
      : []),
    ...(Array.isArray(imageMetadata)
      ? imageMetadata.map((image) => image?.caption || image?.placementSection)
      : []),
    ...(extractedInfo?.supportingText ? [extractedInfo.supportingText] : []),
    // Filenames are explicitly excluded to prevent AI from mentioning specific files like .xlsx in the report
  ]
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 10);

  return observationLines.join(" | ") || "Data required";
}

function buildUploadedFileRoleSummary(uploadedFiles = []) {
  return [
    "Energy consumption records",
    "Equipment information",
    "Operational data",
    "ECM calculations",
  ];
}

function buildCompactSupportingContext({
  extractedInfo = {},
  uploadedFiles = [],
  imageMetadata = [],
}) {
  const fileSummary = buildUploadedFileRoleSummary(uploadedFiles);
  const context = {
    uploadedFiles: fileSummary,
    facilityObservations: (Array.isArray(extractedInfo?.facilityObservations)
      ? extractedInfo.facilityObservations
      : []
    ).slice(0, 5),
    utilityObservations: (Array.isArray(extractedInfo?.utilityObservations)
      ? extractedInfo.utilityObservations
      : []
    ).slice(0, 5),
    projectNotes: (Array.isArray(extractedInfo?.projectSupportingNotes)
      ? extractedInfo.projectSupportingNotes
      : []
    )
      .slice(0, 8)
      .map((note) => ({
        projectNo: note?.projectNo || undefined,
        projectTitle: note?.projectTitle || undefined,
        existingConditionNotes: normalizeWhitespace(
          note?.existingConditionNotes
        ),
        implementationNotes: normalizeWhitespace(note?.implementationNotes),
      })),
    imageEvidence: (Array.isArray(imageMetadata) ? imageMetadata : [])
      .slice(0, 6)
      .map((image) =>
        normalizeWhitespace(image?.caption || image?.placementSection)
      )
      .filter(Boolean),
  };

  return context;
}

function buildProjectSpecificSupportingContext(
  project,
  extractedInfo = {},
  uploadedFiles = [],
  imageMetadata = []
) {
  const projectText =
    `${safeReportValue(project?.projectNo)} ${safeReportValue(project?.projectTitle)} ${safeReportValue(project?.equipmentCovered)} ${safeReportValue(project?.system)}`.toLowerCase();
  const relatedProjectNotes = (
    Array.isArray(extractedInfo?.projectSupportingNotes)
      ? extractedInfo.projectSupportingNotes
      : []
  )
    .filter((note) => {
      const noteText =
        `${note?.projectNo || ""} ${note?.projectTitle || ""} ${note?.existingConditionNotes || ""} ${note?.implementationNotes || ""}`.toLowerCase();
      return (
        noteText &&
        (noteText.includes(String(project?.projectNo || "").toLowerCase()) ||
          noteText.includes(
            String(project?.projectTitle || "").toLowerCase()
          ) ||
          noteText.includes(
            String(project?.equipmentCovered || "").toLowerCase()
          ) ||
          noteText.includes(String(project?.system || "").toLowerCase()))
      );
    })
    .slice(0, 4)
    .map((note) => ({
      projectNo: note?.projectNo || undefined,
      projectTitle: note?.projectTitle || undefined,
      existingConditionNotes: normalizeWhitespace(note?.existingConditionNotes),
      implementationNotes: normalizeWhitespace(note?.implementationNotes),
    }));

  const relatedFileSummary = buildUploadedFileRoleSummary(uploadedFiles).filter(
    (entry) => {
      const entryText = String(entry || "").toLowerCase();
      return (
        !projectText ||
        entryText.includes(String(project?.system || "").toLowerCase()) ||
        entryText.includes(
          String(project?.equipmentCovered || "").toLowerCase()
        )
      );
    }
  );

  const genericCompactContext = buildCompactSupportingContext({
    extractedInfo,
    uploadedFiles,
    imageMetadata,
  });

  return {
    relatedProjectNotes,
    relatedUploadedFiles: relatedFileSummary.length
      ? relatedFileSummary
      : genericCompactContext.uploadedFiles.slice(0, 6),
    facilityObservations: genericCompactContext.facilityObservations,
    utilityObservations: genericCompactContext.utilityObservations,
    imageEvidence: genericCompactContext.imageEvidence,
  };
}

function buildSummaryOnlyBatch({
  report,
  formData = {},
  extractedInfo = {},
  uploadedFiles = [],
  imageMetadata = [],
}) {
  const executiveSummaryDefinition =
    getReportComponentDefinition("executive_summary") || {};
  const groupedProjects = Array.isArray(report?.groupedProjects)
    ? report.groupedProjects
    : [];
  const supportingContext = buildSupportingContext({
    extractedInfo,
    uploadedFiles,
    imageMetadata,
  });
  const compactSupportingContext = buildCompactSupportingContext({
    extractedInfo,
    uploadedFiles,
    imageMetadata,
  });
  const groupSummariesOnly = groupedProjects.map((group) => ({
    groupTitle: group.groupTitle,
    groupIntroduction: group.summaryParagraph || "Data required",
    groupObservation: group.technicalObservation || "Data required",
  }));

  return [
    {
      name: "summary_only",
      componentId: "summary_narrative_enhancement",
      payload: {
        reportType: "Detailed Energy Audit Report",
        clientName: formData.clientName || "Data required",
        facilityType:
          formData.buildingType ||
          report?.buildingProfile?.typeOfBuilding ||
          "Data required",
        supportingContext,
        compactSupportingContext,
        executiveSummary: {
          purposeText: report?.executiveSummary?.purposeText || "Data required",
          keyObservations: report?.executiveSummary?.keyObservations || [],
          conclusionAndWayForward:
            report?.executiveSummary?.conclusionAndWayForward ||
            "Data required",
        },
        projectGroups: groupedProjects.map((group) => ({
          groupTitle: group.groupTitle || "Data required",
          projectTitles: Array.isArray(group.projects)
            ? group.projects.map(
                (project) => project.projectTitle || "Data required"
              )
            : [],
        })),
        groups: groupSummariesOnly,
        plantProfileContext: {
          facilityName:
            formData.facilityName ||
            report?.buildingProfile?.facilityName ||
            "Data required",
          location:
            formData.location ||
            report?.buildingProfile?.address ||
            "Data required",
          facilityDescription:
            report?.buildingProfile?.facilityDescription || "Data required",
          utilityDescription:
            report?.buildingProfile?.utilityDescription || "Data required",
        },
        allowedOutputFields: [
          "executiveSummary.purposeText",
          "executiveSummary.keyObservations",
          "executiveSummary.conclusionAndWayForward",
          "groups[].groupIntroduction",
          "groups[].groupObservation",
        ],
      },
      meta: {
        executiveSummaryAllowedFields:
          executiveSummaryDefinition.llmAllowedFields || [],
        executiveSummaryLockedFields:
          executiveSummaryDefinition.lockedFields || [],
      },
    },
  ];
}

function buildStandardNarrativeBatches(
  llmEligiblePayloads = [],
  batchSize = 4
) {
  const batches = [];
  for (let i = 0; i < llmEligiblePayloads.length; i += batchSize) {
    const batchNumber = batches.length + 1;
    batches.push({
      name: `Batch ${batchNumber}`,
      componentId: "batch_narrative_enhancement",
      payload: llmEligiblePayloads.slice(i, i + batchSize),
    });
  }
  return batches;
}

async function runSummaryOnlyNarrativeStage(
  batch,
  templateConfig,
  options = {}
) {
  const systemPrompt = `You are a senior energy audit engineer and detailed technical report writer.

Your task is to expand explanations in a professional Detailed Energy Audit Report.

Do not generate, estimate, modify, or calculate any numbers.
Do not change any project titles, equipment names, group names, tables, savings, investment, payback, quantities, kWh, ₹, %, kW, TR, kVAr, or calculated values.

Use uploaded file context and deterministic report context only.

Write detailed, client-ready, engineering explanation.
Return only allowed narrative fields.`;

  const userPrompt = `Enhance only the executive summary and group-level summary narratives.
Use the audit purpose, facility details, grouped project titles, deterministic narrative, and uploaded supporting-file context.

${JSON.stringify(batch.payload, null, 2)}

Return valid JSON only using exactly this schema:
{
  "executiveSummary": {
    "purposeText": "Write minimum 3 paragraphs. Paragraph 1: objective of audit and review of uploaded data. Paragraph 2: how ECMs are identified and converted into actionable projects. Paragraph 3: how management can use report for prioritization, implementation, monitoring, and savings verification.",
    "keyObservations": [
      "Observation 1: 40 to 70 words explaining quick-win opportunities, high-impact projects, or system controls.",
      "Observation 2: 40 to 70 words explaining monitoring gaps or utility optimization.",
      "Observation 3: 40 to 70 words explaining production-machine energy saving potential.",
      "Observation 4: 40 to 70 words explaining phased implementation or automation.",
      "Observation 5: 40 to 70 words explaining maintenance and reliability benefits."
    ],
    "conclusionAndWayForward": "Write minimum 2 to 3 paragraphs on implementation roadmap, detailed engineering, procurement, measurement and verification, post-implementation monitoring, and savings delivery approach."
  },
  "groups": [
    {
      "groupTitle": "Must exactly match one provided group title",
      "groupIntroduction": "Write 80 to 140 words on what systems are included and inefficiencies addressed.",
      "groupObservation": "Write 60 to 100 words on quick wins and overall findings.",
      "implementationFocus": "Write 60 to 100 words on implementation importance.",
      "measurementVerificationFocus": "Write 60 to 100 words on M&V focus."
    }
  ]
}

Rules:
- Do not generate or modify numbers.
- If data is missing, write "Data required".
- Do not include markdown.`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig, options);
}

function normalizeAiSummaryOutput(ai) {
  const executiveSummary =
    ai.executiveSummary || ai.executive_summary || ai.summary || {};

  const parseToArray = (field) => {
    if (!field) return [];
    if (Array.isArray(field))
      return field
        .map((x) => (x && typeof x.text === "string" ? x.text : String(x)))
        .filter(Boolean);
    if (typeof field === "string") {
      return field
        .split(/\\n|•|-/)
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  };

  return {
    executiveSummary: {
      purposeText: parseToArray(
        executiveSummary.purposeText || executiveSummary.purpose
      ),
      keyObjectives: parseToArray(executiveSummary.keyObjectives),
      scopeOfAssessment: parseToArray(executiveSummary.scopeOfAssessment),
      expectedOutcomes: parseToArray(executiveSummary.expectedOutcomes),
      strategicImportance: parseToArray(executiveSummary.strategicImportance),
      keyFindings: parseToArray(
        executiveSummary.keyFindings ||
          executiveSummary.keyObservations ||
          executiveSummary.observations
      ),
      financialHighlightsNarrative: parseToArray(
        executiveSummary.financialHighlightsNarrative
      ),
      energySavingPotentialNarrative: parseToArray(
        executiveSummary.energySavingPotentialNarrative
      ),
      recommendedImplementationApproach: parseToArray(
        executiveSummary.recommendedImplementationApproach ||
          executiveSummary.conclusionAndWayForward ||
          executiveSummary.conclusion
      ),
    },
    groups: Array.isArray(ai.groups)
      ? ai.groups
      : Array.isArray(ai.groupNarratives)
        ? ai.groupNarratives
        : [],
  };
}

function applySummaryOnlyNarrative(
  report,
  batch,
  narrativeOutput,
  approvedTokens,
  warnings
) {
  if (
    !narrativeOutput ||
    typeof narrativeOutput !== "object" ||
    Array.isArray(narrativeOutput)
  ) {
    throw new Error(
      "Invalid summary-only narrative response. Expected JSON object."
    );
  }

  const normalizedAi = normalizeAiSummaryOutput(narrativeOutput);

  if (process.env.NODE_ENV === "development") {
    console.log(
      "[AI RAW SUMMARY OUTPUT]",
      JSON.stringify(normalizedAi, null, 2)
    );
  }

  const changedFields = [];
  const droppedFields = [];
  const addDroppedField = (fieldPath, reason, value) => {
    const dropped = {
      field: fieldPath,
      reason,
      preview: previewValue(value),
    };
    droppedFields.push(dropped);
    if (process.env.NODE_ENV === "development") {
      console.log("[AI FIELD REJECTED]", {
        fieldPath,
        reason,
        value,
      });
    }
  };
  const hasUnapprovedNumbers = (value, fieldPath) => {
    const badNums = validateNarrativeNumbers(value, approvedTokens, fieldPath);
    if (badNums.length > 0) {
      addDroppedField(
        fieldPath,
        `Unapproved numeric token: ${badNums[0].num}`,
        value
      );
      return true;
    }
    return false;
  };
  const isExtremelyGeneric = (text) => {
    const normalized = normalizeWhitespace(text).toLowerCase();
    return [
      "this project saves energy.",
      "this improves efficiency.",
      "data required.",
      "this project saves energy",
      "this improves efficiency",
      "data required",
    ].includes(normalized);
  };

  const executiveBefore = cloneJson(report.executiveSummary || {});
  if (!report.executiveSummary) report.executiveSummary = {};

  const esFields = [
    "purposeText",
    "keyObjectives",
    "scopeOfAssessment",
    "expectedOutcomes",
    "strategicImportance",
    "keyFindings",
    "financialHighlightsNarrative",
    "energySavingPotentialNarrative",
    "recommendedImplementationApproach",
  ];

  esFields.forEach((key) => {
    const arr = normalizedAi.executiveSummary[key];
    if (Array.isArray(arr) && arr.length > 0) {
      const validItems = [];
      arr.forEach((item, index) => {
        const text = typeof item === "string" ? normalizeWhitespace(item) : "";
        const fieldPath = `executiveSummary.${key}[${index}]`;
        if (!text) return;
        if (text.length < 30) {
          addDroppedField(fieldPath, "Too short", text);
          return;
        }
        if (isExtremelyGeneric(text)) {
          addDroppedField(fieldPath, "Extremely generic wording", text);
          return;
        }
        if (hasUnapprovedNumbers(text, fieldPath)) {
          return;
        }
        validItems.push(text);
      });

      if (validItems.length > 0) {
        report.executiveSummary[key] = validItems;
        changedFields.push(`executiveSummary.${key}`);
      } else {
        addDroppedField(
          `executiveSummary.${key}`,
          "No valid items survived validation",
          arr
        );
      }
    }
  });

  if (Array.isArray(normalizedAi.groups)) {
    normalizedAi.groups.forEach((groupOutput) => {
      const groupIndex = (report.groupedProjects || []).findIndex(
        (group) =>
          String(group?.groupTitle || "")
            .trim()
            .toLowerCase() ===
          String(groupOutput?.groupTitle || "")
            .trim()
            .toLowerCase()
      );
      if (groupIndex === -1) return;

      const groupIntroduction =
        typeof groupOutput.groupIntroduction === "string"
          ? normalizeWhitespace(groupOutput.groupIntroduction)
          : "";
      if (groupIntroduction) {
        if (groupIntroduction.length < 60) {
          addDroppedField(
            `groups[${groupIndex}].groupIntroduction`,
            "Too short",
            groupIntroduction
          );
        } else if (isExtremelyGeneric(groupIntroduction)) {
          addDroppedField(
            `groups[${groupIndex}].groupIntroduction`,
            "Extremely generic wording",
            groupIntroduction
          );
        } else if (
          !hasUnapprovedNumbers(
            groupIntroduction,
            `groups[${groupIndex}].groupIntroduction`
          )
        ) {
          report.groupedProjects[groupIndex].summaryParagraph =
            groupIntroduction;
          report.groupedProjects[groupIndex].groupIntroduction =
            groupIntroduction;
          changedFields.push(`groups[${groupIndex}].groupIntroduction`);
        }
      }

      const groupObservation =
        typeof groupOutput.groupObservation === "string"
          ? normalizeWhitespace(groupOutput.groupObservation)
          : "";
      if (groupObservation) {
        if (groupObservation.length < 60) {
          addDroppedField(
            `groups[${groupIndex}].groupObservation`,
            "Too short",
            groupObservation
          );
        } else if (isExtremelyGeneric(groupObservation)) {
          addDroppedField(
            `groups[${groupIndex}].groupObservation`,
            "Extremely generic wording",
            groupObservation
          );
        } else if (
          !hasUnapprovedNumbers(
            groupObservation,
            `groups[${groupIndex}].groupObservation`
          )
        ) {
          report.groupedProjects[groupIndex].technicalObservation =
            groupObservation;
          report.groupedProjects[groupIndex].groupObservation =
            groupObservation;
          changedFields.push(`groups[${groupIndex}].groupObservation`);
        }
      }
    });
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[AI MERGE SUMMARY]", {
      aiEnhancedFields: changedFields,
      aiDroppedFields: droppedFields,
      purposeTextChanged:
        executiveBefore?.purposeText !== report.executiveSummary?.purposeText,
      keyObservationsBefore: executiveBefore?.keyObservations?.length || 0,
      keyObservationsAfter:
        report.executiveSummary?.keyObservations?.length || 0,
    });
  }

  const aiEnhancementStatus =
    changedFields.length > 0
      ? droppedFields.length > 0
        ? "partial_success"
        : "success"
      : "no_fields_changed";

  return {
    report,
    changedFields,
    droppedFields,
    aiEnhanced: changedFields.length > 0,
    aiEnhancementStatus,
  };
}

function buildAnnexures(uploadedFiles = [], imageMetadata = []) {
  const uploadItems = (uploadedFiles || []).map((file, index) => ({
    itemNo: index + 1,
    fileName: file?.filename || file?.originalname || "Uploaded file",
    fileType: file?.mimetype || file?.type || "unknown",
    description:
      file?.originalname || file?.filename || "Uploaded supporting file",
  }));

  const imageItems = (imageMetadata || []).map((image, index) => ({
    itemNo: uploadItems.length + index + 1,
    fileName: image?.imageFileName || image?.filename || "Image reference",
    fileType: "image",
    description:
      image?.caption || image?.placementSection || "Supporting image reference",
  }));

  return {
    uploadedFiles: uploadItems,
    imageReferences: imageItems,
  };
}

function buildExcelCalculationContext(baseReport, extractedExcelData = {}) {
  const groupedProjects = Array.isArray(baseReport?.groupedProjects)
    ? baseReport.groupedProjects
    : [];
  const projects = Array.isArray(baseReport?.projects)
    ? baseReport.projects
    : [];

  const calcFallback = "[Calculation pending due to missing input data]";

  return {
    projects,
    groupedProjects,
    portfolioTotals: {
      totalEnergySaving:
        baseReport?.executiveSummary?.totalEnergySavingPotential ??
        calcFallback,
      totalAnnualCostSaving:
        baseReport?.executiveSummary?.totalAnnualCostSavingPotential ??
        calcFallback,
      totalEstimatedInvestment:
        baseReport?.executiveSummary?.totalEstimatedInvestment ?? calcFallback,
      averagePaybackPeriod:
        baseReport?.executiveSummary?.simplePaybackPeriod ?? calcFallback,
      totalCO2Reduction:
        baseReport?.executiveSummary?.co2ReductionPotential ?? calcFallback,
    },
    groupTotals: groupedProjects.map((group) => ({
      groupNo: group.groupNo,
      groupTitle: group.groupTitle,
      projectCount: Array.isArray(group.projects) ? group.projects.length : 0,
      totalInvestment: group.totalInvestment ?? calcFallback,
      totalSaving: group.totalAnnualSaving ?? calcFallback,
      totalEnergySaving: group.totalEnergySaving ?? calcFallback,
      averagePayback: group.weightedPayback ?? calcFallback,
    })),
    annualElectricityConsumption:
      extractedExcelData?.annualElectricityConsumption || calcFallback,
    annualElectricityCost:
      extractedExcelData?.annualElectricityCost || calcFallback,
    averageTariff: extractedExcelData?.averageTariff || calcFallback,
  };
}

function classifyEcmType(project) {
  const text =
    `${project?.projectTitle || ""} ${project?.equipmentCovered || ""} ${project?.projectActivitiesText || ""} ${project?.system || ""}`.toLowerCase();

  // Strict priority based on user requirements
  if (
    text.includes("exhaust heat recovery") ||
    text.includes("heat recovery") ||
    text.includes("waste heat")
  )
    return "heat_recovery";
  if (
    text.includes("insulation") &&
    (text.includes("hot") ||
      text.includes("duct") ||
      text.includes("pipe") ||
      text.includes("thermal"))
  )
    return "thermal_insulation";
  if (text.includes("band heater") || text.includes("ir heater"))
    return "ir_heater_or_band_heater_replacement";
  if (text.includes("servo") || text.includes("hydraulic"))
    return "servo_hydraulic_retrofit";
  if (text.includes("apfc") || text.includes("power factor"))
    return "apfc_power_factor_correction";
  if (text.includes("booster compressor"))
    return "booster_compressor_automation";
  if (text.includes("compressed air")) return "compressed_air_management";
  if (
    text.includes("ct fan") ||
    text.includes("cooling tower fan") ||
    (text.includes("ct no.") && text.includes("fan"))
  )
    return "cooling_tower_fan_upgrade";
  if (text.includes("ahu") && text.includes("plug fan"))
    return "ahu_plug_fan_optimization";
  if (text.includes("free cooling") || text.includes("chiller bypass"))
    return "free_cooling_chiller_bypass";
  if (text.includes("chiller") && text.includes("kw/tr"))
    return "chiller_kw_tr_optimization";
  if (
    text.includes("ie5") ||
    text.includes("pmsm") ||
    text.includes("motor retrofit")
  )
    return "motor_retrofit_ie5_pmsm";
  if (
    text.includes("cooling system") ||
    text.includes("cooling tower") ||
    text.includes("chiller") ||
    text.includes("ct segregation")
  )
    return "cooling_system_optimization";
  if (
    text.includes("pump") ||
    text.includes("vfd") ||
    text.includes("flow optimization")
  )
    return "pump_flow_optimization";
  if (text.includes("ahu") || text.includes("fan"))
    return "ahu_plug_fan_optimization";
  if (text.includes("blower") || text.includes("direct drive"))
    return "blower_direct_drive_retrofit";
  if (text.includes("grinder")) return "grinder_motor_retrofit";
  if (text.includes("lighting") || text.includes("led"))
    return "lighting_efficiency";
  if (text.includes("boiler") || text.includes("steam boiler"))
    return "boiler_thermal_efficiency";
  if (
    text.includes("condensate") ||
    text.includes("steam trap") ||
    text.includes("steam")
  )
    return "steam_condensate_recovery";
  if (text.includes("process heating") || text.includes("heating"))
    return "process_heating_optimization";

  return "general_ecm";
}

function buildIndustrialEcmDeterministicTemplate(
  project,
  ecmType,
  supportingNotes,
  fallbackText
) {
  const equip =
    project.equipmentCovered || project.system || "the associated equipment";
  const title = project.projectTitle || "this energy conservation measure";
  const system = project.system || "the industrial system";

  const isGeneric = (val) => {
    if (!val) return true;
    const lower = val.toLowerCase();
    return (
      lower.includes(
        "present operating approach results in avoidable energy losses"
      ) ||
      lower.includes("engineering gap in optimal energy performance") ||
      lower.includes(
        "the existing system operates under current process conditions"
      ) ||
      lower.includes(
        "opportunities for measurable energy-performance improvement"
      ) ||
      lower.includes("this project involves upgrading") ||
      lower.includes("the audit identified an operating gap") ||
      lower.includes("data required") ||
      lower.includes("to be updated after site data verification")
    );
  };

  const getStr = (val) =>
    val && typeof val === "string" && val.trim().length > 0 && !isGeneric(val)
      ? val.trim()
      : null;

  // Input data mapping
  const inputExisting =
    getStr(supportingNotes.existingConditionNotes) ||
    getStr(project.baselineDetails) ||
    getStr(project.existingOperatingCondition) ||
    getStr(project.existingSystemDescription);
  const inputProposed =
    getStr(supportingNotes.implementationNotes) ||
    getStr(project.projectActivitiesText) ||
    getStr(project.proposedIntervention) ||
    getStr(project.proposedProjectDescription);
  const inputRationale =
    getStr(project.rationaleForEnergySaving) ||
    getStr(supportingNotes.implementationNotes);
  const inputProblem =
    getStr(project.problemGapIdentified) ||
    getStr(supportingNotes.existingConditionNotes);
  const inputScope =
    getStr(project.scopeOfWork) || getStr(supportingNotes.implementationNotes);
  const inputActivities =
    getStr(project.keyActivities) || getStr(project.projectActivitiesText);
  const inputMV =
    getStr(project.measurementVerificationPlan) ||
    getStr(supportingNotes.existingConditionNotes);
  const inputBenefits = getStr(project.benefitsOtherThanEnergySaving);
  const inputAspects =
    getStr(project.aspectsToBeTakenCareOf) || getStr(project.precautions);
  const inputConclusion =
    getStr(project.finalConclusion) || getStr(project.conclusion);

  // Template generation
  let existing,
    problem,
    proposed,
    scope,
    activities,
    rationale,
    mv,
    benefits,
    aspects,
    conclusion;

  switch (ecmType) {
    case "heat_recovery":
      existing =
        inputExisting ||
        `The existing process exhausts thermal energy to the atmosphere without any recovery mechanism for ${equip}.`;
      problem =
        inputProblem ||
        `A significant gap exists in thermal efficiency as high-grade waste heat is continually lost, increasing the primary heating load on ${system}.`;
      proposed =
        inputProposed ||
        `The proposed measure involves installing a heat recovery system to capture waste heat and pre-heat the incoming fluid for ${equip}.`;
      rationale =
        inputRationale ||
        `Energy savings will be achieved by recovering waste heat from the exhaust stream to pre-heat incoming process fluid, thereby reducing the primary thermal energy requirement of the heater/boiler.`;
      break;
    case "thermal_insulation":
      existing =
        inputExisting ||
        `The current thermal distribution network, including ${equip}, has exposed or inadequately insulated hot surfaces.`;
      problem =
        inputProblem ||
        `Radiation and convection losses from uninsulated hot surfaces lead to continuous thermal energy wastage.`;
      proposed =
        inputProposed ||
        `The proposed intervention is to install industrial-grade thermal insulation on ${equip} to minimize surface heat losses.`;
      rationale =
        inputRationale ||
        `Insulating hot surfaces drastically reduces radiant heat loss, ensuring the process temperature is maintained with lower continuous thermal input.`;
      break;
    case "servo_hydraulic_retrofit":
      existing =
        inputExisting ||
        `The existing ${equip} operates with a continuously running standard induction motor driving a fixed displacement hydraulic pump.`;
      problem =
        inputProblem ||
        `During idle, cooling, and part-load phases of the machine cycle, the hydraulic pump continuously bypasses fluid, wasting significant electrical energy.`;
      proposed =
        inputProposed ||
        `The proposed energy conservation measure is to retrofit the machine with a servo-driven hydraulic pump system.`;
      rationale =
        inputRationale ||
        `A servo motor will precisely modulate pump speed according to the instantaneous hydraulic demand of the machine cycle, virtually eliminating bypass losses during idle and holding phases.`;
      break;
    case "compressed_air_management":
      existing =
        inputExisting ||
        `The compressed air network supplying ${equip} currently lacks precise sectional monitoring and leak management.`;
      problem =
        inputProblem ||
        `Undetected compressed air leaks, inappropriate pressure settings, and artificial demand result in high specific power consumption.`;
      proposed =
        inputProposed ||
        `The proposed measure involves deploying a comprehensive measurement and management system for the compressed air network.`;
      rationale =
        inputRationale ||
        `Identifying and sealing leaks while optimizing generation pressure will directly reduce the compressor's load and specific power consumption.`;
      break;
    case "apfc_power_factor_correction":
      existing =
        inputExisting ||
        `The electrical distribution network serving ${system} is currently operating at a sub-optimal power factor.`;
      problem =
        inputProblem ||
        `Low power factor leads to increased I²R losses in the distribution network and potentially attracts utility penalties or higher kVA demand charges.`;
      proposed =
        inputProposed ||
        `The proposed measure is to install or upgrade an Automatic Power Factor Correction (APFC) relay and capacitor banks.`;
      rationale =
        inputRationale ||
        `Compensating reactive power locally improves the overall power factor, reduces the apparent power (kVA) demand, and minimizes distribution losses.`;
      break;
    case "cooling_system_optimization":
    case "chiller_kw_tr_optimization":
    case "cooling_tower_fan_upgrade":
    case "free_cooling_chiller_bypass":
      existing =
        inputExisting ||
        `The existing cooling system (${equip}) operates with fixed setpoints and lacks dynamic load-matching controls.`;
      problem =
        inputProblem ||
        `Operating the cooling tower and chillers without optimized approach temperatures and condenser water control leads to elevated compressor lift and higher kW/TR.`;
      proposed =
        inputProposed ||
        `The proposed intervention optimizes the cooling system by implementing advanced control logic and upgrading ${equip}.`;
      rationale =
        inputRationale ||
        `Lowering the condenser water temperature and optimizing the cooling tower approach reduces the compressor lift, thereby improving the overall chiller kW/TR efficiency.`;
      break;
    case "pump_flow_optimization":
    case "ahu_plug_fan_optimization":
      existing =
        inputExisting ||
        `The existing fluid/air handling system (${equip}) utilizes fixed-speed drives with mechanical throttling (valves/dampers) to control flow.`;
      problem =
        inputProblem ||
        `Mechanical throttling creates artificial pressure drops, forcing the motor to consume excess power to deliver the required flow rate.`;
      proposed =
        inputProposed ||
        `The proposed measure is to implement Variable Frequency Drives (VFDs) or plug fan retrofits to electronically match flow with process demand.`;
      rationale =
        inputRationale ||
        `According to affinity laws, reducing motor speed electronically rather than throttling mechanically yields cubic reductions in power consumption for centrifugal loads.`;
      break;
    case "motor_retrofit_ie5_pmsm":
      existing =
        inputExisting ||
        `The ${system} is currently driven by an older, lower-efficiency induction motor.`;
      problem =
        inputProblem ||
        `Standard induction motors exhibit higher inherent stator and rotor I²R losses, especially at partial loads, resulting in sub-optimal overall drive efficiency.`;
      proposed =
        inputProposed ||
        `The proposed measure is to retrofit the existing drive with an IE5-class Permanent Magnet Synchronous Motor (PMSM).`;
      rationale =
        inputRationale ||
        `IE5 PMSM motors eliminate rotor I²R losses by utilizing permanent magnets, maintaining exceptionally high efficiency across a wide range of operating speeds and loads.`;
      break;
    default:
      existing =
        inputExisting ||
        `Baseline operational data for ${equip} was recorded and analyzed during the site assessment.`;
      problem =
        inputProblem ||
        `The recorded data indicates an opportunity to optimize the specific energy performance of ${system}.`;
      proposed =
        inputProposed ||
        `The proposed measure involves upgrading ${equip} based on the observed operational parameters.`;
      rationale =
        inputRationale ||
        `Optimization will reduce the specific energy consumption and improve the overall efficiency of the system.`;
      break;
  }

  scope =
    inputScope ||
    `Implementation of ${title} adhering to industrial standards.`;
  activities =
    inputActivities ||
    `1. Technical sizing and specification.\\n2. Procurement of equipment.\\n3. Mechanical/Electrical installation.\\n4. Commissioning and parameter tuning.\\n5. Performance validation.`;
  mv =
    inputMV ||
    `1. Record baseline power/fuel consumption and operating parameters.\\n2. Measure post-implementation consumption under identical load conditions.\\n3. Calculate normalized energy savings.`;
  benefits =
    inputBenefits ||
    `1. Enhanced system reliability.\\n2. Reduced maintenance requirements.\\n3. Improved operational control.`;
  aspects =
    inputAspects ||
    `1. Ensure compatibility with existing control systems.\\n2. Plan execution during scheduled maintenance windows to avoid process downtime.\\n3. Verify equipment sizing before procurement.`;
  conclusion =
    inputConclusion ||
    `Implementing ${title} is a technically sound and financially viable measure to significantly reduce the energy intensity of ${system}.`;

  return {
    existingSystemDescription: existing,
    proposedProjectDescription: proposed,
    rationaleForEnergySaving: rationale,
    problemGapIdentified: problem,
    scopeOfWork: scope,
    keyActivities: activities,
    measurementVerificationPlan: mv,
    benefitsOtherThanEnergySaving: benefits,
    aspectsToBeTakenCareOf: aspects,
    finalConclusion: conclusion,
  };
}

function buildComponentPayloads({
  formData = {},
  baseReport,
  extractedInfo = {},
  imageMetadata = [],
  uploadedFiles = [],
}) {
  const payloads = [];
  const groupedProjects = Array.isArray(baseReport?.groupedProjects)
    ? baseReport.groupedProjects
    : [];
  const projects = Array.isArray(baseReport?.projects)
    ? baseReport.projects
    : [];
  const supportingContext = buildSupportingContext({
    extractedInfo,
    uploadedFiles,
    imageMetadata,
  });
  const compactSupportingContext = buildCompactSupportingContext({
    extractedInfo,
    uploadedFiles,
    imageMetadata,
  });

  payloads.push({
    ...getReportComponentDefinition("cover_page"),
    componentTitle: "Cover Page",
    baseComponent: cloneJson(baseReport.reportInfo || {}),
  });

  payloads.push({
    ...getReportComponentDefinition("table_of_contents"),
    componentTitle: "Table of Contents",
    baseComponent: {
      chapters: [
        "Executive Summary",
        "Plant / Building Details and Energy Profile",
        "Energy Saving Projects",
        "Annexures",
      ],
      groups: groupedProjects.map((group) => ({
        groupNo: group.groupNo,
        groupTitle: group.groupTitle,
        projects: (group.projects || []).map((project) => ({
          projectNo: project.projectNo,
          projectTitle: project.projectTitle,
        })),
      })),
    },
  });

  payloads.push({
    ...getReportComponentDefinition("executive_summary"),
    componentTitle: "Chapter 1: Executive Summary",
    lockedData: getComponentLockedSnapshot(
      baseReport.executiveSummary || {},
      getReportComponentDefinition("executive_summary")?.lockedFields
    ),
    qualityContext: {
      purposeText: baseReport?.executiveSummary?.purposeText,
      keyObservations: groupedProjects.map((group) => group.groupTitle),
      conclusionAndWayForward:
        baseReport?.executiveSummary?.conclusionAndWayForward,
    },
    narrativeInputs: {
      reportType: "Detailed Energy Audit Report",
      clientName: formData.clientName || "Data required",
      facilityType:
        formData.buildingType ||
        baseReport?.buildingProfile?.typeOfBuilding ||
        "Data required",
      auditPurpose:
        baseReport?.executiveSummary?.purposeText || "Data required",
      currentNarrative: {
        purposeText:
          baseReport?.executiveSummary?.purposeText || "Data required",
        keyObservations: baseReport?.executiveSummary?.keyObservations || [],
        conclusionAndWayForward:
          baseReport?.executiveSummary?.conclusionAndWayForward || [],
      },
      projectGroups: groupedProjects.map((group) => ({
        groupTitle: group.groupTitle,
        projectTitles: (group.projects || []).map(
          (project) => project.projectTitle
        ),
      })),
      supportingContext,
      compactSupportingContext,
    },
    mergeTarget: { type: "executive_summary" },
    forbiddenFields:
      getReportComponentDefinition("executive_summary")?.lockedFields || [],
  });

  payloads.push({
    ...getReportComponentDefinition("plant_profile"),
    componentTitle: "Chapter 2: Plant / Building Details and Energy Profile",
    lockedData: getComponentLockedSnapshot(
      baseReport.buildingProfile || {},
      getReportComponentDefinition("plant_profile")?.lockedFields
    ),
    qualityContext: {
      facilityDescription: extractedInfo?.facilityObservations,
      utilityDescription: extractedInfo?.utilityObservations,
      operatingPatternNarrative: extractedInfo?.facilityObservations,
      majorSystemsNarrative: extractedInfo?.utilityObservations,
    },
    narrativeInputs: {
      reportType: "Detailed Energy Audit Report",
      facilityType:
        formData.buildingType ||
        baseReport?.buildingProfile?.typeOfBuilding ||
        "Data required",
      currentNarrative: {
        facilityDescription:
          baseReport?.buildingProfile?.facilityDescription || "Data required",
        utilityDescription:
          baseReport?.buildingProfile?.utilityDescription || "Data required",
        operatingPatternNarrative:
          baseReport?.buildingProfile?.operatingPatternNarrative ||
          "Data required",
        majorSystemsNarrative:
          baseReport?.buildingProfile?.majorSystemsNarrative || "Data required",
      },
      supportingContext,
      facilityContext: {
        facilityName: formData.facilityName || "Data required",
        location: formData.location || "Data required",
        contactPerson: formData.contactPerson || "Data required",
      },
      compactSupportingContext,
    },
    mergeTarget: { type: "plant_profile" },
    forbiddenFields:
      getReportComponentDefinition("plant_profile")?.lockedFields || [],
  });

  groupedProjects.forEach((group, groupIndex) => {
    payloads.push({
      ...getReportComponentDefinition("project_group"),
      componentTitle: `${group.groupNo} ${group.groupTitle}`,
      lockedData: {
        groupNo: group.groupNo,
        groupTitle: group.groupTitle,
        projectCount: Array.isArray(group.projects) ? group.projects.length : 0,
        totalInvestment: group.totalInvestment,
        totalAnnualSaving: group.totalAnnualSaving,
        totalEnergySaving: group.totalEnergySaving,
        weightedPayback: group.weightedPayback,
      },
      qualityContext: {
        summaryParagraph: group.groupTitle,
        technicalObservation: (group.projects || []).map(
          (project) => project.projectTitle
        ),
        implementationStrategy: extractedInfo?.facilityObservations,
        groupConclusion: extractedInfo?.utilityObservations,
      },
      narrativeInputs: {
        reportType: "Detailed Energy Audit Report",
        groupTitle: group.groupTitle || "Data required",
        projectTitles: (group.projects || []).map(
          (project) => project.projectTitle
        ),
        groupProjectContext: (group.projects || []).map((project) => ({
          projectNo: project.projectNo || "Data required",
          projectTitle: project.projectTitle || "Data required",
          equipmentCovered: project.equipmentCovered || "Data required",
          system: project.system || "Data required",
          currentNarrative: {
            existingSystemDescription:
              project.existingSystemDescription || "Data required",
            proposedProjectDescription:
              project.proposedProjectDescription || "Data required",
            rationaleForEnergySaving:
              project.rationaleForEnergySaving || "Data required",
          },
        })),
        currentNarrative: {
          summaryParagraph: group.summaryParagraph || "Data required",
          technicalObservation: group.technicalObservation || "Data required",
          implementationStrategy:
            group.implementationStrategy || "Data required",
          groupConclusion: group.groupConclusion || "Data required",
        },
        supportingContext,
        compactSupportingContext,
      },
      mergeTarget: { type: "project_group", groupIndex },
      forbiddenFields:
        getReportComponentDefinition("project_group")?.lockedFields || [],
    });
  });

  projects.forEach((project, projectIndex) => {
    const supportingNotes =
      (extractedInfo?.projectSupportingNotes || []).find(
        (note) =>
          String(note?.projectNo || "").trim() ===
            String(project.projectNo || "").trim() ||
          String(note?.projectTitle || "")
            .trim()
            .toLowerCase() ===
            String(project.projectTitle || "")
              .trim()
              .toLowerCase()
      ) || {};
    const projectSpecificSupportingContext =
      buildProjectSpecificSupportingContext(
        project,
        extractedInfo,
        uploadedFiles,
        imageMetadata
      );

    const fallbackText = "[To be updated after site data verification]";
    const ecmType = classifyEcmType(project);
    const detTmpl = buildIndustrialEcmDeterministicTemplate(
      project,
      ecmType,
      supportingNotes,
      fallbackText
    );

    payloads.push({
      ...getReportComponentDefinition("project_detail"),
      componentTitle: safeReportValue(project.projectTitle),
      lockedData: getComponentLockedSnapshot(
        project,
        getReportComponentDefinition("project_detail")?.lockedFields
      ),
      qualityContext: {
        existingSystemDescription: detTmpl.existingSystemDescription,
        proposedProjectDescription: detTmpl.proposedProjectDescription,
        rationaleForEnergySaving: detTmpl.rationaleForEnergySaving,
        problemGapIdentified: detTmpl.problemGapIdentified,
        scopeOfWork: detTmpl.scopeOfWork,
        keyActivities: detTmpl.keyActivities,
        measurementVerificationPlan: detTmpl.measurementVerificationPlan,
        benefitsOtherThanEnergySaving: detTmpl.benefitsOtherThanEnergySaving,
        aspectsToBeTakenCareOf: detTmpl.aspectsToBeTakenCareOf,
        finalConclusion: detTmpl.finalConclusion,
      },
      narrativeInputs: {
        reportType: "Detailed Energy Audit Report",
        projectNo: project.projectNo || fallbackText,
        projectTitle: project.projectTitle || fallbackText,
        equipmentCovered: project.equipmentCovered || fallbackText,
        system: project.system || project.groupTitle || fallbackText,
        ecmClassificationType: ecmType,
        baselineContext: detTmpl.existingSystemDescription,
        proposedContext: detTmpl.proposedProjectDescription,
        supportingContext,
        compactSupportingContext: projectSpecificSupportingContext,
        currentNarrative: {
          existingSystemDescription: detTmpl.existingSystemDescription,
          proposedProjectDescription: detTmpl.proposedProjectDescription,
          rationaleForEnergySaving: detTmpl.rationaleForEnergySaving,
          problemGapIdentified: detTmpl.problemGapIdentified,
          scopeOfWork: detTmpl.scopeOfWork,
          keyActivities: detTmpl.keyActivities,
          measurementVerificationPlan: detTmpl.measurementVerificationPlan,
          benefitsOtherThanEnergySaving: detTmpl.benefitsOtherThanEnergySaving,
          aspectsToBeTakenCareOf: detTmpl.aspectsToBeTakenCareOf,
          finalConclusion: detTmpl.finalConclusion,
        },
        deterministicProjectData: {
          groupTitle: project.groupTitle || fallbackText,
          projectActivitiesText: project.projectActivitiesText || fallbackText,
          baselineDetails:
            project.baselineDetails ||
            project.existingOperatingCondition ||
            fallbackText,
          proposedIntervention: project.proposedIntervention || fallbackText,
          existingOperatingCondition:
            project.existingOperatingCondition || fallbackText,
        },
      },
      mergeTarget: { type: "project_detail", projectIndex },
      forbiddenFields:
        getReportComponentDefinition("project_detail")?.lockedFields || [],
    });
  });

  payloads.push({
    ...getReportComponentDefinition("annexures"),
    componentTitle: "Chapter 4: Annexures",
    baseComponent: buildAnnexures(uploadedFiles, imageMetadata),
  });

  return payloads;
}

async function runComponentNarrativeStage(
  payload,
  templateConfig,
  options = {}
) {
  const systemPrompt = `You are a senior energy audit engineer and professional technical report writer for SEE-Tech Solutions.

Your role is explanation enhancement only.

Absolute accuracy rules:
1. Do not change any number.
2. Do not create any new number.
3. Do not estimate any missing number.
4. Do not calculate savings, payback, investment, tariff, CO2, quantities, operating hours, efficiency, kWh, kW, TR, kVAr, or currency values.
5. Do not change project titles, project numbers, equipment names, group names, priorities, or extracted table values.
6. Use only provided context from deterministic report data and uploaded supporting files.
7. If information is missing, write "Data required" or explain generally without inventing facts.
8. Return valid JSON only.
9. Return only allowed narrative fields.
10. Do not include markdown or tables.
11. Do not use generic filler, sales language, or repeated paragraphs.

Writing objective:
- Write like a professional Detailed Energy Audit Report.
- Explain the existing system, the proposed measure, the engineering rationale, the execution scope, the implementation steps, the verification method, the non-energy benefits, and the aspects to be taken care of.
- Use practical engineering language and implementation-oriented wording.
- Interpret the meaning of the available data in words without changing it.`;

  const userPrompt = `Improve the report explanation for this component.
AI is a report writer, not a calculator.

${JSON.stringify(
  {
    componentId: payload.id,
    componentTitle: payload.componentTitle,
    lockedData: payload.lockedData || {},
    narrativeInputs: payload.narrativeInputs || {},
    allowedOutputFields: payload.llmAllowedFields || [],
    forbiddenFields: payload.forbiddenFields || [],
  },
  null,
  2
)}

Return JSON now:`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig, options);
}

async function runBatchComponentNarrativeStage(
  payloads,
  templateConfig,
  options = {}
) {
  const isEcmBatch = payloads.every((p) => p.id === "project_detail");

  const baseSystemPrompt = `You are a senior energy audit engineer and professional technical report writer for SEE-Tech Solutions.

Your role is explanation enhancement only for a Detailed Energy Audit Report.

Absolute accuracy rules:
1. Do not change any number.
2. Do not create any new number.
3. Do not estimate any missing number.
4. Do not calculate savings, payback, investment, tariff, CO2, quantities, operating hours, efficiency, kWh, kW, TR, kVAr, or currency values.
5. Do not change project titles, project numbers, equipment names, group names, priorities, or extracted table values.
6. Use only the provided context.
7. If information is missing, write "[To be updated after site data verification]".
8. Return valid JSON only.
9. Return only allowed narrative fields.
10. Do not include markdown or tables.
11. Do not use generic filler, sales language, exaggerated claims, or repeated text.
12. Use the deterministic Excel reportData as the source of truth for all numeric values.
13. Use supporting PPT/PDF/DOCX text only to improve engineering narrative.
14. Do not change investment, savings, kWh, payback, ECM titles, or quantities.

CRITICAL NEGATIVE CONSTRAINTS:
- NEVER copy internal prompt instructions into the output.
- NEVER use words like 'Explain', 'Discuss', or 'DRAFT'.
- NEVER mention uploaded filenames like '.xlsx', '.pdf', '.docx' etc. Use "based on energy consumption records, equipment information, operational data, and ECM calculations made available during the study" instead.
- NEVER output null, undefined, or "Data required".

Writing objective:
- Write like a professional Detailed Energy Audit Report.
- Improve grammar, readability, technical explanation quality, and flow of the provided deterministic text.
- Interpret available uploaded-file context and deterministic narrative without changing locked values.`;

  const ecmHints = `
Rule-Based Technical Context by ECM Type (DO NOT COPY THESE EXPLICITLY, use as engineering guidance):
- chiller / cooling tower / CT segregation: Relevant principles: condenser water temperature, cooling tower approach, chiller lift, circuit segregation, CT fan/pump control, monitoring strategy.
- pump / VFD / flow optimization: Relevant principles: variable flow, avoiding over-pumping, ΔT/ΔP monitoring, matching flow with load, VFD control logic.
- IE5 / PMSM / motor retrofit: Relevant principles: reduced motor losses, better efficiency at operating load, direct drive/cogged belt benefits, alignment.
- compressed air: Relevant principles: leakage, pressure optimization, specific power, compressor loading/unloading, flow measurement, corrective action.
- heat recovery: Relevant principles: recovering exhaust/waste heat, pre-heating incoming stream, reducing heater energy input, fouling.
- insulation: Relevant principles: surface heat loss reduction, heat retention, reduced reheating, safety.
- IR heater / band heater: Relevant principles: improved heat transfer, better response, reduced standby loss, process temperature control.
- servo retrofit: Relevant principles: demand-based hydraulic operation, reduced idle/part-load losses, better machine control, reduced heat generation.
- AHU / plug fan: Relevant principles: fan efficiency, airflow control, belt loss reduction, static pressure monitoring, VFD integration.
- APFC: Relevant principles: reactive power compensation, PF control, kVA demand impact, harmonic considerations.

Field length guidelines:
- existingSystemBaselineCondition / existingSystemDescription: 80 to 140 words.
- proposedProjectDescription / projectDescriptionEnhanced: 80 to 140 words.
- rationaleForEnergySaving: 80 to 140 words.
- problemGapIdentified: 60 to 100 words.
- scopeOfWork: 4 to 6 practical bullets.
- keyActivities / keyActivitiesNarrative: 4 to 6 execution bullets.
- measurementVerificationPlan: 3 to 5 bullets.
- benefitsOtherThanEnergySaving: 3 to 5 bullets.
- aspectsToBeTakenCareOf: 3 to 5 bullets.
- finalConclusion / conclusion: 60 to 100 words.`;

  const nonEcmHints = `
- existingSystemDescription: 80 to 140 words.
- proposedProjectDescription: 80 to 140 words.
- rationaleForEnergySaving: 80 to 140 words.
- problemGapIdentified: 60 to 100 words.
- scopeOfWork: 4 to 6 practical bullets.
- keyActivities: 4 to 6 execution bullets.
- measurementVerificationPlan: 3 to 5 bullets.
- benefitsOtherThanEnergySaving: 3 to 5 bullets.
- aspectsToBeTakenCareOf: 3 to 5 bullets.
- finalConclusion: 60 to 100 words.`;

  const systemPrompt =
    baseSystemPrompt + "\n" + (isEcmBatch ? ecmHints : nonEcmHints);

  const ecmJsonFormat = `{
  "ecmEnhancements": [
    {
      "ecmNo": "...",
      "existingSystemBaselineCondition": "...",
      "problemGapIdentified": "...",
      "proposedEnergyConservationMeasure": "...",
      "projectDescriptionEnhanced": "...",
      "keyActivitiesNarrative": "...",
      "rationaleForEnergySaving": "...",
      "measurementVerificationPlan": "...",
      "benefitsOtherThanEnergySaving": "...",
      "aspectsToBeTakenCareOf": "...",
      "conclusion": "..."
    }
  ]
}`;

  const nonEcmJsonFormat = `{
  "components": [
    {
      "componentKey": "...",
      "output": {
        "field1": "...",
        "field2": "..."
      }
    }
  ]
}`;

  const userPrompt = `Improve the report explanation for these components.
AI is a report writer, not a calculator.

${JSON.stringify(
  {
    components: payloads.map((payload) => ({
      componentKey: buildComponentInstanceKey(payload),
      componentId: payload.id,
      componentTitle: payload.componentTitle,
      lockedData: payload.lockedData || {},
      narrativeInputs: payload.narrativeInputs || {},
      allowedOutputFields: payload.llmAllowedFields || [],
    })),
  },
  null,
  2
)}

Return JSON exactly in this format. No nested objects inside output:
${isEcmBatch ? ecmJsonFormat : nonEcmJsonFormat}`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig, options);
}

function applyComponentNarrative(
  report,
  payload,
  narrativeOutput,
  approvedTokens,
  warnings
) {
  const allowedOutputFields =
    payload.allowedOutputFields || payload.llmAllowedFields || [];
  const lockedFields = payload.lockedFields || [];

  validateNarrativeOutputShape(
    {
      componentId: payload.id,
      allowedOutputFields,
      lockedFields,
    },
    narrativeOutput,
    approvedTokens,
    warnings
  );

  // Strict QC Scan
  const strictQcScan = (value) => {
    if (typeof value !== "string") return true;
    const lower = value.toLowerCase();
    const blacklist = [
      "data required",
      "[draft",
      "qc review required",
      "undefined",
      "null",
      "explain cooling",
      "explain hydraulic",
      "explain thermal",
      "explain compressed air",
      ".xlsx",
      ".docx",
      ".pdf",
    ];
    for (const bad of blacklist) {
      if (lower.includes(bad)) return false;
    }
    return true;
  };

  const filteredNarrativeOutput = {};
  for (const [key, value] of Object.entries(narrativeOutput)) {
    if (strictQcScan(value)) {
      filteredNarrativeOutput[key] = value;
    } else {
      warnings.push(
        `QC Rejected field '${key}' in component '${payload.id}' due to blacklisted content. Falling back to deterministic.`
      );
    }
  }

  if (payload.mergeTarget?.type === "executive_summary") {
    const before = cloneJson(report.executiveSummary || {});
    const normalizedNarrativeOutput = { ...filteredNarrativeOutput };
    if (
      Array.isArray(normalizedNarrativeOutput.conclusionAndWayForward) &&
      Array.isArray(before.conclusionAndWayForward)
    ) {
      normalizedNarrativeOutput.conclusionAndWayForward =
        before.conclusionAndWayForward.map((stepRow, index) => ({
          ...stepRow,
          action: strictQcScan(
            normalizedNarrativeOutput.conclusionAndWayForward[index]?.action
          )
            ? safeReportValue(
                normalizedNarrativeOutput.conclusionAndWayForward[index]?.action
              )
            : stepRow.action,
        }));
    }
    const merged = mergeNarrativeOnly(
      before,
      normalizedNarrativeOutput,
      allowedOutputFields
    );
    assertLockedFieldsUnchanged(before, merged, lockedFields, payload.id);
    report.executiveSummary = merged;
    return report;
  }

  if (payload.mergeTarget?.type === "plant_profile") {
    const before = cloneJson(report.buildingProfile || {});
    const merged = mergeNarrativeOnly(
      before,
      filteredNarrativeOutput,
      allowedOutputFields
    );
    assertLockedFieldsUnchanged(before, merged, lockedFields, payload.id);
    report.buildingProfile = merged;
    return report;
  }

  if (payload.mergeTarget?.type === "project_group") {
    const idx = payload.mergeTarget.groupIndex;
    const before = cloneJson(report.groupedProjects?.[idx] || {});
    const merged = mergeNarrativeOnly(
      before,
      filteredNarrativeOutput,
      allowedOutputFields
    );
    assertLockedFieldsUnchanged(before, merged, lockedFields, payload.id);
    if (Array.isArray(report.groupedProjects) && report.groupedProjects[idx]) {
      report.groupedProjects[idx] = merged;
    }
    return report;
  }

  if (payload.mergeTarget?.type === "project_detail") {
    const idx = payload.mergeTarget.projectIndex;
    const before = cloneJson(report.projects?.[idx] || {});
    const normalizedNarrativeOutput = { ...filteredNarrativeOutput };
    if (
      normalizedNarrativeOutput.conclusion !== undefined &&
      normalizedNarrativeOutput.finalConclusion === undefined
    ) {
      normalizedNarrativeOutput.finalConclusion =
        normalizedNarrativeOutput.conclusion;
      delete normalizedNarrativeOutput.conclusion;
    }
    if (
      normalizedNarrativeOutput.aspectsToBeTakenCareOf !== undefined &&
      normalizedNarrativeOutput.precautions === undefined
    ) {
      normalizedNarrativeOutput.precautions =
        normalizedNarrativeOutput.aspectsToBeTakenCareOf;
    }
    const effectiveAllowedFields = allowedOutputFields.includes(
      "finalConclusion"
    )
      ? allowedOutputFields
      : [...allowedOutputFields, "finalConclusion", "precautions"];
    const merged = mergeNarrativeOnly(
      before,
      normalizedNarrativeOutput,
      effectiveAllowedFields
    );
    assertLockedFieldsUnchanged(before, merged, lockedFields, payload.id);
    if (Array.isArray(report.projects) && report.projects[idx]) {
      report.projects[idx] = merged;
      report.projects[idx].aspectsToBeTakenCareOf =
        normalizedNarrativeOutput.aspectsToBeTakenCareOf ||
        normalizedNarrativeOutput.precautions ||
        report.projects[idx].aspectsToBeTakenCareOf ||
        report.projects[idx].precautions;
    }
    return report;
  }

  return report;
}

async function generateCommercialAuditComponentReport({
  formData = {},
  extractedExcelData = {},
  extractedInfo = {},
  imageMetadata = [],
  uploadedFiles = [],
  templateConfig,
  baseReportOverride = null,
  useAiOverride = null,
}) {
  const useAiDuringGeneration =
    typeof useAiOverride === "boolean"
      ? useAiOverride
      : String(process.env.USE_AI_DURING_GENERATION || "true").toLowerCase() ===
        "true";
  const aiFinalizationTimeoutMs = Number(
    process.env.AI_FINALIZATION_TIMEOUT_MS ||
      process.env.AI_TOTAL_TIMEOUT_MS ||
      120000
  );
  let providerUsed = "deterministic";
  let providerStatus = "success";
  let modelUsed = null;
  const providerAttempts = [];
  const warnings = [];
  let quotaExceededRetry = null;
  let aiFailureReason = null;
  let allAiEnhancedFields = [];
  let allAiDroppedFields = [];

  let report = baseReportOverride
    ? cloneJson(baseReportOverride)
    : buildCommercialBuildingEnergyAuditBaseData({
        inputDetails: formData,
        extractedExcelData,
        uploadedFiles,
      });

  report = normalizeReportForExport({
    ...report,
    annexures: buildAnnexures(uploadedFiles, imageMetadata),
    buildingProfile: {
      ...(report.buildingProfile || {}),
      facilityName:
        formData.facilityName ||
        report.buildingProfile?.facilityName ||
        "Data required",
      address:
        formData.location || report.buildingProfile?.address || "Data required",
      facilityContactPerson:
        formData.contactPerson ||
        report.buildingProfile?.facilityContactPerson ||
        "Data required",
      auditDate:
        formData.auditPeriod ||
        report.buildingProfile?.auditDate ||
        "Data required",
    },
    executiveSummary: {
      ...(report.executiveSummary || {}),
      numberOfProjects: Array.isArray(report.projects)
        ? report.projects.length
        : 0,
    },
    qcSummary: {
      ...(report.qcSummary || {}),
      componentWorkflow: true,
      numericAuthority: "excel_form_calculation_only",
    },
  });

  const componentPayloads = buildComponentPayloads({
    formData,
    baseReport: report,
    extractedInfo,
    imageMetadata,
    uploadedFiles,
  });

  const approvedTokens = collectApprovedNumericTokens(report);

  for (const payload of componentPayloads) {
    if (payload.qualityContext) {
      report = applyComponentNarrative(
        report,
        payload,
        payload.qualityContext,
        approvedTokens,
        []
      );
    }
  }

  const deterministicReport = finalizeCommercialAuditReport({
    report: cloneJson(report),
    componentPayloads,
    extractedExcelData,
    llmSuccessCount: 0,
    llmFailureCount: 0,
    aiEnhanced: false,
    useAiDuringGeneration,
  });

  let llmSuccessCount = 0;
  let llmFailureCount = 0;
  let lastSuccessProvider = null;
  let lastSuccessModel = null;
  let aiEnhancementFailed = false;
  let exactErrorStr = null;
  let llmEligiblePayloads = componentPayloads.filter(
    (payload) => payload?.allowLLM
  );
  const enhancementMode = process.env.AI_ENHANCEMENT_MODE || "all";
  const maxAiCalls = Number(process.env.MAX_AI_CALLS_PER_REPORT || 1);
  const stopOnRateLimit =
    String(process.env.STOP_AI_ON_RATE_LIMIT || "true").toLowerCase() ===
    "true";
  let aiCallsUsed = 0;
  let batches = [];

  console.log("[AI ENHANCE CONFIG]", {
    mode: process.env.AI_ENHANCEMENT_MODE,
    maxCalls: process.env.MAX_AI_CALLS_PER_REPORT,
    stopOnRateLimit: process.env.STOP_AI_ON_RATE_LIMIT,
  });

  if (!useAiDuringGeneration) {
    warnings.push(
      "AI enhancement disabled. Deterministic report generated successfully."
    );
  } else {
    if (enhancementMode === "selected_projects") {
      const selectedProjectNos = Array.isArray(formData?.aiSelectedProjects)
        ? formData.aiSelectedProjects
            .map((value) => String(value).trim())
            .filter(Boolean)
        : String(process.env.AI_SELECTED_PROJECTS || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
      llmEligiblePayloads = llmEligiblePayloads.filter(
        (payload) =>
          payload?.id === "project_detail" &&
          selectedProjectNos.includes(
            String(payload?.lockedData?.projectNo || "").trim()
          )
      );
    }

    const batchSize = Number(process.env.AI_ENHANCEMENT_BATCH_SIZE || 4);
    batches =
      enhancementMode === "summary_only"
        ? buildSummaryOnlyBatch({
            report,
            formData,
            extractedInfo,
            uploadedFiles,
            imageMetadata,
          })
        : buildStandardNarrativeBatches(llmEligiblePayloads, batchSize);

    if (batches.length) {
      console.log("[AI ENHANCE BATCHES]", {
        enhancementMode,
        batchCount: batches.length,
        maxAiCalls,
      });

      console.time("[REPORT] ai_attempts");
      for (const [b, batch] of batches.entries()) {
        const batchName = batch.name || `Batch ${b + 1}`;
        if (aiCallsUsed >= maxAiCalls) {
          providerAttempts.push({
            provider: "gemini",
            model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
            status: "skipped",
            reason: `MAX_AI_CALLS_PER_REPORT reached (${maxAiCalls})`,
            batch: batchName,
            componentId: batch.componentId,
          });
          break;
        }

        aiCallsUsed += 1;
        try {
          console.log(
            `[REPORT] before AI call for batch ${b + 1}/${batches.length}`
          );
          const result =
            batch.name === "summary_only"
              ? await runSummaryOnlyNarrativeStage(batch, templateConfig, {
                  isManualEnhancement: useAiOverride === true,
                })
              : await runBatchComponentNarrativeStage(
                  batch.payload,
                  templateConfig,
                  { isManualEnhancement: useAiOverride === true }
                );
          console.log(
            `[REPORT] after AI call for batch ${b + 1}/${batches.length}`
          );

          const attempts = result?.providerAttempts || [];
          if (Array.isArray(attempts) && attempts.length) {
            providerAttempts.push(
              ...attempts.map((attempt) => ({
                ...attempt,
                batch: batchName,
                componentId: batch.componentId,
                componentTitle:
                  batch.name === "summary_only"
                    ? "Summary narrative enhancement"
                    : `Batched narrative enhancement (${batchName})`,
              }))
            );
          }

          if (result?.success === false && result?.error) {
            const batchItemCount =
              batch.name === "summary_only"
                ? 1 +
                  (Array.isArray(batch.payload?.groups)
                    ? batch.payload.groups.length
                    : 0)
                : batch.payload.length;
            llmFailureCount += batchItemCount;
            warnings.push(
              `${batchName} AI enhancement failed: ${result.error}`
            );
            if (!exactErrorStr) exactErrorStr = result.error;

            const isQuotaExceeded =
              result?.isQuotaExceeded ||
              attempts.some((a) => a.isQuotaExceeded);
            if (isQuotaExceeded) {
              quotaExceededRetry =
                result?.retryAfterSeconds ||
                attempts.find((a) => a.retryAfterSeconds)?.retryAfterSeconds ||
                60;
              aiFailureReason = `Gemini free quota exceeded. Retry after ${quotaExceededRetry} seconds.`;
              if (stopOnRateLimit) {
                break;
              }
            }
            continue;
          }

          if (batch.name === "summary_only") {
            if (!result?.result || typeof result.result !== "object") {
              llmFailureCount +=
                1 +
                (Array.isArray(batch.payload?.groups)
                  ? batch.payload.groups.length
                  : 0);
              warnings.push(`${batchName} AI returned no summary outputs`);
              continue;
            }

            const summaryResult = applySummaryOnlyNarrative(
              report,
              batch,
              result.result,
              approvedTokens,
              warnings
            );
            report = summaryResult.report;
            if (summaryResult.changedFields) {
              allAiEnhancedFields.push(...summaryResult.changedFields);
            }
            if (summaryResult.droppedFields) {
              allAiDroppedFields.push(...summaryResult.droppedFields);
            }

            if (summaryResult.aiEnhanced) {
              llmSuccessCount += 1;
              lastSuccessProvider = result?.providerUsed || lastSuccessProvider;
              lastSuccessModel = result?.modelUsed || lastSuccessModel;
            } else {
              llmFailureCount +=
                1 +
                (Array.isArray(batch.payload?.groups)
                  ? batch.payload.groups.length
                  : 0);
              warnings.push(
                `${batchName} AI responded, but no valid narrative fields were merged.`
              );
              if (!exactErrorStr)
                exactErrorStr =
                  "AI responded, but no valid narrative fields were merged due to quality checks.";
            }
            continue;
          }

          const batchPayloads = batch.payload;

          if (result?.result && Array.isArray(result.result.ecmEnhancements)) {
            console.log(
              `[REPORT] MAPPING ecmEnhancements to components array...`
            );
            const enhancements = result.result.ecmEnhancements;
            const mappedComponents = [];
            const unmatchedEcms = [];

            enhancements.forEach((enh) => {
              const ecmNoRaw = String(enh.ecmNo || "").trim();
              const matchingPayload = batchPayloads.find(
                (p) => String(p.lockedData?.projectNo || "").trim() === ecmNoRaw
              );

              if (matchingPayload) {
                const componentKey = buildComponentInstanceKey(matchingPayload);
                console.log(
                  `[REPORT] ECM Map Success | ECM: ${ecmNoRaw} -> componentKey: ${componentKey}`
                );

                // Map the specific keys back to the standard narrative keys
                mappedComponents.push({
                  componentKey,
                  output: {
                    existingSystemDescription:
                      enh.existingSystemBaselineCondition ||
                      enh.existingSystemDescription,
                    problemGapIdentified: enh.problemGapIdentified,
                    proposedProjectDescription:
                      enh.proposedEnergyConservationMeasure ||
                      enh.projectDescriptionEnhanced,
                    keyActivities:
                      enh.keyActivitiesNarrative || enh.keyActivities,
                    rationaleForEnergySaving: enh.rationaleForEnergySaving,
                    measurementVerificationPlan:
                      enh.measurementVerificationPlan,
                    benefitsOtherThanEnergySaving:
                      enh.benefitsOtherThanEnergySaving,
                    aspectsToBeTakenCareOf: enh.aspectsToBeTakenCareOf,
                    finalConclusion: enh.conclusion || enh.finalConclusion,
                  },
                });
              } else {
                console.warn(
                  `[REPORT] ECM Map Failure | Unmatched ECM: ${ecmNoRaw}`
                );
                unmatchedEcms.push(ecmNoRaw);
              }
            });

            if (unmatchedEcms.length > 0) {
              warnings.push(
                `${batchName} unmatched ECMs: ${unmatchedEcms.join(", ")}`
              );
            }

            result.result.components = mappedComponents;
          }

          if (!result?.result || !Array.isArray(result.result.components)) {
            llmFailureCount += batchPayloads.length;
            warnings.push(`${batchName} AI returned no component outputs`);
            continue;
          }

          const outputs = result.result.components;
          const payloadMap = new Map(
            batchPayloads.map((payload) => [
              buildComponentInstanceKey(payload),
              payload,
            ])
          );

          if (
            !attempts.some((attempt) => attempt.status === "success") &&
            attempts.length > 0
          ) {
            llmFailureCount += batchPayloads.length;
            warnings.push(
              `${batchName} AI enhancement failed after all model attempts.`
            );
          } else {
            let mergedReport = cloneJson(report);
            outputs.forEach((item) => {
              const payload = payloadMap.get(item?.componentKey);
              if (!payload) return;
              mergedReport = applyComponentNarrative(
                mergedReport,
                payload,
                item?.output || {},
                approvedTokens,
                warnings
              );
              llmSuccessCount += 1;
            });
            report = mergedReport;
            lastSuccessProvider = result?.providerUsed || lastSuccessProvider;
            lastSuccessModel = result?.modelUsed || lastSuccessModel;
          }
        } catch (error) {
          const batchItemCount =
            batch.name === "summary_only"
              ? 1 +
                (Array.isArray(batch.payload?.groups)
                  ? batch.payload.groups.length
                  : 0)
              : batch.payload.length;
          console.error(
            `[REPORT] ${batchName} AI enhancement error:`,
            error.message
          );
          llmFailureCount += batchItemCount;
          warnings.push(
            `${batchName} AI enhancement threw an error: ${error.message}`
          );
          if (!exactErrorStr) exactErrorStr = error.message;

          let attempts = [];
          if (
            Array.isArray(error?.providerAttempts) &&
            error.providerAttempts.length
          ) {
            attempts = error.providerAttempts.map((attempt) => ({
              ...attempt,
              batch: batchName,
              componentId: batch.componentId,
              componentTitle:
                batch.name === "summary_only"
                  ? "Summary narrative enhancement"
                  : `Batched narrative enhancement (${batchName})`,
            }));
            providerAttempts.push(...attempts);
          }

          const isQuotaExceeded =
            error.isQuotaExceeded || attempts.some((a) => a.isQuotaExceeded);
          if (isQuotaExceeded) {
            quotaExceededRetry =
              error.retryAfterSeconds ||
              attempts.find((a) => a.retryAfterSeconds)?.retryAfterSeconds ||
              60;
            aiFailureReason = `Gemini free quota exceeded. Retry after ${quotaExceededRetry} seconds.`;
            if (stopOnRateLimit) {
              break;
            }
          }
        }
      }
      console.timeEnd("[REPORT] ai_attempts");
      console.log("[AI ENHANCE RESULT]", {
        enhancementMode,
        maxAiCalls,
        batchesCreated: batches.length,
        actualGeminiCallsMade: aiCallsUsed,
        providerAttemptsCount: providerAttempts.length,
      });

      if (llmSuccessCount > 0) {
        report = await withTimeout(
          Promise.resolve().then(() => {
            return finalizeCommercialAuditReport({
              report,
              componentPayloads,
              extractedExcelData,
              llmSuccessCount,
              llmFailureCount,
              aiEnhanced: true,
              useAiDuringGeneration,
            });
          }),
          aiFinalizationTimeoutMs,
          "AI finalization"
        );
      } else {
        aiEnhancementFailed = true;
        exactErrorStr = exactErrorStr || "All AI enhancement batches failed";
        report = deterministicReport;
      }
    }
  }

  if (!useAiDuringGeneration) {
    providerUsed = "deterministic";
    providerStatus = "success";
  } else if (llmSuccessCount === 0 || aiEnhancementFailed) {
    providerUsed = "deterministic";
    providerStatus = "success";
  } else {
    providerUsed = lastSuccessProvider || "openrouter";
    providerStatus = llmFailureCount > 0 ? "partial_success" : "success";
    modelUsed = lastSuccessModel || null;
  }

  const aiEnhanced = llmSuccessCount > 0;

  // Merge Check
  const beforeHash = safeHashNarrativeFields(deterministicReport);
  const afterHash = safeHashNarrativeFields(report);
  const mergeHadEffect =
    beforeHash && afterHash
      ? beforeHash !== afterHash
      : Boolean(allAiEnhancedFields.length > 0);

  let finalStatus = "failed_non_blocking";
  let finalFailureReason = aiFailureReason || exactErrorStr;
  let finalEnhancerUsed = "deterministic";

  if (!useAiDuringGeneration) {
    finalStatus = "skipped";
    finalFailureReason = "AI enhancement disabled during generation.";
    finalEnhancerUsed = "none";
  } else if (aiEnhanced) {
    if (!mergeHadEffect) {
      finalStatus = "failed_non_blocking";
      finalFailureReason = "no_enhanced_fields_merged";
      finalEnhancerUsed = "deterministic";

      // Mark latest success attempt as success_but_no_effect
      const lastSuccess = providerAttempts
        .slice()
        .reverse()
        .find((a) => a.status === "success");
      if (lastSuccess) {
        lastSuccess.status = "success_but_no_effect";
      }
    } else if (allAiDroppedFields.length > 0 || llmFailureCount > 0) {
      finalStatus = "partial_success";
      finalEnhancerUsed = providerUsed;
    } else {
      finalStatus = "success";
      finalEnhancerUsed = providerUsed;
    }
  } else if (
    quotaExceededRetry &&
    !providerAttempts.some((attempt) => attempt.provider === "openrouter")
  ) {
    finalFailureReason = `quota_exceeded (${quotaExceededRetry}s)`;
  } else {
    finalFailureReason = exactErrorStr || "All AI providers failed";
  }

  const aiEnhancementStatus = {
    status: finalStatus,
    finalEnhancerUsed: finalEnhancerUsed,
    providerAttempts,
    fieldsRequested: allAiEnhancedFields.length + allAiDroppedFields.length,
    fieldsGenerated: allAiEnhancedFields.length,
    fieldsAccepted: allAiEnhancedFields.length, // Simplified mapping
    fieldsDropped: allAiDroppedFields.length,
    ecmsRequested: batches.length, // Simplified mapping
    ecmsEnhanced: llmSuccessCount,
    failureReason: finalFailureReason,
    userMessage: "",
    developerMessage: exactErrorStr,
    droppedFields: allAiDroppedFields,
    warnings: warnings,
    errors: exactErrorStr ? [exactErrorStr] : [],
  };

  return {
    report: aiEnhanced && mergeHadEffect ? report : deterministicReport,
    deterministicReport,
    providerUsed,
    providerStatus,
    modelUsed,
    providerAttempts,
    warnings,
    providerWarning: aiEnhancementStatus.failureReason,
    aiEnhanced: aiEnhanced && mergeHadEffect,
    aiEnhancementStatus,
    aiFailureReason: finalFailureReason,
    retryAfterSeconds: quotaExceededRetry,
    componentPayloads,
    aiEnhancedFields: allAiEnhancedFields,
    aiDroppedFields: allAiDroppedFields,
    debug: {
      enhancementMode,
      maxAiCalls,
      batchesCreated: useAiDuringGeneration ? batches.length : 0,
      actualGeminiCallsMade: aiCallsUsed,
      providerAttemptsCount: providerAttempts.length,
      unmatchedEcmCount: warnings.filter((w) => /unmatched ECM/i.test(w))
        .length,
    },
    error: exactErrorStr,
  };
}

// ============================================================================
// STAGE 1: DOCUMENT EXTRACTION
// ============================================================================
async function runStage1Extraction({
  retrievedChunks,
  imageMetadata,
  formData,
  excelTruth,
  templateConfig,
}) {
  const systemPrompt = `You are SEE-Tech Solutions' engineering report information extractor.
Your task is to read the retrieved document chunks and extract only useful information for a Detailed Energy Audit Report.

Return valid JSON only.
Do not return markdown.
Do not invent numerical values.
Do not change Excel-derived project numbers, project names, investment, savings, payback, or duration.
If information is missing, return "Data required".

Extract information into this JSON structure:
{
  "facilityObservations": [],
  "utilityObservations": [],
  "projectSupportingNotes": [
    {
      "projectNo": "",
      "projectTitle": "",
      "existingConditionNotes": "",
      "proposedMeasureNotes": "",
      "rationaleNotes": "",
      "implementationNotes": "",
      "precautionNotes": "",
      "measurementVerificationNotes": "",
      "caseStudyNotes": "",
      "sourceReferences": []
    }
  ],
  "imageMappings": [
    {
      "imageFileName": "",
      "projectNo": "",
      "caption": "",
      "placementSection": ""
    }
  ],
  "missingInformation": []
}

Rules:
- Match document notes to projects using projectNo or projectTitle.
- Do not create new projects.
- Do not change project titles.
- Do not invent data.
- Use source references when possible.`;

  const userPrompt = `### Form Data:
${JSON.stringify(formData, null, 2)}

### Excel Projects (TRUTH):
${JSON.stringify(excelTruth.projects, null, 2)}

### Image Metadata:
${JSON.stringify(imageMetadata, null, 2)}

### Retrieved Document Text:
${retrievedChunks}

Extract the JSON now:`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig);
}

// ============================================================================
// STAGE 2: BASE REPORT JSON BUILDER
// ============================================================================
async function runStage2Builder({
  formData,
  excelTruth,
  extractedInfo,
  templateConfig,
}) {
  const systemPrompt = `You are SEE-Tech Solutions' Detailed Energy Audit Report JSON builder.

Return valid JSON only.
Do not return markdown.
Do not include explanations outside JSON.

You must build a report JSON matching the fixed CommercialBuildingEnergyAuditData schema.

Core rules:
Excel decides:
- projectNo
- projectTitle
- equipmentCovered
- systemCategory
- investment
- annualSaving
- energySaving
- payback
- duration
- priority

Form decides:
- clientName
- facilityName
- buildingType
- location
- auditPeriod
- reportDate
- preparedBy
- documentVersion

Document extraction decides:
- existing condition details
- observations
- rationale notes
- implementation notes
- M&V notes
- case study notes
- figure captions

AI may only generate narrative fields.
Do not modify Excel truth fields.

Required output structure:
{
  "reportInfo": {},
  "executiveSummary": {},
  "buildingProfile": {},
  "groupedProjects": [],
  "projects": [],
  "annexures": {},
  "qcSummary": {}
}

The report must be divided into:
1. Cover Page
2. Table of Contents
3. Executive Summary
4. Plant / Building Details and Energy Profile
5. Group-wise Energy Saving Projects
6. ECM-wise project chapters
7. Annexures`;

  const userPrompt = `### Form Data:
${JSON.stringify(formData, null, 2)}

### Excel Truth:
${JSON.stringify(excelTruth, null, 2)}

### Extracted Document Info:
${JSON.stringify(extractedInfo, null, 2)}

Build the base report JSON now:`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig);
}

// ============================================================================
// STAGE 3: EXECUTIVE SUMMARY
// ============================================================================
async function runStage3ExecSummary({
  formData,
  excelTruth,
  baseReport,
  templateConfig,
}) {
  const systemPrompt = `You are SEE-Tech Solutions' Executive Summary Generator.

Return valid JSON only.

Required output structure:
{
  "purposeText": [],
  "keyObjectives": [],
  "scopeOfAssessment": [],
  "expectedOutcomes": [],
  "strategicImportance": [],
  "keyFindings": [],
  "financialHighlightsNarrative": [],
  "energySavingPotentialNarrative": [],
  "recommendedImplementationApproach": []
}

Rules:
- Generate professional consulting-style narratives.
- Convert all content into structured sections with bullet points. Each array item in the JSON should be a bullet point.
- Target 300-600 words for each major section.
- Expand each subsection substantially explaining why issues matter, operational implications, and business impact.
- Use exact totals from ExcelTruth. Do not invent energy savings, investments, or payback periods.
- Mention number of ECMs from cleaned project count.
- Keep professional SEE-Tech tone. Use professional language similar to Tier-1 energy consulting reports.
- Use ₹ for financial values.`;

  const userPrompt = `### Base Report Details:
${JSON.stringify(baseReport.reportInfo, null, 2)}

### Excel Truth Totals & Projects:
${JSON.stringify({ totals: excelTruth.portfolioTotals, groups: excelTruth.groupTotals, projects: excelTruth.projects }, null, 2)}

Generate Executive Summary JSON now:`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig);
}

// ============================================================================
// STAGE 4: GROUP CHAPTER GENERATOR
// ============================================================================
async function runStage4GroupChapters({
  groupedProjects,
  extractedInfo,
  templateConfig,
}) {
  const systemPrompt = `You are SEE-Tech Solutions' Group Chapter Generator.

Return valid JSON only.

Required output structure:
{
  "groupNarratives": [
    {
      "groupNo": "",
      "groupTitle": "",
      "summaryParagraph": "",
      "technicalObservation": "",
      "implementationStrategy": "",
      "groupConclusion": ""
    }
  ]
}

Rules:
- Do not change group project list.
- Do not change group totals.
- Do not create or remove groups.
- Use professional energy-audit language.`;

  const userPrompt = `### Grouped Projects Data:
${JSON.stringify(groupedProjects, null, 2)}

### Extracted Info:
${JSON.stringify(extractedInfo?.facilityObservations, null, 2)}

Generate Group Narratives JSON now:`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig);
}

// ============================================================================
// STAGE 5: ECM PROJECT NARRATIVE GENERATOR
// ============================================================================
async function runStage5ProjectNarratives({
  projectsBatch,
  extractedNotes,
  imageRefs,
  templateConfig,
}) {
  const systemPrompt = `You are SEE-Tech Solutions' ECM Project Narrative Generator.

Return valid JSON only.

Required output structure:
{
  "projectNarratives": [
    {
      "projectNo": "",
      "projectTitle": "",
      "existingSystemDescription": "",
      "baselineDataExplanation": "",
      "problemGapIdentified": "",
      "proposedProjectDescription": "",
      "scopeOfWork": [],
      "keyActivities": [],
      "rationaleForEnergySaving": "",
      "energySavingCalculationNarrative": "",
      "carbonFootprintNarrative": "",
      "technicalSpecifications": [],
      "schematicFramework": [],
      "implementationPrecautions": [],
      "measurementVerificationPlan": [],
      "benefitsOtherThanEnergySaving": [],
      "caseStudies": [],
      "conclusion": ""
    }
  ]
}

Rules:
- Do not change projectNo or projectTitle.
- Do not change numerical values.
- If document notes are missing, write engineering-specific but cautious narrative.
- Do not use the same generic paragraph for all ECMs.
- Generate narrative based on project type.`;

  const userPrompt = `### Projects Batch:
${JSON.stringify(projectsBatch, null, 2)}

### Extracted Notes:
${JSON.stringify(extractedNotes, null, 2)}

### Images:
${JSON.stringify(imageRefs, null, 2)}

Generate Project Narratives JSON now:`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig);
}

// ============================================================================
// STAGE 6: FINAL POLISHER
// ============================================================================
async function runStage6Polisher({ finalReport, templateConfig }) {
  const systemPrompt = `You are SEE-Tech Solutions' report quality reviewer.

Return valid JSON only.
Do not change numerical values.
Do not change project list.
Do not change group assignments.
Only improve grammar, clarity and professional tone of narrative fields.

Check:
- no repeated generic narratives
- no [object Object]
- no markdown
- no raw JSON strings inside values
- no missing title
- no incorrect group names
- no Data required in TOC
- all sections are professional`;

  const userPrompt = `### Final Assembled Report JSON:
${JSON.stringify(finalReport, null, 2)}

Polish and return the JSON now:`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig);
}

// ============================================================================
// MERGE LOGIC (Step 10)
// ============================================================================
function mergeNarrativeWithExcelTruth(excelTruthProjects, aiNarratives) {
  // We strictly loop over excelTruth to preserve its array structure and protected fields.
  const mergedProjects = [];
  const aiNarrativesMap = {};

  if (aiNarratives && Array.isArray(aiNarratives)) {
    aiNarratives.forEach((n) => {
      if (n.projectNo) aiNarrativesMap[n.projectNo] = n;
      else if (n.projectTitle)
        aiNarrativesMap[n.projectTitle.toLowerCase()] = n;
    });
  }

  const allowedAiFields = [
    "existingSystemDescription",
    "problemGapIdentified",
    "proposedProjectDescription",
    "scopeOfWork",
    "keyActivities",
    "rationaleForEnergySaving",
    "precautions",
    "measurementVerificationPlan",
    "benefitsOtherThanEnergySaving",
    "caseStudies",
    "conclusion",
    "energySavingCalculationNarrative",
    "carbonFootprintNarrative",
    "technicalSpecifications",
    "schematicFramework",
    "baselineDataExplanation",
  ];

  excelTruthProjects.forEach((excelProj) => {
    const aiNarrative =
      aiNarrativesMap[excelProj.projectNo] ||
      aiNarrativesMap[excelProj.projectTitle?.toLowerCase()] ||
      {};
    const merged = { ...excelProj };

    allowedAiFields.forEach((field) => {
      if (aiNarrative[field] && aiNarrative[field] !== "Data required") {
        merged[field] = aiNarrative[field];
      }
    });

    mergedProjects.push(merged);
  });

  return mergedProjects;
}

// ============================================================================
// DETERMINISTIC FALLBACK (Offline Generation)
// ============================================================================
function buildDeterministicCommercialAuditFallback({
  formData,
  excelTruth,
  extractedExcelData,
}) {
  const {
    projects = [],
    portfolioTotals = {},
    groupTotals = [],
  } = excelTruth || {};

  const report = {
    reportInfo: {
      clientName: formData.clientName || "Data required",
      facilityName: formData.facilityName || "Data required",
      location: formData.location || "Data required",
      auditPeriod: formData.auditPeriod || "Data required",
      preparedBy: formData.preparedBy || "SEE-Tech Solutions",
      documentVersion: formData.documentVersion || "1.0",
      reportTitle: "Detailed Energy Audit Report",
    },
    executiveSummary: {
      purposeText: [
        "The purpose of this detailed energy audit is to identify practical energy conservation measures that can be implemented through a disciplined combination of engineering review, operating assessment, and project-level prioritization.",
        "The audit translates observed system inefficiencies into implementation-ready opportunities so management can plan energy cost reduction actions with clear technical scope, operational relevance, and execution focus.",
      ],
      keyObjectives: [
        "Identify and quantify energy-saving opportunities across all major utility and process systems.",
        "Provide a structured roadmap for implementing control improvements, equipment efficiency upgrades, and system optimization initiatives.",
        "Establish baseline performance metrics to enable effective post-implementation measurement and verification.",
      ],
      scopeOfAssessment: [
        "Comprehensive review of historical energy consumption patterns and utility billing data.",
        "Detailed performance evaluation of major energy-consuming systems including HVAC, compressed air, pumping, and production machinery.",
        "Assessment of existing control logic, operating practices, and maintenance procedures impacting energy efficiency.",
      ],
      expectedOutcomes: [
        "A prioritized portfolio of energy conservation measures (ECMs) categorized by technical feasibility and financial return.",
        "Clear recommendations for immediate operational improvements requiring minimal capital investment.",
        "Strategic guidance for long-term capital planning related to major equipment replacements and system retrofits.",
      ],
      strategicImportance: [
        "Enhances operational resilience by reducing exposure to energy price volatility and supply constraints.",
        "Supports corporate sustainability goals through quantifiable reductions in carbon emissions and environmental impact.",
        "Improves overall facility competitiveness by lowering production costs and optimizing resource utilization.",
      ],
      keyFindings: [
        "The identified ECM portfolio covers multiple functional systems, allowing management to sequence implementation across operational improvements, control upgrades, and equipment-efficiency measures instead of treating all projects as a single package.",
        "Measures linked to operating control, load matching, and reduction of avoidable system losses are generally suitable early implementation candidates because they strengthen performance discipline while preparing the site team for larger retrofit actions.",
        "Projects associated with major utility systems and continuously operating process support equipment warrant close management attention because sustained operating hours make these systems important contributors to the overall energy-improvement roadmap.",
      ],
      financialHighlightsNarrative: [
        "The proposed energy conservation measures offer a highly attractive financial return, driven by significant reductions in annual operating costs.",
        "A balanced mix of low-cost operational improvements and high-return capital projects provides a robust investment portfolio for management consideration.",
      ],
      energySavingPotentialNarrative: [
        "Substantial energy savings can be achieved through a combination of enhanced system controls, elimination of avoidable losses, and targeted equipment upgrades.",
        "The projected energy reductions are grounded in verified baseline data and conservative engineering calculations to ensure reliable and achievable outcomes.",
      ],
      recommendedImplementationApproach: [
        "Review the identified ECM portfolio group-wise so implementation can be sequenced across quick operational actions, control improvements, and larger retrofit measures.",
        "Confirm project-wise priority, execution windows, and cross-functional ownership with plant, maintenance, production, and electrical teams before detailed engineering begins.",
        "Develop detailed engineering, technical specifications, and integration requirements for the shortlisted measures, including instrumentation, controls, and safety interfaces.",
        "Carry out installation, control tuning, testing, and commissioning with documented baseline reference and post-implementation performance checks.",
      ],
      totalAnnualElectricityConsumption:
        extractedExcelData?.annualElectricityConsumption || "Data required",
      annualElectricityCost:
        extractedExcelData?.annualElectricityCost || "Data required",
      averageTariff: extractedExcelData?.averageTariff || "Data required",
      numberOfProjects: projects.length,
      totalEnergySavingPotential: portfolioTotals.totalEnergySaving || 0,
      totalAnnualCostSavingPotential:
        portfolioTotals.totalAnnualCostSaving || 0,
      totalEstimatedInvestment: portfolioTotals.totalEstimatedInvestment || 0,
      simplePaybackPeriod:
        portfolioTotals.averagePaybackPeriod || "Data required",
      co2ReductionPotential:
        portfolioTotals.totalCO2Reduction || "Data required",
      categoryWiseSummary: groupTotals.map((g) => ({
        category: g.groupTitle || g.groupNo,
        numberOfProjects: g.projectCount,
        estimatedInvestment: g.totalInvestment,
        annualCostSaving: g.totalSaving,
        energySaving: g.totalEnergySaving,
        simplePaybackPeriod: g.averagePayback,
      })),
    },
    buildingProfile: {
      facilityName: formData.facilityName || "Data required",
      address: formData.location || "Data required",
      typeOfBuilding: formData.buildingType || "Data required",
    },
    projects: [],
    groupedProjects: [],
    annexures: {},
    qcSummary: {
      qcPassed: true,
      notes: "Generated using deterministic fallback.",
    },
  };

  const getFallbackNarrative = (title, system) => {
    const txt = (String(title) + " " + String(system)).toLowerCase();

    if (
      txt.includes("chiller") ||
      txt.includes("cooling tower") ||
      txt.includes("ct") ||
      txt.includes("pump") ||
      txt.includes("vfd") ||
      txt.includes("cooling") ||
      txt.includes("chw")
    ) {
      return {
        existingSystemDescription:
          "The existing cooling system operates with suboptimal control logic and fixed-speed components, leading to energy wastage during part-load conditions. Explain cooling tower approach, chilled water flow, condenser water temperature, pump control, VFD, delta T/delta P, kW/TR, free cooling if applicable.",
        proposedProjectDescription:
          "It is proposed to optimize the cooling system by implementing advanced controls or variable frequency drives to match the cooling load demand.",
        rationaleForEnergySaving:
          "Energy saving is achieved by dynamically adjusting the cooling capacity and flow rates to match the actual building load, reducing unnecessary power consumption.",
      };
    }
    if (
      txt.includes("servo") ||
      txt.includes("asb") ||
      txt.includes("ebm") ||
      txt.includes("hydraulic") ||
      txt.includes("production machine")
    ) {
      return {
        existingSystemDescription:
          "The production machine utilizes a conventional fixed-speed motor and variable displacement pump, running continuously even during idle cycles. Explain hydraulic motor loading, idle losses, servo control, process stability, machine response, reduced energy during partial load.",
        proposedProjectDescription:
          "It is proposed to retrofit the machine with a servo-hydraulic system or advanced controls, replacing the fixed-speed motor with a servo motor.",
        rationaleForEnergySaving:
          "The servo motor varies its speed precisely according to the pressure and flow requirements of the cycle, almost eliminating idle running losses.",
      };
    }
    if (
      txt.includes("compress") ||
      txt.includes("air") ||
      txt.includes("booster")
    ) {
      return {
        existingSystemDescription:
          "The compressed air system operates with poor load/unload control, higher than required generation pressure, or significant leakage losses. Explain compressed air monitoring, CFM/kW, leakage, pressure control, compressor loading/unloading, booster automation.",
        proposedProjectDescription:
          "It is proposed to optimize the compressed air system by installing a master controller, reducing generation pressure, and rectifying air leaks.",
        rationaleForEnergySaving:
          "Reducing the compressor discharge pressure and minimizing unloaded running hours drastically reduces the specific power consumption (kW/CFM) of the system.",
      };
    }
    if (
      txt.includes("ie5") ||
      txt.includes("motor") ||
      txt.includes("pmsm") ||
      txt.includes("direct mount")
    ) {
      return {
        existingSystemDescription:
          "The existing equipment is driven by standard efficiency (IE2/IE3) induction motors or older rewound motors with high inherent electrical losses. Explain motor efficiency class, reduced electrical losses, belt loss reduction, direct drive reliability, VFD compatibility.",
        proposedProjectDescription:
          "It is proposed to replace the existing inefficient motors with ultra-premium efficiency (IE5) synchronous reluctance or permanent magnet motors.",
        rationaleForEnergySaving:
          "IE5 motors operate with significantly lower electrical and magnetic losses, and maintain high efficiency even at partial loads, directly reducing kWh consumption.",
      };
    }
    if (
      txt.includes("insulation") ||
      txt.includes("hot duct") ||
      txt.includes("dryer") ||
      txt.includes("recovery") ||
      txt.includes("heat")
    ) {
      return {
        existingSystemDescription:
          "The existing thermal surfaces lack proper insulation or exhaust heat is discharged into the environment, leading to significant thermal energy losses. Explain thermal losses, exhaust heat reuse, surface heat loss reduction, preheating, improved thermal efficiency.",
        proposedProjectDescription:
          "It is proposed to apply high-density thermal insulation or install a heat recovery system to capture waste heat.",
        rationaleForEnergySaving:
          "Proper insulation or heat recovery creates a thermal barrier that reduces heat transfer and offsets fuel/electricity required by primary heating equipment.",
      };
    }
    if (
      txt.includes("ir heater") ||
      txt.includes("band heater") ||
      txt.includes("heater")
    ) {
      return {
        existingSystemDescription:
          "The existing heating system uses conventional elements with high ambient heat loss and slow response times. Explain heating efficiency, targeted heat transfer, reduced warm-up loss, better temperature control.",
        proposedProjectDescription:
          "It is proposed to upgrade the heating elements to IR heaters or insulated band heaters.",
        rationaleForEnergySaving:
          "Advanced heaters provide targeted radiant or conductive heat transfer with minimal convection losses, lowering the power required to maintain process temperatures.",
      };
    }
    if (
      txt.includes("apfc") ||
      txt.includes("kvar") ||
      txt.includes("power factor")
    ) {
      return {
        existingSystemDescription:
          "The electrical system exhibits a lower power factor, resulting in higher apparent power (kVA) demand and potential utility penalties. Explain power factor correction, reactive power management, relay control, capacitor health, electrical stability.",
        proposedProjectDescription:
          "It is proposed to install or upgrade the Automatic Power Factor Correction (APFC) panel with intelligent controllers and detuned reactors.",
        rationaleForEnergySaving:
          "Improving the power factor reduces the kVA demand from the utility grid, lowering demand charges and reducing I²R losses in the internal distribution network.",
      };
    }

    // Generic fallback
    return {
      existingSystemDescription:
        "The existing system operates without optimal energy conservation measures, leading to higher than necessary energy consumption.",
      proposedProjectDescription:
        "It is proposed to implement targeted energy efficiency improvements, optimizing equipment operation and reducing losses.",
      rationaleForEnergySaving:
        "The project reduces energy consumption by improving the operational efficiency and eliminating avoidable energy waste in the system.",
    };
  };

  report.projects = projects.map((p) => {
    const narrative = getFallbackNarrative(p.projectTitle, p.system);
    return {
      ...p,
      existingSystemDescription: narrative.existingSystemDescription,
      proposedProjectDescription: narrative.proposedProjectDescription,
      rationaleForEnergySaving: narrative.rationaleForEnergySaving,
      problemGapIdentified:
        "The audit identified an operating gap in this area where the present arrangement continues to meet the process requirement, but not with the most disciplined use of energy, controls, or utility support. The observed condition indicates that avoidable losses, conservative operating logic, or limited demand matching are allowing energy use to remain higher than necessary during normal operation.",
      scopeOfWork: [
        {
          srNo: 1,
          scopeItem:
            "Carry out detailed site verification, engineering review, and implementation planning for the identified measure.",
        },
        {
          srNo: 2,
          scopeItem:
            "Finalize technical scope, equipment selection, controls interface, and required field modifications.",
        },
        {
          srNo: 3,
          scopeItem:
            "Arrange supply, installation, and integration of the approved components and associated accessories.",
        },
        {
          srNo: 4,
          scopeItem:
            "Complete testing, commissioning, and operating-sequence validation under representative site conditions.",
        },
        {
          srNo: 5,
          scopeItem:
            "Document the implemented arrangement and hand over the monitoring and verification approach to the site team.",
        },
      ],
      keyActivities: [
        {
          activity: "Baseline review",
          details:
            "Confirm existing operating condition, control approach, and implementation boundary for the identified ECM.",
          responsibility: "SEE-Tech + Client",
        },
        {
          activity: "Engineering finalization",
          details:
            "Freeze the detailed technical approach, controls logic, and integration requirement before execution.",
          responsibility: "SEE-Tech",
        },
        {
          activity: "Execution planning",
          details:
            "Coordinate materials, shutdown needs, field access, and installation sequence with the client team.",
          responsibility: "SEE-Tech / Client",
        },
        {
          activity: "Installation and commissioning",
          details:
            "Implement the selected measure, verify correct operation, and tune the arrangement where required.",
          responsibility: "SEE-Tech / Vendor",
        },
        {
          activity: "Post-implementation follow-up",
          details:
            "Review stabilized operation and confirm the measurement and verification approach for sustained performance tracking.",
          responsibility: "SEE-Tech + Client",
        },
      ],
      measurementVerificationPlan: [
        {
          parameter: "Existing operating condition",
          baselineMeasurement:
            "Record the present operating logic, loading pattern, and site observations before implementation.",
          postImplementationMeasurement:
            "Confirm the revised operating arrangement after commissioning and stabilization.",
        },
        {
          parameter: "Representative performance trend",
          baselineMeasurement:
            "Document pre-implementation system behavior under normal operating conditions.",
          postImplementationMeasurement:
            "Compare post-implementation behavior under similar operating conditions.",
        },
        {
          parameter: "Normalized review",
          baselineMeasurement:
            "Establish baseline records with relevant operating references for later comparison.",
          postImplementationMeasurement:
            "Review the improved condition after normalizing for comparable production, load, or seasonal influence.",
        },
        {
          parameter: "Sustained verification",
          baselineMeasurement:
            "Identify existing monitoring practice before execution.",
          postImplementationMeasurement:
            "Confirm that the site team has a practical follow-up method to sustain the achieved improvement.",
        },
      ],
      benefitsOtherThanEnergySaving: [
        {
          benefit: "Improved reliability",
          description:
            "Better control and stronger operating discipline can reduce avoidable stress on the affected equipment or utility system.",
        },
        {
          benefit: "Reduced manual intervention",
          description:
            "A clearer operating approach reduces repeated operator adjustment and improves implementation consistency.",
        },
        {
          benefit: "Better monitoring visibility",
          description:
            "The measure supports stronger understanding of system behavior and easier post-implementation follow-up.",
        },
        {
          benefit: "Improved maintenance readiness",
          description:
            "Documented engineering changes and a more stable operating condition support cleaner maintenance planning.",
        },
      ],
      aspectsToBeTakenCareOf: [
        {
          aspect: "Field compatibility",
          careRequired:
            "Verify compatibility of the proposed modification with the existing equipment, controls, and utility interfaces before execution.",
        },
        {
          aspect: "Shutdown and access planning",
          careRequired:
            "Plan implementation windows, access arrangements, and coordination with operations so execution does not create avoidable disruption.",
        },
        {
          aspect: "Safety and commissioning discipline",
          careRequired:
            "Complete required isolation, safety checks, and commissioning review before the system is returned to service.",
        },
        {
          aspect: "Post-implementation follow-up",
          careRequired:
            "Confirm operator orientation, monitoring responsibility, and early-stage performance review after implementation.",
        },
      ],
      precautions: [
        {
          aspect: "Field compatibility",
          careRequired:
            "Verify compatibility of the proposed modification with the existing equipment, controls, and utility interfaces before execution.",
        },
        {
          aspect: "Shutdown and access planning",
          careRequired:
            "Plan implementation windows, access arrangements, and coordination with operations so execution does not create avoidable disruption.",
        },
        {
          aspect: "Safety and commissioning discipline",
          careRequired:
            "Complete required isolation, safety checks, and commissioning review before the system is returned to service.",
        },
        {
          aspect: "Post-implementation follow-up",
          careRequired:
            "Confirm operator orientation, monitoring responsibility, and early-stage performance review after implementation.",
        },
      ],
      finalConclusion:
        "This project is technically suitable for implementation because it addresses an observed operating inefficiency through a practical and implementation-ready corrective measure. The recommendation supports the facility's broader energy-performance roadmap and can be executed through structured engineering, commissioning, and verification follow-through.",
      conclusion: `This project is technically feasible and financially attractive. With an estimated investment of ₹${p.estimatedInvestment || "0"}, it will yield an annual saving of ₹${p.expectedAnnualCostSaving || "0"} with a simple payback of ${p.simplePaybackPeriod || "N/A"}. It is recommended for implementation.`,
    };
  });

  report.groupedProjects = buildProjectGroups(report.projects).map((group) => ({
    ...group,
    summaryParagraph: `This group covers ${Array.isArray(group.projects) ? group.projects.length : 0} energy conservation measure${Array.isArray(group.projects) && group.projects.length === 1 ? "" : "s"} under the ${group.groupTitle} opportunity area. The grouped view helps management review related projects together, understand the common inefficiencies being addressed, and plan implementation in a more structured manner across the same functional system.`,
    technicalObservation:
      "The measures in this category focus on improving how the system operates in practice by strengthening control discipline, reducing avoidable losses, and improving the alignment between utility supply and actual process demand. This makes the group important from both an implementation-planning and sustained-performance perspective.",
    implementationStrategy:
      "Implementation should combine site verification, detailed engineering, shutdown coordination where required, and post-commissioning performance review so the group-level outcomes remain stable after execution.",
    groupConclusion: `The ${group.groupTitle} category remains relevant because it translates related site observations into implementable engineering actions that support the facility's wider energy-management roadmap.`,
  }));

  return report;
}

module.exports = {
  REPORT_COMPONENTS,
  runStage1Extraction,
  runStage2Builder,
  runStage3ExecSummary,
  runStage4GroupChapters,
  runStage5ProjectNarratives,
  runStage6Polisher,
  mergeNarrativeOnly,
  assertLockedFieldsUnchanged,
  mergeNarrativeWithExcelTruth,
  buildDeterministicCommercialAuditFallback,
  buildComponentPayloads,
  generateCommercialAuditComponentReport,
};
