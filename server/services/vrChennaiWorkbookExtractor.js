const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const { extractPdfBills } = require("./pdfBillExtractor");
const {
  MONTHS,
  cleanNumber,
  cleanPercent,
  cleanText,
  normalizeAssetType,
  normalizeMonthlyBill,
  normalizeServiceNo,
  isValidMonthlyBill,
} = require("./extractedDataContextService");

function parseNumberOrNull(value) {
  return cleanNumber(value);
}

function parsePercent(value) {
  return cleanPercent(value);
}

function formatInr(val) {
  if (val === null || val === undefined) return null;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
}

function formatKwh(val) {
  if (val === null || val === undefined) return null;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(val);
}

function classifySystem(ecmNo) {
  const map = {
    1: "Electrical Billing / Demand Management",
    2: "Cooling Tower / Chiller Condenser System",
    3: "Cooling Tower Fan System",
    4: "Chiller Plant Controls / CHW Set Point",
    5: "Chiller Plant Automation and Sequencing",
    6: "Condenser Water Pumping System",
    7: "Primary CHW Pumping System",
    8: "Secondary CHW Pumping System",
    9: "STP Blower / Motor Drive System",
    10: "AHU Plug Fan System",
    11: "Air Washer Plug Fan System",
    12: "Heat Recovery Wheel / Ventilation Fan System",
    13: "Scrubber Ventilation Motor System",
    18: "Chiller Operational Practice Improvement"
  };
  return map[ecmNo] || "Energy Conservation Measure";
}

