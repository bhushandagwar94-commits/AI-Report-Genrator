const { extractPdfBill } = require("./pdfBillExtractor");

async function extractBillFromPdf(filePath, fileName) {
  const result = await extractPdfBill(filePath, fileName);
  if (!result.success) {
    return { success: false, reason: result.reason, fileName };
  }

  return {
    success: true,
    fileName: result.fileName,
    billMonth: result.monthLabel,
    serviceNo: result.serviceNo,
    netAmountPayable: result.netAmountPayable,
    kwh: result.totalKwh,
    kvah: result.totalKvah,
    recordedDemandKva: result.recordedDemandKva,
    billedDemandKva: result.billedDemandKva,
    confidence: result.extractionConfidence,
    raw: result,
  };
}

module.exports = {
  extractBillFromPdf,
};
