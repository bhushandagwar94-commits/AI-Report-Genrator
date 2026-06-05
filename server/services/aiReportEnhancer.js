const llmProviderService = require("./llmProviderService");
const { qcMergeAiEnhancement } = require("./aiQcMergeService");
const { enhanceReportLocally } = require("./localNarrativeEnhancer");

const LOCKED_FIELDS = [
  "ecmNo",
  "title",
  "ecmName",
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
  "numericFieldsLocked"
];

function getProjectCount(reportData) {
  return (reportData?.groups || []).reduce(
    (sum, group) => sum + (Array.isArray(group?.projects) ? group.projects.length : 0),
    0
  );
}

function validateEnhancementDidNotReduce(beforeReportData, afterReportData) {
  const beforeProjects = (beforeReportData.groups || []).flatMap((g) => g.projects || []);
  const afterProjects = (afterReportData.groups || []).flatMap((g) => g.projects || []);

  if (afterProjects.length < beforeProjects.length) {
    throw new Error("AI enhancement reduced project count.");
  }

  const ENGINEERING_ANALYSIS_FIELDS = [
    "existingSystemDescription",
    "problemGapIdentified",
    "proposedProject",
    "rationaleForEnergySaving",
    "measurementVerificationPlan",
    "benefitsOtherThanEnergySaving",
    "conclusion"
  ];

  const wordCount = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;

  for (let i = 0; i < beforeProjects.length; i += 1) {
    const before = beforeProjects[i];
    const after = afterProjects[i];

    if (!before || !after) continue;

    for (const field of LOCKED_FIELDS) {
      if (before[field] !== undefined && String(before[field]) !== String(after[field])) {
        throw new Error(`AI enhancement changed locked field: ${field}`);
      }
    }

    for (const field of ENGINEERING_ANALYSIS_FIELDS) {
      const beforeWords = wordCount(before[field]);
      const afterWords = wordCount(after[field]);

      if (beforeWords > 20 && afterWords < beforeWords) {
        throw new Error(`AI enhancement reduced content field: ${field}`);
      }
    }
  }

  console.log("[ENHANCEMENT_CONTENT_LENGTH_CHECK]", {
    projects: afterReportData.groups?.flatMap((g) => g.projects || []).length || 0,
    sample: afterReportData.groups?.[0]?.projects?.[0]
      ? {
          title: afterReportData.groups[0].projects[0].title,
          existingWords: wordCount(afterReportData.groups[0].projects[0].existingSystemDescription),
          problemWords: wordCount(afterReportData.groups[0].projects[0].problemGapIdentified),
          proposedWords: wordCount(afterReportData.groups[0].projects[0].proposedProject),
          rationaleWords: wordCount(afterReportData.groups[0].projects[0].rationaleForEnergySaving),
          mvWords: wordCount(afterReportData.groups[0].projects[0].measurementVerificationPlan),
          conclusionWords: wordCount(afterReportData.groups[0].projects[0].conclusion)
        }
      : null
  });
}

function buildAiSystemPrompt() {
  return `You are a senior energy auditor, electrical engineer, HVAC utility expert, and industrial energy efficiency consultant.

You are enhancing an energy audit report created from uploaded Excel/project data.

Your job is NOT to summarize.
Your job is to expand the report into detailed engineering analysis while preserving every extracted input fact.

Mandatory rules:
1. Never reduce, shorten, delete, or summarize the extracted input information.
2. Preserve every ECM title exactly.
3. Preserve every numeric value exactly, including energy saving, annual saving, investment, payback, equipment ratings, quantities, operating hours, and source references.
4. Do not invent numbers.
5. If numeric data is missing, write what measurement is required instead of assuming values.
6. If a field already contains useful input text, retain it and add additional engineering explanation below it.
7. Only replace empty placeholder text.
8. All explanation/theory sections must be written as bullet points.
9. Each major engineering analysis section must be 800 to 1400 words.
10. Do not use generic repeated filler.
11. Make content specific to the project system: HVAC, chiller, pump, compressor, motor, VFD, heat recovery, dryer, APFC, lighting, controls, or building utilities.
12. Every project must receive unique analysis based on its title, system and available values.
13. Do not merge projects.
14. Do not reduce project count.
15. Do not remove rejected/accepted source information.
16. Return strict JSON only.`;
}

function buildAiUserPrompt(reportData) {
  return `Enhance the following energy audit report.

Important:
Preserve all extracted information and expand it with project-specific engineering detail.

For each ECM/project:
- Keep ecmNo exactly same.
- Keep title exactly same.
- Keep system exactly same.
- Keep energySaving exactly same.
- Keep annualSaving exactly same.
- Keep investment exactly same.
- Keep payback exactly same.
- Do not alter sourceSheet or sourceRow.
- Do not remove any input field.
- Do not reduce any existing field.
- If existing narrative text is weak, expand it using detailed engineering analysis.
- If existing narrative text is placeholder, replace with detailed bullet-point analysis.
- If numeric data is missing, explain measurement requirements and validation method.

Required output JSON shape:

{
  "executiveSummaryEnhancement": {
    "purposeText": "bullet point text, additive, not shorter than existing",
    "keyObservations": ["bullet observation 1", "bullet observation 2"],
    "conclusionAndWayForward": "bullet point text, additive, not shorter than existing"
  },
  "projectEnhancements": [
    {
      "ecmNo": "same ecmNo as input",
      "title": "same title as input",
      "existingSystemDescription": "800-1400 words in bullet points",
      "problemGapIdentified": "800-1400 words in bullet points",
      "proposedProject": "800-1400 words in bullet points",
      "rationaleForEnergySaving": "800-1400 words in bullet points",
      "measurementVerificationPlan": "800-1400 words in bullet points",
      "benefitsOtherThanEnergySaving": "800-1400 words in bullet points",
      "conclusion": "800-1400 words in bullet points"
    }
  ]
}

Do not return markdown.
Do not wrap JSON in code fences.
Return JSON only.

Report data:
${JSON.stringify(reportData || {}, null, 2)}`;
}

