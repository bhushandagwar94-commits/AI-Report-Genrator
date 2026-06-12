const fs = require("fs");
const path = require("path");
const { qcMergeAiEnhancement } = require("./aiQcMergeService");
const { enhanceReportLocally } = require("./localNarrativeEnhancer");
const {
  generateEngineeringEnhancementWithProviders,
} = require("./aiProviderOrchestrator");

const LOCKED_FIELDS = [
  "ecmNo",
  "title",
  "ecmName",
  "projectTitle",
  "system",
  "energySaving",
  "annualSaving",
  "investment",
  "payback",
  "investmentRaw",
  "annualSavingRaw",
  "energySavingRaw",
  "paybackRaw",
  "sourceSheet",
  "sourceRow",
  "fallbackGenerated",
  "numericFieldsLocked",
];

function getAllProjects(reportData = {}) {
  return (reportData?.groups || []).flatMap((group) =>
    Array.isArray(group?.projects) ? group.projects : []
  );
}

function getProjectCount(reportData) {
  return getAllProjects(reportData).length;
}

function validateEnhancementDidNotReduce(beforeReportData, afterReportData) {
  const beforeProjects = getAllProjects(beforeReportData);
  const afterProjects = getAllProjects(afterReportData);

  if (afterProjects.length < beforeProjects.length) {
    throw new Error("AI enhancement reduced project count.");
  }

  for (let index = 0; index < beforeProjects.length; index += 1) {
    const before = beforeProjects[index];
    const after = afterProjects[index];
    if (!before || !after) continue;

    for (const field of LOCKED_FIELDS) {
      if (
        before[field] !== undefined &&
        String(before[field]) !== String(after[field])
      ) {
        throw new Error(`AI enhancement changed locked field: ${field}`);
      }
    }
  }
}

function buildAiSystemPrompt() {
  return `You are an expert energy auditor and engineering report writer.
You enhance energy audit ECM sections with professional engineering narratives.
Return ONLY valid JSON. Do not use markdown. Do not wrap in code fences.
Do not invent numeric savings, investment, tariff, or payback values.
Use only provided numeric values.
If technical values are missing, write practical engineering narrative and use "To be updated" only for unknown numeric fields.`;
}

function buildAiUserPrompt(originalProjects = []) {
  return `Enhance the following ECMs for an energy audit report.

For every ECM, return exactly one enhanced project using the same ecmNo and same projectTitle.

Required JSON schema:
{
  "engineeringExpansion": {
    "projects": [
      {
        "ecmNo": 1,
        "projectTitle": "same original project title",
        "existingCondition": "2-4 professional sentences",
        "problemGap": "2-4 professional sentences",
        "proposedProject": "2-4 professional sentences",
        "projectActivities": ["activity 1", "activity 2", "activity 3", "activity 4"],
        "benefits": ["benefit 1", "benefit 2", "benefit 3"],
        "conclusion": "2-3 professional sentences"
      }
    ]
  }
}

ECM input list:
${JSON.stringify(originalProjects, null, 2)}`;
}

function writeEnhancementDebugFiles({
  providerAttempts = [],
  rawResponse = "",
  parsedResponse = null,
}) {
  const debugDir = path.resolve(__dirname, "../debug-ai");
  fs.mkdirSync(debugDir, { recursive: true });

  const attemptsPath = path.join(debugDir, "latest-provider-attempts.json");
  const rawResponsePath = path.join(
    debugDir,
    "latest-ai-enhancement-response.txt"
  );
  const parsedPath = path.join(
    debugDir,
    "latest-ai-enhancement-parsed.json"
  );

  fs.writeFileSync(
    attemptsPath,
    JSON.stringify(providerAttempts || [], null, 2),
    "utf8"
  );
  fs.writeFileSync(rawResponsePath, String(rawResponse || ""), "utf8");
  fs.writeFileSync(
    parsedPath,
    JSON.stringify(parsedResponse || {}, null, 2),
    "utf8"
  );

  console.log("[AI_DEBUG_FILES_WRITTEN]", {
    attemptsPath,
    rawResponsePath,
    parsedPath,
  });
}

