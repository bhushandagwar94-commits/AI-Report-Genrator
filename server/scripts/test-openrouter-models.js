require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

async function callOpenRouterModel(model, messages, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS || 90000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "SEE-Tech AI Report Generator (TEST)"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        max_tokens: 100
      }),
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenRouter returned no message content");
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function runTests() {
  console.log("=== Testing OpenRouter Models ===");
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("❌ Error: OPENROUTER_API_KEY is missing in server/.env");
    process.exit(1);
  }

  const modelsStr = process.env.OPENROUTER_MODELS || process.env.OPENROUTER_MODEL || "";
  const models = modelsStr.split(",").map(m => m.trim()).filter(Boolean);

  if (models.length === 0) {
    console.error("❌ Error: No OpenRouter models configured in OPENROUTER_MODELS or OPENROUTER_MODEL.");
    process.exit(1);
  }

  console.log(`Found ${models.length} model(s) to test:`, models);
  
  const messages = [{ role: "user", content: 'Return JSON only: {"ok":true}' }];

  for (const model of models) {
    console.log(`\nTesting model: ${model}`);
    try {
      const content = await callOpenRouterModel(model, messages);
      let jsonValid = false;
      try {
        let cleaned = content.trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
          JSON.parse(cleaned.substring(start, end + 1));
          jsonValid = true;
        } else {
          JSON.parse(cleaned);
          jsonValid = true;
        }
      } catch (err) {
        jsonValid = false;
      }
      console.log(`  - Status: SUCCESS`);
      console.log(`  - JSON Valid: ${jsonValid}`);
      if (!jsonValid) {
        console.log(`  - Raw Response: ${content.substring(0, 100)}...`);
      }
    } catch (e) {
      console.log(`  - Status: FAILED`);
      console.log(`  - Reason: ${e.message}`);
    }
  }
  console.log("\n=== Test Complete ===");
}

runTests();
