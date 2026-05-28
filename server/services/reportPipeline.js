const { getLLMProvider } = require("../utils/helpers");
const { cleanJsonResponse, generateWithOpenRouterFallback } = require("./llmProviderService");
const { generateWithGemini } = require("./geminiProviderService");
const {
  buildCommercialBuildingEnergyAuditBaseData,
  cleanAndDeduplicateProjects,
  buildProjectGroups,
  normalizeReportForExport,
  safeReportValue,
} = require("./llmProviderService");
const { REPORT_COMPONENTS, getReportComponentDefinition } = require("./reportComponentRegistry");

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

/**
 * Helper to call the active LLM provider for a prompt stage
 */
async function runPromptStage(systemPrompt, userPrompt, templateConfig, options = {}) {
  let providerUsed = "none";
  let providerStatus = "idle";
  let fallbackReason = "";
  let jsonResult = null;
  let modelUsed = null;
  let providerAttempts = [];

  const provider = (process.env.AI_PROVIDER || process.env.LLM_PROVIDER || "openrouter").toLowerCase();

  console.log("[runPromptStage] Selected provider:", provider);

  // A. Try AnythingLLM if explicitly enabled
  if (templateConfig?.useAnythingLLM === true && process.env.ANYTHING_LLM_WORKSPACE_SLUG) {
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
        return { result: jsonResult, providerUsed, providerStatus, fallbackReason, modelUsed, providerAttempts };
      }
    } catch (e) {
      console.error("[runPromptStage] AnythingLLM failed:", e.message);
      fallbackReason += `AnythingLLM: ${e.message}; `;
    }
  }

  // B0. Try Gemini
  if (!jsonResult && provider === "gemini") {
    console.log("[REPORT PIPELINE] About to call generateWithGemini");
    const promptText = `System:\n${systemPrompt}\n\nUser:\n${userPrompt}`;
    const geminiResult = await generateWithGemini(promptText);
    
    if (geminiResult.providerAttempts) {
      providerAttempts.push(...geminiResult.providerAttempts);
    } else {
      providerAttempts.push({
        provider: "gemini",
        model: geminiResult.modelUsed || "gemini-1.5-flash",
        status: geminiResult.success ? "success" : "failed",
        reason: geminiResult.error || null,
        error: geminiResult.error || null
      });
    }

    if (geminiResult.success) {
      try {
        jsonResult = cleanJsonResponse(geminiResult.content);
        providerUsed = "gemini";
        providerStatus = "success";
        modelUsed = geminiResult.modelUsed;
        return { 
          result: jsonResult, 
          providerUsed, 
          providerStatus,
          fallbackReason,
          modelUsed,
          providerAttempts
        };
      } catch (parseError) {
        console.warn(`[runPromptStage] Initial Gemini JSON parse failed, attempting repair...`);
        const repairPrompt = `System:\nFix this into valid JSON only. Do not change values. Do not add fields.\n\nUser:\n${geminiResult.content}`;
        const repairResult = await generateWithGemini(repairPrompt);
        
        providerAttempts.push({
          provider: "gemini",
          model: repairResult.modelUsed || "gemini-1.5-flash",
          status: repairResult.success ? "success" : "failed",
          reason: repairResult.error || "Repair attempt failed",
          error: repairResult.error || "Repair attempt failed"
        });

        if (repairResult.success) {
          try {
            jsonResult = cleanJsonResponse(repairResult.content);
            providerUsed = "gemini";
            providerStatus = "success";
            modelUsed = repairResult.modelUsed;
            return { 
              result: jsonResult, 
              providerUsed, 
              providerStatus,
              fallbackReason,
              modelUsed,
              providerAttempts
            };
          } catch (repairParseError) {
             geminiResult.success = false;
             geminiResult.error = repairParseError.message;
          }
        } else {
           geminiResult.success = false;
           geminiResult.error = repairResult.error;
        }
      }
    }
    
    if (!geminiResult.success) {
      console.warn(`[runPromptStage] Gemini failed: ${geminiResult.error}`);
      return {
        success: false,
        result: null,
        providerUsed: "gemini",
        providerStatus: "failed",
        error: geminiResult.error,
        providerAttempts
      };
    }
  }

  // B. Try OpenRouter
  if (!jsonResult && provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];
    
    console.log("[REPORT PIPELINE] About to call generateWithOpenRouterFallback");
    console.log("[REPORT GENERATE] OPENROUTER_API_KEY present:", Boolean(process.env.OPENROUTER_API_KEY));
    console.log("[REPORT GENERATE] OPENROUTER_MODELS:", process.env.OPENROUTER_MODELS);
    
    const openRouterResult = await generateWithOpenRouterFallback(messages, options);
    providerAttempts = openRouterResult?.providerAttempts || openRouterResult?.attempts || [];
    console.log("[REPORT PIPELINE] LLM result:", {
      success: openRouterResult?.success,
      providerUsed: openRouterResult?.providerUsed,
      providerStatus: openRouterResult?.providerStatus,
      modelUsed: openRouterResult?.modelUsed,
      attemptsCount: providerAttempts.length || 0,
      error: openRouterResult?.error
    });
    
    if (openRouterResult.success) {
      jsonResult = openRouterResult.parsedData;
      providerUsed = "openrouter";
      providerStatus = openRouterResult.providerStatus || "success";
      modelUsed = openRouterResult.modelUsed || null;
      return { 
        result: jsonResult, 
        providerUsed, 
        providerStatus,
        fallbackReason,
        modelUsed,
        providerAttempts
      };
    } else {
      console.warn(`[runPromptStage] OpenRouter failed: ${openRouterResult.error}`);
      providerStatus = openRouterResult.providerStatus || "fallback";
      fallbackReason += `OpenRouter: ${openRouterResult.error}; `;
      // Can't return immediately, might try OpenAI
    }
  }

  // C. Try OpenAI
  if (!jsonResult && process.env.OPENAI_API_KEY) {
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
        jsonResult = cleanJsonResponse(result.textResponse);
        providerUsed = "openai";
        providerStatus = "success";
        return { result: jsonResult, providerUsed, providerStatus, fallbackReason, modelUsed, providerAttempts };
      }
    } catch (e) {
      console.error("[runPromptStage] OpenAI failed:", e.message);
      fallbackReason += `OpenAI: ${e.message}; `;
    }
  }

  const finalError = new Error("No LLM provider available or all failed: " + fallbackReason);
  finalError.providerAttempts = providerAttempts;
  finalError.providerUsed = "deterministic-fallback";
  finalError.providerStatus = "fallback";
  finalError.modelUsed = modelUsed;
  throw finalError;
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
    ...(priorGroupNarratives.get(`${group.groupNo}::${group.groupTitle}`) || {}),
  }));

  finalizedReport.qcSummary = {
    ...(finalizedReport.qcSummary || {}),
    componentCount: componentPayloads.length,
    llmEligibleComponentCount: componentPayloads.filter((component) => component.allowLLM).length,
    llmSuccessCount,
    llmFailureCount,
    componentRegistry: REPORT_COMPONENTS.map((component) => component.id),
    excelCalculationContext: buildExcelCalculationContext(finalizedReport, extractedExcelData),
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
  const merged = Array.isArray(baseComponent) ? [...baseComponent] : { ...(baseComponent || {}) };
  const safeOutput = llmOutput && typeof llmOutput === "object" ? llmOutput : {};

  for (const field of allowedOutputFields || []) {
    if (safeOutput[field] !== undefined) {
      merged[field] = safeOutput[field];
    }
  }

  return merged;
}

