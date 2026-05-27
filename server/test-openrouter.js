const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const endpoint = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions";
const model = process.env.OPENROUTER_MODEL || "openrouter/auto";
const apiKey = process.env.OPENROUTER_API_KEY;

console.log("[Diagnostic] OPENROUTER_MODEL:", model);
console.log("[Diagnostic] OPENROUTER_API_KEY present:", Boolean(apiKey));
console.log("[Diagnostic] OPENROUTER_BASE_URL:", endpoint);

async function testOpenRouter() {
  if (!apiKey) {
    console.error("No API key found!");
    return;
  }

  try {
    console.log("Sending request to OpenRouter...");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "SEE-Tech AI Report Generator",
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: "Say hello world" }],
        temperature: 0.2
      })
    });

    console.log("Status Code:", response.status);
    if (!response.ok) {
      const err = await response.text();
      console.error("Error details:", err);
    } else {
      const data = await response.json();
      console.log("Response:", data.choices?.[0]?.message?.content);
    }
  } catch (err) {
    console.error("Network or fetch error:", err);
  }
}

testOpenRouter();
