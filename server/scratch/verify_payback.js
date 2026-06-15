const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();

async function run() {
  const extractor = require('../services/lightweightExcelExtractor');
  const extractedDataContextService = require('../services/extractedDataContextService');
  const renderer = require('../services/vrChennaiClientReadyRenderer');
  
  const hotdir = path.join(__dirname, "../../collector/hotdir");
  const files = fs.readdirSync(hotdir).filter(f => f.endsWith(".xlsx"));
  if (files.length === 0) return console.log("No excel files found");
  const primaryFile = { filename: files[0], location: path.join(hotdir, files[0]), originalname: files[0] };
  
  // 1. Excel Cell Value
  const workbook = XLSX.readFile(primaryFile.location, { cellDates: true, sheetStubs: true });
  const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('ecm'));
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, {header: 1});
  const headerRowIndex = data.findIndex(row => row.some(cell => String(cell).toLowerCase().includes('payback')));
  const headerRow = data[headerRowIndex];
  const paybackColIndex = headerRow.findIndex(cell => String(cell).toLowerCase().includes('payback'));
  
  // 2. Extractor
  const extraction = extractor.extractLightweightExcelData([primaryFile], path.join(__dirname, "../../storage"));
  
  // 3. reports.js simulation mapping
  const clonedExtraction = JSON.parse(JSON.stringify(extraction.projects));
  clonedExtraction.forEach(p => {
    const p_months = p.paybackMonthsRaw ?? p.paybackRaw;
    p.payback = p_months != null ? `${(p_months/12).toFixed(2)} years` : p.payback ?? "N/A";
  });

  // 4. extractedDataContextService
  const context = extractedDataContextService.buildExtractedDataContext([primaryFile], { projects: clonedExtraction });
  
  // 5. DOCX Render model
  const docxModel = renderer.buildVrChennaiClientReadyModel({ projects: clonedExtraction }, context);
  
  console.log("=== FINAL VERIFICATION REPORT ===");
  console.log(`File: ${primaryFile.filename}`);
  console.log(`Column Header: "${headerRow[paybackColIndex]}"`);
  console.log("---------------------------------------------------------");

  let ecmCount = 0;
  for (let i = headerRowIndex + 1; i < data.length && ecmCount < 5; i++) {
    const row = data[i];
    if (!row[0]) continue;
    const ecmNo = row[0];
    const excelValue = row[paybackColIndex];
    
    const ecmExt = extraction.projects.find(p => p.ecmNo == ecmNo);
    const ecmPipe = clonedExtraction.find(p => p.ecmNo == ecmNo);
    const ecmCtx = context.ecmProjects.find(p => p.ecmNo == ecmNo);
    const ecmDocx = docxModel.ecmDetails.find(p => p.ecmNo == ecmNo);

    console.log(`ECM ${ecmNo}`);
    console.log(`  Excel Value: ${excelValue}`);
    console.log(`  Extractor Value:`);
    console.log(`    paybackRaw: ${ecmExt.paybackRaw}`);
    console.log(`    paybackMonthsRaw: ${ecmExt.paybackMonthsRaw}`);
    console.log(`  Pipeline Value (reports.js):`);
    console.log(`    payback: ${ecmPipe.payback}`);
    console.log(`  Context/Renderer Value:`);
    console.log(`    paybackMonthsRaw (Context): ${ecmCtx.paybackMonthsRaw}`);
    console.log(`  DOCX Value:`);
    console.log(`    paybackMonthsFormatted: ${ecmDocx.paybackMonthsFormatted}`);
    console.log(`    paybackYearsFormatted: ${ecmDocx.paybackYearsFormatted}`);
    console.log("---------------------------------------------------------");
    ecmCount++;
  }
}
run();
