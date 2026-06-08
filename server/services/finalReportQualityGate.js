const { validateFinalReportQuality: legacyValidateFinalReportQuality } = require("./finalReportQualityService");
const { BLOCKED_PHRASES } = require("./reportSanitizerService");
const {
  buildVrChennaiClientReadyModel,
  isVrChennaiReport,
} = require("./vrChennaiClientReadyRenderer");

function countMatches(text, regex) {
  return (String(text || "").match(regex) || []).length;
}

function countBlockedPhrases(text) {
  const lowered = String(text || "").toLowerCase();
  return BLOCKED_PHRASES.reduce((sum, phrase) => {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return sum + ((lowered.match(regex) || []).length);
  }, 0);
}

function countPlaceholders(text) {
  const lowered = String(text || "").toLowerCase();
  const tokens = [
    "[to be updated after site data verification]",
    "[calculation pending]",
    "client name",
    "undefined",
    "null",
  ];
  return tokens.reduce((sum, token) => sum + (lowered.includes(token) ? 1 : 0), 0);
}

function countDuplicateUnits(text) {
  return countMatches(text, /\bkWh\/year kWh\/year\b/gi) +
    countMatches(text, /\bkVAh kVAh\b/gi) +
    countMatches(text, /\bkVA kVA\b/gi) +
    countMatches(text, /\bmonths months\b/gi) +
    countMatches(text, /\byears years\b/gi);
}

function countIndustrialRows(text) {
  const lowered = String(text || "").toLowerCase();
  const patterns = ["production areas", "compressor room", "dryer section", "injection", "stretch blow", "production hall", "warehouse", "dispatch"];
  return patterns.reduce((sum, pattern) => sum + (lowered.includes(pattern) ? 1 : 0), 0);
}

function countRawDecimals(text) {
  return countMatches(text, /\b\d+\.\d{4,}\b/g);
}

function buildAccuracySummary(model) {
  const context = model.context;
  const availableFields = context.extractionAudit.fieldsExtracted.length + context.extractionAudit.fieldsMissing.length;
  const extractedFields = context.extractionAudit.fieldsExtracted.length;
  const missingFieldsMovedToAnnexure = context.missingInputs.length;
  const placeholdersInMainReport = countPlaceholders(model.mainReportText);
  const badPhrases = countBlockedPhrases(model.plainText);
  const rawDecimals = countRawDecimals(model.mainReportText);

  const percentage = (num, den) => {
    if (den <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((num / den) * 100)));
  };

  const pdfAttempted = (context.pdfBillExtraction.filesParsed || 0) + (context.pdfBillExtraction.filesFailed || []).length;

  return {
    accuracyScore: {
      ecmExtraction: percentage(context.ecmProjects.length, 14),
      billProfileExtraction: percentage(
        Number(Boolean(context.projectInfo.facilityName)) +
          Number(Boolean(context.electricalProfile.serviceNo)) +
          Number(Boolean(context.electricalProfile.tariffCategory)) +
          Number(Boolean(context.electricalProfile.contractDemandKva)) +
          Number(Boolean(context.electricalProfile.supplyVoltage)),
        5
      ),
      pdfBillExtraction: percentage(pdfAttempted, context.pdfBillExtraction.filesDetected || pdfAttempted || 1),
      connectedLoadExtraction: percentage(context.connectedLoad.summaryByAssetType.length, context.connectedLoad.summaryByAssetType.length || 1),
      costingExtraction: percentage(Object.keys(context.costing.matchedCostingByEcm || {}).length, 8),
      autoFillAccuracy: percentage(extractedFields - placeholdersInMainReport, extractedFields || 1),
      finalReportReadiness: percentage(extractedFields - placeholdersInMainReport - badPhrases - rawDecimals, extractedFields || 1),
    },
    counts: {
      availableFields,
      extractedFields,
      filledFields: Math.max(0, extractedFields - placeholdersInMainReport),
      missingFieldsMovedToAnnexure,
      placeholdersInMainReport,
      badPhrases,
      rawDecimals,
    },
  };
}

