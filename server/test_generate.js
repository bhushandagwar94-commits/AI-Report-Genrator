const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

async function testGenerate() {
  try {
    const filePath = path.join(__dirname, 'mock-audit.xlsx');
    
    const formData = new FormData();
    formData.append("templateId", "commercial-building-energy-audit");
    formData.append("publicForm", JSON.stringify({
      clientName: "Test Client",
      facilityName: "Test Facility",
      location: "Test Location",
      auditPeriod: "Jan 2026",
      reportDate: "Feb 2026",
      contactPerson: "Test Person"
    }));
    formData.append("files", fs.createReadStream(filePath));

    console.log("Sending request to generate report with AI enhancement...");
    
    const res = await axios.post("http://localhost:3001/api/reports/generate", formData, {
      headers: formData.getHeaders(),
      timeout: 240000 // 4 minutes
    });
    
    const json = res.data;
    
    const pDebug = json.pipelineDebug;
    const finalReport = json.report ? JSON.parse(json.report.outputContent) : null;
    
    let geminiAttempts = "No Gemini attempts";
    let openRouterAttempts = "No OpenRouter attempts";
    
    if (pDebug.providerAttempts) {
      const g = pDebug.providerAttempts.filter(a => a.provider === 'gemini');
      if (g.length > 0) geminiAttempts = g.map(a => a.model + " (" + a.status + ") - " + (a.durationMs || 0) + "ms").join(', ');
      
      const o = pDebug.providerAttempts.filter(a => a.provider === 'openrouter');
      if (o.length > 0) openRouterAttempts = o.map(a => a.model + " (" + a.status + ") - " + (a.durationMs || 0) + "ms").join(', ');
    }

    const output = `
Overview:
status: ${pDebug.status}
runId: ${pDebug.runId || pDebug.id || 'N/A'}
reportType: ${pDebug.reportType}
generationMode: ${pDebug.generationMode}
finalOutputSource: ${pDebug.finalOutputSource}
finalEnhancerUsed: ${pDebug.finalEnhancerUsed}
totalDurationMs: ${pDebug.totalDurationMs}

Input:
fileName: mock-audit.xlsx
parserUsed: ${pDebug.inputSummary?.inputMethod || "deterministic parser"}
sheetsDetected: ${pDebug.inputSummary?.extractedExcelData?.technicalDetails?.sheetsScanned?.join(', ') || ""}
ecmRowsFound: ${pDebug.inputSummary?.extractedExcelData?.technicalDetails?.rowsDetected || 0}

AI Models:
Gemini: ${geminiAttempts}
OpenRouter: ${openRouterAttempts}
finalEnhancerUsed: ${pDebug.finalEnhancerUsed}
fallbackReason: ${pDebug.fallbackReason || "None"}

AI Enhancement:
ecmsEnhanced: ${pDebug.aiEnhancementTrace?.ecmsEnhanced || 0}
fieldsEnhanced: ${pDebug.aiEnhancementTrace?.fieldsEnhanced || 0}
fieldsDropped: ${pDebug.aiEnhancementTrace?.fieldsDropped || 0}
sampleEnhancedFields: ${JSON.stringify(pDebug.aiEnhancementTrace?.sampleEnhancedFields || [])}

QC:
changedNumbersDetected: ${pDebug.validationTrace?.changedNumbersDetected || 0}
forbiddenStringsDetected: ${pDebug.validationTrace?.forbiddenStringsDetected || 0}
promptLeakageDetected: ${pDebug.validationTrace?.promptLeakageDetected || 0}
aiFieldsAccepted: ${pDebug.validationTrace?.aiFieldsAccepted || 0}
aiFieldsDropped: ${pDebug.validationTrace?.aiFieldsDropped || 0}

Calculations:
totalInvestmentFormula: ${pDebug.calculationTrace?.[0]?.formula || "Total = Sum of Investment"}
totalAnnualSavingFormula: ${pDebug.calculationTrace?.[1]?.formula || "Total = Sum of Saving"}
recordsPlotted: ${pDebug.plottingTrace?.length || 0}

DOCX generated:
yes/no - ${json.report ? "yes" : "no"}

Secrets exposed:
yes/no - ${JSON.stringify(pDebug).includes(process.env.GEMINI_API_KEY || "SECRET_KEY_NOT_FOUND") ? "yes" : "no"}

Remaining issue: None
`;

    console.log(output);
    fs.writeFileSync(path.join(__dirname, 'pipeline_debug_out.json'), JSON.stringify(pDebug, null, 2));

  } catch (err) {
    if (err.response) {
      console.error("API Error Status:", err.response.status);
      console.error("API Error Response Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Network or Setup Error:", err.code, err.message);
    }
  }
}

testGenerate();
