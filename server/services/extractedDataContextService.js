const path = require("path");

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function cleanNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/[₹,\s]/g, "").replace(/[^0-9.+-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanPercent(value) {
  const parsed = cleanNumber(value);
  if (parsed === null) return null;
  if (String(value).includes("%")) return parsed / 100;
  return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeServiceNo(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits.slice(-12);
  return digits.padStart(12, "0");
}

function monthYearFromText(value) {
  const text = cleanText(value);
  if (!text) return { billMonth: "", billYear: null };

  const lower = text.toLowerCase();
  const monthIndex = MONTHS.findIndex((month) => lower.includes(month));
  const yearMatch = text.match(/\b(20\d{2}|\d{2})\b/);

  return {
    billMonth: monthIndex >= 0 ? MONTHS[monthIndex] : "",
    billYear: yearMatch ? Number(yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : null,
  };
}

function normalizeMonthName(value) {
  const lower = cleanText(value).toLowerCase();
  return MONTHS.find((month) => lower.includes(month)) || "";
}

function monthLabel(bill = {}) {
  const month = cleanText(bill.billMonth || bill.month || "");
  const year = cleanNumber(bill.billYear || "");
  if (!month && !year) return "";
  const label = month ? `${month.slice(0, 1).toUpperCase()}${month.slice(1, 3)}` : "";
  return cleanText(`${label} ${year || ""}`);
}

function hasRealMonth(value) {
  const lower = cleanText(value).toLowerCase();
  return MONTHS.some((month) => lower.includes(month));
}

function normalizeMonthlyBill(raw = {}, fallback = {}) {
  const sourceMonth = raw.billMonth || raw.month || fallback.billMonth || fallback.month || "";
  const parsedMonth = monthYearFromText(sourceMonth);
  const month = parsedMonth.billMonth || normalizeMonthName(fallback.billMonth);
  const year = parsedMonth.billYear || cleanNumber(raw.billYear) || cleanNumber(fallback.billYear);

  const totalKwh =
    cleanNumber(raw.totalKwh) ??
    cleanNumber(raw.kwh) ??
    cleanNumber(raw.kwhConsumption) ??
    cleanNumber(raw.industrialConsumptionKwh) ??
    cleanNumber(fallback.totalKwh);

  const totalKvah =
    cleanNumber(raw.totalKvah) ??
    cleanNumber(raw.kvah) ??
    cleanNumber(raw.kvahConsumption) ??
    cleanNumber(fallback.totalKvah);

  const netAmountPayable =
    cleanNumber(raw.netAmountPayable) ??
    cleanNumber(raw.netAmount) ??
    cleanNumber(raw.billAmount) ??
    cleanNumber(fallback.netAmountPayable);

  const record = {
    sourceFile: cleanText(raw.sourceFile || fallback.sourceFile),
    billMonth: month,
    billYear: year,
    billNo: cleanText(raw.billNo || fallback.billNo),
    dateOfBill: cleanText(raw.dateOfBill || fallback.dateOfBill),
    dueDate: cleanText(raw.dueDate || fallback.dueDate),
    serviceNo: normalizeServiceNo(raw.serviceNo || fallback.serviceNo),
    tariffCategory: cleanText(raw.tariffCategory || fallback.tariffCategory),
    permittedMdKva: cleanNumber(raw.permittedMdKva ?? raw.contractDemandKva ?? fallback.permittedMdKva),
    contractDemandKva: cleanNumber(raw.contractDemandKva ?? raw.permittedMdKva ?? fallback.contractDemandKva),
    supplyVoltageKv: cleanText(raw.supplyVoltageKv || raw.supplyVoltage || fallback.supplyVoltageKv || fallback.supplyVoltage),
    industrialConsumptionKwh: cleanNumber(raw.industrialConsumptionKwh ?? totalKwh),
    peakConsumptionKwh: cleanNumber(raw.peakConsumptionKwh),
    nightHourConsumptionKwh: cleanNumber(raw.nightHourConsumptionKwh),
    lavishIlluminationConsumptionKwh: cleanNumber(raw.lavishIlluminationConsumptionKwh ?? raw.lavishIlluminationAmount),
    totalKwh,
    totalKvah,
    recordedDemandKva: cleanNumber(raw.recordedDemandKva ?? raw.mdKva ?? raw.maximumDemandKva),
    billedDemandKva: cleanNumber(raw.billedDemandKva),
    energyCharges: cleanNumber(raw.energyCharges),
    demandCharges: cleanNumber(raw.demandCharges),
    taxAmount: cleanNumber(raw.taxAmount ?? raw.electricityTax),
    netAmountPayable,
    amountPayableAfterDueDate: cleanNumber(raw.amountPayableAfterDueDate),
    powerFactor: cleanNumber(raw.powerFactor) ?? (totalKwh && totalKvah ? totalKwh / totalKvah : null),
    meterMf: cleanNumber(raw.meterMf ?? raw.mf),
    extractionConfidence: cleanNumber(raw.extractionConfidence) ?? cleanNumber(fallback.extractionConfidence) ?? null,
    pdfAttempted: Boolean(raw.pdfAttempted ?? fallback.pdfAttempted),
  };

  record.monthLabel = monthLabel(record);
  return record;
}

function isValidMonthlyBill(record = {}) {
  if (!hasRealMonth(record.monthLabel || `${record.billMonth} ${record.billYear || ""}`)) return false;
  if ((record.totalKwh || 0) <= 0) return false;
  if ((record.netAmountPayable || 0) <= 0 && (record.energyCharges || 0) <= 0) return false;

  const invalidTerms = ["particular", "contract demand", "total", "undefined", "[object date]", "max recorded demand"];
  const label = cleanText(record.monthLabel).toLowerCase();
  return !invalidTerms.some((term) => label.includes(term));
}

function mergeBillEntries(excelBills = [], pdfBills = []) {
  const byKey = new Map();

  const upsert = (bill, sourcePriority) => {
    const normalized = normalizeMonthlyBill(bill);
    if (!isValidMonthlyBill(normalized)) return;
    const key = `${normalized.billYear || ""}-${normalized.billMonth || normalized.monthLabel}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { ...normalized, _priority: sourcePriority });
      return;
    }

    const merged = { ...existing };
    for (const [field, value] of Object.entries(normalized)) {
      if (value === null || value === undefined || value === "") continue;
      if (merged[field] === null || merged[field] === undefined || merged[field] === "") {
        merged[field] = value;
        continue;
      }

      if (sourcePriority < existing._priority) {
        merged[field] = value;
      }
    }

    merged._priority = Math.min(existing._priority, sourcePriority);
    byKey.set(key, merged);
  };

  asArray(excelBills).forEach((bill) => upsert(bill, 1));
  asArray(pdfBills).forEach((bill) => upsert(bill, 2));

  return Array.from(byKey.values())
    .map(({ _priority, ...bill }) => bill)
    .sort((a, b) => {
      const ay = a.billYear || 0;
      const by = b.billYear || 0;
      if (ay !== by) return ay - by;
      return MONTHS.indexOf(a.billMonth) - MONTHS.indexOf(b.billMonth);
    });
}

function enrichPrimaryBills(primaryBills = [], pdfBills = []) {
  if (primaryBills.length !== 12) return mergeBillEntries(primaryBills, pdfBills);

  const sortedPdfBills = [...pdfBills].sort((a, b) => {
    const ay = a.billYear || 0;
    const by = b.billYear || 0;
    if (ay !== by) return ay - by;
    return MONTHS.indexOf(a.billMonth) - MONTHS.indexOf(b.billMonth);
  });

  if (sortedPdfBills.length >= primaryBills.length) {
    const alignedPdfBills = sortedPdfBills.slice(sortedPdfBills.length - primaryBills.length);
    return primaryBills.map((bill, index) => {
      const pdfBill = alignedPdfBills[index];
      if (!pdfBill) return bill;
      return normalizeMonthlyBill({
        ...bill,
        billMonth: pdfBill.billMonth || bill.billMonth,
        billYear: pdfBill.billYear || bill.billYear,
        billNo: pdfBill.billNo || bill.billNo,
        dateOfBill: pdfBill.dateOfBill || bill.dateOfBill,
        dueDate: pdfBill.dueDate || bill.dueDate,
        serviceNo: pdfBill.serviceNo || bill.serviceNo,
        tariffCategory: pdfBill.tariffCategory || bill.tariffCategory,
        permittedMdKva: pdfBill.permittedMdKva || bill.permittedMdKva,
        contractDemandKva: pdfBill.contractDemandKva || bill.contractDemandKva,
        supplyVoltageKv: pdfBill.supplyVoltageKv || bill.supplyVoltageKv,
        totalKvah: pdfBill.totalKvah || bill.totalKvah,
        billedDemandKva: pdfBill.billedDemandKva || bill.billedDemandKva,
        powerFactor: pdfBill.powerFactor || bill.powerFactor,
        meterMf: pdfBill.meterMf || bill.meterMf,
        pdfAttempted: true,
      });
    });
  }

  const remainingPdfBills = [...pdfBills];
  return primaryBills.map((bill) => {
    const bestIndex = remainingPdfBills.findIndex((pdfBill) => {
      if (bill.billMonth && bill.billYear && pdfBill.billMonth === bill.billMonth && pdfBill.billYear === bill.billYear) return true;
      if (!bill.totalKwh || !pdfBill.totalKwh) return false;
      return Math.abs(pdfBill.totalKwh - bill.totalKwh) / bill.totalKwh < 0.02;
    });

    if (bestIndex < 0) return bill;
    const [matchedPdf] = remainingPdfBills.splice(bestIndex, 1);
    return normalizeMonthlyBill({
      ...bill,
      billMonth: matchedPdf.billMonth || bill.billMonth,
      billYear: matchedPdf.billYear || bill.billYear,
      billNo: matchedPdf.billNo || bill.billNo,
      dateOfBill: matchedPdf.dateOfBill || bill.dateOfBill,
      dueDate: matchedPdf.dueDate || bill.dueDate,
      serviceNo: matchedPdf.serviceNo || bill.serviceNo,
      tariffCategory: matchedPdf.tariffCategory || bill.tariffCategory,
      permittedMdKva: matchedPdf.permittedMdKva || bill.permittedMdKva,
      contractDemandKva: matchedPdf.contractDemandKva || bill.contractDemandKva,
      supplyVoltageKv: matchedPdf.supplyVoltageKv || bill.supplyVoltageKv,
      totalKvah: matchedPdf.totalKvah || bill.totalKvah,
      billedDemandKva: matchedPdf.billedDemandKva || bill.billedDemandKva,
      powerFactor: matchedPdf.powerFactor || bill.powerFactor,
      meterMf: matchedPdf.meterMf || bill.meterMf,
      pdfAttempted: true,
    });
  });
}

function normalizeAssetType(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return "Other";
  if (text.includes("cooling tower")) return "Cooling Tower";
  if (text.includes("chiller")) return "Chiller";
  if (text.includes("condenser pump")) return "Condenser Pump";
  if (text.includes("primary")) return "Primary CHW Pump";
  if (text.includes("secondary")) return "Secondary CHW Pump";
  if (text === "ahu" || text.includes("ahu")) return "AHU";
  if (text === "csu" || text.includes("csu")) return "CSU";
  if (text === "fcu" || text.includes("fcu")) return "FCU";
  if (text.includes("heat recovery wheel") && text.includes("fresh")) return "Heat Recovery Wheel fresh air";
  if (text.includes("heat recovery wheel") && text.includes("exhaust")) return "Heat Recovery Wheel exhaust";
  if (text.includes("air washer")) return "Air Washer";
  if (text.includes("scrubber")) return "Scrubber";
  if (text.includes("escalator")) return "Escalator";
  if (text.includes("passanger lift") || text.includes("passenger lift") || text.includes("services lift") || text.includes("lift")) return "Lift";
  if (text.includes("office outdoor")) return "Office Outdoor";
  if (text.includes("domestic pump")) return "Domestic Pump";
  if (text.includes("flush pump")) return "Flush Pump";
  if (text.includes("irrigation pump")) return "Irrigation Pump";
  if (text.includes("softner pump") || text.includes("softener pump")) return "Softener Pump";
  if (text.includes("stp blower") || text.includes("air blower")) return "STP Blower";
  return cleanText(value) || "Other";
}

function summarizeConnectedLoad(rows = []) {
  const normalizedRows = rows
    .filter((row) => cleanText(row.assetType))
    .map((row) => ({
      ...row,
      assetType: normalizeAssetType(row.assetType),
      quantity: 1,
    }));

  const summaryMap = new Map();
  let totalAnnualConsumption = 0;

  for (const row of normalizedRows) {
    const assetType = row.assetType;
    const actualKw = cleanNumber(row.actualKw ?? row.connectedLoadKw) || 0;
    const annual = cleanNumber(row.consumptionPerYear) || 0;
    totalAnnualConsumption += annual;

    if (!summaryMap.has(assetType)) {
      summaryMap.set(assetType, {
        assetType,
        quantity: 0,
        totalKw: 0,
        totalAnnualConsumption: 0,
        percentageShare: 0,
        remarks: "",
      });
    }

    const entry = summaryMap.get(assetType);
    entry.quantity += 1;
    entry.totalKw += actualKw;
    entry.totalAnnualConsumption += annual;
  }

  const summaryByAssetType = Array.from(summaryMap.values())
    .map((entry) => ({
      ...entry,
      percentageShare: totalAnnualConsumption > 0 ? (entry.totalAnnualConsumption / totalAnnualConsumption) * 100 : 0,
      remarks: `Counted from ${entry.quantity} equipment row${entry.quantity === 1 ? "" : "s"}`,
    }))
    .sort((a, b) => b.totalAnnualConsumption - a.totalAnnualConsumption);

  return {
    equipmentRows: normalizedRows,
    summaryByAssetType,
    majorSystems: summaryByAssetType.slice(0, 20),
  };
}

function exactVrGroup(ecmNo) {
  const number = cleanNumber(String(ecmNo).replace(/[^\d]/g, ""));
  if (number === 1) return { groupNo: "GR-1", groupName: "Electrical Billing and Demand Optimization" };
  if ([2, 3, 4, 5, 18].includes(number)) return { groupNo: "GR-2", groupName: "Chiller Plant and Cooling Tower Optimization" };
  if ([6, 7, 8].includes(number)) return { groupNo: "GR-3", groupName: "Pumping System Optimization" };
  if ([9, 10, 11, 12, 13].includes(number)) return { groupNo: "GR-4", groupName: "Air Handling, Ventilation and Blower Optimization" };
  return { groupNo: "", groupName: "" };
}

function normalizeProject(project = {}) {
  const exactGroup = exactVrGroup(project.ecmNo || project.serialNo);
  return {
    ecmNo: cleanText(project.ecmNo || (project.serialNo ? `ECM ${project.serialNo}` : "")),
    serialNo: cleanNumber(project.serialNo),
    equipmentName: cleanText(project.equipmentName),
    projectTitle: cleanText(project.projectTitle || project.title),
    system: cleanText(project.system),
    groupNo: cleanText(project.groupNo || exactGroup.groupNo),
    groupName: cleanText(project.groupName || project.groupTitle || exactGroup.groupName),
    rationaleForEnergySaving: cleanText(project.rationaleForEnergySaving),
    savingPotentialRange: cleanText(project.savingPotentialRange),
    briefInformationAdvantages: cleanText(project.briefInformationAdvantages),
    projectActivities: cleanText(project.projectActivitiesText || project.projectActivities),
    baselineNotes: cleanText(project.baselineNotes),
    baselineKwhPerYearRaw: cleanNumber(project.baselineKwhPerYearRaw),
    savingPercentRaw: cleanPercent(project.savingPercentRaw),
    energySavingRaw: cleanNumber(project.energySavingRaw),
    annualSavingRaw: cleanNumber(project.annualSavingRaw),
    investmentRaw: cleanNumber(project.investmentRaw),
    paybackMonthsRaw: cleanNumber(project.paybackMonthsRaw),
    paybackYearsRaw: cleanNumber(project.paybackYearsRaw ?? (cleanNumber(project.paybackMonthsRaw) ? cleanNumber(project.paybackMonthsRaw) / 12 : null)),
    sourceSheet: cleanText(project.sourceSheet),
    sourceRow: cleanNumber(project.sourceRow),
  };
}

function buildMissingInputs(base = []) {
  return asArray(base)
    .filter(Boolean)
    .map((item) => {
      if (typeof item === "string") {
        return {
          section: "General",
          missingInput: item,
          whyRequired: "Required to complete the final engineering report.",
          suggestedSource: "Client / uploaded source file",
          criticality: "Medium",
        };
      }
      return {
        section: cleanText(item.section || "General"),
        missingInput: cleanText(item.missingInput || item.field || item.name),
        whyRequired: cleanText(item.whyRequired || "Required to complete the final engineering report."),
        suggestedSource: cleanText(item.suggestedSource || "Client / uploaded source file"),
        criticality: cleanText(item.criticality || "Medium"),
      };
    });
}

function calculateAudit(context) {
  const fieldsExtracted = [];
  const fieldsMissing = [];

  const pushField = (pathLabel, value) => {
    if (value === null || value === undefined || value === "") fieldsMissing.push(pathLabel);
    else fieldsExtracted.push(pathLabel);
  };

  pushField("projectInfo.clientName", context.projectInfo.clientName);
  pushField("projectInfo.facilityName", context.projectInfo.facilityName);
  pushField("electricalProfile.serviceNo", context.electricalProfile.serviceNo);
  pushField("electricalProfile.tariffCategory", context.electricalProfile.tariffCategory);
  pushField("electricalProfile.contractDemandKva", context.electricalProfile.contractDemandKva);
  pushField("electricalProfile.supplyVoltage", context.electricalProfile.supplyVoltage);
  pushField("monthlyBills.count", context.monthlyBills.length);
  pushField("ecmProjects.count", context.ecmProjects.length);
  pushField("connectedLoad.equipmentRows.count", context.connectedLoad.equipmentRows.length);

  return {
    sourceFiles: context.extractionAudit.sourceFiles,
    fieldsExtracted,
    fieldsMissing,
    confidenceBySection: {
      ecm: context.ecmProjects.length ? 100 : 0,
      billProfile: context.monthlyBills.length ? 100 : 0,
      connectedLoad: context.connectedLoad.equipmentRows.length ? 100 : 0,
      costing: Object.keys(context.costing.matchedCostingByEcm || {}).length ? 100 : 0,
    },
    warnings: context.extractionAudit.warnings,
  };
}

function resolveBuildArgs(arg1 = [], arg2 = {}) {
  if (
    arg1 &&
    typeof arg1 === "object" &&
    !Array.isArray(arg1) &&
    (Object.prototype.hasOwnProperty.call(arg1, "uploadedFiles") ||
      Object.prototype.hasOwnProperty.call(arg1, "workbookExtractions") ||
      Object.prototype.hasOwnProperty.call(arg1, "reportData"))
  ) {
    return {
      uploadedFiles: asArray(arg1.uploadedFiles),
      extractionResults: {
        ...(arg1.workbookExtractions || {}),
        ...(arg1.reportData || {}),
        ...(arg1.extractionResults || {}),
      },
    };
  }

  return {
    uploadedFiles: asArray(arg1),
    extractionResults: arg2 || {},
  };
}

function buildExtractedDataContext(arg1 = [], arg2 = {}) {
  const { uploadedFiles, extractionResults } = resolveBuildArgs(arg1, arg2);
  const energyProfile = extractionResults.energyProfile || extractionResults.billEntry || {};
  const pdfBillExtraction = extractionResults.pdfBillExtraction || {};
  const pdfBills = asArray(pdfBillExtraction.bills || extractionResults.pdfBills || []);
  const monthlyBills = enrichPrimaryBills(energyProfile.monthlyBills || extractionResults.monthlyBills || [], pdfBills);

  const annualKwh = monthlyBills.reduce((sum, bill) => sum + (bill.totalKwh || 0), 0);
  const annualKvah = monthlyBills.reduce((sum, bill) => sum + (bill.totalKvah || 0), 0);
  const annualBillAmount = monthlyBills.reduce((sum, bill) => sum + (bill.netAmountPayable || 0), 0);
  const maxRecordedDemandKva = monthlyBills.reduce((max, bill) => Math.max(max, bill.recordedDemandKva || 0), 0);
  const demandValues = monthlyBills.map((bill) => bill.recordedDemandKva).filter((value) => value !== null && value !== undefined);
  const pfValues = monthlyBills.map((bill) => bill.powerFactor).filter((value) => value !== null && value !== undefined);
  const averageRecordedDemandKva = demandValues.length ? demandValues.reduce((sum, value) => sum + value, 0) / demandValues.length : null;

  const connectedLoadRows = extractionResults.connectedLoad?.equipmentRows || extractionResults.connectedLoadRows || [];
  const connectedLoad = summarizeConnectedLoad(connectedLoadRows);

  const ecmProjects = asArray(extractionResults.projects || extractionResults.ecmProjects).map(normalizeProject);
  const costing = extractionResults.costing || {
    costingRows: asArray(extractionResults.costingData?.costingRows),
    blowerCostingRows: asArray(extractionResults.costingData?.blowerCostingRows),
    matchedCostingByEcm: extractionResults.costingData?.matchedCostingByEcm || {},
  };

  const projectInfo = {
    clientName: cleanText(extractionResults.projectInfo?.clientName || energyProfile.consumerName || pdfBillExtraction.clientName),
    facilityName: cleanText(extractionResults.projectInfo?.facilityName || energyProfile.consumerName || pdfBillExtraction.clientName),
    address: cleanText(extractionResults.projectInfo?.address || pdfBillExtraction.address),
    location: cleanText(extractionResults.projectInfo?.location || extractionResults.reportDetails?.location),
    buildingType: cleanText(extractionResults.projectInfo?.buildingType || extractionResults.reportDetails?.buildingType || "Commercial Mall / Retail Building"),
    auditPeriod: cleanText(extractionResults.projectInfo?.auditPeriod || extractionResults.reportDetails?.auditPeriod),
    reportDate: cleanText(extractionResults.projectInfo?.reportDate || extractionResults.reportDetails?.reportDate),
    preparedBy: cleanText(extractionResults.projectInfo?.preparedBy || "SEE-Tech Solutions"),
  };

  const electricalProfile = {
    serviceNo: normalizeServiceNo(energyProfile.serviceNo || pdfBillExtraction.serviceNo),
    consumerNumber: normalizeServiceNo(energyProfile.serviceNo || pdfBillExtraction.serviceNo),
    tariffCategory: cleanText(energyProfile.tariffCategory || pdfBillExtraction.tariffCategory),
    contractDemandKva: cleanNumber(energyProfile.contractDemandKva || pdfBillExtraction.permittedMdKva || pdfBillExtraction.contractDemandKva),
    permittedMdKva: cleanNumber(energyProfile.contractDemandKva || pdfBillExtraction.permittedMdKva || pdfBillExtraction.contractDemandKva),
    supplyVoltage: cleanText(energyProfile.supplyVoltage || pdfBillExtraction.supplyVoltage || pdfBillExtraction.supplyVoltageKv),
    transformerCapacityKva: cleanNumber(pdfBillExtraction.transformerCapacityKva || extractionResults.energyProfile?.transformerCapacityKva),
    billingType: cleanText(energyProfile.billingDemandRule),
    averagePowerFactor: pfValues.length ? pfValues.reduce((sum, value) => sum + value, 0) / pfValues.length : null,
    annualKwh,
    annualKvah,
    annualBillAmount,
    averageTariff: annualKwh > 0 ? annualBillAmount / annualKwh : null,
    maxRecordedDemandKva,
    averageRecordedDemandKva,
  };

  const context = {
    projectInfo,
    electricalProfile,
    monthlyBills,
    ecmProjects,
    connectedLoad,
    costing: {
      costingRows: asArray(costing.costingRows),
      blowerCostingRows: asArray(costing.blowerCostingRows),
      matchedCostingByEcm: costing.matchedCostingByEcm || {},
    },
    pdfBillExtraction: {
      filesDetected:
        cleanNumber(pdfBillExtraction.filesDetected) ||
        asArray(uploadedFiles).filter((file) => path.extname(file.originalname || file.filename || file.name || "").toLowerCase() === ".pdf").length,
      filesParsed: cleanNumber(pdfBillExtraction.filesParsed) || pdfBills.length,
      filesFailed: asArray(pdfBillExtraction.filesFailed),
      warnings: asArray(pdfBillExtraction.warnings),
      bills: pdfBills,
      clientName: cleanText(pdfBillExtraction.clientName),
      address: cleanText(pdfBillExtraction.address),
      serviceNo: normalizeServiceNo(pdfBillExtraction.serviceNo),
      tariffCategory: cleanText(pdfBillExtraction.tariffCategory),
      permittedMdKva: cleanNumber(pdfBillExtraction.permittedMdKva),
      contractDemandKva: cleanNumber(pdfBillExtraction.contractDemandKva || pdfBillExtraction.permittedMdKva),
      supplyVoltage: cleanText(pdfBillExtraction.supplyVoltage || pdfBillExtraction.supplyVoltageKv),
      transformerCapacityKva: cleanNumber(pdfBillExtraction.transformerCapacityKva),
    },
    missingInputs: buildMissingInputs(extractionResults.missingInputs),
    extractionAudit: {
      sourceFiles: asArray(uploadedFiles).map((file) => cleanText(file.originalname || file.filename || file.name)),
      fieldsExtracted: [],
      fieldsMissing: [],
      confidenceBySection: {},
      warnings: asArray(extractionResults.validationWarnings || extractionResults.warnings),
    },
  };

  context.extractionAudit = calculateAudit(context);
  return context;
}

module.exports = {
  MONTHS,
  asArray,
  buildExtractedDataContext,
  cleanNumber,
  cleanPercent,
  cleanText,
  isValidMonthlyBill,
  monthLabel,
  normalizeAssetType,
  normalizeMonthlyBill,
  normalizeMonthName,
  normalizeServiceNo,
};