function detectEcmGroupingColumn(headers = []) {
  const groupAliases = [
    "group",
    "group no",
    "group name",
    "ecm group",
    "measure group",
    "category",
    "gr",
    "gr no",
    "group code"
  ];

  const normalizedHeaders = headers.map(h =>
    String(h || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

  return normalizedHeaders.findIndex(header =>
    groupAliases.some(alias => header === alias || header.includes(alias))
  );
}

function extractECM(sheet, fileName) {
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const projects = [];
  
  // Try to find a header row
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (row && row.some(cell => String(cell).toLowerCase().includes('project'))) {
      headerRowIndex = i;
      break;
    }
  }
  
  const headers = data[headerRowIndex] || [];
  const groupColIndex = detectEcmGroupingColumn(headers);
  
  let groupColumnDetected = groupColIndex !== -1;
  let groupColumnName = groupColumnDetected ? headers[groupColIndex] : null;

  // Data usually starts at row 5 (index 4) but let's be flexible if headers were lower
  const dataStartIndex = Math.max(4, headerRowIndex + 1);

  for (let i = dataStartIndex; i < data.length; i++) {
    const row = data[i];
    const sr = parseNumberOrNull(row[0]); // A = Sr.
    const title = String(row[3] || "").trim(); // D = Energy Saving Project
    
    if (sr !== null && title !== "") {
      const ecmNoNum = sr;
      const energySavingRaw = parseNumberOrNull(row[11]); // L = Saving, kWh/ Year
      const annualSavingRaw = parseNumberOrNull(row[12]); // M = Savings in Rs
      const investmentRaw = parseNumberOrNull(row[13]);   // N = Investment, Rs
      let paybackMonthsRaw = parseNumberOrNull(row[14]);  // O = Payback Period, Months
      
      if (paybackMonthsRaw === null && annualSavingRaw > 0 && investmentRaw !== null) {
          paybackMonthsRaw = (investmentRaw / annualSavingRaw) * 12;
      }
      
      let groupNo = null;
      let groupTitle = null;
      let hasExplicitEcmGrouping = false;

      if (groupColIndex !== -1) {
        const groupVal = cleanText(row[groupColIndex]);
        if (groupVal) {
          groupNo = groupVal;
          groupTitle = groupVal;
          hasExplicitEcmGrouping = true;
        }
      }
      
      projects.push({
        ecmNo: `ECM ${ecmNoNum}`,
        serialNo: ecmNoNum,
        equipmentName: cleanText(row[1]),
        energyConsumptionShare: parsePercent(row[2]),
        title,
        projectTitle: title,
        rationaleForEnergySaving: cleanText(row[4]),
        savingPotentialRange: cleanText(row[5]),
        briefInformationAdvantages: cleanText(row[6]),
        projectActivities: cleanText(row[7]),
        baselineNotes: cleanText(row[8]),
        baselineKwhPerYearRaw: parseNumberOrNull(row[9]),
        savingPercentRaw: parsePercent(row[10]),
        energySavingRaw: energySavingRaw !== null ? Number(energySavingRaw.toFixed(0)) : null,
        annualSavingRaw: annualSavingRaw !== null ? Number(annualSavingRaw.toFixed(0)) : null,
        investmentRaw: investmentRaw !== null ? Number(investmentRaw.toFixed(0)) : null,
        paybackMonthsRaw: paybackMonthsRaw !== null ? Number(paybackMonthsRaw.toFixed(2)) : null,
        paybackYearsRaw: paybackMonthsRaw !== null ? Number((paybackMonthsRaw / 12).toFixed(2)) : null,
        
        energySaving: formatKwh(energySavingRaw),
        annualSaving: formatInr(annualSavingRaw),
        investment: formatInr(investmentRaw),
        payback: paybackMonthsRaw !== null ? `${(paybackMonthsRaw/12).toFixed(2)} years` : null,
        
        system: classifySystem(ecmNoNum),
        groupNo: groupNo,
        groupTitle: groupTitle,
        hasExplicitEcmGrouping: hasExplicitEcmGrouping,
        
        sourceFile: fileName,
        sourceSheet: "ECM",
        sourceRow: i + 1,
        extractionFormat: "vr_chennai_ecm_sheet_v1",
        isFallback: false,
        fallbackGenerated: false
      });
    }
  }

  const hasExplicitEcmGrouping = projects.some(p => p.hasExplicitEcmGrouping);
  
  console.log("[ECM_GROUPING_DETECTION]", {
    sourceFile: fileName,
    headers,
    groupColumnDetected,
    groupColumnName,
    hasExplicitEcmGrouping
  });

  return { projects, hasExplicitEcmGrouping };
}

function extractBillEntry(sheet) {
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  
  const consumerName = cleanText(data[0]?.[1]); // B1
  const serviceNo = normalizeServiceNo(data[1]?.[1]); // B2
  const contractDemandKva = parseNumberOrNull(data[2]?.[1]); // B3
  const tariffCategory = cleanText(data[1]?.[4]); // E2
  const supplyVoltage = cleanText(data[2]?.[4]); // E3
  const billingDemandRule = cleanText(data[0]?.[8]); // I1
  
  const monthlyBills = [];

  // Monthly table starts row 4 (index 3)
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    let monthRaw = row[1]; // B
    if (!monthRaw) continue;
    
    // Handle JS Date object created by xlsx parser
    let monthStr = "";
    if (monthRaw instanceof Date) {
        monthStr = monthRaw.toLocaleString("en-US", { month: "short", year: "2-digit" });
    } else {
        monthStr = String(monthRaw).trim();
    }
    
    const lowerMonth = monthStr.toLowerCase();
    const isValidMonth = MONTHS.some(m => lowerMonth.includes(m));
    
    if (lowerMonth.includes("total") || lowerMonth === "month" || !isValidMonth) {
        // If we hit "Particular" or "Contract Demand" or "Total", we break if we already found bills
        if (monthlyBills.length >= 12 || lowerMonth.includes("particular") || lowerMonth.includes("contract demand")) {
            break;
        }
        continue;
    }
    
    const normalized = normalizeMonthlyBill({
      month: monthStr,
      recordedDemandKva: row[2],
      demandCharges: row[3],
      totalKwh: row[4],
      energyCharges: row[5],
      netAmountPayable: row[6],
      unitRate: row[7],
      sourceFile: "Bill Entry",
      serviceNo,
      tariffCategory,
      permittedMdKva: contractDemandKva,
      supplyVoltageKv: supplyVoltage,
      extractionConfidence: 1,
    });

    if (!isValidMonthlyBill(normalized)) continue;
    monthlyBills.push(normalized);
  }

  const annualKwh = monthlyBills.reduce((sum, bill) => sum + (bill.totalKwh || 0), 0);
  const annualEnergyCharges = monthlyBills.reduce((sum, bill) => sum + (bill.energyCharges || 0), 0);
  const annualNetPayable = monthlyBills.reduce((sum, bill) => sum + (bill.netAmountPayable || 0), 0);
  const demandValues = monthlyBills.map((bill) => bill.recordedDemandKva).filter((value) => value !== null && value !== undefined);
  const maxRecordedDemandKva = demandValues.reduce((max, value) => Math.max(max, value || 0), 0);

  return {
    consumerName,
    serviceNo,
    contractDemandKva,
    tariffCategory,
    supplyVoltage,
    billingDemandRule,
    monthlyBills,
    annualKwh,
    annualEnergyCharges,
    annualNetPayable,
    averageRecordedDemandKva: demandValues.length > 0 ? demandValues.reduce((sum, value) => sum + value, 0) / demandValues.length : null,
    maxRecordedDemandKva,
    averageTariff: annualKwh > 0 ? annualNetPayable / annualKwh : null
  };
}

