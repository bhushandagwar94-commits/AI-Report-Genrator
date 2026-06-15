const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();

async function run() {
  const extractor = require('../services/lightweightExcelExtractor');
  const reports = require('../endpoints/reports');
  
  const hotdir = path.join(__dirname, "../../collector/hotdir");
  const files = fs.readdirSync(hotdir).filter(f => f.endsWith(".xlsx"));
  if (files.length === 0) return console.log("No excel files found");
  
  const primaryFile = { filename: files[0], location: path.join(hotdir, files[0]), originalname: files[0] };
  console.log("File:", primaryFile.filename);
  
  // 1. extraction
  const extraction = extractor.extractLightweightExcelData([primaryFile], path.join(__dirname, "../../storage"));
  
  const ecm1 = extraction.projects.find(p => p.ecmNo == 1);
  console.log("== 1. Lightweight Extractor ==");
  console.log({
    paybackRaw: ecm1.paybackRaw,
    payback: ecm1.payback,
    paybackMonthsRaw: ecm1.paybackMonthsRaw,
    simplePaybackPeriod: ecm1.simplePaybackPeriod
  });

  // 2. VR Chennai extraction
  const vrChennaiExtractor = require('../services/vrChennaiWorkbookExtractor');
  const workbook = XLSX.readFile(primaryFile.location, { cellDates: true, sheetStubs: true });
  const auxData = await vrChennaiExtractor.extractVrChennaiWorkbook(workbook, primaryFile.filename, [], path.dirname(primaryFile.location));
  const auxEcm1 = auxData.projects.find(p => p.ecmNo == 1);
  console.log("== 2. VR Chennai Aux Extractor ==");
  console.log({
    paybackRaw: auxEcm1.paybackRaw,
    payback: auxEcm1.payback,
    paybackMonthsRaw: auxEcm1.paybackMonthsRaw,
    paybackYearsRaw: auxEcm1.paybackYearsRaw
  });

  // 3. buildLightweightReportData mapping
  const buildLwData = require('../services/llmProviderService').buildCommercialBuildingEnergyAuditBaseData;
  const lwData = buildLwData(extraction.projects, { facilityName: "Test" });
  const p1_lw = lwData.projects.find(p => p.ecmNo == 1);
  console.log("== 3. buildLightweightReportData (if called) ==");
  console.log({
    paybackRaw: p1_lw.paybackRaw,
    payback: p1_lw.payback,
    paybackMonthsRaw: p1_lw.paybackMonthsRaw,
    simplePaybackPeriod: p1_lw.simplePaybackPeriod
  });

  // 4. VR Chennai mapping loop inside reports.js line 2614
  const clonedExtraction = JSON.parse(JSON.stringify(extraction.projects));
  clonedExtraction.forEach(p => {
    p.savingCalculation = `... payback of ${p.paybackMonthsRaw ? (p.paybackMonthsRaw/12).toFixed(2) : "N/A"} years.`;
    p.payback = p.paybackMonthsRaw ? `${(p.paybackMonthsRaw/12).toFixed(2)} years` : "N/A";
    p.simplePaybackPeriod = p.payback;
  });
  const p1_vr = clonedExtraction.find(p => p.ecmNo == 1);
  console.log("== 4. VR Chennai Mapping (reports.js line 2614) ==");
  console.log({
    paybackRaw: p1_vr.paybackRaw,
    payback: p1_vr.payback,
    paybackMonthsRaw: p1_vr.paybackMonthsRaw,
    simplePaybackPeriod: p1_vr.simplePaybackPeriod
  });

  // 5. Final DOCX renderer Context mapping
  const extractedDataContextService = require('../services/extractedDataContextService');
  const context = extractedDataContextService.buildExtractedDataContext([primaryFile], { projects: clonedExtraction });
  const ctxEcm1 = context.ecmProjects.find(p => p.ecmNo == 1);
  console.log("== 5. extractedDataContextService normalizeProject ==");
  console.log({
    paybackRaw: ctxEcm1.paybackRaw,
    payback: ctxEcm1.payback,
    paybackMonthsRaw: ctxEcm1.paybackMonthsRaw,
    paybackYearsRaw: ctxEcm1.paybackYearsRaw
  });
  
  // 6. DOCX Rendering vrChennaiClientReadyRenderer.js
  const renderer = require('../services/vrChennaiClientReadyRenderer');
  const docxModel = renderer.buildVrChennaiClientReadyModel({ projects: clonedExtraction }, context);
  const docxEcm1 = docxModel.ecmDetails.find(p => p.ecmNo == 1);
  console.log("== 6. vrChennaiClientReadyRenderer buildEcmDetail ==");
  console.log({
    paybackMonthsFormatted: docxEcm1.paybackMonthsFormatted,
    paybackYearsFormatted: docxEcm1.paybackYearsFormatted,
    energySavingCalculationRows: docxEcm1.energySavingCalculationRows.filter(r => r[0].includes("Payback"))
  });

}
run();