function assertLockedFieldsUnchanged(before, after, lockedFields = [], componentLabel = "component") {
  for (const field of lockedFields) {
    if (String(before?.[field] ?? "") !== String(after?.[field] ?? "")) {
      throw new Error(`LLM attempted to modify locked field: ${componentLabel}.${field}`);
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
      bad.push(...validateNarrativeNumbers(item, approvedTokens, `${path}[${index}]`));
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
  return String(text || "").replace(/\s+/g, " ").trim();
}

function previewValue(value, maxLength = 160) {
  const text = typeof value === "string"
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
    return Object.values(value).some((item) => hasMeaningfulNarrativeContext(item));
  }
  const text = normalizeWhitespace(value);
  return Boolean(text) && text.toLowerCase() !== "data required";
}

function isGenericNarrative(text) {
  const normalized = normalizeWhitespace(text).toLowerCase();
  return GENERIC_NARRATIVE_PHRASES.some((phrase) => normalized === phrase || normalized.includes(phrase));
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
      return sourceContextAvailable ? "used Data required despite available context" : null;
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
      const itemText = typeof item === "object" && item !== null
        ? normalizeWhitespace(item.action || item.text || "")
        : normalizeWhitespace(item);

      if (!itemText) return "empty bullet";
      if (itemText === "Data required") {
        if (sourceContextAvailable) return "used Data required despite available context";
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
    const sourceContextAvailable = hasMeaningfulNarrativeContext(sourceContext[field]);
    const qualityIssue = validateNarrativeFieldQuality(field, value, sourceContextAvailable);
    if (qualityIssue) {
      warnings.push(`Removed AI field ${payload.componentId}.${field} because the narrative was ${qualityIssue}.`);
      delete llmOutput[field];
    }
  });
}

function validateNarrativeOutputShape(payload, llmOutput, approvedTokens, warnings) {
  if (!llmOutput || typeof llmOutput !== "object" || Array.isArray(llmOutput)) {
    throw new Error(`Invalid narrative response for ${payload.componentId}. Expected JSON object.`);
  }

  const allowed = new Set(payload.allowedOutputFields || []);
  const locked = new Set(payload.lockedFields || []);

  Object.keys(llmOutput).forEach((field) => {
    if (locked.has(field)) {
      throw new Error(`Locked field returned by LLM for ${payload.componentId}: ${field}`);
    }
    if (!allowed.has(field)) {
      throw new Error(`Unexpected field returned by LLM for ${payload.componentId}: ${field}`);
    }
  });

  Object.entries(llmOutput).forEach(([field, value]) => {
    const badNums = validateNarrativeNumbers(value, approvedTokens, `${payload.componentId}.${field}`);
    if (badNums.length > 0) {
      warnings.push(`Removed AI field ${payload.componentId}.${field} because it contained unapproved numeric token: ${badNums[0].num}`);
      delete llmOutput[field];
    }
  });

  enforceNarrativeQuality(payload, llmOutput, warnings);
}

function buildSupportingContext({ extractedInfo = {}, uploadedFiles = [], imageMetadata = [] }) {
  const observationLines = [
    ...(Array.isArray(extractedInfo?.facilityObservations) ? extractedInfo.facilityObservations : []),
    ...(Array.isArray(extractedInfo?.utilityObservations) ? extractedInfo.utilityObservations : []),
    ...(Array.isArray(extractedInfo?.projectSupportingNotes)
      ? extractedInfo.projectSupportingNotes.flatMap((note) => [
          note?.existingConditionNotes,
          note?.implementationNotes,
        ])
      : []),
    ...(Array.isArray(imageMetadata) ? imageMetadata.map((image) => image?.caption || image?.placementSection) : []),
    ...(Array.isArray(uploadedFiles) ? uploadedFiles.map((file) => file?.originalname || file?.filename) : []),
  ]
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 10);

  return observationLines.join(" | ") || "Data required";
}

function buildSummaryOnlyBatch({ report, formData = {}, extractedInfo = {}, uploadedFiles = [], imageMetadata = [] }) {
  const executiveSummaryDefinition = getReportComponentDefinition("executive_summary") || {};
  const groupedProjects = Array.isArray(report?.groupedProjects) ? report.groupedProjects : [];
  const supportingContext = buildSupportingContext({ extractedInfo, uploadedFiles, imageMetadata });
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
        facilityType: formData.buildingType || report?.buildingProfile?.typeOfBuilding || "Data required",
        supportingContext,
        executiveSummary: {
          purposeText: report?.executiveSummary?.purposeText || "Data required",
          keyObservations: report?.executiveSummary?.keyObservations || [],
          conclusionAndWayForward: report?.executiveSummary?.conclusionAndWayForward || "Data required",
        },
        projectGroups: groupedProjects.map((group) => ({
          groupTitle: group.groupTitle || "Data required",
          projectTitles: Array.isArray(group.projects)
            ? group.projects.map((project) => project.projectTitle || "Data required")
            : [],
        })),
        groups: groupSummariesOnly,
        allowedOutputFields: [
          "executiveSummary.purposeText",
          "executiveSummary.keyObservations",
          "executiveSummary.conclusionAndWayForward",
          "groups[].groupIntroduction",
          "groups[].groupObservation",
        ],
      },
      meta: {
        executiveSummaryAllowedFields: executiveSummaryDefinition.llmAllowedFields || [],
        executiveSummaryLockedFields: executiveSummaryDefinition.lockedFields || [],
      },
    },
  ];
}

function buildStandardNarrativeBatches(llmEligiblePayloads = [], batchSize = 4) {
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

async function runSummaryOnlyNarrativeStage(batch, templateConfig, options = {}) {
  const systemPrompt = `You are a senior energy audit report writer.

Your task is to improve the explanation quality of an already generated deterministic energy audit report.

Important rules:
1. Do not generate any numerical values.
2. Do not modify any numerical values.
3. Do not estimate missing values.
4. Do not calculate savings, investment, payback, CO2, tariff, operating hours, or quantities.
5. Do not change project names, equipment names, group names, project numbers, or priorities.
6. Use only the provided context.
7. If information is not available, write "Data required".
8. Return valid JSON only.
9. Return only the allowed fields.
10. Do not include markdown.
11. Do not include tables.
12. Do not repeat the same sentence across groups or summary sections.

Writing expectations:
- Use professional energy audit language.
- Improve clarity, explainability, and client-readiness.
- Explain opportunity areas, implementation intent, and operational value in words only.
- Keep text concise but meaningful.
- Do not create per-project outputs in summary-only mode.`;

  const userPrompt = `Enhance only the executive summary and group-level summary narratives.
Use the audit purpose, project groups, supporting file context, and implementation roadmap to make the wording more professional and explainable.
Do not add any new numbers.

${JSON.stringify(batch.payload, null, 2)}

Return valid JSON only using exactly this schema:

{
  "executiveSummary": {
    "purposeText": "Write 80 to 120 words explaining the purpose of this detailed energy audit in professional language.",
    "keyObservations": [
      "Observation 1 in 20 to 35 words.",
      "Observation 2 in 20 to 35 words.",
      "Observation 3 in 20 to 35 words.",
      "Observation 4 in 20 to 35 words."
    ],
    "conclusionAndWayForward": "Write 80 to 120 words explaining recommended next steps and implementation approach."
  },
  "groups": [
    {
      "groupTitle": "Must exactly match one provided group title",
      "groupIntroduction": "Write 40 to 70 words explaining this opportunity area.",
      "groupObservation": "Write 30 to 60 words explaining why this group is important."
    }
  ]
}

Rules:
- Do not generate or modify numbers.
- Prefer wording without numeric figures.
- Do not use Data required unless context is missing.
- Do not add unsupported claims.
- Do not include markdown.
- Do not include extra keys.`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig, options);
}

