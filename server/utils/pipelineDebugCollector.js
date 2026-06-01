function createPipelineDebugCollector(initial = {}) {
  const startedAt = new Date().toISOString();

  const debug = {
    runId: initial.runId || `run_${Date.now()}`,
    startedAt,
    finishedAt: null,
    totalDurationMs: null,

    reportType: initial.reportType || "unknown",
    generationMode: initial.generationMode || "unknown",
    status: "running",

    inputSummary: {
      files: [],
      parserUsed: null,
      parserReason: null,
      sheetsDetected: 0,
      sheetSummaries: [],
      ecmRowsFound: 0,
      supportingDataFound: "No",
      extractedFieldsCount: 0,
      missingFields: [],
      warnings: [],
      errors: []
    },
    dataStructuring: {
      rawRowsCount: 0,
      normalizedEcmCount: 0,
      groupsCount: 0,
      groups: [],
      ecmClassifications: [],
      fieldMapping: {
        financialFieldsMapped: 0,
        energyFieldsMapped: 0,
        paybackFieldsMapped: 0,
        missingFinancialFields: [],
        missingEnergyFields: []
      }
    },
    functionBlocks: [],
    aiNodes: [],
    providerAttempts: [],
    prompts: [],
    vectorDb: {
      enabled: false,
      retrievalUsed: false,
      message: "Vector DB not configured"
    },
    ocrTrace: {
      ocrUsed: false,
      engine: null,
      reason: null
    },
    calculationTrace: [],
    plottingTrace: [],
    validationTrace: {
      changedNumbersDetected: 0,
      forbiddenStringsDetected: 0,
      promptLeakageDetected: 0,
      aiFieldsAccepted: 0,
      aiFieldsDropped: 0,
      droppedFields: []
    },
    exportTrace: {},
    recommendedModels: [
      {
        nodeId: "input_extraction",
        currentModel: "deterministic parser",
        idealModel: "deterministic parser",
        reason: "Structured extraction is more accurate with code than LLM",
        priority: "high"
      },
      {
        nodeId: "executive_summary",
        currentModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
        idealModel: "gemini-2.5-flash-lite",
        reason: "Fast and cost-efficient for summary generation",
        priority: "medium"
      },
      {
        nodeId: "ecm_engineering",
        currentModel: "openai/gpt-oss-120b:free",
        idealModel: "openai/gpt-oss-120b:free",
        reason: "Better suited for deeper ECM engineering explanation",
        priority: "high"
      },
      {
        nodeId: "qc_validation",
        currentModel: "deterministic validation",
        idealModel: "deterministic validation",
        reason: "QC should not depend on AI",
        priority: "critical"
      }
    ],
    warnings: [],
    errors: [],

    finalOutputSource: "deterministic",
    finalEnhancerUsed: "none",
    fallbackReason: null,

    config: {
      geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      openRouterModels: String(process.env.OPENROUTER_MODELS || "").split(",").map(s => s.trim()).filter(Boolean),
      aiFinalizationTimeoutMs: Number(process.env.AI_FINALIZATION_TIMEOUT_MS || process.env.AI_TOTAL_TIMEOUT_MS || 120000),
      openRouterTimeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS || 90000),
      openRouterBatchSize: Number(process.env.OPENROUTER_ECM_BATCH_SIZE || 3)
    }
  };

  return {
    data: debug,

    addBlock(block) {
      debug.functionBlocks.push({
        id: block.id || `block_${debug.functionBlocks.length + 1}`,
        title: block.title || "Unnamed block",
        status: block.status || "unknown",
        startedAt: block.startedAt || new Date().toISOString(),
        finishedAt: block.finishedAt || null,
        durationMs: block.durationMs || null,
        inputSummary: block.inputSummary || {},
        outputSummary: block.outputSummary || {},
        warnings: block.warnings || [],
        errors: block.errors || []
      });
    },

    addProviderAttempt(attempt) {
      debug.providerAttempts.push({
        provider: attempt.provider || "unknown",
        model: attempt.model || "unknown",
        status: attempt.status || "unknown",
        startedAt: attempt.startedAt || null,
        finishedAt: attempt.finishedAt || null,
        durationMs: attempt.durationMs || null,
        error: attempt.error || null,
        reason: attempt.reason || null,
        finalUsed: Boolean(attempt.finalUsed)
      });
    },

    addAiNode(node) {
      debug.aiNodes.push({
        nodeId: node.nodeId || `ai_node_${debug.aiNodes.length + 1}`,
        task: node.task || "AI task",
        selectedProvider: node.selectedProvider || "unknown",
        selectedModel: node.selectedModel || "unknown",
        fallbackModels: node.fallbackModels || [],
        status: node.status || "unknown",
        finalUsed: Boolean(node.finalUsed),
        idealModelSuggestion: node.idealModelSuggestion || null,
        warnings: node.warnings || [],
        errors: node.errors || []
      });
    },

    addPrompt(prompt) {
      debug.prompts.push({
        nodeId: prompt.nodeId || "unknown",
        promptName: prompt.promptName || "Unnamed prompt",
        promptVersion: prompt.promptVersion || "v1",
        model: prompt.model || "unknown",
        systemPromptPreview: prompt.systemPromptPreview || "",
        userPromptPreview: prompt.userPromptPreview || "",
        schemaName: prompt.schemaName || null,
        estimatedInputTokens: prompt.estimatedInputTokens || null,
        estimatedOutputTokens: prompt.estimatedOutputTokens || null
      });
    },

    addWarning(message, meta = {}) {
      debug.warnings.push({ message, meta, at: new Date().toISOString() });
    },

    addError(message, meta = {}) {
      debug.errors.push({ message, meta, at: new Date().toISOString() });
    },

    finalize(final = {}) {
      debug.finishedAt = new Date().toISOString();
      debug.totalDurationMs = new Date(debug.finishedAt).getTime() - new Date(debug.startedAt).getTime();
      debug.status = final.status || "completed";
      debug.finalOutputSource = final.finalOutputSource || debug.finalOutputSource;
      debug.finalEnhancerUsed = final.finalEnhancerUsed || debug.finalEnhancerUsed;
      debug.fallbackReason = final.fallbackReason || debug.fallbackReason;
      return debug;
    }
  };
}

module.exports = {
  createPipelineDebugCollector
};
