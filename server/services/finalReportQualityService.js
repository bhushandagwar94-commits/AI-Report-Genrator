const { buildExtractedDataContext, cleanText } = require("./extractedDataContextService");
const { BLOCKED_PHRASES } = require("./reportSanitizerService");

function pruneForDisplay(value) {
  if (Array.isArray(value)) return value.map(pruneForDisplay);
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key === "extractedDataContext" || key === "raw") continue;
      if (key.toLowerCase().includes("raw")) continue;
      output[key] = pruneForDisplay(nested);
    }
    return output;
  }
  return value;
}

function countRawDecimals(value) {
  const text = JSON.stringify(pruneForDisplay(value || {}));
  return (text.match(/\b\d+\.\d{4,}\b/g) || []).length;
}

function countBadPhrases(value) {
  const text = JSON.stringify(pruneForDisplay(value || {})).toLowerCase();
  return BLOCKED_PHRASES.reduce((sum, phrase) => sum + ((text.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length), 0);
}

function countPlaceholders(value) {
  const text = JSON.stringify(pruneForDisplay(value || {})).toLowerCase();
  const placeholders = ["to be updated after site data verification", "calculation pending", "\"client name\"", "\"n/a\"", "\"undefined\"", "\"null\""];
  return placeholders.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0);
}

function countIndustrialRows(reportData = {}) {
  const text = JSON.stringify(reportData.majorEnergyConsumingSystems || []).toLowerCase();
  const patterns = ["production area", "compressor room", "dryer section", "injection", "stretch blow", "warehouse", "dispatch"];
  return patterns.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0);
}

function computeAccuracySummary(reportData = {}, extractedDataContext = {}) {
  const fieldsAvailable = extractedDataContext.extractionAudit.fieldsExtracted.length + extractedDataContext.extractionAudit.fieldsMissing.length;
  const extractedFields = extractedDataContext.extractionAudit.fieldsExtracted.length;
  const filledFields = Math.max(0, extractedFields - countPlaceholders(reportData));
  const missingFields = extractedDataContext.missingInputs.length;
  const badPhraseCount = countBadPhrases(reportData);
  const rawDecimalCount = countRawDecimals(reportData);

  const percentage = (num, den) => (den > 0 ? Math.max(0, Math.min(100, Math.round((num / den) * 100))) : 100);

  return {
    extractionAccuracy: {
      ecm: percentage(extractedDataContext.ecmProjects.length, extractedDataContext.ecmProjects.length),
      billProfile: percentage(extractedDataContext.monthlyBills.length, extractedDataContext.monthlyBills.length),
      pdfBills: percentage(extractedDataContext.pdfBillExtraction.filesParsed, extractedDataContext.pdfBillExtraction.filesDetected || extractedDataContext.pdfBillExtraction.filesParsed || 1),
      connectedLoad: percentage(extractedDataContext.connectedLoad.equipmentRows.length, extractedDataContext.connectedLoad.equipmentRows.length || 1),
      costing: percentage(Object.keys(extractedDataContext.costing.matchedCostingByEcm || {}).length, Object.keys(extractedDataContext.costing.matchedCostingByEcm || {}).length || 1),
      autoFill: percentage(filledFields, extractedFields || 1),
      finalReportReadiness: percentage(filledFields - badPhraseCount - rawDecimalCount, extractedFields || 1),
    },
    counts: {
      availableFields: fieldsAvailable,
      extractedFields,
      filledFields,
      missingFields,
      blockedBadPhrases: badPhraseCount,
      rawDecimalsFound: rawDecimalCount,
    },
  };
}

function getEcmNumberValue(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeEcmNumberList(projects) {
  return (projects || [])
    .map((project) => getEcmNumberValue(project.ecmNo || project.serialNo || project.ecmNumber))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

function sameNumberSet(actual, expected) {
  if (actual.length !== expected.length) return false;
  return actual.every((n, i) => n === expected[i]);
}

function findPlaceholderPaths(obj, path = "", results = []) {
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => findPlaceholderPaths(item, `${path}[${index}]`, results));
    return results;
  }

  if (!obj || typeof obj !== "object") {
    const text = String(obj || "");
    if (
      text.includes("[To be updated") ||
      text.includes("after site data verification") ||
      text.includes("[Calculation pending]") ||
      text.trim() === "Client Name"
    ) {
      results.push({ path, value: text });
    }
    return results;
  }

  for (const [key, value] of Object.entries(obj)) {
    findPlaceholderPaths(value, path ? `${path}.${key}` : key, results);
  }

  return results;
}