function validateVrChennaiFinalReport(reportData = {}, extractedDataContext = {}) {
  const model = buildVrChennaiClientReadyModel(reportData, extractedDataContext);
  const context = model.context;
  const text = model.mainReportText;
  const fullText = model.plainText;

  const projectCount = context.ecmProjects.length;
  const ecmNumbers = context.ecmProjects.map((project) => Number(String(project.ecmNo).replace(/\D/g, ""))).sort((a, b) => a - b);
  const expectedEcms = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 18];
  const totalEnergySaving = context.ecmProjects.reduce((sum, project) => sum + (project.energySavingRaw || 0), 0);
  const totalAnnualSaving = context.ecmProjects.reduce((sum, project) => sum + (project.annualSavingRaw || 0), 0);
  const placeholderCountMainReport = countPlaceholders(text);
  const badPhraseCount = countBlockedPhrases(fullText);
  const rawDecimalCount = countRawDecimals(text);
  const duplicateUnitCount = countDuplicateUnits(text);
  const genericGroupNameCount = model.groups.filter((group) => /group\s+[1-4]/i.test(group.groupName)).length;
  const industrialRowCount = countIndustrialRows(text);
  const pdfFilesUploaded = context.pdfBillExtraction.filesDetected || 0;
  const pdfFilesParsed = context.pdfBillExtraction.filesParsed || 0;
  const pdfAttempted = pdfFilesParsed + (context.pdfBillExtraction.filesFailed || []).length;

  const rowCountByAsset = context.connectedLoad.equipmentRows.reduce((acc, row) => {
    acc[row.assetType] = (acc[row.assetType] || 0) + 1;
    return acc;
  }, {});
  const connectedLoadQuantityErrors = context.connectedLoad.summaryByAssetType.filter(
    (row) => row.quantity !== rowCountByAsset[row.assetType]
  ).map((row) => row.assetType);

  const failures = [];
  const warnings = [];
  const failIf = (condition, message) => {
    if (condition) failures.push(message);
  };
  const warnIf = (condition, message) => {
    if (condition) warnings.push(message);
  };

  failIf(projectCount !== 14, `ECM count != 14 (found ${projectCount})`);
  failIf(JSON.stringify(ecmNumbers) !== JSON.stringify(expectedEcms), `ECM number set != [${expectedEcms.join(", ")}]`);
  failIf(totalEnergySaving <= 0, "totalEnergySaving <= 0");
  failIf(totalAnnualSaving <= 0, "totalAnnualSaving <= 0");
  failIf(genericGroupNameCount > 0, "group names contain generic Group 1/2/3/4 labels");
  failIf(!context.projectInfo.facilityName && (context.electricalProfile.serviceNo || context.pdfBillExtraction.clientName), "facilityName missing while Bill Entry/PDF has data");
  failIf(!context.electricalProfile.serviceNo && pdfFilesUploaded > 0, "serviceNo missing while Bill Entry/PDF has data");
  failIf(!context.electricalProfile.tariffCategory && pdfFilesUploaded > 0, "tariff missing while Bill Entry/PDF has data");
  failIf(!context.electricalProfile.contractDemandKva && pdfFilesUploaded > 0, "contract demand missing while Bill Entry/PDF has data");
  failIf(!context.electricalProfile.supplyVoltage && pdfFilesUploaded > 0, "supply voltage missing while Bill Entry/PDF has data");
  failIf(context.monthlyBills.length < 12, `monthlyBills < 12 (found ${context.monthlyBills.length})`);
  failIf(badPhraseCount > 0, `badPhraseCount > 0 (${badPhraseCount})`);
  failIf(rawDecimalCount > 0, `rawDecimalCount > 0 (${rawDecimalCount})`);
  failIf(duplicateUnitCount > 0, `duplicateUnitCount > 0 (${duplicateUnitCount})`);
  failIf(industrialRowCount > 0, `old industrial rows remain (${industrialRowCount})`);
  failIf(placeholderCountMainReport > 10, `placeholder count in main report > 10 (${placeholderCountMainReport})`);
  failIf(connectedLoadQuantityErrors.length > 0, `connected-load quantities do not match row counts for: ${connectedLoadQuantityErrors.join(", ")}`);
  failIf(pdfFilesUploaded > 0 && pdfAttempted === 0, "PDF files uploaded and PDF parser not attempted");

  warnIf(pdfFilesUploaded > 0 && pdfFilesParsed === 0 && context.monthlyBills.length >= 12, "PDF parser failed but Bill Entry has valid 12 rows");
  warnIf(!context.projectInfo.address, "Facility address missing");
  warnIf((context.electricalProfile.transformerCapacityKva || 0) === 0, "Transformer capacity missing");
  warnIf(!Object.keys(context.costing.matchedCostingByEcm || {}).length, "Costing backup missing for some ECMs");

  const gateLog = {
    projectCount,
    ecmNumbers,
    totalEnergySaving,
    totalAnnualSaving,
    facilityName: context.projectInfo.facilityName,
    serviceNo: context.electricalProfile.serviceNo,
    tariff: context.electricalProfile.tariffCategory,
    contractDemand: context.electricalProfile.contractDemandKva,
    supplyVoltage: context.electricalProfile.supplyVoltage,
    monthlyBillCount: context.monthlyBills.length,
    pdfFilesUploaded,
    pdfFilesParsed,
    connectedLoadSystems: context.connectedLoad.summaryByAssetType.length,
    costingMatchedCount: Object.keys(context.costing.matchedCostingByEcm || {}).length,
    placeholderCountMainReport,
    missingInputsCount: context.missingInputs.length,
    badPhraseCount,
    rawDecimalCount,
    duplicateUnitCount,
    genericGroupNameCount,
    industrialRowCount,
    connectedLoadQuantityErrors,
    failures,
    warnings,
    passed: failures.length === 0,
  };

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    gateLog,
    accuracySummary: buildAccuracySummary(model),
    model,
  };
}

function validateFinalReportQuality(reportData = {}, extractedDataContext = {}) {
  if (!isVrChennaiReport(reportData, extractedDataContext)) {
    return legacyValidateFinalReportQuality(reportData, extractedDataContext);
  }
  return validateVrChennaiFinalReport(reportData, extractedDataContext);
}

module.exports = {
  buildAccuracySummary,
  validateFinalReportQuality,
  validateVrChennaiFinalReport,
};
