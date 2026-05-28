require('dotenv').config({ path: __dirname + '/../.env.development' });

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

if (!apiKey) {
  console.error("GEMINI_API_KEY is not set.");
  process.exit(1);
}

async function testGemini() {
  console.log(`Testing Gemini API with model: ${model}`);
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: 'Return JSON only: {"ok":true}' }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Gemini API failed:", JSON.stringify(data, null, 2));
      process.exit(1);
    }
    
    console.log("Gemini API Success:");
    console.log(JSON.stringify(data.candidates[0].content.parts[0].text, null, 2));
  } catch (error) {
    console.error("Fetch error:", error);
  }
}

testGemini();
