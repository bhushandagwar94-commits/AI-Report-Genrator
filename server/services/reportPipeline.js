const { getLLMProvider } = require("../utils/helpers");
const { cleanJsonResponse, generateWithOpenRouterFallback } = require("./llmProviderService");
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
async function runPromptStage(systemPrompt, userPrompt, templateConfig) {
  let providerUsed = "none";
  let providerStatus = "idle";
  let fallbackReason = "";
  let jsonResult = null;
  let modelUsed = null;
  let providerAttempts = [];

  console.log("[LLM] Provider:", process.env.LLM_PROVIDER);
  console.log("[LLM] OpenRouter key present:", Boolean(process.env.OPENROUTER_API_KEY));
  console.log("[LLM] OpenRouter model:", process.env.OPENROUTER_MODEL);

  const preferredProvider = process.env.LLM_PROVIDER;

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

  // B. Try OpenRouter
  if (!jsonResult && (!preferredProvider || preferredProvider === "openrouter") && process.env.OPENROUTER_API_KEY) {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];
    
    console.log("[REPORT PIPELINE] About to call generateWithOpenRouterFallback");
    console.log("[REPORT GENERATE] OPENROUTER_API_KEY present:", Boolean(process.env.OPENROUTER_API_KEY));
    console.log("[REPORT GENERATE] OPENROUTER_MODELS:", process.env.OPENROUTER_MODELS);
    
    const openRouterResult = await generateWithOpenRouterFallback(messages);
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

const NUMERIC_DRIFT_PATTERN = /\d/;

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

function containsNumericNarrative(value) {
  if (typeof value === "string") {
    return NUMERIC_DRIFT_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsNumericNarrative(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsNumericNarrative(item));
  }
  return false;
}

function validateNarrativeOutputShape(payload, llmOutput) {
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
    if (containsNumericNarrative(value)) {
      throw new Error(`Numeric content detected in LLM narrative for ${payload.componentId}.${field}`);
    }
  });
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
    baseComponent: cloneJson(baseReport.executiveSummary || {}),
    lockedData: getComponentLockedSnapshot(baseReport.executiveSummary || {}, getReportComponentDefinition("executive_summary")?.lockedFields),
    narrativeInputs: {
      formData: {
        clientName: formData.clientName || "Data required",
        facilityName: formData.facilityName || "Data required",
        location: formData.location || "Data required",
      },
      groupSummary: groupedProjects.map((group) => ({
        groupTitle: group.groupTitle,
        projectCount: (group.projects || []).length,
      })),
      extractedObservations: extractedInfo?.facilityObservations || [],
    },
    mergeTarget: { type: "executive_summary" },
    forbiddenFields: getReportComponentDefinition("executive_summary")?.lockedFields || [],
  });

  payloads.push({
    ...getReportComponentDefinition("plant_profile"),
    componentTitle: "Chapter 2: Plant / Building Details and Energy Profile",
    baseComponent: cloneJson(baseReport.buildingProfile || {}),
    lockedData: getComponentLockedSnapshot(baseReport.buildingProfile || {}, getReportComponentDefinition("plant_profile")?.lockedFields),
    narrativeInputs: {
      facilityObservations: extractedInfo?.facilityObservations || [],
      utilityObservations: extractedInfo?.utilityObservations || [],
      supportingFormData: {
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
      baseComponent: cloneJson(group),
      lockedData: {
        groupNo: group.groupNo,
        groupTitle: group.groupTitle,
        projectCount: Array.isArray(group.projects) ? group.projects.length : 0,
        totalInvestment: group.totalInvestment,
        totalAnnualSaving: group.totalAnnualSaving,
        totalEnergySaving: group.totalEnergySaving,
        weightedPayback: group.weightedPayback,
      },
      narrativeInputs: {
        projectTitles: (group.projects || []).map((project) => project.projectTitle),
        extractedObservations: extractedInfo?.facilityObservations || [],
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
      baseComponent: cloneJson(project),
      lockedData: getComponentLockedSnapshot(project, getReportComponentDefinition("project_detail")?.lockedFields),
      narrativeInputs: {
        baselineDetails: supportingNotes.existingConditionNotes || project.baselineDetails || project.existingOperatingCondition || "Data required",
        projectActivitiesText: supportingNotes.implementationNotes || project.projectActivitiesText || project.proposedIntervention || "Data required",
        documentText: [
          supportingNotes.proposedMeasureNotes,
          supportingNotes.rationaleNotes,
          supportingNotes.measurementVerificationNotes,
          supportingNotes.caseStudyNotes,
        ].filter(Boolean).join("\n") || "Data required",
        imageReferences: imageMetadata.filter((image) =>
          String(image?.projectNo || "").trim() === String(project.projectNo || "").trim()
        ),
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

async function runComponentNarrativeStage(payload, templateConfig) {
  const systemPrompt = `You are generating professional technical narrative for a Detailed Energy Audit Report.

Strict rules:
1. Do not generate any numerical values.
2. Do not modify any numerical values.
3. Do not estimate missing numbers.
4. Do not change project names, equipment names, savings, investment, payback, duration, priority, or counts.
5. Use only the provided input context.
6. If information is missing, write "Data required".
7. Return JSON only.
8. Only fill fields listed in allowedOutputFields.
9. Never include markdown fences.
10. Do not add extra fields.`;

  const userPrompt = `Generate narrative for this report component.

${JSON.stringify({
    componentId: payload.id,
    componentTitle: payload.componentTitle,
    lockedData: payload.lockedData || {},
    narrativeInputs: payload.narrativeInputs || {},
    allowedOutputFields: payload.llmAllowedFields || [],
    forbiddenFields: payload.forbiddenFields || [],
  }, null, 2)}

Return JSON now:`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig);
}

async function runBatchComponentNarrativeStage(payloads, templateConfig) {
  const systemPrompt = `You are generating professional technical narrative for a Detailed Energy Audit Report.

Strict rules:
1. Do not generate any numerical values.
2. Do not modify any numerical values.
3. Do not estimate missing numbers.
4. Do not change project names, equipment names, savings, investment, payback, duration, priority, or counts.
5. Use only the provided input context.
6. If information is missing, write "Data required".
7. Return JSON only.
8. Only fill fields listed in allowedOutputFields.
9. Never include markdown fences.
10. Do not add extra fields.
11. Return one output object per componentKey.`;

  const userPrompt = `Generate narrative for these report components.

${JSON.stringify({
    components: payloads.map((payload) => ({
      componentKey: buildComponentInstanceKey(payload),
      componentId: payload.id,
      componentTitle: payload.componentTitle,
      lockedData: payload.lockedData || {},
      narrativeInputs: payload.narrativeInputs || {},
      allowedOutputFields: payload.llmAllowedFields || [],
      forbiddenFields: payload.forbiddenFields || [],
    })),
  }, null, 2)}

Return JSON in this format:
{
  "components": [
    {
      "componentKey": "",
      "output": {}
    }
  ]
}`;

  return runPromptStage(systemPrompt, userPrompt, templateConfig);
}

function applyComponentNarrative(report, payload, narrativeOutput) {
  const allowedOutputFields = payload.llmAllowedFields || [];
  const lockedFields = payload.lockedFields || [];

  validateNarrativeOutputShape({
    componentId: payload.id,
    allowedOutputFields,
    lockedFields,
  }, narrativeOutput);

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
}) {
  const useAiDuringGeneration = String(process.env.USE_AI_DURING_GENERATION || "true").toLowerCase() === "true";
  const aiFinalizationTimeoutMs = Number(process.env.AI_FINALIZATION_TIMEOUT_MS || 30000);
  let providerUsed = "deterministic";
  let providerStatus = "success";
  let modelUsed = null;
  const providerAttempts = [];
  const warnings = [];

  let report = buildCommercialBuildingEnergyAuditBaseData({
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
  const llmEligiblePayloads = componentPayloads.filter((payload) => payload?.allowLLM);

  if (!useAiDuringGeneration) {
    warnings.push("AI enhancement disabled. Deterministic report generated successfully.");
  } else {
    if (llmEligiblePayloads.length) {
      try {
        console.time("[REPORT] ai_attempts");
        console.log("[REPORT] before AI call");
        const result = await runBatchComponentNarrativeStage(llmEligiblePayloads, templateConfig);
        console.log("[REPORT] after AI call");
        console.timeEnd("[REPORT] ai_attempts");
        const attempts = result?.providerAttempts || [];
        if (Array.isArray(attempts) && attempts.length) {
          providerAttempts.push(...attempts.map((attempt) => ({
            ...attempt,
            componentId: "batch_narrative_enhancement",
            componentTitle: "Batched narrative enhancement",
          })));
        }

        if (!result?.result || !Array.isArray(result.result.components)) {
          throw new Error("AI returned no component outputs");
        }

        const outputs = result.result.components;
        const payloadMap = new Map(
          llmEligiblePayloads.map((payload) => [buildComponentInstanceKey(payload), payload])
        );

        if (!attempts.some((attempt) => attempt.status === "success") && providerAttempts.length > 0) {
          llmFailureCount += llmEligiblePayloads.length;
          warnings.push("AI enhancement failed after all model attempts. Deterministic report used.");
        } else {
          report = await withTimeout(
            Promise.resolve().then(() => {
              console.time("[REPORT] ai_parse");
              console.log("[REPORT] before JSON parse");
              console.log("[REPORT] after JSON parse");
              console.timeEnd("[REPORT] ai_parse");

              console.time("[REPORT] narrative_merge");
              console.log("[REPORT] before merge");
              let mergedReport = cloneJson(report);
              outputs.forEach((item) => {
                const payload = payloadMap.get(item?.componentKey);
                if (!payload) return;
                mergedReport = applyComponentNarrative(mergedReport, payload, item?.output || {});
                llmSuccessCount += 1;
              });
              console.log("[REPORT] after merge");
              console.timeEnd("[REPORT] narrative_merge");

              console.time("[REPORT] qc");
              const finalizedReport = finalizeCommercialAuditReport({
                report: mergedReport,
                componentPayloads,
                extractedExcelData,
                llmSuccessCount,
                llmFailureCount,
                aiEnhanced: llmSuccessCount > 0,
                useAiDuringGeneration,
              });
              console.log("[REPORT] after qc");
              console.timeEnd("[REPORT] qc");
              return finalizedReport;
            }),
            aiFinalizationTimeoutMs,
            "AI finalization"
          );
        }

        if (llmSuccessCount > 0) {
          lastSuccessProvider = result?.providerUsed || lastSuccessProvider;
          lastSuccessModel = result?.modelUsed || lastSuccessModel;
        } else {
          llmFailureCount += llmEligiblePayloads.length;
          warnings.push("AI enhancement returned no usable narrative updates. Deterministic report used.");
        }
      } catch (error) {
        aiEnhancementFailed = true;
        llmSuccessCount = 0;
        lastSuccessProvider = null;
        lastSuccessModel = null;
        llmFailureCount += llmEligiblePayloads.length;
        if (Array.isArray(error?.providerAttempts) && error.providerAttempts.length) {
          providerAttempts.push(...error.providerAttempts.map((attempt) => ({
            ...attempt,
            componentId: "batch_narrative_enhancement",
            componentTitle: "Batched narrative enhancement",
          })));
        }
        warnings.push(`Batched narrative enhancement: ${error.message}`);
        console.warn(`[COMPONENT LLM FALLBACK] Batched narrative enhancement: ${error.message}`);
      }
    }

    if (llmSuccessCount > 0) {
      providerUsed = lastSuccessProvider || "openrouter";
      providerStatus = "success";
      modelUsed = lastSuccessModel || null;
    } else if (providerAttempts.length > 0) {
      warnings.push("AI enhancement failed after all model attempts. Deterministic report used.");
    } else if (llmFailureCount > 0) {
      warnings.push("AI enhancement failed. Deterministic report used.");
    } else {
      warnings.push("AI enhancement was skipped. Deterministic report used.");
    }
  }

  if (!useAiDuringGeneration) {
    providerUsed = "deterministic";
    providerStatus = "success";
  } else if (llmSuccessCount === 0 || aiEnhancementFailed) {
    providerUsed = "deterministic";
    providerStatus = "success";
  }

  const aiEnhanced = llmSuccessCount > 0;
  const providerWarning = aiEnhanced
    ? null
    : (warnings.find((warning) => /AI enhancement/i.test(warning)) || null);

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
    componentPayloads,
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

async function runAIEnhancementStage(reportData, templateConfig) {
  const narrativePayload = {
    executiveSummary: {
      purposeText: reportData.executiveSummary?.purposeText || "",
      keyObservations: reportData.executiveSummary?.keyObservations || [],
      conclusionAndWayForward: reportData.executiveSummary?.conclusionAndWayForward || ""
    },
    projects: (reportData.projects || []).map(p => ({
      projectNo: p.projectNo,
      existingSystemDescription: p.existingSystemDescription || "",
      proposedProjectDescription: p.proposedProjectDescription || "",
      rationaleForEnergySaving: p.rationaleForEnergySaving || "",
      problemGapIdentified: p.problemGapIdentified || "",
      scopeOfWork: p.scopeOfWork || "",
      keyActivities: p.keyActivities || [],
      measurementVerificationPlan: p.measurementVerificationPlan || "",
      benefitsOtherThanEnergySaving: p.benefitsOtherThanEnergySaving || [],
      conclusion: p.conclusion || ""
    }))
  };

  const systemPrompt = `You are a professional energy auditor. Enhance the narrative descriptions provided in the JSON payload to sound professional, persuasive, and technically sound. Do NOT change any numerical truth values. Return ONLY valid JSON matching the exact structure of the input payload.`;
  const userPrompt = JSON.stringify(narrativePayload);

  return runPromptStage(systemPrompt, userPrompt, templateConfig);
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
  runAIEnhancementStage,
};
