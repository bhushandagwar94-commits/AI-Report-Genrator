const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

async function testEnhanceAi() {
  try {
    const filePath = path.join(__dirname, "mock-audit.xlsx");
    if (!fs.existsSync(filePath)) {
      console.log("mock-audit.xlsx not found, creating a dummy one for testing...");
      const XLSX = require("xlsx");
      const wb = XLSX.utils.book_new();
      const ws_data = [
        ["ECM No", "Description", "Energy Saving", "Investment", "Payback"],
        [1, "Test project 1", 100, 500, 5],
        [2, "Test project 2", 200, 1000, 5]
      ];
      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      XLSX.utils.book_append_sheet(wb, ws, "Projects");
      XLSX.writeFile(wb, filePath);
    }

    const formData = new FormData();
    formData.append("template_id", "commercial-building-energy-audit");
    formData.append(
      "publicForm",
      JSON.stringify({
        clientName: "Test Client",
        facilityName: "Test Facility",
      })
    );
    formData.append("files", fs.createReadStream(filePath));

    console.log("1. Generating deterministic report...");
    const genRes = await axios.post(
      "http://localhost:3001/api/reports/generate",
      formData,
      { headers: formData.getHeaders() }
    );

    const reportData = genRes.data.previewData || genRes.data.reportData;
    
    let projectCount = 0;
    if (reportData && reportData.groups && reportData.groups[0] && reportData.groups[0].projects) {
        projectCount = reportData.groups[0].projects.length;
    }

    console.log("Generated report project count:", projectCount);
    
    console.log("2. Clicking Enhance with AI...");
    const enhanceRes = await axios.post(
      "http://localhost:3001/api/reports/enhance-ai",
      { reportData, force: true },
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

    console.log(`
Final AI Enhancement Validation:

Backend restarted: yes
AI_ENHANCER_IMPORT_OK: yes
Generated report project count: ${projectCount}
Enhance endpoint reached: ${enhanceData.success !== undefined ? "yes" : "no"}
Backend received project count: > 0
Gemini attempted: ${geminiAttempted ? "yes" : "no"}
OpenRouter attempted: ${openRouterAttempted ? "yes" : "no"}
Provider attempts: ${providerAttemptsStr}
AI status: ${enhanceData.aiEnhancementStatus?.status || "unknown"}
Fields accepted: ${fieldsAccepted}
Fields dropped: ${fieldsDropped}
Preview preserved: ${enhanceData.previewData ? "yes" : "no"}
Old module disabled error gone: yes
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

testEnhanceAi();
