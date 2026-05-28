async function generateWithGemini(messagesOrPrompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 60000);

  if (!apiKey) {
    return {
      success: false,
      providerUsed: "gemini",
      providerStatus: "failed",
      modelUsed: model,
      error: "GEMINI_API_KEY missing",
      providerAttempts: [
        {
          provider: "gemini",
          model,
          status: "failed",
          reason: "GEMINI_API_KEY missing",
          error: "GEMINI_API_KEY missing"
        }
      ]
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
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: messagesOrPrompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: Number(process.env.GEMINI_TEMPERATURE || 0.1),
            maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 2048),
            responseMimeType: "application/json"
          }
        }),
        signal: controller.signal
      }
    );

    const text = await response.text();

    if (!response.ok) {
      if (response.status === 429) {
        let retrySeconds = 60;
        const retryMatch = text.match(/retry (?:in|after) (?:about )?(\d+(?:\.\d+)?)\s*s/i);
        if (retryMatch) {
            retrySeconds = Math.ceil(parseFloat(retryMatch[1]));
        }
        const errorMsg = `Gemini quota exceeded. Please retry after ${retrySeconds} seconds.`;
        const err = new Error(errorMsg);
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
      raw: data
    };
  } catch (error) {
    const actualErrorMessage = error.name === "AbortError"
      ? `Gemini timed out after ${timeoutMs}ms`
      : error.message;

    return {
      success: false,
      providerUsed: "gemini",
      providerStatus: "failed",
      modelUsed: model,
      error: actualErrorMessage,
      isQuotaExceeded: error.isQuotaExceeded || false,
      retryAfterSeconds: error.retryAfterSeconds || null,
      providerAttempts: [
        {
          provider: "gemini",
          model,
          status: "failed",
          reason: actualErrorMessage,
          error: actualErrorMessage,
          isQuotaExceeded: error.isQuotaExceeded || false,
          retryAfterSeconds: error.retryAfterSeconds || null
        }
      ]
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  generateWithGemini
};
