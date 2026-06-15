const {
  getGeminiApiKeys,
} = require("./geminiProviderService");

const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENROUTER_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-3.1-8b-instruct:free",
];
const DEFAULT_PROVIDER_PRIORITY = ["gemini", "openai", "openrouter"];

function getAiTimeoutMs() {
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 90000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 90000;
}

function getProviderPriority() {
  const configured = String(
    process.env.AI_PROVIDER_PRIORITY || DEFAULT_PROVIDER_PRIORITY.join(",")
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const unique = [...new Set(configured)];
  const known = unique.filter((provider) =>
    DEFAULT_PROVIDER_PRIORITY.includes(provider)
  );

  return known.length ? known : [...DEFAULT_PROVIDER_PRIORITY];
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

function getOpenAiModel() {
  return process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
}

function getOpenRouterModels() {
  const configured = String(
    process.env.OPENROUTER_MODELS || DEFAULT_OPENROUTER_MODELS.join(",")
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configured.length ? configured : [...DEFAULT_OPENROUTER_MODELS];
}

function getOpenRouterKeys() {
  const multiKeys = String(process.env.OPENROUTER_API_KEYS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (multiKeys.length) return multiKeys;
  if (process.env.OPENROUTER_API_KEY) {
    return [String(process.env.OPENROUTER_API_KEY).trim()];
  }
  return [];
}

function createAttempt({
  provider,
  model,
  keyIndex = null,
  status = "skipped",
  httpStatus = null,
  error = null,
  contentLength = 0,
  keyConfigured = false,
}) {
  return {
    provider,
    model,
    keyIndex,
    status,
    keyConfigured,
    httpStatus,
    error,
    contentLength,
  };
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = getAiTimeoutMs()) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const responseText = await response.text();

    let responseData = null;
    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseData = responseText;
    }

    return {
      ok: response.ok,
      status: response.status,
      responseText,
      responseData,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getFirstGeminiContent(payload) {
  return payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function getFirstOpenAiContent(payload) {
  return payload?.choices?.[0]?.message?.content || "";
}

async function tryGeminiProvider({ systemPrompt, userPrompt }) {
  const attempts = [];
  const apiKeys = getGeminiApiKeys();
  const model = getGeminiModel();

  if (!apiKeys.length) {
    attempts.push(
      createAttempt({
        provider: "gemini",
        model,
        keyIndex: 1,
        status: "skipped",
        error: "GEMINI_API_KEY missing",
        keyConfigured: false,
      })
    );
    return { success: false, attempts };
  }

  for (let index = 0; index < apiKeys.length; index += 1) {
    const apiKey = apiKeys[index];
    const keyIndex = index + 1;
    const attempt = createAttempt({
      provider: "gemini",
      model,
      keyIndex,
      status: "attempting",
      keyConfigured: Boolean(apiKey),
    });
    attempts.push(attempt);

    console.log("[AI_PROVIDER_ATTEMPT]", {
      provider: "gemini",
      model,
      hasKey: Boolean(apiKey),
      keyLength: apiKey?.length || 0,
      promptLength: userPrompt?.length || 0,
    });

    try {
      const result = await fetchJsonWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const content = getFirstGeminiContent(result.responseData);
      if (result.ok && content) {
        console.log("[AI_PROVIDER_SUCCESS]", {
          provider: "gemini",
          model,
          contentLength: content.length || 0,
        });
        attempt.status = "success";
        attempt.httpStatus = result.status;
        attempt.contentLength = content.length || 0;

        return {
          success: true,
          providerUsed: "gemini",
          modelUsed: model,
          rawResponse: content,
          attempts,
        };
      }

      const errorMessage =
        typeof result.responseData === "string"
          ? result.responseData.slice(0, 500)
          : JSON.stringify(result.responseData || {}).slice(0, 500);

      console.error("[AI_PROVIDER_FAILED]", {
        provider: "gemini",
        model,
        status: result.status,
        message: `Gemini returned empty or invalid content`,
        responseData: result.responseData,
      });

      attempt.status = "failed";
      attempt.httpStatus = result.status;
      attempt.error = errorMessage || "Gemini returned empty content";
    } catch (error) {
      console.error("[AI_PROVIDER_FAILED]", {
        provider: "gemini",
        model,
        status: error.response?.status || null,
        message: error.message,
        responseData: error.response?.data,
      });

      attempt.status = "failed";
      attempt.httpStatus = error.response?.status || null;
      attempt.error = error.message;
    }
  }

  return { success: false, attempts };
}

async function tryOpenAiProvider({ systemPrompt, userPrompt }) {
  const attempts = [];
  const apiKey = process.env.OPENAI_API_KEY;
  const model = getOpenAiModel();

  if (!apiKey) {
    attempts.push(
      createAttempt({
        provider: "openai",
        model,
        keyIndex: 1,
        status: "skipped",
        error: "OPENAI_API_KEY missing",
        keyConfigured: false,
      })
    );
    return { success: false, attempts };
  }
  const attempt = createAttempt({
    provider: "openai",
    model,
    keyIndex: 1,
    status: "attempting",
    keyConfigured: Boolean(apiKey),
  });
  attempts.push(attempt);

  console.log("[AI_PROVIDER_ATTEMPT]", {
    provider: "openai",
    model,
    hasKey: Boolean(apiKey),
    keyLength: apiKey?.length || 0,
    promptLength: userPrompt?.length || 0,
  });

  try {
    const result = await fetchJsonWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      }
    );

    const content = getFirstOpenAiContent(result.responseData);
    if (result.ok && content) {
      console.log("[AI_PROVIDER_SUCCESS]", {
        provider: "openai",
        model,
        contentLength: content.length || 0,
      });
      attempt.status = "success";
      attempt.httpStatus = result.status;
      attempt.contentLength = content.length || 0;

      return {
        success: true,
        providerUsed: "openai",
        modelUsed: model,
        rawResponse: content,
        attempts,
      };
    }

    attempt.status = "failed";
    attempt.httpStatus = result.status;
    attempt.error =
      (typeof result.responseData === "string"
        ? result.responseData
        : JSON.stringify(result.responseData || {})).slice(0, 500) ||
      "OpenAI returned empty content";
  } catch (error) {
    attempt.status = "failed";
    attempt.httpStatus = error.response?.status || null;
    attempt.error = error.message;
  }

  return { success: false, attempts };
}

async function tryOpenRouterProvider({ systemPrompt, userPrompt }) {
  const attempts = [];
  const keys = getOpenRouterKeys();
  const models = getOpenRouterModels();

  if (!keys.length) {
    attempts.push(
      createAttempt({
        provider: "openrouter",
        model: models[0] || DEFAULT_OPENROUTER_MODELS[0],
        keyIndex: 1,
        status: "skipped",
        error: "OPENROUTER_API_KEY missing",
        keyConfigured: false,
      })
    );
    return { success: false, attempts };
  }

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const apiKey = keys[keyIndex];

    for (const model of models) {
      const attempt = createAttempt({
        provider: "openrouter",
        model,
        keyIndex: keyIndex + 1,
        status: "attempting",
        keyConfigured: Boolean(apiKey),
      });
      attempts.push(attempt);
      console.log("[AI_PROVIDER_ATTEMPT]", {
        provider: "openrouter",
        model,
        hasKey: Boolean(apiKey),
        keyLength: apiKey?.length || 0,
        promptLength: userPrompt?.length || 0,
      });

      try {
        const result = await fetchJsonWithTimeout(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost:3000",
              "X-Title": "AI Report Generator",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.1,
            }),
          }
        );

        const content = getFirstOpenAiContent(result.responseData);
        if (result.ok && content) {
          console.log("[AI_PROVIDER_SUCCESS]", {
            provider: "openrouter",
            model,
            contentLength: content.length || 0,
          });
          attempt.status = "success";
          attempt.httpStatus = result.status;
          attempt.contentLength = content.length || 0;

          return {
            success: true,
            providerUsed: "openrouter",
            modelUsed: model,
            rawResponse: content,
            attempts,
          };
        }

        attempt.status = "failed";
        attempt.httpStatus = result.status;
        attempt.error =
          (typeof result.responseData === "string"
            ? result.responseData
            : JSON.stringify(result.responseData || {})).slice(0, 500) ||
          "OpenRouter returned empty content";
      } catch (error) {
        attempt.status = "failed";
        attempt.httpStatus = error.response?.status || null;
        attempt.error = error.message;
      }
    }
  }

  return { success: false, attempts };
}

