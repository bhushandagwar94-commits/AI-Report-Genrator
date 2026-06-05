const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const { extractBillFromPdf } = require("./electricityBillPdfExtractorService");

function parseNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    // Check if it's already a decimal representation of percentage
    return value;
  }
  const str = String(value);
  const num = parseNumberOrNull(str);
  if (num === null) return null;
  if (str.includes("%")) return num; 
  return num > 1 ? num / 100 : num; // If > 1, assume it's like "15" for 15%. If <= 1, it's "0.15" for 15%.
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

function classifyGroup(ecmNo) {
  if (ecmNo === 1) return { groupNo: "GR-1", groupTitle: "Electrical Billing and Demand Optimization" };
  if ([2, 3, 4, 5, 18].includes(ecmNo)) return { groupNo: "GR-2", groupTitle: "Chiller Plant and Cooling Tower Optimization" };
  if ([6, 7, 8].includes(ecmNo)) return { groupNo: "GR-3", groupTitle: "Pumping System Optimization" };
  if ([9, 10, 11, 12, 13].includes(ecmNo)) return { groupNo: "GR-4", groupTitle: "Air Handling, Ventilation and Blower Optimization" };
  return { groupNo: "GR-5", groupTitle: "Other Optimizations" };
}

function extractECM(sheet, fileName) {
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const projects = [];
  
  // Data starts at row 5 (index 4)
  for (let i = 4; i < data.length; i++) {
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
      
      const groupInfo = classifyGroup(ecmNoNum);
      
      projects.push({
        ecmNo: `ECM ${ecmNoNum}`,
        serialNo: ecmNoNum,
        equipmentName: String(row[1] || "").trim(),
        energyConsumptionShare: parsePercent(row[2]),
        title,
        projectTitle: title,
        rationaleForEnergySaving: String(row[4] || "").trim(),
        savingPotentialRange: String(row[5] || "").trim(),
        briefInformationAdvantages: String(row[6] || "").trim(),
        projectActivities: String(row[7] || "").trim(),
        baselineNotes: String(row[8] || "").trim(),
        baselineKwhPerYearRaw: parseNumberOrNull(row[9]),
        savingPercentRaw: parsePercent(row[10]),
        energySavingRaw,
        annualSavingRaw,
        investmentRaw,
        paybackMonthsRaw,
        paybackYearsRaw: paybackMonthsRaw !== null ? paybackMonthsRaw / 12 : null,
        
        energySaving: formatKwh(energySavingRaw),
        annualSaving: formatInr(annualSavingRaw),
        investment: formatInr(investmentRaw),
        payback: paybackMonthsRaw !== null ? `${(paybackMonthsRaw/12).toFixed(2)} years` : null,
        
        system: classifySystem(ecmNoNum),
        groupNo: groupInfo.groupNo,
        groupTitle: groupInfo.groupTitle,
        
        sourceFile: fileName,
        sourceSheet: "ECM",
        sourceRow: i + 1,
        extractionFormat: "vr_chennai_ecm_sheet_v1",
        isFallback: false,
        fallbackGenerated: false
      });
    }
  }
  return projects;
}

