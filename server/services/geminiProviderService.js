function getGeminiApiKeys() {
  const multiKeys = process.env.GEMINI_API_KEYS;

  if (multiKeys) {
    return multiKeys
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
  }

  if (process.env.GEMINI_API_KEY) {
    return [process.env.GEMINI_API_KEY.trim()];
  }

  return [];
}

function isRetryableGeminiError(errorMessage = "") {
  const message = String(errorMessage).toLowerCase();
  return [
    "timed out",
    "timeout",
    "aborted",
    "econnreset",
    "enotfound",
    "fetch failed",
    "failed to fetch",
    "network",
    "socket hang up",
    "temporarily unavailable",
    "internal error",
    "service unavailable",
    "resource exhausted",
    "429",
    "503",
    "500",
  ].some((token) => message.includes(token));
}

async function generateWithGeminiUsingKey(messagesOrPrompt, options = {}) {
  const apiKey = options.apiKey;
  const keyIndex = options.keyIndex || 1;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 60000);

  if (!apiKey) {
    return {
      success: false,
      providerUsed: "gemini",
      providerStatus: "failed",
      modelUsed: model,
      keyIndex,
      error: "Gemini API key missing",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: messagesOrPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: Number(process.env.GEMINI_TEMPERATURE || 0.1),
            maxOutputTokens: Number(
              process.env.GEMINI_MAX_OUTPUT_TOKENS || 2048
            ),
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      }
    );

    const text = await response.text();

    if (!response.ok) {
      if (response.status === 429) {
        let retrySeconds = 60;
        const retryMatch = text.match(
          /retry (?:in|after) (?:about )?(\d+(?:\.\d+)?)\s*s/i
        );
        if (retryMatch) {
          retrySeconds = Math.ceil(parseFloat(retryMatch[1]));
        }
        const err = new Error(
          `Gemini free quota exceeded. Retry after ${retrySeconds} seconds.`
        );
        err.retryAfterSeconds = retrySeconds;
        err.isQuotaExceeded = true;
        throw err;
      }

      throw new Error(`Gemini ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = JSON.parse(text);
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error("Gemini returned empty content");
    }

    return {
      success: true,
      providerUsed: "gemini",
      providerStatus: "success",
      modelUsed: model,
      content,
      raw: data,
      keyIndex,
    };
  } catch (error) {
    const actualErrorMessage =
      error.name === "AbortError"
        ? `Gemini timed out after ${timeoutMs}ms`
        : error.message;

    return {
      success: false,
      providerUsed: "gemini",
      providerStatus: error.isQuotaExceeded ? "quota_exceeded" : "failed",
      modelUsed: model,
      keyIndex,
      error: actualErrorMessage,
      isQuotaExceeded: error.isQuotaExceeded || false,
      retryAfterSeconds: error.retryAfterSeconds || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithGeminiFallback(prompt, options = {}) {
  const keys = getGeminiApiKeys();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const providerAttempts = [];

  console.log("[GEMINI KEYS CONFIG]", {
    hasSingleKey: Boolean(process.env.GEMINI_API_KEY),
    multiKeyCount: keys.length,
    model,
  });

  if (!keys.length) {
    return {
      success: false,
      providerUsed: "gemini",
      providerStatus: "failed",
      modelUsed: model,
      error: "No Gemini API keys configured",
      providerAttempts,
    };
  }

  for (let i = 0; i < keys.length; i += 1) {
    const keyIndex = i + 1;
    console.log("[GEMINI FALLBACK] Trying key", keyIndex, "of", keys.length);
    const attempt = {
      provider: "gemini",
      model,
      keyIndex,
      status: "started",
      startedAt: new Date().toISOString(),
    };

    providerAttempts.push(attempt);

    const result = await generateWithGeminiUsingKey(prompt, {
      ...options,
      apiKey: keys[i],
      keyIndex,
    });

    if (result.success) {
      attempt.status = "success";
      attempt.finishedAt = new Date().toISOString();
      console.log(`[GEMINI FALLBACK] Key ${keyIndex} success.`);

      return {
        ...result,
        providerUsed: "gemini",
        providerStatus: "success",
        modelUsed: model,
        keyIndex,
        providerAttempts,
      };
    }

    const errorMessage = result.error || "Gemini failed without error details";
    attempt.status = result.isQuotaExceeded ? "quota_exceeded" : "failed";
    attempt.reason = errorMessage;
    attempt.error = errorMessage;
    attempt.isQuotaExceeded = Boolean(result.isQuotaExceeded);
    attempt.retryAfterSeconds = result.retryAfterSeconds || null;
    attempt.finishedAt = new Date().toISOString();

    if (result.isQuotaExceeded) {
      console.log(
        `[GEMINI FALLBACK] Key ${keyIndex} quota exceeded. Trying next key.`
      );
      continue;
    }

    if (isRetryableGeminiError(errorMessage)) {
      console.warn(
        `[GEMINI FALLBACK] Key ${keyIndex} failed/retryable. Trying next key if available...`
      );
      continue;
    }

    break;
  }

  const quotaAttempts = providerAttempts.filter(
    (attempt) => attempt.status === "quota_exceeded"
  );
  const retryAfterSeconds =
    quotaAttempts
      .map((attempt) => Number(attempt.retryAfterSeconds))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b)[0] || 60;

  const allQuotaExceeded =
    providerAttempts.length > 0 &&
    providerAttempts.every((attempt) => attempt.status === "quota_exceeded");

  return {
    success: false,
    providerUsed: "gemini",
    providerStatus: allQuotaExceeded ? "quota_exceeded" : "failed",
    modelUsed: model,
    error: allQuotaExceeded
      ? `All Gemini API keys are quota exhausted. Retry after ${retryAfterSeconds} seconds.`
      : "All Gemini API keys failed.",
    isQuotaExceeded: allQuotaExceeded,
    retryAfterSeconds,
    providerAttempts,
  };
}

async function generateWithGemini(prompt, options = {}) {
  return generateWithGeminiFallback(prompt, options);
}

module.exports = {
  getGeminiApiKeys,
  isRetryableGeminiError,
  generateWithGeminiUsingKey,
  generateWithGeminiFallback,
  generateWithGemini,
};
