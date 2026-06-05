const { extractVrChennaiWorkbook } = require("./vrChennaiWorkbookExtractor");

function detectWorkbookType(workbook, fileName) {
  const sheets = workbook.SheetNames || [];
  
  const hasECM = sheets.includes("ECM");
  const hasBillEntry = sheets.includes("Bill Entry");
  const hasConnectedLoad = sheets.includes("Connected Load List & Energy Ba");
  
  if (hasECM && hasBillEntry && hasConnectedLoad) {
    const type = "vr_chennai_ecm_workbook_v1";
    console.log("[INPUT_WORKBOOK_DETECTED]", {
      fileName,
      type,
      sheetsDetected: sheets,
      confidence: 0.98
    });
    
    return {
      type,
      confidence: 0.98,
      sheetsDetected: sheets
    };
  }
  
  return {
    type: "unknown",
    confidence: 0,
    sheetsDetected: sheets
  };
}

module.exports = {
  detectWorkbookType
};
