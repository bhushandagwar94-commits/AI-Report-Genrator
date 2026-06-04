require("dotenv").config({ path: __dirname + "/../.env.development" });

const {
  getGeminiApiKeys,
  generateWithGeminiUsingKey,
} = require("../services/geminiProviderService");
const {
  generateWithOpenRouterFallback,
} = require("../services/llmProviderService");

async function testGeminiKey(apiKey, keyIndex) {
  const result = await generateWithGeminiUsingKey(
    'Return JSON only: {"ok":true}',
    {
      apiKey,
      keyIndex,
    }
  );

  if (result.success) return { keyIndex, status: "success" };
  if (result.isQuotaExceeded) return { keyIndex, status: "quota" };
  return { keyIndex, status: "failed" };
}

async function testOpenRouter() {
  const result = await generateWithOpenRouterFallback(
    [{ role: "user", content: 'Return JSON only: {"ok":true}' }],
    { isManualEnhancement: true }
  );

  if (result.success) return { status: "success", providerUsed: "openrouter" };
  return { status: "failed", providerUsed: "openrouter" };
}

async function main() {
  const geminiKeys = getGeminiApiKeys();
  console.log(`Gemini key count: ${geminiKeys.length}`);

  const geminiResults = [];
  for (let i = 0; i < geminiKeys.length; i += 1) {
    geminiResults.push(await testGeminiKey(geminiKeys[i], i + 1));
  }

  const openRouterResult = await testOpenRouter();
  const selectedFallbackProvider = geminiResults.find(
    (result) => result.status === "success"
  )
    ? "gemini"
    : openRouterResult.status === "success"
      ? "openrouter"
      : "deterministic";

  geminiResults.forEach((result) => {
    console.log(`Gemini Key ${result.keyIndex}: ${result.status}`);
  });
  console.log(`OpenRouter: ${openRouterResult.status}`);
  console.log(`Selected fallback provider: ${selectedFallbackProvider}`);
}

main().catch((error) => {
  console.error("AI provider chain test failed:", error.message);
  process.exit(1);
});
