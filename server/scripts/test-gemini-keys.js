require("dotenv").config({ path: __dirname + "/../.env.development" });

const {
  getGeminiApiKeys,
  generateWithGeminiUsingKey,
} = require("../services/geminiProviderService");

async function testKey(apiKey, keyIndex) {
  const result = await generateWithGeminiUsingKey(
    'Return JSON only: {"ok":true}',
    {
      apiKey,
      keyIndex,
    }
  );

  if (result.success) {
    console.log(`Key ${keyIndex}: success`);
    return;
  }

  if (result.isQuotaExceeded) {
    console.log(`Key ${keyIndex}: quota`);
    return;
  }

  console.log(`Key ${keyIndex}: failed`);
}

async function main() {
  const keys = getGeminiApiKeys();
  console.log(`Gemini key count: ${keys.length}`);

  if (!keys.length) {
    process.exit(1);
  }

  for (let i = 0; i < keys.length; i += 1) {
    await testKey(keys[i], i + 1);
  }
}

main().catch((error) => {
  console.error("Gemini key test failed:", error.message);
  process.exit(1);
});
