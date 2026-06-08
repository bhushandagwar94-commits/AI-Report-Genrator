const fs = require("fs");
let PdfParseModule = null;

try {
  PdfParseModule = require("pdf-parse");
} catch (error) {
  console.warn("[pdfBillExtractor] pdf-parse not installed.");
}

const {
  cleanNumber,
  cleanText,
  monthLabel,
  normalizeMonthlyBill,
  normalizeServiceNo,
} = require("./extractedDataContextService");

function getPdfParser(buffer) {
  if (!PdfParseModule) return null;
  if (typeof PdfParseModule === "function") {
    return {
      async getText() {
        const result = await PdfParseModule(buffer);
        return { text: result.text || "" };
      },
      async destroy() {},
    };
  }

  if (typeof PdfParseModule.PDFParse === "function") {
    return new PdfParseModule.PDFParse({ data: buffer });
  }

  return null;
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\u00a0/g, " ").replace(/\r/g, "\n");
}

function pick(text, patterns = [], transform = (value) => value) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = transform(match[1]);
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }
  return null;
}

function pickNumber(text, patterns = []) {
  return pick(text, patterns, cleanNumber);
}

function pickText(text, patterns = []) {
  return pick(text, patterns, (value) => cleanText(value));
}

function extractMonthYear(text, fileName = "") {
  const source = `${text}\n${fileName}`;
  const monthMatch = source.match(/\b(?:Month of|Bill Month)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
  if (!monthMatch) return { billMonth: "", billYear: null };
  return {
    billMonth: monthMatch[1].slice(0, 3).toLowerCase(),
    billYear: Number(monthMatch[2]),
  };
}

function extractAddress(text) {
  const match = text.match(/NO\s*\.?\s*44,[\s\S]*?CHENNAI\s*-\s*600\s*040/i);
  return match ? cleanText(match[0]) : "";
}

function extractAnnexureConsumption(text) {
  const match = text.match(/([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+Consumption/i);
  if (!match) {
    return {
      totalKwh: null,
      totalKvah: null,
      rkvah: null,
      recordedDemandKva: null,
    };
  }

  return {
    totalKwh: cleanNumber(match[1]),
    totalKvah: cleanNumber(match[2]),
    rkvah: cleanNumber(match[3]),
    recordedDemandKva: cleanNumber(match[4]),
  };
}

function extractCommercialNumbers(text) {
  const energyMatch = text.match(/(?:Industrial Consumption|1\.\s*Industrial Consumption)[\s\S]*?(\d+(?:\.\d+)?)\s+per unit\s+([\d,]+)\s+([\d,]+\.\d+)/i);
  const demandMatch = text.match(/(\d+(?:\.\d+)?)\s+per KVA\s+([\d,]+(?:\.\d+)?)\s+([\d,]+\.\d+)/i);
  const netAmountPayable = pickNumber(text, [/Net Amount Payable\s*\n?([\d,]+\.\d+)/i, /Net Total\s*\n?([\d,]+\.\d+)/i]);
  const amountAfterDueDate = pickNumber(text, [/Amount Payable after due date[\s\S]*?\n([\d,]+\.\d+)/i]);
  const taxAmount = pickNumber(text, [/E-Tax Amount \(5%\)\s*\n?([\d,]+\.\d+)/i, /Total E-Tax[\s\S]*?\n([\d,]+\.\d+)/i]);
  const peakConsumption = pickNumber(text, [/Peak Hour Consumption[\s\S]*?([\d,]+)\s+2\.35 per unit/i]);
  const nightConsumption = pickNumber(text, [/Night Hour Consumption[\s\S]*?([\d,]+)\s+\(-\)\s*[\d,]+\.\d+\(-\)/i]);
  const lavishCharge = pickNumber(text, [/Lavish illumination charges[\s\S]*?([\d,]+\.\d+)/i]);

  return {
    totalKwh: energyMatch ? cleanNumber(energyMatch[2]) : null,
    energyCharges: energyMatch ? cleanNumber(energyMatch[3]) : null,
    demandCharges: demandMatch ? cleanNumber(demandMatch[3]) : null,
    billedDemandKva: demandMatch ? cleanNumber(demandMatch[2]) : null,
    netAmountPayable,
    amountPayableAfterDueDate: amountAfterDueDate,
    taxAmount,
    peakConsumptionKwh: peakConsumption,
    nightHourConsumptionKwh: nightConsumption,
    lavishIlluminationConsumptionKwh: lavishCharge,
  };
}

function extractFromText(rawText = "", fileName = "") {
  const text = normalizeWhitespace(rawText);
  const monthYear = extractMonthYear(text, fileName);
  const annexure = extractAnnexureConsumption(text);
  const charges = extractCommercialNumbers(text);
  const voltageAndTransformer = text.match(/(\d+\s*KV)\s+(\d+\s*KVA)/i);
  const allDates = text.match(/\b\d{2}-[A-Za-z]{3}-\d{2}\b/g) || [];
  const headerDigits = text.match(/\b\d{11,12}\b/g) || [];
  const billNoMatch = text.match(/\bH[0-9A-Z]{8,}\b/);
  const tariffMatch = text.match(/\bHT\s*III\s*\/\s*HT\s*III\b/i);
  const permittedMdMatch = text.match(/\b(\d{4,5})\s*KVA\b/i);
  const netPayableMatch = text.match(/([\d,]+\.\d+)\s+Net Amount Payable/i);
  const payableAfterDueMatches = text.match(/[\d,]+\.\d+/g) || [];

  const base = {
    sourceFile: fileName,
    billMonth: monthYear.billMonth,
    billYear: monthYear.billYear,
    billNo: billNoMatch ? cleanText(billNoMatch[0]) : "",
    dateOfBill: allDates[0] || "",
    dueDate: allDates[1] || "",
    serviceNo: normalizeServiceNo(headerDigits[0]),
    tariffCategory: tariffMatch ? cleanText(tariffMatch[0]) : "",
    permittedMdKva: permittedMdMatch ? cleanNumber(permittedMdMatch[1]) : null,
    contractDemandKva: permittedMdMatch ? cleanNumber(permittedMdMatch[1]) : null,
    supplyVoltageKv: voltageAndTransformer ? cleanText(voltageAndTransformer[1]) : "",
    transformerCapacityKva: voltageAndTransformer ? cleanNumber(voltageAndTransformer[2]) : null,
    clientName: pickText(text, [/To:\s*(M\/S\s+[A-Z0-9 .,&()-]+)/i]),
    address: extractAddress(text),
    industrialConsumptionKwh: charges.totalKwh ?? annexure.totalKwh,
    peakConsumptionKwh: charges.peakConsumptionKwh,
    nightHourConsumptionKwh: charges.nightHourConsumptionKwh,
    lavishIlluminationConsumptionKwh: charges.lavishIlluminationConsumptionKwh,
    totalKwh: annexure.totalKwh ?? charges.totalKwh,
    totalKvah: annexure.totalKvah,
    rkvah: annexure.rkvah,
    recordedDemandKva: annexure.recordedDemandKva ?? pickNumber(text, [/DEMAND CALCULATION[\s\S]*?\n([\d,]+\.\d+)/i]),
    billedDemandKva: charges.billedDemandKva ?? pickNumber(text, [/(\d+(?:\.\d+)?)\s+Normal/i]),
    powerFactor: null,
    meterMf: pickNumber(text, [/\bMF\s*:?\s*\n?([\d,]+(?:\.\d+)?)/i]),
    readingStatus: pickText(text, [/READING STATUS\s*:?\s*([A-Za-z]+)/i]),
    daysBilled: pickNumber(text, [/Total Days\s*\n?(\d+)/i, /DAYS\s*BILLED[\s\S]*?\n(\d+)/i]),
    mdRate: pickNumber(text, [/MD Rate\s*\n?([\d,]+\.\d+)/i, /(\d+(?:\.\d+)?)\s+per KVA/i]),
    demandChargeAmount: charges.demandCharges,
    energyCharges: charges.energyCharges,
    demandCharges: charges.demandCharges,
    taxAmount: charges.taxAmount,
    netAmountPayable: netPayableMatch ? cleanNumber(netPayableMatch[1]) : charges.netAmountPayable,
    amountPayableAfterDueDate: payableAfterDueMatches.length ? cleanNumber(payableAfterDueMatches[payableAfterDueMatches.length - 1]) : charges.amountPayableAfterDueDate,
    extractionConfidence: 0.95,
    pdfAttempted: true,
  };

  const normalized = normalizeMonthlyBill({
    ...base,
    powerFactor:
      base.totalKwh && base.totalKvah ? base.totalKwh / base.totalKvah : null,
  });

  return {
    ...base,
    ...annexure,
    ...charges,
    ...normalized,
    monthLabel: monthLabel(normalized),
    extractionConfidence: normalized.extractionConfidence,
  };
}

async function extractPdfBill(filePath, fileName = "") {
  console.log("[PDF_BILL_PARSE_ATTEMPT]", { fileName });

  const logResult = (result) => {
    console.log("[PDF_BILL_PARSE_RESULT]", result);
    return result;
  };

  if (!PdfParseModule) {
    return logResult({ fileName, success: false, failureReason: "pdf-parse missing" });
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const parser = getPdfParser(buffer);
    if (!parser) {
      return logResult({ fileName, success: false, failureReason: "pdf parser unavailable" });
    }

    const parsed = await parser.getText();
    await parser.destroy?.();

    const text = parsed?.text || "";
    if (!cleanText(text)) {
      return logResult({ fileName, success: false, failureReason: "empty PDF text" });
    }

    const result = extractFromText(text, fileName);
    if (!result.serviceNo && !result.totalKwh && !result.netAmountPayable) {
      return logResult({ fileName, success: false, failureReason: "No bill fields detected" });
    }

    return logResult({
      fileName,
      success: true,
      billMonth: result.monthLabel,
      serviceNo: result.serviceNo,
      kwh: result.totalKwh,
      kvah: result.totalKvah,
      recordedDemandKva: result.recordedDemandKva,
      billedDemandKva: result.billedDemandKva,
      netAmountPayable: result.netAmountPayable,
      failureReason: null,
      ...result,
    });
  } catch (error) {
    return logResult({
      fileName,
      success: false,
      failureReason: error.message || "PDF parse failed",
    });
  }
}

async function extractPdfBills(files = []) {
  const bills = [];
  const filesFailed = [];
  const warnings = [];

  for (const file of files) {
    const filePath = file.location || file.path;
    const fileName = file.originalname || file.filename || file.name || "";
    const result = await extractPdfBill(filePath, fileName);

    if (!result.success) {
      filesFailed.push({ fileName, reason: result.failureReason || result.reason || "Unknown parse error" });
      continue;
    }

    bills.push(result);
    if (!result.totalKvah || !result.recordedDemandKva || !result.billedDemandKva) {
      warnings.push(`${fileName}: partial PDF extraction`);
    }
  }

  const primary = bills[0] || {};
  return {
    filesDetected: files.length,
    filesParsed: bills.length,
    filesFailed,
    warnings,
    bills,
    clientName: primary.clientName || "",
    address: primary.address || "",
    serviceNo: primary.serviceNo || "",
    tariffCategory: primary.tariffCategory || "",
    permittedMdKva: primary.permittedMdKva || null,
    contractDemandKva: primary.contractDemandKva || primary.permittedMdKva || null,
    supplyVoltage: primary.supplyVoltageKv || "",
    transformerCapacityKva: primary.transformerCapacityKva || null,
  };
}

module.exports = {
  extractFromText,
  extractPdfBill,
  extractPdfBills,
};