function extractBillEntry(sheet) {
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  
  const consumerName = String(data[0]?.[1] || ""); // B1
  const serviceNo = String(data[1]?.[1] || ""); // B2
  const contractDemandKva = parseNumberOrNull(data[2]?.[1]); // B3
  const tariffCategory = String(data[1]?.[4] || ""); // E2
  const supplyVoltage = String(data[2]?.[4] || ""); // E3
  const billingDemandRule = String(data[0]?.[8] || ""); // I1
  
  const monthlyBills = [];
  let annualKwh = 0;
  let annualEnergyCharges = 0;
  let annualNetPayable = 0;
  let totalRecordedDemand = 0;
  let maxRecordedDemandKva = 0;
  let validMonths = 0;

  // Monthly table starts row 4 (index 3)
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    const month = String(row[1] || "").trim(); // B
    if (!month || month.toLowerCase().includes("total") || month.toLowerCase() === "month") continue;
    
    const kwh = parseNumberOrNull(row[4]); // E
    const net = parseNumberOrNull(row[6]); // G
    if (kwh === null && net === null) continue;
    
    const demand = parseNumberOrNull(row[2]); // C
    const demandCharges = parseNumberOrNull(row[3]); // D
    const energyCharges = parseNumberOrNull(row[5]); // F
    const unitRate = parseNumberOrNull(row[7]); // H
    
    monthlyBills.push({
      month,
      recordedDemandKva: demand,
      demandCharges,
      kwhConsumption: kwh,
      energyCharges,
      netAmountPayable: net,
      unitRate
    });
    
    annualKwh += kwh || 0;
    annualEnergyCharges += energyCharges || 0;
    annualNetPayable += net || 0;
    
    if (demand !== null) {
        totalRecordedDemand += demand;
        validMonths++;
        if (demand > maxRecordedDemandKva) maxRecordedDemandKva = demand;
    }
  }

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
    averageRecordedDemandKva: validMonths > 0 ? totalRecordedDemand / validMonths : null,
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
    const assetType = String(row[1] || "").trim();
    if (!assetType || assetType.toLowerCase() === "asset type") continue;
    
    const annualCons = parseNumberOrNull(row[9]) || 0;
    
    equipmentRows.push({
      assetType,
      assetName: String(row[2] || "").trim(),
      floorCode: String(row[3] || "").trim(),
      roomArea: String(row[4] || "").trim(),
      actualKw: parseNumberOrNull(row[5]),
      operatingTime: parseNumberOrNull(row[6]),
      consumptionPerDay: parseNumberOrNull(row[7]),
      consumptionPerMonth: parseNumberOrNull(row[8]),
      consumptionPerYear: annualCons,
      share: parsePercent(row[10])
    });
    
    if (!summaryByAssetType[assetType]) {
      summaryByAssetType[assetType] = 0;
    }
    summaryByAssetType[assetType] += annualCons;
    totalAnnualConsumption += annualCons;
  }
  
  const majorEnergyConsumingSystems = Object.entries(summaryByAssetType)
    .map(([type, cons]) => ({ system: type, annualConsumption: cons }))
    .sort((a,b) => b.annualConsumption - a.annualConsumption);

  return {
    equipmentRows,
    summaryByAssetType,
    totalAnnualConsumption,
    majorEnergyConsumingSystems
  };
}

function extractCosting(workbook) {
   // Optional costing extractors as per requirements
   // Kept minimal for now to prevent bloating, maps easily in pipeline.
   return {};
}

async function extractVrChennaiWorkbook(workbook, fileName, pdfFiles = [], baseStorageDir = '') {
  const ecmSheet = workbook.Sheets["ECM"];
  const billEntrySheet = workbook.Sheets["Bill Entry"];
  const connectedLoadSheet = workbook.Sheets["Connected Load List & Energy Ba"];
  
  const projects = ecmSheet ? extractECM(ecmSheet, fileName) : [];
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
  
  const pdfExtractionResults = [];
  if (pdfFiles.length > 0 && energyProfile) {
     for (const pdf of pdfFiles) {
        const filePath = path.join(baseStorageDir, pdf.filename || pdf.originalName || pdf.name);
        if (fs.existsSync(filePath)) {
           const res = await extractBillFromPdf(filePath, pdf.originalName);
           pdfExtractionResults.push(res);
        }
     }
     
     // Validate against Bill Entry
     let mismatchWarnings = [];
     for (const res of pdfExtractionResults) {
        if (!res.success) continue;
        const matchingMonth = energyProfile.monthlyBills.find(m => m.month.toLowerCase().includes(res.billMonth?.split(' ')[0]?.toLowerCase() || 'none'));
        
        if (matchingMonth && res.kwh) {
            const diff = Math.abs(matchingMonth.kwhConsumption - res.kwh) / (matchingMonth.kwhConsumption || 1);
            if (diff > 0.02) {
               mismatchWarnings.push(`PDF mismatch for ${res.billMonth}: Excel kWh ${matchingMonth.kwhConsumption}, PDF ${res.kwh}`);
            }
        }
        if (matchingMonth && res.netAmountPayable) {
            const diff = Math.abs(matchingMonth.netAmountPayable - res.netAmountPayable) / (matchingMonth.netAmountPayable || 1);
            if (diff > 0.02) {
               mismatchWarnings.push(`PDF mismatch for ${res.billMonth}: Excel Net ${matchingMonth.netAmountPayable}, PDF ${res.netAmountPayable}`);
            }
        }
     }
     validationWarnings.push(...mismatchWarnings);
  }
  
  return {
    extractionFormat: "vr_chennai_ecm_workbook_v1",
    projects,
    energyProfile,
    connectedLoad,
    costingData,
    validationErrors,
    validationWarnings,
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