function extractConnectedLoad(sheet) {
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const equipmentRows = [];
  const summaryByAssetType = {};
  let totalAnnualConsumption = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rawAssetType = cleanText(row[1]);
    if (!rawAssetType || rawAssetType.toLowerCase() === "asset type") continue;
    const assetType = normalizeAssetType(rawAssetType);
    
    const annualCons = parseNumberOrNull(row[9]) || 0;
    
    equipmentRows.push({
      assetType,
      assetName: cleanText(row[2]),
      floorCode: cleanText(row[3]),
      roomArea: cleanText(row[4]),
      actualKw: parseNumberOrNull(row[5]),
      operatingTime: parseNumberOrNull(row[6]),
      consumptionPerDay: parseNumberOrNull(row[7]),
      consumptionPerMonth: parseNumberOrNull(row[8]),
      consumptionPerYear: annualCons,
      sharePercent: parsePercent(row[10]),
      quantity: 1,
    });
    
    if (!summaryByAssetType[assetType]) {
      summaryByAssetType[assetType] = {
        assetType,
        quantity: 0,
        totalKw: 0,
        totalAnnualConsumption: 0,
      };
    }
    summaryByAssetType[assetType].quantity += 1;
    summaryByAssetType[assetType].totalKw += parseNumberOrNull(row[5]) || 0;
    summaryByAssetType[assetType].totalAnnualConsumption += annualCons;
    totalAnnualConsumption += annualCons;
  }
  
  const summaryArray = Object.values(summaryByAssetType)
    .map((item) => ({
      ...item,
      percentageShare: totalAnnualConsumption > 0 ? (item.totalAnnualConsumption / totalAnnualConsumption) * 100 : 0,
      remarks: `Qty ${item.quantity}`,
    }))
    .sort((a, b) => b.totalAnnualConsumption - a.totalAnnualConsumption);

  return {
    equipmentRows,
    summaryByAssetType: summaryArray,
    totalAnnualConsumption,
    majorSystems: summaryArray
  };
}

function extractCosting(workbook) {
   const costingRows = [];
   const blowerCostingRows = [];
   const matchedCostingByEcm = {};

   const costingSheet = workbook.Sheets["Costing"];
   if (costingSheet) {
      const rows = xlsx.utils.sheet_to_json(costingSheet, { header: 1, defval: "", blankrows: false });
      rows.slice(2).forEach((row) => {
         const item = cleanText(row[0]);
         if (!item) return;
         costingRows.push({
            sheet: "Costing",
            item,
            motorCost: parseNumberOrNull(row[1]),
            vfdCost: parseNumberOrNull(row[2]),
            automationCost: parseNumberOrNull(row[3]),
            installationCost: parseNumberOrNull(row[4]),
            purchasePrice: parseNumberOrNull(row[5]),
            totalCost: parseNumberOrNull(row[6]),
            implementationScope: item,
         });
      });
   }

   const blowerSheet = workbook.Sheets["Blower Costing"];
   if (blowerSheet) {
      const rows = xlsx.utils.sheet_to_json(blowerSheet, { header: 1, defval: "", blankrows: false });
      let currentSection = "";
      rows.forEach((row) => {
         const first = cleanText(row[0]);
         if (["AHU", "Air Washer", "HRW"].includes(first)) {
            currentSection = first;
            return;
         }
         if (!currentSection || !parseNumberOrNull(row[0])) return;

         blowerCostingRows.push({
            sheet: "Blower Costing",
            section: currentSection,
            cfm: parseNumberOrNull(row[1]),
            staticPressure: parseNumberOrNull(row[2]),
            fanModel: cleanText(row[3]),
            motorKw: parseNumberOrNull(row[4]),
            blowerCost: parseNumberOrNull(row[5]),
            motorCost: parseNumberOrNull(row[6]),
            vfdCost: parseNumberOrNull(row[7]),
            fabricationCost: parseNumberOrNull(row[8]),
            installationCost: parseNumberOrNull(row[9]),
            automationCost: parseNumberOrNull(row[10]),
            totalPurchaseCost: parseNumberOrNull(row[11]),
            totalSellingCost: parseNumberOrNull(row[12]),
            quantity: parseNumberOrNull(row[13]),
            totalCost: parseNumberOrNull(row[14]),
         });
      });
   }

   const findCostingRows = (predicate) => costingRows.filter(predicate);
   const findBlowerRows = (section) => blowerCostingRows.filter((row) => row.section === section);

   matchedCostingByEcm["ECM 6"] = findCostingRows((row) => row.item.toLowerCase().includes("condenser"));
   matchedCostingByEcm["ECM 7"] = findCostingRows((row) => row.item.toLowerCase().includes("pri"));
   matchedCostingByEcm["ECM 8"] = findCostingRows((row) => row.item.toLowerCase().includes("sec"));
   matchedCostingByEcm["ECM 9"] = findCostingRows((row) => row.item.toLowerCase().includes("air blower"));
   matchedCostingByEcm["ECM 10"] = findBlowerRows("AHU");
   matchedCostingByEcm["ECM 11"] = findBlowerRows("Air Washer");
   matchedCostingByEcm["ECM 12"] = findBlowerRows("HRW");

   Object.keys(matchedCostingByEcm).forEach((key) => {
      if (!matchedCostingByEcm[key]?.length) delete matchedCostingByEcm[key];
   });

   return { costingRows, blowerCostingRows, matchedCostingByEcm };
}

