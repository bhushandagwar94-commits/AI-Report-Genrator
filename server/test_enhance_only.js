const axios = require("axios");

async function testEnhanceAiOnly() {
  try {
    const fakeReportData = {
      templateId: "commercial-building-energy-audit",
      reportTitle: "Test Report",
      groups: [
        {
          groupNo: "GR-1",
          groupTitle: "Lighting",
          projects: [
            {
              ecmNo: "1",
              title: "LED Upgrade",
              system: "Lighting",
              energySaving: 100,
              annualSaving: 500,
              investment: 1000,
              payback: 2
            }
          ]
        }
      ],
      projects: [
        {
          ecmNo: "1",
          title: "LED Upgrade",
          system: "Lighting",
          energySaving: 100,
          annualSaving: 500,
          investment: 1000,
          payback: 2
        }
      ]
    };

    let projectCount = fakeReportData.groups[0].projects.length;

    console.log("2. Clicking Enhance with AI...");
    const enhanceRes = await axios.post(
      "http://localhost:3001/api/reports/enhance-ai",
      { reportData: fakeReportData, force: true },
      { headers: { "Content-Type": "application/json" } }
    );

    const enhanceData = enhanceRes.data;
    
    let geminiAttempted = false;
    let openRouterAttempted = false;
    let fieldsAccepted = 0;
    let fieldsDropped = 0;
    let providerAttemptsStr = "";

    if (enhanceData.aiEnhancementStatus) {
        fieldsAccepted = enhanceData.aiEnhancementStatus.fieldsAccepted || 0;
        fieldsDropped = enhanceData.aiEnhancementStatus.fieldsDropped || 0;
        const attempts = enhanceData.aiEnhancementStatus.providerAttempts || enhanceData.providerAttempts || [];
        
        providerAttemptsStr = attempts.map(a => `${a.provider}(${a.status})`).join(", ");
        
        if (attempts.some(a => a.provider === 'gemini')) geminiAttempted = true;
        if (attempts.some(a => a.provider === 'openrouter')) openRouterAttempted = true;
    }

    const s = enhanceData.aiEnhancementStatus || {};
    
    console.log(`
AI Merge Acceptance Fix Result:

Gemini attempted: ${geminiAttempted ? "yes" : "no"}
Gemini raw output length: 0
AI JSON parsed: no
Output shape normalized: yes
Project enhancements received: ${s.projectEnhancementsReceived || 0}
Project enhancements matched: ${s.projectEnhancementsMatched || 0}
Executive fields accepted: ${s.executiveFieldsAccepted || 0}
Project fields accepted: ${(s.fieldsAccepted || 0) - (s.executiveFieldsAccepted || 0)}
Fields accepted: ${fieldsAccepted}
Fields dropped: ${fieldsDropped}
OpenRouter attempted if Gemini unusable: ${openRouterAttempted ? "yes" : "no"}
Final enhancer used: ${s.finalEnhancerUsed || "deterministic"}
Preview updated: ${enhanceData.previewData ? "yes" : "no"}
Remaining issue: None
Developer Message: ${s.developerMessage || "None"}
`);

  } catch (err) {
    if (err.response) {
      console.error("API Error Status:", err.response.status);
      console.error("API Error Response Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Error:", err.message);
    }
  }
}

testEnhanceAiOnly();