function normalizeAiSummaryOutput(ai) {
  const executiveSummary =
    ai.executiveSummary ||
    ai.executive_summary ||
    ai.summary ||
    {};
  let keyObservations = executiveSummary.keyObservations ||
                        executiveSummary.key_observations ||
                        executiveSummary.observations ||
                        executiveSummary.keyFindings ||
                        executiveSummary.findings ||
                        [];

  if (typeof keyObservations === "string") {
    keyObservations = keyObservations
      .split(/\\n|•|-/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return {
    executiveSummary: {
      purposeText:
        executiveSummary.purposeText ||
        executiveSummary.purpose ||
        executiveSummary.auditPurpose ||
        executiveSummary.summaryPurpose ||
        null,

      keyObservations,

      conclusionAndWayForward:
        executiveSummary.conclusionAndWayForward ||
        executiveSummary.conclusion ||
        executiveSummary.wayForward ||
        executiveSummary.nextSteps ||
        null
    },
    groups: Array.isArray(ai.groups)
      ? ai.groups
      : Array.isArray(ai.groupNarratives)
        ? ai.groupNarratives
        : []
  };
}

function applySummaryOnlyNarrative(report, batch, narrativeOutput, approvedTokens, warnings) {
  if (!narrativeOutput || typeof narrativeOutput !== "object" || Array.isArray(narrativeOutput)) {
    throw new Error("Invalid summary-only narrative response. Expected JSON object.");
  }

  const normalizedAi = normalizeAiSummaryOutput(narrativeOutput);

  if (process.env.NODE_ENV === "development") {
    console.log("[AI RAW SUMMARY OUTPUT]", JSON.stringify(normalizedAi, null, 2));
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
        value
      });
    }
  };
  const hasUnapprovedNumbers = (value, fieldPath) => {
    const badNums = validateNarrativeNumbers(value, approvedTokens, fieldPath);
    if (badNums.length > 0) {
      addDroppedField(fieldPath, `Unapproved numeric token: ${badNums[0].num}`, value);
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
      "data required"
    ].includes(normalized);
  };
  const isDifferentFromExisting = (nextValue, existingValue) =>
    normalizeWhitespace(nextValue) !== normalizeWhitespace(existingValue);

  const executiveBefore = cloneJson(report.executiveSummary || {});
  if (!report.executiveSummary) report.executiveSummary = {};

  const purposeText = typeof normalizedAi.executiveSummary.purposeText === "string"
    ? normalizeWhitespace(normalizedAi.executiveSummary.purposeText)
    : "";
  if (purposeText) {
    if (purposeText.length < 80) {
      addDroppedField("executiveSummary.purposeText", "Too short", purposeText);
    } else if (isExtremelyGeneric(purposeText)) {
      addDroppedField("executiveSummary.purposeText", "Extremely generic wording", purposeText);
    } else if (!isDifferentFromExisting(purposeText, executiveBefore?.purposeText)) {
      addDroppedField("executiveSummary.purposeText", "Same as deterministic text", purposeText);
    } else if (!hasUnapprovedNumbers(purposeText, "executiveSummary.purposeText")) {
      report.executiveSummary.purposeText = purposeText;
      changedFields.push("executiveSummary.purposeText");
    }
  }

  if (Array.isArray(normalizedAi.executiveSummary.keyObservations) && normalizedAi.executiveSummary.keyObservations.length > 0) {
    const validObservations = [];
    normalizedAi.executiveSummary.keyObservations.forEach((obs, index) => {
      const observation = typeof obs === "string" ? normalizeWhitespace(obs) : "";
      const fieldPath = `executiveSummary.keyObservations[${index}]`;
      if (!observation) return;
      if (observation.length < 50) {
        addDroppedField(fieldPath, "Too short", observation);
        return;
      }
      if (isExtremelyGeneric(observation)) {
        addDroppedField(fieldPath, "Extremely generic wording", observation);
        return;
      }
      if (hasUnapprovedNumbers(observation, fieldPath)) {
        return;
      }
      validObservations.push(observation);
    });

    if (validObservations.length >= 1) {
      report.executiveSummary.keyObservations = validObservations;
      changedFields.push("executiveSummary.keyObservations");
    } else {
      addDroppedField("executiveSummary.keyObservations", "No valid observations survived validation", normalizedAi.executiveSummary.keyObservations);
    }
  }

  const conclusionValue = normalizedAi.executiveSummary.conclusionAndWayForward;
  const conclusionText = Array.isArray(conclusionValue)
    ? conclusionValue
        .map((item) => normalizeWhitespace(item?.action || item?.text || item))
        .filter(Boolean)
        .join(" ")
    : typeof conclusionValue === "string"
      ? normalizeWhitespace(conclusionValue)
      : "";
  if (conclusionText) {
    if (conclusionText.length < 80) {
      addDroppedField("executiveSummary.conclusionAndWayForward", "Too short", conclusionValue);
    } else if (isExtremelyGeneric(conclusionText)) {
      addDroppedField("executiveSummary.conclusionAndWayForward", "Extremely generic wording", conclusionValue);
    } else if (!isDifferentFromExisting(conclusionText, executiveBefore?.conclusionAndWayForward)) {
      addDroppedField("executiveSummary.conclusionAndWayForward", "Same as deterministic text", conclusionValue);
    } else if (!hasUnapprovedNumbers(conclusionText, "executiveSummary.conclusionAndWayForward")) {
      report.executiveSummary.conclusionAndWayForward = conclusionText;
      changedFields.push("executiveSummary.conclusionAndWayForward");
    }
  }

  if (Array.isArray(normalizedAi.groups)) {
    normalizedAi.groups.forEach((groupOutput) => {
      const groupIndex = (report.groupedProjects || []).findIndex(
        (group) => String(group?.groupTitle || "").trim().toLowerCase() === String(groupOutput?.groupTitle || "").trim().toLowerCase()
      );
      if (groupIndex === -1) return;

      const groupIntroduction = typeof groupOutput.groupIntroduction === "string"
        ? normalizeWhitespace(groupOutput.groupIntroduction)
        : "";
      if (groupIntroduction) {
        if (groupIntroduction.length < 60) {
          addDroppedField(`groups[${groupIndex}].groupIntroduction`, "Too short", groupIntroduction);
        } else if (isExtremelyGeneric(groupIntroduction)) {
          addDroppedField(`groups[${groupIndex}].groupIntroduction`, "Extremely generic wording", groupIntroduction);
        } else if (!hasUnapprovedNumbers(groupIntroduction, `groups[${groupIndex}].groupIntroduction`)) {
          report.groupedProjects[groupIndex].summaryParagraph = groupIntroduction;
          report.groupedProjects[groupIndex].groupIntroduction = groupIntroduction;
          changedFields.push(`groups[${groupIndex}].groupIntroduction`);
        }
      }

      const groupObservation = typeof groupOutput.groupObservation === "string"
        ? normalizeWhitespace(groupOutput.groupObservation)
        : "";
      if (groupObservation) {
        if (groupObservation.length < 60) {
          addDroppedField(`groups[${groupIndex}].groupObservation`, "Too short", groupObservation);
        } else if (isExtremelyGeneric(groupObservation)) {
          addDroppedField(`groups[${groupIndex}].groupObservation`, "Extremely generic wording", groupObservation);
        } else if (!hasUnapprovedNumbers(groupObservation, `groups[${groupIndex}].groupObservation`)) {
          report.groupedProjects[groupIndex].technicalObservation = groupObservation;
          report.groupedProjects[groupIndex].groupObservation = groupObservation;
          changedFields.push(`groups[${groupIndex}].groupObservation`);
        }
      }
    });
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[AI MERGE SUMMARY]", {
      aiEnhancedFields: changedFields,
      aiDroppedFields: droppedFields,
      purposeTextChanged: executiveBefore?.purposeText !== report.executiveSummary?.purposeText,
      keyObservationsBefore: executiveBefore?.keyObservations?.length || 0,
      keyObservationsAfter: report.executiveSummary?.keyObservations?.length || 0
    });
  }

  const aiEnhancementStatus = changedFields.length > 0
    ? (droppedFields.length > 0 ? "partial_success" : "success")
    : "no_fields_changed";

  return { 
    report, 
    changedFields,
    droppedFields,
    aiEnhanced: changedFields.length > 0,
    aiEnhancementStatus
  };
}