function validateFinalReportQuality(reportData = {}, extractedDataInput = {}) {
  const extractedDataContext = extractedDataInput.projectInfo && extractedDataInput.electricalProfile
    ? extractedDataInput
    : buildExtractedDataContext([], extractedDataInput);

  const projects = (reportData.groups && reportData.groups.length > 0)
    ? reportData.groups.flatMap((group) => group.projects || [])
    : (reportData.projects || []);
  
  const actualEcms = normalizeEcmNumberList(projects);
  const expectedVrChennaiEcms = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 18];
  
  const totalEnergySaving = extractedDataContext.ecmProjects.reduce((sum, project) => sum + (project.energySavingRaw || 0), 0);
  const totalAnnualSaving = extractedDataContext.ecmProjects.reduce((sum, project) => sum + (project.annualSavingRaw || 0), 0);
  const monthlyBillCount = extractedDataContext.monthlyBills.length;
  const pdfFilesUploaded = extractedDataContext.pdfBillExtraction.filesDetected;
  const pdfFilesParsed = extractedDataContext.pdfBillExtraction.filesParsed;
  const genericGroupNameCount = (reportData.groups || []).filter((group) => /group\s*[1-4]/i.test(group.groupName || group.groupTitle || "")).length;
  const industrialRowCount = countIndustrialRows(reportData);
  const badPhraseCount = countBadPhrases(reportData);
  const rawDecimalCount = countRawDecimals(reportData);
  
  const placeholderPaths = findPlaceholderPaths(reportData);
  console.log("[PLACEHOLDER_PATHS_FOUND]", placeholderPaths);
  const placeholderCount = placeholderPaths.length;
  
  const costingMatchedCount = Object.keys(extractedDataContext.costing.matchedCostingByEcm || {}).length;

  const failures = [];
  const warnings = [];
  
  const failIf = (condition, message) => { if (condition) failures.push(message); };
  const warnIf = (condition, message) => { if (condition) warnings.push(message); };

  failIf(projects.length !== 14, `ECM count must be 14, found ${projects.length}`);
  
  if (!sameNumberSet(actualEcms, expectedVrChennaiEcms)) {
    failures.push(`Unexpected ECM numbers. Expected ${expectedVrChennaiEcms.join(", ")} but got ${actualEcms.join(", ")}`);
  }
  
  failIf(totalEnergySaving <= 0, "Total energy saving must be greater than 0");
  failIf(totalAnnualSaving <= 0, "Total annual saving must be greater than 0");
  failIf(cleanText(extractedDataContext.projectInfo.facilityName).toLowerCase() === "client name", "Facility name is still Client Name");
  failIf(!Boolean(extractedDataContext.electricalProfile.serviceNo), "Service No. is missing");
  failIf(!Boolean(extractedDataContext.electricalProfile.tariffCategory), "Tariff is missing");
  
  // PDF Parsing logic
  if (pdfFilesUploaded > 0 && pdfFilesParsed === 0 && monthlyBillCount < 12) {
    failures.push("PDF bills were uploaded but none were parsed, and Bill Entry monthly data is incomplete.");
  } else if (pdfFilesUploaded > 0 && pdfFilesParsed === 0 && monthlyBillCount >= 12) {
    warnings.push("PDF bills were uploaded but none were parsed. Bill Entry sheet used as primary billing source.");
  }
  
  warnIf(!Boolean(extractedDataContext.electricalProfile.supplyVoltage || extractedDataContext.electricalProfile.supplyVoltageKv), "Supply voltage is missing");
  warnIf(!Boolean(extractedDataContext.electricalProfile.contractDemandKva), "Contract demand is missing");
  
  failIf(extractedDataContext.monthlyBills.some((bill) => (bill.totalKwh || 0) <= 0), "One or more monthly bill rows have 0 kWh");
  failIf(extractedDataContext.monthlyBills.some((bill) => /particular|contract demand|total|undefined/i.test(bill.monthLabel || "")), "Invalid fake month/date row exists");
  failIf(genericGroupNameCount > 0, "Generic group names found");
  failIf(badPhraseCount > 0, `Blocked phrases found: ${badPhraseCount}`);
  failIf(rawDecimalCount > 0, `Raw decimals found: ${rawDecimalCount}`);
  failIf(industrialRowCount > 0, `Old industrial rows remain: ${industrialRowCount}`);
  failIf(placeholderCount > 0, `Placeholders remain in report: ${placeholderCount}`);
  
  warnIf(projects.some((project) => !project.keyActivities?.length && extractedDataContext.ecmProjects.find((source) => source.ecmNo === (project.ecmNo || project.projectNo))?.projectActivities), "Project activities missing where ECM source has project activities");
  warnIf(projects.some((project) => !project.baselineTable?.baselineAnnualConsumption && extractedDataContext.ecmProjects.find((source) => source.ecmNo === (project.ecmNo || project.projectNo))?.baselineKwhPerYearRaw), "Baseline kWh missing where ECM source has baseline");

  // PART 7 VALIDATIONS
  let paybackBlankCount = 0;
  projects.forEach((project) => {
    const inv = Number(project.investmentRaw || 0);
    const sav = Number(project.annualSavingRaw || 0);
    if (inv > 0 && sav > 0 && (!project.paybackMonthsRaw && !project.paybackMonthsFormatted && !project.payback)) {
      paybackBlankCount++;
    }
  });
  failIf(paybackBlankCount > 0, `Payback blank for ${paybackBlankCount} ECMs despite having investment and saving.`);

  let connectedLoadShareTotal = 0;
  let connectedLoadShareErrors = 0;
  if (reportData.majorEnergyConsumingSystems) {
    reportData.majorEnergyConsumingSystems.forEach((sys) => {
      const share = Number(String(sys.percentageShare || "").replace(/[^\d.]/g, ""));
      if (sys.system?.toLowerCase() !== "total") connectedLoadShareTotal += share;
      if (share > 100 && sys.system?.toLowerCase() !== "total") connectedLoadShareErrors++;
    });
    warnIf(connectedLoadShareTotal > 0 && (connectedLoadShareTotal < 99 || connectedLoadShareTotal > 101), `Connected load total share is ${connectedLoadShareTotal}%`);
    failIf(connectedLoadShareErrors > 0, "Connected load individual share > 100%");
  }

  let suspiciousMonthlyBills = 0;
  if (reportData.monthlyBillingSummary) {
    reportData.monthlyBillingSummary.forEach((bill) => {
      if (String(bill.pf || "").includes("Verify from bill PDF") || String(bill.kvah || "").includes("Verify from bill PDF")) suspiciousMonthlyBills++;
    });
    warnIf(suspiciousMonthlyBills > 0, `${suspiciousMonthlyBills} monthly bills require kVAh/PF verification.`);
  }

  let sourceFieldsAvailable = 0;
  let sourceFieldsRendered = 0;
  projects.forEach((project) => {
    const targetNo = String(project.ecmNo || project.projectNo || "").replace(/\D/g, "");
    const source = extractedDataContext.ecmProjects.find((s) => String(s.ecmNo).replace(/\D/g, "") === targetNo);
    if (!source) return;
    if (source.equipmentName) { sourceFieldsAvailable++; if (project.equipmentCovered) sourceFieldsRendered++; else warnings.push("equipmentCovered missing"); }
    if (source.rationaleForEnergySaving) { sourceFieldsAvailable++; if (project.problemGapIdentified) sourceFieldsRendered++; else warnings.push("problemGapIdentified missing"); }
    if (source.projectActivities) { sourceFieldsAvailable++; if (project.keyActivities && project.keyActivities.length) sourceFieldsRendered++; else warnings.push("keyActivities missing"); }
    if (source.baselineKwhPerYearRaw) { sourceFieldsAvailable++; if (project.baselineTable?.baselineAnnualConsumption) sourceFieldsRendered++; else warnings.push("baselineAnnualConsumption missing"); }
  });
  const sourceFieldRenderAccuracy = sourceFieldsAvailable > 0 ? (sourceFieldsRendered / sourceFieldsAvailable) * 100 : 100;
  failIf(sourceFieldRenderAccuracy < 80, `Source field render accuracy is ${sourceFieldRenderAccuracy.toFixed(2)}%, below 80% threshold`);

  const missingInputsData = reportData.vrChennaiClientReadyReport?.context?.missingInputs || reportData.missingInputs || [];
  const missingAnnexureRowsAfterGrouping = missingInputsData.length;
  const missingAnnexureRowsBeforeGrouping = reportData.vrChennaiClientReadyReport?.context?._originalMissingInputsCount || reportData._originalMissingInputsCount || missingAnnexureRowsAfterGrouping;
  warnIf(missingAnnexureRowsAfterGrouping > 20, `Annexure B has ${missingAnnexureRowsAfterGrouping} rows, which is more than 20`);
  // END PART 7 VALIDATIONS

  const gateLog = {
    projectCount: projects.length,
    ecmNumbers: actualEcms,
    totalEnergySaving,
    totalAnnualSaving,
    facilityName: extractedDataContext.projectInfo.facilityName,
    serviceNo: extractedDataContext.electricalProfile.serviceNo,
    tariff: extractedDataContext.electricalProfile.tariffCategory,
    supplyVoltage: extractedDataContext.electricalProfile.supplyVoltage || extractedDataContext.electricalProfile.supplyVoltageKv,
    contractDemand: extractedDataContext.electricalProfile.contractDemandKva,
    monthlyBillCount,
    pdfFilesUploaded,
    pdfFilesParsed,
    connectedLoadSystems: extractedDataContext.connectedLoad.summaryByAssetType.length,
    costingMatchedCount,
    placeholderCount,
    placeholderPaths,
    missingInputsCount: extractedDataContext.missingInputs.length,
    badPhraseCount,
    rawDecimalCount,
    genericGroupNameCount,
    industrialRowCount,
    paybackBlankCount,
    connectedLoadShareTotal,
    connectedLoadShareErrors,
    suspiciousMonthlyBills,
    sourceFieldsAvailable,
    sourceFieldsRendered,
    sourceFieldRenderAccuracy,
    missingAnnexureRowsBeforeGrouping,
    missingAnnexureRowsAfterGrouping,
    passed: failures.length === 0,
  };

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    gateLog,
    accuracySummary: computeAccuracySummary(reportData, extractedDataContext),
  };
}

module.exports = {
  validateFinalReportQuality,
  computeAccuracySummary,
};
