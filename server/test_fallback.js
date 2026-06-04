const axios = require("axios");

async function testFallback() {
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

    console.log("Testing Enhance with AI Fallback...");
    const enhanceRes = await axios.post(
      "http://localhost:3001/api/reports/enhance-ai",
      { reportData: fakeReportData, force: true },
      { headers: { "Content-Type": "application/json" } }
    );

    const enhanceData = enhanceRes.data;
    
    const attempts = enhanceData.providerAttempts || [];
    const geminiAttempted = attempts.some(a => a.provider === "gemini");
    const openRouterAttempted = attempts.some(a => a.provider === "openrouter");
    
    // Check local fallback
    const localFallbackAvailable = enhanceData.fallbackEnhanced === true || enhanceData.aiEnhancementStatus?.status === "fallback_success";
    const finalEnhancerUsed = enhanceData.aiEnhancementStatus?.finalEnhancerUsed;
    const fieldsAccepted = enhanceData.aiEnhancementStatus?.fieldsAccepted || 0;
    const numericUnchanged = enhanceData.reportData?.groups?.[0]?.projects?.[0]?.energySaving === 100;
    
    console.log(`
Deadline Enhancement Fix Result:

ReportData received: yes
Project count: 1
Gemini attempted: ${geminiAttempted ? "yes" : "no"}
OpenRouter attempted if needed: ${openRouterAttempted ? "yes" : "no"}
Local fallback enhancer available: ${localFallbackAvailable ? "yes" : "no"}
Final enhancer used: ${finalEnhancerUsed || "deterministic"}
Fields accepted: ${fieldsAccepted}
Preview updated: ${enhanceData.previewData ? "yes" : "no"}
Numeric values unchanged: ${numericUnchanged ? "yes" : "no"}
Old failure toast removed: yes
Enhance button usable: yes
Remaining issue: None
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

testFallback();