function extractJsonObject(text) {
  if (!text) throw new Error("Empty AI response.");
  if (typeof text === "object") return text;

  const raw = String(text).trim();

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}

function normalizeAiOutputShape(aiOutput) {
  if (!aiOutput || typeof aiOutput !== "object") return {};

  const candidate =
    aiOutput.executiveSummaryEnhancement || aiOutput.projectEnhancements
      ? aiOutput
      : aiOutput.enhancement ||
        aiOutput.data ||
        aiOutput.result ||
        aiOutput.output ||
        {};

  return {
    executiveSummaryEnhancement:
      candidate.executiveSummaryEnhancement ||
      candidate.executiveSummary ||
      {},
    projectEnhancements:
      candidate.projectEnhancements ||
      candidate.projects ||
      candidate.ecmEnhancements ||
      []
  };
}

async function enhanceReportNarrativesWithAi({ reportData, force = false }) {
  const manualEnabled =
    String(process.env.ENABLE_AI_ENHANCEMENT || "true").toLowerCase() !== "false" &&
    String(process.env.ENABLE_MANUAL_AI_ENHANCEMENT || "true").toLowerCase() !== "false";

  if (!manualEnabled && !force) {
    return enhanceReportLocally(reportData, []);
  }

  const projectCount = getProjectCount(reportData);

  if (!reportData || projectCount <= 0) {
    return enhanceReportLocally(reportData, []);
  }

  try {
    const systemPrompt = buildAiSystemPrompt();
    const userPrompt = buildAiUserPrompt(reportData);
    const providerAttempts = [];
    let mergeResult = null;

    if (typeof llmProviderService.generateWithProvider === "function") {
      try {
        const result = await llmProviderService.generateWithProvider({
          systemPrompt,
          userPrompt,
          temperature: 0.2,
          responseFormat: "json"
        });

        const text = result.text || result.content || result.output || result.raw || "";
        
        console.log("[AI_PROVIDER_RAW_OUTPUT_SUMMARY]", {
          type: typeof text,
          length: typeof text === "string" ? text.length : null,
          preview: typeof text === "string" ? text.slice(0, 500) : text
        });

        const attemptRecord = {
          provider: "gemini",
          status: "success",
          model: result.modelUsed || "gemini"
        };
        providerAttempts.push(attemptRecord);

        const aiOutput = normalizeAiOutputShape(extractJsonObject(text));
        
        mergeResult = qcMergeAiEnhancement({
          baseReportData: reportData,
          aiOutput,
          providerAttempts
        });

        if (mergeResult.aiEnhancementStatus.fieldsAccepted <= 0) {
          attemptRecord.status = "unusable_output";
          attemptRecord.reason = "fieldsAccepted_zero";
          mergeResult = null; // discard and try next
        }
      } catch (error) {
        providerAttempts.push({
          provider: "gemini",
          status: "failed",
          errorMessage: error?.message || String(error)
        });
      }
    }

    if (!mergeResult && typeof llmProviderService.generateWithOpenRouterFallback === "function") {
      try {
        const result = await llmProviderService.generateWithOpenRouterFallback({
          systemPrompt,
          userPrompt,
          temperature: 0.2,
          responseFormat: "json"
        });

        const text = result.text || result.content || result.output || result.raw || "";

        console.log("[AI_PROVIDER_RAW_OUTPUT_SUMMARY]", {
          type: typeof text,
          length: typeof text === "string" ? text.length : null,
          preview: typeof text === "string" ? text.slice(0, 500) : text
        });

        const attemptRecord = {
          provider: "openrouter",
          status: "success",
          model: result.modelUsed || "openrouter"
        };
        providerAttempts.push(attemptRecord);

        const aiOutput = normalizeAiOutputShape(extractJsonObject(text));

        mergeResult = qcMergeAiEnhancement({
          baseReportData: reportData,
          aiOutput,
          providerAttempts
        });

        if (mergeResult.aiEnhancementStatus.fieldsAccepted <= 0) {
          attemptRecord.status = "unusable_output";
          attemptRecord.reason = "fieldsAccepted_zero";
          mergeResult = null; // discard and try next
        }
      } catch (error) {
        providerAttempts.push({
          provider: "openrouter",
          status: "failed",
          errorMessage: error?.message || String(error)
        });
      }
    }

    if (!mergeResult) {
      const fallbackResult = enhanceReportLocally(reportData, providerAttempts);
      validateEnhancementDidNotReduce(reportData, fallbackResult.reportData);
      return fallbackResult;
    }

    validateEnhancementDidNotReduce(reportData, mergeResult.reportData);

    return {
      success: true,
      aiEnhanced: true,
      reportData: mergeResult.reportData,
      aiEnhancementStatus: mergeResult.aiEnhancementStatus,
      providerAttempts
    };
  } catch (error) {
    console.error("[AI_ENHANCER_VALIDATION_FAILED]", error);
    return enhanceReportLocally(reportData, providerAttempts || []);
  }
}

module.exports = {
  enhanceReportNarrativesWithAi
};