function parseAiEnhancementResponse(raw) {
  if (!raw) return { parsed: null, mode: "empty" };
  if (typeof raw === "object") return { parsed: raw, mode: "object" };

  let text = String(raw).trim();

  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return { parsed: JSON.parse(text), mode: "direct-json" };
  } catch {}

  const objectMatch = text.match(/{[\s\S]*}/);
  if (objectMatch) {
    try {
      return {
        parsed: JSON.parse(objectMatch[0]),
        mode: "extracted-json-object",
      };
    } catch {}
  }

  return { parsed: { rawText: text }, mode: "raw-text" };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTitle(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEcmNumber(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? String(Number(match[1])) : "";
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

function splitRawTextIntoBlocks(text, count) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (blocks.length >= count) {
    return blocks.slice(0, count);
  }

  const sentenceBlocks = normalized
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sentenceBlocks.length >= count) {
    const size = Math.ceil(sentenceBlocks.length / count);
    return Array.from({ length: count }, (_, index) =>
      sentenceBlocks.slice(index * size, (index + 1) * size).join(" ").trim()
    ).filter(Boolean);
  }

  return blocks.length ? blocks : [normalized];
}

function convertRawTextToProjectRows(rawText, originalProjects = []) {
  const blocks = splitRawTextIntoBlocks(rawText, originalProjects.length || 1);
  return originalProjects.map((project, index) => {
    const block = blocks[index] || blocks[blocks.length - 1] || normalizeText(rawText);
    return {
      ecmNo: project.ecmNo || project.projectNo || index + 1,
      projectTitle: project.projectTitle || project.title || project.ecmName || `ECM ${index + 1}`,
      existingCondition: block,
      problemGap: block,
      proposedProject: block,
      projectActivities: [],
      benefits: [],
      conclusion: block,
      enhancedNarrative: block,
      aiTextConverted: true,
    };
  });
}