function buildProviderUserMessage(providerUsed, appliedCount) {
  if (providerUsed === "gemini") {
    return `Gemini engineering enhancement applied to ${appliedCount} ECMs.`;
  }
  if (providerUsed === "openai") {
    return `GPT engineering enhancement applied to ${appliedCount} ECMs.`;
  }
  if (providerUsed === "openrouter") {
    return `OpenRouter engineering enhancement applied to ${appliedCount} ECMs.`;
  }
  return `AI providers failed. Engineering enhancement applied using deterministic fallback to ${appliedCount} ECMs.`;
}

async function enhanceReportNarrativesWithAi({ reportData, force = false }) {
  const manualEnabled =
    String(process.env.ENABLE_AI_ENHANCEMENT || "true").toLowerCase() !==
      "false" &&
    String(process.env.ENABLE_MANUAL_AI_ENHANCEMENT || "true").toLowerCase() !==
      "false";
  const allowDeterministicFallback =
    String(process.env.USE_DETERMINISTIC_AI_FALLBACK || "true").toLowerCase() !==
    "false";

  const originalProjects = getAllProjects(reportData).map((project, index) => ({
    ecmNo: project.ecmNo || project.projectNo || index + 1,
    projectTitle:
      project.projectTitle || project.title || project.ecmName || `ECM ${index + 1}`,
    system: project.system || null,
    energySavingKwh: project.energySavingRaw ?? project.energySaving ?? null,
    annualSavingRs: project.annualSavingRaw ?? project.annualSaving ?? null,
    investmentRs: project.investmentRaw ?? project.investment ?? null,
    paybackMonths: project.paybackRaw ?? project.payback ?? null,
    existingCondition:
      project.existingCondition || project.existingSystemDescription || null,
    problemGap:
      project.problemGap || project.problemGapIdentified || null,
    proposedProject:
      project.proposedProject || project.proposedProjectDescription || null,
    projectActivities: project.projectActivities || project.keyActivities || [],
    benefits:
      project.benefits || project.benefitsOtherThanEnergySaving || [],
    conclusion: project.conclusion || null,
    sourceSheet: project.sourceSheet || null,
    sourceRow: project.sourceRow || null,
  }));

  if (!manualEnabled && !force) {
    return {
      ...enhanceReportLocally(reportData, []),
      providerUsed: "deterministic-fallback",
      modelUsed: null,
      enhancementMode: "deterministic-engineering-fallback",
      aiEnhancementCapture: { input: null, rawOutput: "", parsedOutput: null },
    };
  }

  if (!reportData || originalProjects.length <= 0) {
    return {
      ...enhanceReportLocally(reportData, []),
      providerUsed: "deterministic-fallback",
      modelUsed: null,
      enhancementMode: "deterministic-engineering-fallback",
      aiEnhancementCapture: { input: null, rawOutput: "", parsedOutput: null },
    };
  }

  const systemPrompt = buildAiSystemPrompt();
  const userPrompt = buildAiUserPrompt(originalProjects);
  console.log("[BACKEND_CALLING_AI_PROVIDER_ORCHESTRATOR]", {
    projectCount: originalProjects.length,
    providerPriority: process.env.AI_PROVIDER_PRIORITY,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY),
  });

  const orchestrated = await generateEngineeringEnhancementWithProviders({
    systemPrompt,
    userPrompt,
    originalProjects,
    reportData,
  });

  writeEnhancementDebugFiles({
    providerAttempts: orchestrated.providerAttempts,
    rawResponse: orchestrated.rawResponse,
    parsedResponse: orchestrated.parsedResponse,
  });

  const aiEnhancementCapture = {
    input: {
      systemPrompt,
      userPrompt,
      originalProjects,
      reportData,
    },
    rawOutput: orchestrated.rawResponse || "",
    parsedOutput: orchestrated.parsedResponse,
  };

  if (orchestrated.success && orchestrated.parsedProjects.length > 0) {
    const mergeResult = qcMergeAiEnhancement({
      baseReportData: reportData,
      aiOutput: { projectEnhancements: orchestrated.parsedProjects },
      providerAttempts: orchestrated.providerAttempts,
      providerUsed: orchestrated.providerUsed,
      modelUsed: orchestrated.modelUsed,
    });

    if (mergeResult.aiEnhancementStatus.aiAppliedCount > 0) {
      validateEnhancementDidNotReduce(reportData, mergeResult.reportData);
      const appliedCount = mergeResult.aiEnhancementStatus.aiAppliedCount;

      return {
        success: true,
        aiEnhanced: true,
        fallbackEnhanced: false,
        reportData: mergeResult.reportData,
        providerUsed: orchestrated.providerUsed,
        modelUsed: orchestrated.modelUsed,
        enhancementMode: "ai-engineering",
        providerAttempts: orchestrated.providerAttempts,
        aiEnhancementCapture,
        aiEnhancementStatus: {
          ...mergeResult.aiEnhancementStatus,
          providerUsed: orchestrated.providerUsed,
          modelUsed: orchestrated.modelUsed,
          enhancementMode: "ai-engineering",
          finalEnhancerUsed: orchestrated.providerUsed,
          userMessage: buildProviderUserMessage(
            orchestrated.providerUsed,
            appliedCount
          ),
        },
      };
    }
  }

  const realAttempts = (orchestrated.providerAttempts || []).filter((attempt) =>
    ["gemini", "openai", "openrouter"].includes(attempt.provider)
  );

  if (realAttempts.length === 0) {
    console.log("[FALLBACK_WITHOUT_PROVIDER_ATTEMPTS_SOURCE]", {
      file: "server/services/aiReportEnhancer.js",
      functionName: "enhanceReportNarrativesWithAi",
      reason: "AI provider chain was not executed",
      providerAttemptsLength: 0,
    });
    throw new Error(
      "AI provider chain was not executed. Refusing silent deterministic fallback."
    );
  }

  if (!allowDeterministicFallback) {
    return {
      success: false,
      aiEnhanced: false,
      fallbackEnhanced: false,
      reportData,
      providerUsed: orchestrated.providerUsed || "none",
      modelUsed: orchestrated.modelUsed || null,
      enhancementMode: "ai-engineering",
      providerAttempts: orchestrated.providerAttempts,
      aiEnhancementCapture,
      aiEnhancementStatus: {
        status: "failed_non_blocking",
        finalEnhancerUsed: orchestrated.providerUsed || "none",
        providerAttempts: orchestrated.providerAttempts,
        providerUsed: orchestrated.providerUsed || "none",
        modelUsed: orchestrated.modelUsed || null,
        enhancementMode: "ai-engineering",
        userMessage: "AI enhancement failed and deterministic fallback is disabled.",
      },
    };
  }

  const fallbackResult = enhanceReportLocally(
    reportData,
    orchestrated.providerAttempts
  );
  console.warn("[DETERMINISTIC_FALLBACK_AFTER_REAL_AI_ATTEMPTS]", {
    attempts: orchestrated.providerAttempts,
    reason:
      orchestrated.parsedProjects.length > 0
        ? "No usable merged AI content returned"
        : "No usable content returned by providers",
  });
  validateEnhancementDidNotReduce(reportData, fallbackResult.reportData);
  const fallbackCount = getProjectCount(fallbackResult.reportData);

  return {
    ...fallbackResult,
    providerUsed: "deterministic-fallback",
    modelUsed: null,
    enhancementMode: "deterministic-engineering-fallback",
    providerAttempts: orchestrated.providerAttempts,
    aiEnhancementCapture,
    aiEnhancementStatus: {
      ...(fallbackResult.aiEnhancementStatus || {}),
      providerAttempts: orchestrated.providerAttempts,
      providerUsed: "deterministic-fallback",
      modelUsed: null,
      enhancementMode: "deterministic-engineering-fallback",
      userMessage: buildProviderUserMessage("deterministic-fallback", fallbackCount),
    },
  };
}

module.exports = {
  enhanceReportNarrativesWithAi,
};
