const fs = require('fs');
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.warn("pdf-parse not installed. PDF extraction will be disabled.");
}

async function extractBillFromPdf(filePath, fileName) {
  if (!pdfParse) return { success: false, reason: "pdf-parse missing" };
  
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    const text = data.text || "";
    
    // Very lightweight extraction using Regex (this can be improved later)
    const isHTBill = /High Tension Bill/i.test(text) || /HT Bill/i.test(text);
    if (!isHTBill) return { success: false, reason: "Not an HT Bill" };
    
    // Example regexes - would be customized based on actual bill format
    const monthMatch = text.match(/Bill Month\s*:\s*(\w+\s+\d{4})/i);
    const serviceNoMatch = text.match(/Service No\.?\s*:\s*(\d+)/i);
    const netAmountMatch = text.match(/Net Amount Payable\s*:\s*(?:Rs\.?|INR)?\s*([\d,]+(\.\d+)?)/i);
    const kwhMatch = text.match(/Consumption(?:\s*\(kWh\))?\s*:\s*([\d,]+(\.\d+)?)/i);
    
    const result = {
      success: true,
      fileName,
      billMonth: monthMatch ? monthMatch[1] : null,
      serviceNo: serviceNoMatch ? serviceNoMatch[1] : null,
      netAmountPayable: netAmountMatch ? Number(netAmountMatch[1].replace(/,/g, '')) : null,
      kwh: kwhMatch ? Number(kwhMatch[1].replace(/,/g, '')) : null,
      confidence: 0.8
    };
    
    console.log("[BILL_PDF_EXTRACTED]", result);
    return result;
    
  } catch (err) {
    console.error("PDF Parse error", err);
    return { success: false, reason: err.message };
  }
}

module.exports = {
  extractBillFromPdf
};