function buildAnnexures(uploadedFiles = [], imageMetadata = []) {
  const uploadItems = (uploadedFiles || []).map((file, index) => ({
    itemNo: index + 1,
    fileName: file?.filename || file?.originalname || "Uploaded file",
    fileType: file?.mimetype || file?.type || "unknown",
    description: file?.originalname || file?.filename || "Uploaded supporting file",
  }));

  const imageItems = (imageMetadata || []).map((image, index) => ({
    itemNo: uploadItems.length + index + 1,
    fileName: image?.imageFileName || image?.filename || "Image reference",
    fileType: "image",
    description: image?.caption || image?.placementSection || "Supporting image reference",
  }));

  return {
    uploadedFiles: uploadItems,
    imageReferences: imageItems,
  };
}

function buildExcelCalculationContext(baseReport, extractedExcelData = {}) {
  const groupedProjects = Array.isArray(baseReport?.groupedProjects) ? baseReport.groupedProjects : [];
  const projects = Array.isArray(baseReport?.projects) ? baseReport.projects : [];

  return {
    projects,
    groupedProjects,
    portfolioTotals: {
      totalEnergySaving: baseReport?.executiveSummary?.totalEnergySavingPotential ?? 0,
      totalAnnualCostSaving: baseReport?.executiveSummary?.totalAnnualCostSavingPotential ?? 0,
      totalEstimatedInvestment: baseReport?.executiveSummary?.totalEstimatedInvestment ?? 0,
      averagePaybackPeriod: baseReport?.executiveSummary?.simplePaybackPeriod ?? "Data required",
      totalCO2Reduction: baseReport?.executiveSummary?.co2ReductionPotential ?? "Data required",
    },
    groupTotals: groupedProjects.map((group) => ({
      groupNo: group.groupNo,
      groupTitle: group.groupTitle,
      projectCount: Array.isArray(group.projects) ? group.projects.length : 0,
      totalInvestment: group.totalInvestment,
      totalSaving: group.totalAnnualSaving,
      totalEnergySaving: group.totalEnergySaving,
      averagePayback: group.weightedPayback,
    })),
    annualElectricityConsumption: extractedExcelData?.annualElectricityConsumption || "Data required",
    annualElectricityCost: extractedExcelData?.annualElectricityCost || "Data required",
    averageTariff: extractedExcelData?.averageTariff || "Data required",
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
  const groupedProjects = Array.isArray(baseReport?.groupedProjects) ? baseReport.groupedProjects : [];
  const projects = Array.isArray(baseReport?.projects) ? baseReport.projects : [];
  const supportingContext = buildSupportingContext({ extractedInfo, uploadedFiles, imageMetadata });

  payloads.push({
    ...getReportComponentDefinition("cover_page"),
    componentTitle: "Cover Page",
    baseComponent: cloneJson(baseReport.reportInfo || {}),
  });

  payloads.push({
    ...getReportComponentDefinition("table_of_contents"),
    componentTitle: "Table of Contents",
    baseComponent: {
      chapters: ["Executive Summary", "Plant / Building Details and Energy Profile", "Energy Saving Projects", "Annexures"],
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
    lockedData: getComponentLockedSnapshot(baseReport.executiveSummary || {}, getReportComponentDefinition("executive_summary")?.lockedFields),
    qualityContext: {
      purposeText: baseReport?.executiveSummary?.purposeText,
      keyObservations: groupedProjects.map((group) => group.groupTitle),
      conclusionAndWayForward: baseReport?.executiveSummary?.conclusionAndWayForward,
    },
    narrativeInputs: {
      reportType: "Detailed Energy Audit Report",
      clientName: formData.clientName || "Data required",
      facilityType: formData.buildingType || baseReport?.buildingProfile?.typeOfBuilding || "Data required",
      auditPurpose: baseReport?.executiveSummary?.purposeText || "Data required",
      currentNarrative: {
        purposeText: baseReport?.executiveSummary?.purposeText || "Data required",
        keyObservations: baseReport?.executiveSummary?.keyObservations || [],
        conclusionAndWayForward: baseReport?.executiveSummary?.conclusionAndWayForward || [],
      },
      projectGroups: groupedProjects.map((group) => ({
        groupTitle: group.groupTitle,
        projectTitles: (group.projects || []).map((project) => project.projectTitle),
      })),
      supportingContext,
    },
    mergeTarget: { type: "executive_summary" },
    forbiddenFields: getReportComponentDefinition("executive_summary")?.lockedFields || [],
  });

  payloads.push({
    ...getReportComponentDefinition("plant_profile"),
    componentTitle: "Chapter 2: Plant / Building Details and Energy Profile",
    lockedData: getComponentLockedSnapshot(baseReport.buildingProfile || {}, getReportComponentDefinition("plant_profile")?.lockedFields),
    qualityContext: {
      facilityDescription: extractedInfo?.facilityObservations,
      utilityDescription: extractedInfo?.utilityObservations,
      operatingPatternNarrative: extractedInfo?.facilityObservations,
      majorSystemsNarrative: extractedInfo?.utilityObservations,
    },
    narrativeInputs: {
      reportType: "Detailed Energy Audit Report",
      facilityType: formData.buildingType || baseReport?.buildingProfile?.typeOfBuilding || "Data required",
      currentNarrative: {
        facilityDescription: baseReport?.buildingProfile?.facilityDescription || "Data required",
        utilityDescription: baseReport?.buildingProfile?.utilityDescription || "Data required",
        operatingPatternNarrative: baseReport?.buildingProfile?.operatingPatternNarrative || "Data required",
        majorSystemsNarrative: baseReport?.buildingProfile?.majorSystemsNarrative || "Data required",
      },
      supportingContext,
      facilityContext: {
        facilityName: formData.facilityName || "Data required",
        location: formData.location || "Data required",
        contactPerson: formData.contactPerson || "Data required",
      },
    },
    mergeTarget: { type: "plant_profile" },
    forbiddenFields: getReportComponentDefinition("plant_profile")?.lockedFields || [],
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
        technicalObservation: (group.projects || []).map((project) => project.projectTitle),
        implementationStrategy: extractedInfo?.facilityObservations,
        groupConclusion: extractedInfo?.utilityObservations,
      },
      narrativeInputs: {
        reportType: "Detailed Energy Audit Report",
        groupTitle: group.groupTitle || "Data required",
        projectTitles: (group.projects || []).map((project) => project.projectTitle),
        currentNarrative: {
          summaryParagraph: group.summaryParagraph || "Data required",
          technicalObservation: group.technicalObservation || "Data required",
          implementationStrategy: group.implementationStrategy || "Data required",
          groupConclusion: group.groupConclusion || "Data required",
        },
        supportingContext,
      },
      mergeTarget: { type: "project_group", groupIndex },
      forbiddenFields: getReportComponentDefinition("project_group")?.lockedFields || [],
    });
  });

  projects.forEach((project, projectIndex) => {
    const supportingNotes = (extractedInfo?.projectSupportingNotes || []).find((note) =>
      String(note?.projectNo || "").trim() === String(project.projectNo || "").trim() ||
      String(note?.projectTitle || "").trim().toLowerCase() === String(project.projectTitle || "").trim().toLowerCase()
    ) || {};

    payloads.push({
      ...getReportComponentDefinition("project_detail"),
      componentTitle: safeReportValue(project.projectTitle),
      lockedData: getComponentLockedSnapshot(project, getReportComponentDefinition("project_detail")?.lockedFields),
      qualityContext: {
        existingSystemDescription: supportingNotes.existingConditionNotes || project.baselineDetails || project.existingOperatingCondition,
        proposedProjectDescription: supportingNotes.implementationNotes || project.projectActivitiesText || project.proposedIntervention,
        rationaleForEnergySaving: supportingNotes.implementationNotes || project.proposedIntervention || project.system,
        problemGapIdentified: supportingNotes.existingConditionNotes || project.existingOperatingCondition || project.system,
        scopeOfWork: supportingNotes.implementationNotes || project.proposedIntervention,
        keyActivities: supportingNotes.implementationNotes || project.proposedIntervention,
        measurementVerificationPlan: supportingNotes.existingConditionNotes || project.system,
        benefitsOtherThanEnergySaving: project.system || project.equipmentCovered,
        finalConclusion: project.system || project.projectTitle,
      },
      narrativeInputs: {
        reportType: "Detailed Energy Audit Report",
        projectNo: project.projectNo || "Data required",
        projectTitle: project.projectTitle || "Data required",
        equipmentCovered: project.equipmentCovered || "Data required",
        system: project.system || project.groupTitle || "Data required",
        baselineContext: supportingNotes.existingConditionNotes || project.baselineDetails || project.existingOperatingCondition || "Data required",
        proposedContext: supportingNotes.implementationNotes || project.projectActivitiesText || project.proposedIntervention || "Data required",
        supportingContext,
        currentNarrative: {
          existingSystemDescription: project.existingSystemDescription || "Data required",
          proposedProjectDescription: project.proposedProjectDescription || "Data required",
          rationaleForEnergySaving: project.rationaleForEnergySaving || "Data required",
          problemGapIdentified: project.problemGapIdentified || "Data required",
          scopeOfWork: project.scopeOfWork || "Data required",
          keyActivities: project.keyActivities || "Data required",
          measurementVerificationPlan: project.measurementVerificationPlan || "Data required",
          benefitsOtherThanEnergySaving: project.benefitsOtherThanEnergySaving || "Data required",
          finalConclusion: project.finalConclusion || "Data required",
        },
      },
      mergeTarget: { type: "project_detail", projectIndex },
      forbiddenFields: getReportComponentDefinition("project_detail")?.lockedFields || [],
    });
  });

  payloads.push({
    ...getReportComponentDefinition("annexures"),
    componentTitle: "Chapter 4: Annexures",
    baseComponent: buildAnnexures(uploadedFiles, imageMetadata),
  });

  return payloads;
}