function resolveProjectsFromParsed(parsed, originalProjects = []) {
  const candidates = [
    parsed?.engineeringExpansion?.projects,
    parsed?.projects,
    parsed?.ecms,
    parsed?.enhancedProjects,
    parsed?.data?.engineeringExpansion?.projects,
    parsed?.result?.engineeringExpansion?.projects,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return {
        projects: candidate,
        source: "structured-projects",
      };
    }
  }

  if (parsed?.rawText) {
    return {
      projects: convertRawTextToProjectRows(parsed.rawText, originalProjects),
      source: "raw-ai-text-converted",
    };
  }

  return {
    projects: [],
    source: "no-projects",
  };
}

async function generateEngineeringEnhancementWithProviders({
  systemPrompt,
  userPrompt,
  originalProjects = [],
  reportData = {},
}) {
  const providerPriority = getProviderPriority();
  const providerAttempts = [];

  for (const provider of providerPriority) {
    let result = null;

    if (provider === "gemini") {
      result = await tryGeminiProvider({ systemPrompt, userPrompt });
    } else if (provider === "openai") {
      result = await tryOpenAiProvider({ systemPrompt, userPrompt });
    } else if (provider === "openrouter") {
      result = await tryOpenRouterProvider({ systemPrompt, userPrompt });
    }

    if (!result) continue;
    providerAttempts.push(...(result.attempts || []));

    if (result.success && result.rawResponse) {
      const { parsed, mode } = parseAiEnhancementResponse(result.rawResponse);
      const resolved = resolveProjectsFromParsed(parsed, originalProjects);

      return {
        success: true,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
        rawResponse: result.rawResponse,
        parsedResponse: parsed,
        parseMode: mode,
        parsedProjects: resolved.projects,
        parsedProjectsSource: resolved.source,
        providerAttempts,
        enhancementMode: "ai-engineering",
        reportData,
      };
    }
  }

  if (providerAttempts.length === 0) {
    throw new Error("AI provider chain did not execute. providerAttempts is empty.");
  }

  return {
    success: false,
    providerUsed: "deterministic-fallback",
    modelUsed: null,
    rawResponse: "",
    parsedResponse: null,
    parseMode: "empty",
    parsedProjects: [],
    parsedProjectsSource: "no-projects",
    providerAttempts,
    enhancementMode: "deterministic-engineering-fallback",
    reportData,
  };
}

module.exports = {
  DEFAULT_PROVIDER_PRIORITY,
  generateEngineeringEnhancementWithProviders,
  getAiTimeoutMs,
  getOpenRouterKeys,
  getOpenRouterModels,
  getProviderPriority,
  parseAiEnhancementResponse,
  resolveProjectsFromParsed,
};