async function extractVrChennaiWorkbook(workbook, fileName, pdfFiles = [], baseStorageDir = '') {
  const ecmSheet = workbook.Sheets["ECM"];
  const billEntrySheet = workbook.Sheets["Bill Entry"];
  const connectedLoadSheet = workbook.Sheets["Connected Load List & Energy Ba"];
  
  const ecmResult = ecmSheet ? extractECM(ecmSheet, fileName) : { projects: [], hasExplicitEcmGrouping: false };
  const projects = ecmResult.projects;
  const hasExplicitEcmGrouping = ecmResult.hasExplicitEcmGrouping;
  const energyProfile = billEntrySheet ? extractBillEntry(billEntrySheet) : null;
  const connectedLoad = connectedLoadSheet ? extractConnectedLoad(connectedLoadSheet) : null;
  const costingData = extractCosting(workbook);
  
  let totalEnergySaving = 0;
  let totalAnnualSaving = 0;
  let zeroSavingProjects = 0;
  
  projects.forEach(p => {
    totalEnergySaving += p.energySavingRaw || 0;
    totalAnnualSaving += p.annualSavingRaw || 0;
    if (!p.energySavingRaw) zeroSavingProjects++;
  });

  const validationErrors = [];
  const validationWarnings = [];
  
  if (projects.length < 14) validationErrors.push(`Expected 14 ECMs, found ${projects.length}`);
  if (zeroSavingProjects > 0) validationErrors.push(`Found ${zeroSavingProjects} projects with 0 energy saving`);
  if (energyProfile && energyProfile.monthlyBills.length < 12) validationErrors.push("Bill Entry has less than 12 months");
  if (totalEnergySaving === 0) validationErrors.push("Total energy saving is 0");
  
  let pdfBillExtraction = { filesDetected: 0, filesParsed: 0, filesFailed: [], warnings: [], bills: [] };
  if (pdfFiles.length > 0) {
     const preparedFiles = pdfFiles
       .map((pdf) => {
         const candidate = pdf.location || pdf.path || path.join(baseStorageDir, pdf.filename || pdf.originalName || pdf.name);
         if (!candidate || !fs.existsSync(candidate)) return null;
         return {
           location: candidate,
           path: candidate,
           originalname: pdf.originalname || pdf.originalName || pdf.name,
           filename: pdf.filename || path.basename(candidate),
           name: pdf.name || path.basename(candidate),
         };
       })
       .filter(Boolean);
     pdfBillExtraction = await extractPdfBills(preparedFiles);

     const mismatchWarnings = [];
     for (const bill of pdfBillExtraction.bills) {
        const matchingMonth = (energyProfile?.monthlyBills || []).find((entry) => entry.billMonth === bill.billMonth && entry.billYear === bill.billYear);
        if (!matchingMonth) continue;

        if (matchingMonth.totalKwh && bill.totalKwh) {
           const diff = Math.abs(matchingMonth.totalKwh - bill.totalKwh) / matchingMonth.totalKwh;
           if (diff > 0.02) mismatchWarnings.push(`PDF mismatch for ${bill.monthLabel}: Excel kWh ${matchingMonth.totalKwh}, PDF ${bill.totalKwh}`);
        }
        if (matchingMonth.netAmountPayable && bill.netAmountPayable) {
           const diff = Math.abs(matchingMonth.netAmountPayable - bill.netAmountPayable) / matchingMonth.netAmountPayable;
           if (diff > 0.02) mismatchWarnings.push(`PDF mismatch for ${bill.monthLabel}: Excel Net ${matchingMonth.netAmountPayable}, PDF ${bill.netAmountPayable}`);
        }
     }
     validationWarnings.push(...mismatchWarnings, ...pdfBillExtraction.warnings);
  }
  
  return {
    extractionFormat: "vr_chennai_ecm_workbook_v1",
    projects,
    energyProfile,
    connectedLoad,
    costingData,
    costing: costingData,
    pdfBillExtraction,
    pdfBills: pdfBillExtraction.bills,
    validationErrors,
    validationWarnings,
    hasExplicitEcmGrouping,
    extractionDebug: {
       ecmCount: projects.length,
       totalEnergySaving,
       totalAnnualSaving,
       consumerName: energyProfile?.consumerName
    }
  };
}

module.exports = {
  extractVrChennaiWorkbook
};