async function runComponentNarrativeStage(payload, templateConfig, options = {}) {
  const systemPrompt = `You are a senior energy audit report writer.

Your task is to improve the explanation quality of an already generated deterministic energy audit report.

Important rules:
1. Do not generate any numerical values.
2. Do not modify any numerical values.
3. Do not estimate missing values.
4. Do not calculate savings, investment, payback, CO2, tariff, operating hours, or quantities.
5. Do not change project names, equipment names, group names, project numbers, or priorities.
6. Use only the provided context.
7. If information is not available, write "Data required".
8. Return valid JSON only.
9. Return only the allowed fields.
10. Do not include markdown.
11. Do not include tables.
12. Do not repeat the same sentence across projects.

Writing expectations:
- Explain the existing system condition in practical engineering terms.
- Explain the proposed measure clearly.
- Explain the energy-saving principle without creating numbers.
- Explain the scope of implementation.
- Explain key activities required for implementation.
- Explain how savings should be verified after implementation.
- Mention operational, reliability, maintenance, safety, or monitoring benefits where relevant.
- Use formal client-ready language suitable for a Detailed Energy Audit Report.`;

  const userPrompt = `Improve the report explanation for this component.
AI is a report writer, not a calculator.

${JSON.stringify({
    componentId: payload.id,
    componentTitle: payload.componentTitle,
    lockedData: payload.lockedData || {},
    narrativeInputs: payload.narrativeInputs || {},
    allowedOutputFields: payload.llmAllowedFields || [],
    forbiddenFields: payload.forbiddenFields || [],
  }, null, 2)}

Return JSON now:`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig, options);
}

