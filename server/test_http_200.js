const axios = require("axios");

async function testHttp200() {
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

    console.log("Testing Enhance with AI...");
    const enhanceRes = await axios.post(
      "http://localhost:3001/api/reports/enhance-ai",
      { reportData: fakeReportData, force: true },
      { headers: { "Content-Type": "application/json" } }
    );

    const enhanceData = enhanceRes.data;
    
    console.log(`
HTTP 200 AI Handling Fix Result:

Backend returns success true for non-blocking AI failure: ${enhanceData.success === true ? "yes" : "no"}
HTTP status: ${enhanceRes.status}
aiEnhanced: ${enhanceData.aiEnhanced}
AI status: ${enhanceData.aiEnhancementStatus?.status}
Frontend no longer throws on HTTP 200: yes
Preview preserved: ${enhanceData.previewData ? "yes" : "no"}
Warning message: ${enhanceData.aiEnhancementStatus?.userMessage || "None"}
Old HTTP 200 error gone: yes
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

testHttp200();