async function runBatchComponentNarrativeStage(payloads, templateConfig, options = {}) {
  const systemPrompt = `You are a senior energy audit report writer.

Your task is to improve the explanation quality of an already generated deterministic energy audit report.

Important rules:
1. Do not generate any numerical values.
2. Do not modify any numerical values.
3. Do not estimate missing values.
4. Do not calculate savings, investment, payback, CO2, tariff, operating hours, or quantities.
5. Do not change project names, equipment names, group names, project numbers, or priorities.
6. Use only the provided context.
7. If information is not available, write "Data required".
8. Return valid JSON only.
9. Return only the allowed fields.
10. Do not include markdown.
11. Do not include tables.
12. Do not repeat the same sentence across projects.

Writing expectations:
- Explain the existing system condition in practical engineering terms.
- Explain the proposed measure clearly.
- Explain the energy-saving principle without creating numbers.
- Explain the scope of implementation.
- Explain key activities required for implementation.
- Explain how savings should be verified after implementation.
- Mention operational, reliability, maintenance, safety, or monitoring benefits where relevant.
- Use formal client-ready language suitable for a Detailed Energy Audit Report.
- Keep text concise but meaningful.
- For scopeOfWork and keyActivities, return 3 to 5 concise bullets.
- For measurementVerificationPlan and benefitsOtherThanEnergySaving, return 3 to 4 concise bullets.
- For conclusion fields, write a short client-ready conclusion.`;

  const userPrompt = `Improve the report explanation for these components.
AI is a report writer, not a calculator.

${JSON.stringify({
    components: payloads.map((payload) => ({
      componentKey: buildComponentInstanceKey(payload),
      componentId: payload.id,
      componentTitle: payload.componentTitle,
      lockedData: payload.lockedData || {},
      narrativeInputs: payload.narrativeInputs || {},
      allowedOutputFields: payload.llmAllowedFields || [],
    })),
  }, null, 2)}

Return JSON exactly in this format. No nested objects inside output:
{
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

  return runPromptStage(systemPrompt, userPrompt, templateConfig, options);
}

function applyComponentNarrative(report, payload, narrativeOutput, approvedTokens, warnings) {
  const allowedOutputFields = payload.llmAllowedFields || [];
  const lockedFields = payload.lockedFields || [];

  validateNarrativeOutputShape({
    componentId: payload.id,
    allowedOutputFields,
    lockedFields,
  }, narrativeOutput, approvedTokens, warnings);

  if (payload.mergeTarget?.type === "executive_summary") {
    const before = cloneJson(report.executiveSummary || {});
    const normalizedNarrativeOutput = { ...narrativeOutput };
    if (Array.isArray(normalizedNarrativeOutput.conclusionAndWayForward) && Array.isArray(before.conclusionAndWayForward)) {
      normalizedNarrativeOutput.conclusionAndWayForward = before.conclusionAndWayForward.map((stepRow, index) => ({
        ...stepRow,
        action: safeReportValue(normalizedNarrativeOutput.conclusionAndWayForward[index]?.action || stepRow.action),
      }));
    }
    const merged = mergeNarrativeOnly(before, normalizedNarrativeOutput, allowedOutputFields);
    assertLockedFieldsUnchanged(before, merged, lockedFields, payload.id);
    report.executiveSummary = merged;
    return report;
  }

  if (payload.mergeTarget?.type === "plant_profile") {
    const before = cloneJson(report.buildingProfile || {});
    const merged = mergeNarrativeOnly(before, narrativeOutput, allowedOutputFields);
    assertLockedFieldsUnchanged(before, merged, lockedFields, payload.id);
    report.buildingProfile = merged;
    return report;
  }

  if (payload.mergeTarget?.type === "project_group") {
    const idx = payload.mergeTarget.groupIndex;
    const before = cloneJson(report.groupedProjects?.[idx] || {});
    const merged = mergeNarrativeOnly(before, narrativeOutput, allowedOutputFields);
    assertLockedFieldsUnchanged(before, merged, lockedFields, payload.id);
    if (Array.isArray(report.groupedProjects) && report.groupedProjects[idx]) {
      report.groupedProjects[idx] = merged;
    }
    return report;
  }

  if (payload.mergeTarget?.type === "project_detail") {
    const idx = payload.mergeTarget.projectIndex;
    const before = cloneJson(report.projects?.[idx] || {});
    const normalizedNarrativeOutput = { ...narrativeOutput };
    if (normalizedNarrativeOutput.conclusion !== undefined && normalizedNarrativeOutput.finalConclusion === undefined) {
      normalizedNarrativeOutput.finalConclusion = normalizedNarrativeOutput.conclusion;
      delete normalizedNarrativeOutput.conclusion;
    }
    const effectiveAllowedFields = allowedOutputFields.includes("finalConclusion")
      ? allowedOutputFields
      : [...allowedOutputFields, "finalConclusion"];
    const merged = mergeNarrativeOnly(before, normalizedNarrativeOutput, effectiveAllowedFields);
    assertLockedFieldsUnchanged(before, merged, lockedFields, payload.id);
    if (Array.isArray(report.projects) && report.projects[idx]) {
      report.projects[idx] = merged;
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
  const useAiDuringGeneration = typeof useAiOverride === "boolean"
    ? useAiOverride
    : String(process.env.USE_AI_DURING_GENERATION || "true").toLowerCase() === "true";
  const aiFinalizationTimeoutMs = Number(process.env.AI_FINALIZATION_TIMEOUT_MS || 30000);
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
      facilityName: formData.facilityName || report.buildingProfile?.facilityName || "Data required",
      address: formData.location || report.buildingProfile?.address || "Data required",
      facilityContactPerson: formData.contactPerson || report.buildingProfile?.facilityContactPerson || "Data required",
      auditDate: formData.auditPeriod || report.buildingProfile?.auditDate || "Data required",
    },
    executiveSummary: {
      ...(report.executiveSummary || {}),
      numberOfProjects: Array.isArray(report.projects) ? report.projects.length : 0,
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
  let llmEligiblePayloads = componentPayloads.filter((payload) => payload?.allowLLM);
  const enhancementMode = process.env.AI_ENHANCEMENT_MODE || "all";
  const maxAiCalls = Number(process.env.MAX_AI_CALLS_PER_REPORT || 1);
  const stopOnRateLimit = String(process.env.STOP_AI_ON_RATE_LIMIT || "true").toLowerCase() === "true";
  let aiCallsUsed = 0;
  let batches = [];

  console.log("[AI ENHANCE CONFIG]", {
    mode: process.env.AI_ENHANCEMENT_MODE,
    maxCalls: process.env.MAX_AI_CALLS_PER_REPORT,
    stopOnRateLimit: process.env.STOP_AI_ON_RATE_LIMIT
  });

  if (!useAiDuringGeneration) {
    warnings.push("AI enhancement disabled. Deterministic report generated successfully.");
  } else {
    if (enhancementMode === "selected_projects") {
      const selectedProjectNos = Array.isArray(formData?.aiSelectedProjects)
        ? formData.aiSelectedProjects.map((value) => String(value).trim()).filter(Boolean)
        : String(process.env.AI_SELECTED_PROJECTS || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
      llmEligiblePayloads = llmEligiblePayloads.filter((payload) =>
        payload?.id === "project_detail" &&
        selectedProjectNos.includes(String(payload?.lockedData?.projectNo || "").trim())
      );
    }

    const batchSize = Number(process.env.AI_ENHANCEMENT_BATCH_SIZE || 4);
    batches = enhancementMode === "summary_only"
      ? buildSummaryOnlyBatch({ report, formData, extractedInfo, uploadedFiles, imageMetadata })
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
          console.log(`[REPORT] before AI call for batch ${b + 1}/${batches.length}`);
          const result = batch.name === "summary_only"
            ? await runSummaryOnlyNarrativeStage(batch, templateConfig, { isManualEnhancement: useAiOverride === true })
            : await runBatchComponentNarrativeStage(batch.payload, templateConfig, { isManualEnhancement: useAiOverride === true });
          console.log(`[REPORT] after AI call for batch ${b + 1}/${batches.length}`);
          
          const attempts = result?.providerAttempts || [];
          if (Array.isArray(attempts) && attempts.length) {
            providerAttempts.push(...attempts.map((attempt) => ({
              ...attempt,
              batch: batchName,
              componentId: batch.componentId,
              componentTitle: batch.name === "summary_only"
                ? "Summary narrative enhancement"
                : `Batched narrative enhancement (${batchName})`,
            })));
          }

          if (result?.success === false && result?.error) {
            const batchItemCount = batch.name === "summary_only"
              ? 1 + (Array.isArray(batch.payload?.groups) ? batch.payload.groups.length : 0)
              : batch.payload.length;
            llmFailureCount += batchItemCount;
            warnings.push(`${batchName} AI enhancement failed: ${result.error}`);
            if (!exactErrorStr) exactErrorStr = result.error;
            
            const isQuotaExceeded = result?.isQuotaExceeded || attempts.some((a) => a.isQuotaExceeded);
            if (isQuotaExceeded) {
              quotaExceededRetry = result?.retryAfterSeconds || attempts.find((a) => a.retryAfterSeconds)?.retryAfterSeconds || 60;
              aiFailureReason = `Gemini quota exceeded. Retry after ${quotaExceededRetry} seconds.`;
              if (stopOnRateLimit) {
                break;
              }
            }
            continue;
          }

          if (batch.name === "summary_only") {
            if (!result?.result || typeof result.result !== "object") {
              llmFailureCount += 1 + (Array.isArray(batch.payload?.groups) ? batch.payload.groups.length : 0);
              warnings.push(`${batchName} AI returned no summary outputs`);
              continue;
            }

            const summaryResult = applySummaryOnlyNarrative(report, batch, result.result, approvedTokens, warnings);
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
              llmFailureCount += 1 + (Array.isArray(batch.payload?.groups) ? batch.payload.groups.length : 0);
              warnings.push(`${batchName} AI responded, but no valid narrative fields were merged.`);
              if (!exactErrorStr) exactErrorStr = "AI responded, but no valid narrative fields were merged due to quality checks.";
            }
            continue;
          }

          const batchPayloads = batch.payload;

          if (!result?.result || !Array.isArray(result.result.components)) {
            llmFailureCount += batchPayloads.length;
            warnings.push(`${batchName} AI returned no component outputs`);
            continue;
          }

          const outputs = result.result.components;
          const payloadMap = new Map(
            batchPayloads.map((payload) => [buildComponentInstanceKey(payload), payload])
          );

          if (!attempts.some((attempt) => attempt.status === "success") && attempts.length > 0) {
            llmFailureCount += batchPayloads.length;
            warnings.push(`${batchName} AI enhancement failed after all model attempts.`);
          } else {
            let mergedReport = cloneJson(report);
            outputs.forEach((item) => {
              const payload = payloadMap.get(item?.componentKey);
              if (!payload) return;
              mergedReport = applyComponentNarrative(mergedReport, payload, item?.output || {}, approvedTokens, warnings);
              llmSuccessCount += 1;
            });
            report = mergedReport;
            lastSuccessProvider = result?.providerUsed || lastSuccessProvider;
            lastSuccessModel = result?.modelUsed || lastSuccessModel;
          }
        } catch (error) {
          const batchItemCount = batch.name === "summary_only"
            ? 1 + (Array.isArray(batch.payload?.groups) ? batch.payload.groups.length : 0)
            : batch.payload.length;
          console.error(`[REPORT] ${batchName} AI enhancement error:`, error.message);
          llmFailureCount += batchItemCount;
          warnings.push(`${batchName} AI enhancement threw an error: ${error.message}`);
          if (!exactErrorStr) exactErrorStr = error.message;
          
          let attempts = [];
          if (Array.isArray(error?.providerAttempts) && error.providerAttempts.length) {
            attempts = error.providerAttempts.map((attempt) => ({
              ...attempt,
              batch: batchName,
              componentId: batch.componentId,
              componentTitle: batch.name === "summary_only"
                ? "Summary narrative enhancement"
                : `Batched narrative enhancement (${batchName})`,
            }));
            providerAttempts.push(...attempts);
          }
          
          const isQuotaExceeded = error.isQuotaExceeded || attempts.some((a) => a.isQuotaExceeded);
          if (isQuotaExceeded) {
            quotaExceededRetry = error.retryAfterSeconds || attempts.find((a) => a.retryAfterSeconds)?.retryAfterSeconds || 60;
            aiFailureReason = `Gemini quota exceeded. Retry after ${quotaExceededRetry} seconds.`;
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
  const providerWarning = aiEnhanced
    ? (llmFailureCount > 0 ? "Some AI enhancement batches failed. Using deterministic fallbacks for failed batches." : null)
    : (warnings.find((warning) => /AI enhancement/i.test(warning)) || null);
  const aiEnhancementStatus = quotaExceededRetry
    ? "quota_exceeded"
    : aiEnhanced
      ? (allAiDroppedFields.length > 0 ? "partial_success" : "success")
      : (allAiDroppedFields.length > 0 ? "no_fields_changed" : "failed");

  return {
    report: aiEnhanced ? report : deterministicReport,
    deterministicReport,
    providerUsed,
    providerStatus,
    modelUsed,
    providerAttempts,
    warnings,
    providerWarning,
    aiEnhanced,
    aiEnhancementStatus,
    aiFailureReason: aiFailureReason || exactErrorStr,
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
    },
    error: exactErrorStr,
  };
}

// ============================================================================
// STAGE 1: DOCUMENT EXTRACTION
// ============================================================================
async function runStage1Extraction({ retrievedChunks, imageMetadata, formData, excelTruth, templateConfig }) {
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
async function runStage2Builder({ formData, excelTruth, extractedInfo, templateConfig }) {
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
async function runStage3ExecSummary({ formData, excelTruth, baseReport, templateConfig }) {
  const systemPrompt = `You are SEE-Tech Solutions' Executive Summary Generator.

Return valid JSON only.

Required output structure:
{
  "purposeText": "",
  "overallEnergySavingPotential": {},
  "categoryWiseSummary": [],
  "keyObservations": [],
  "conclusionAndWayForward": []
}

Rules:
- Use exact totals from ExcelTruth.
- Do not invent figures.
- Mention number of ECMs from cleaned project count.
- Keep professional SEE-Tech tone.
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
async function runStage4GroupChapters({ groupedProjects, extractedInfo, templateConfig }) {
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
async function runStage5ProjectNarratives({ projectsBatch, extractedNotes, imageRefs, templateConfig }) {
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
    aiNarratives.forEach(n => {
      if (n.projectNo) aiNarrativesMap[n.projectNo] = n;
      else if (n.projectTitle) aiNarrativesMap[n.projectTitle.toLowerCase()] = n;
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
    "baselineDataExplanation"
  ];

  excelTruthProjects.forEach(excelProj => {
    const aiNarrative = aiNarrativesMap[excelProj.projectNo] || aiNarrativesMap[excelProj.projectTitle?.toLowerCase()] || {};
    const merged = { ...excelProj };

    allowedAiFields.forEach(field => {
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
function buildDeterministicCommercialAuditFallback({ formData, excelTruth, extractedExcelData }) {
  const { projects = [], portfolioTotals = {}, groupTotals = [] } = excelTruth || {};

  const report = {
    reportInfo: {
      clientName: formData.clientName || "Data required",
      facilityName: formData.facilityName || "Data required",
      location: formData.location || "Data required",
      auditPeriod: formData.auditPeriod || "Data required",
      reportDate: formData.reportDate || "Data required",
      preparedBy: formData.preparedBy || "SEE-Tech Solutions",
      documentVersion: formData.documentVersion || "1.0",
      reportTitle: "Detailed Energy Audit Report"
    },
    executiveSummary: {
      purposeText: "The purpose of this energy audit is to identify technically feasible, financially attractive and practically implementable energy-saving projects.",
      totalAnnualElectricityConsumption: extractedExcelData?.annualElectricityConsumption || "Data required",
      annualElectricityCost: extractedExcelData?.annualElectricityCost || "Data required",
      averageTariff: extractedExcelData?.averageTariff || "Data required",
      numberOfProjects: projects.length,
      totalEnergySavingPotential: portfolioTotals.totalEnergySaving || 0,
      totalAnnualCostSavingPotential: portfolioTotals.totalAnnualCostSaving || 0,
      totalEstimatedInvestment: portfolioTotals.totalEstimatedInvestment || 0,
      simplePaybackPeriod: portfolioTotals.averagePaybackPeriod || "Data required",
      co2ReductionPotential: portfolioTotals.totalCO2Reduction || "Data required",
      categoryWiseSummary: groupTotals.map(g => ({
        category: g.groupTitle || g.groupNo,
        numberOfProjects: g.projectCount,
        estimatedInvestment: g.totalInvestment,
        annualCostSaving: g.totalSaving,
        energySaving: g.totalEnergySaving,
        simplePaybackPeriod: g.averagePayback
      })),
      conclusionAndWayForward: [
        { step: 1, action: "Client review of identified projects" },
        { step: 2, action: "Joint selection of projects for implementation" },
        { step: 3, action: "Detailed engineering and vendor finalization" },
        { step: 4, action: "Submission of final techno-commercial proposal" },
        { step: 5, action: "Implementation, commissioning and performance monitoring" },
        { step: 6, action: "Savings validation and handover" }
      ]
    },
    buildingProfile: {
      facilityName: formData.facilityName || "Data required",
      address: formData.location || "Data required",
      typeOfBuilding: formData.buildingType || "Data required"
    },
    projects: [],
    groupedProjects: [],
    annexures: {},
    qcSummary: { qcPassed: true, notes: "Generated using deterministic fallback." }
  };

  const getFallbackNarrative = (title, system) => {
    const txt = (String(title) + " " + String(system)).toLowerCase();
    
    if (txt.includes("chiller") || txt.includes("cooling tower") || txt.includes("ct")) {
      return {
        existingSystemDescription: "The existing cooling system operates with suboptimal control logic and fixed-speed components, leading to energy wastage during part-load conditions.",
        proposedProjectDescription: "It is proposed to optimize the cooling system by implementing advanced controls or variable frequency drives to match the cooling load demand.",
        rationaleForEnergySaving: "Energy saving is achieved by dynamically adjusting the cooling capacity and flow rates to match the actual building load, reducing unnecessary power consumption."
      };
    }
    if (txt.includes("pump") || txt.includes("vfd")) {
      return {
        existingSystemDescription: "The existing pumping system operates at a constant speed, using mechanical throttling (valves) to control flow, which is highly inefficient.",
        proposedProjectDescription: "It is proposed to install Variable Frequency Drives (VFDs) on the pumps and integrate them with pressure/flow sensors for automatic speed control.",
        rationaleForEnergySaving: "According to the pump affinity laws, power consumption is proportional to the cube of the pump speed. Reducing speed via VFD drastically reduces power consumption compared to valve throttling."
      };
    }
    if (txt.includes("ie5") || txt.includes("motor")) {
      return {
        existingSystemDescription: "The existing equipment is driven by standard efficiency (IE2/IE3) induction motors or older rewound motors with high inherent electrical losses.",
        proposedProjectDescription: "It is proposed to replace the existing inefficient motors with ultra-premium efficiency (IE5) synchronous reluctance or permanent magnet motors.",
        rationaleForEnergySaving: "IE5 motors operate with significantly lower electrical and magnetic losses, and maintain high efficiency even at partial loads, directly reducing kWh consumption."
      };
    }
    if (txt.includes("apfc") || txt.includes("power factor")) {
      return {
        existingSystemDescription: "The electrical system exhibits a lower power factor, resulting in higher apparent power (kVA) demand and potential utility penalties.",
        proposedProjectDescription: "It is proposed to install or upgrade the Automatic Power Factor Correction (APFC) panel with intelligent controllers and detuned reactors.",
        rationaleForEnergySaving: "Improving the power factor reduces the kVA demand from the utility grid, lowering demand charges and reducing I²R losses in the internal distribution network."
      };
    }
    if (txt.includes("compress") || txt.includes("air")) {
      return {
        existingSystemDescription: "The compressed air system operates with poor load/unload control, higher than required generation pressure, or significant leakage losses.",
        proposedProjectDescription: "It is proposed to optimize the compressed air system by installing a master controller, reducing generation pressure, and rectifying air leaks.",
        rationaleForEnergySaving: "Reducing the compressor discharge pressure and minimizing unloaded running hours drastically reduces the specific power consumption (kW/CFM) of the system."
      };
    }
    if (txt.includes("insulation") || txt.includes("heat")) {
      return {
        existingSystemDescription: "The existing hot/cold surfaces lack proper insulation, leading to significant thermal energy losses to the ambient environment.",
        proposedProjectDescription: "It is proposed to apply high-density thermal insulation (such as rockwool, glasswool, or specialized foam) on the exposed surfaces and valves.",
        rationaleForEnergySaving: "Proper insulation creates a thermal barrier that reduces heat transfer, lowering the energy required to maintain the desired process temperature."
      };
    }
    if (txt.includes("recovery")) {
      return {
        existingSystemDescription: "High-temperature exhaust gases or hot water is currently being discharged into the environment, wasting valuable thermal energy.",
        proposedProjectDescription: "It is proposed to install a heat recovery system (such as an economizer or heat exchanger) to capture the waste heat and pre-heat incoming fluid.",
        rationaleForEnergySaving: "Recovering waste heat directly offsets the fuel or electricity required by the primary heating equipment, resulting in significant energy savings."
      };
    }
    if (txt.includes("servo") || txt.includes("hydraulic")) {
      return {
        existingSystemDescription: "The hydraulic machine utilizes a conventional fixed-speed motor and variable displacement pump, running continuously even during idle cycles.",
        proposedProjectDescription: "It is proposed to retrofit the machine with a servo-hydraulic system, replacing the fixed-speed motor with a servo motor.",
        rationaleForEnergySaving: "The servo motor varies its speed precisely according to the pressure and flow requirements of the cycle, almost eliminating idle running losses."
      };
    }
    
    // Generic fallback
    return {
      existingSystemDescription: "The existing system operates without optimal energy conservation measures, leading to higher than necessary energy consumption.",
      proposedProjectDescription: "It is proposed to implement targeted energy efficiency improvements, optimizing equipment operation and reducing losses.",
      rationaleForEnergySaving: "The project reduces energy consumption by improving the operational efficiency and eliminating avoidable energy waste in the system."
    };
  };

  report.projects = projects.map(p => {
    const narrative = getFallbackNarrative(p.projectTitle, p.system);
    return {
      ...p,
      existingSystemDescription: narrative.existingSystemDescription,
      proposedProjectDescription: narrative.proposedProjectDescription,
      rationaleForEnergySaving: narrative.rationaleForEnergySaving,
      problemGapIdentified: "The audit identified opportunities to improve energy efficiency and reduce operational costs in this area.",
      scopeOfWork: [
        { srNo: 1, scopeItem: "Detailed site measurement and final engineering" },
        { srNo: 2, scopeItem: "Supply of required equipment and accessories" },
        { srNo: 3, scopeItem: "Installation and integration with existing system" },
        { srNo: 4, scopeItem: "Testing, commissioning, and performance validation" }
      ],
      keyActivities: [
        { activity: "Site verification", details: "Confirm equipment rating, location and operating condition", responsibility: "SEE-Tech + Client" },
        { activity: "Design finalization", details: "Finalize technical specifications and control logic", responsibility: "SEE-Tech" },
        { activity: "Procurement", details: "Arrange equipment and accessories", responsibility: "SEE-Tech / Vendor" },
        { activity: "Installation", details: "Install system with minimum disturbance", responsibility: "SEE-Tech" }
      ],
      measurementVerificationPlan: [
        { parameter: "Power consumption", baselineMeasurement: "kW before project", postImplementationMeasurement: "kW after project" },
        { parameter: "Operating hours", baselineMeasurement: "Existing operating schedule", postImplementationMeasurement: "Revised operating schedule" },
        { parameter: "Energy consumption", baselineMeasurement: "kWh/year baseline", postImplementationMeasurement: "kWh/year after project" }
      ],
      benefitsOtherThanEnergySaving: [
        { benefit: "Reduced operating cost", description: "Lower utility bills directly improving profitability" },
        { benefit: "Improved reliability", description: "Better control reduces mechanical and thermal stress on equipment" }
      ],
      conclusion: `This project is technically feasible and financially attractive. With an estimated investment of ₹${p.estimatedInvestment || '0'}, it will yield an annual saving of ₹${p.expectedAnnualCostSaving || '0'} with a simple payback of ${p.simplePaybackPeriod || 'N/A'}. It is recommended for implementation.`
    };
  });

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
