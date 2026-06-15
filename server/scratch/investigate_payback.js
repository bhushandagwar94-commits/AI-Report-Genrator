const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

async function run() {
  const hotdir = path.join(__dirname, "../../collector/hotdir");
  const files = fs.readdirSync(hotdir).filter(f => f.endsWith(".xlsx"));
  if (files.length === 0) return console.log("No excel files found");
  
  const primaryFile = { filename: files[0], location: path.join(hotdir, files[0]), originalname: files[0] };
  console.log("=== 1. VERIFY EXCEL SOURCE ===");
  console.log("File:", primaryFile.filename);
  
  const workbook = XLSX.readFile(primaryFile.location, { cellDates: true, sheetStubs: true });
  const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('ecm'));
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, {header: 1});
  
  const headerRowIndex = data.findIndex(row => row.some(cell => String(cell).toLowerCase().includes('payback')));
  if (headerRowIndex !== -1) {
    const headerRow = data[headerRowIndex];
    const paybackColIndex = headerRow.findIndex(cell => String(cell).toLowerCase().includes('payback'));
    const investmentColIndex = headerRow.findIndex(cell => String(cell).toLowerCase().includes('investment'));
    const savingColIndex = headerRow.findIndex(cell => String(cell).toLowerCase().includes('saving') && !String(cell).toLowerCase().includes('kwh'));
    
    console.log(`Column Header: "${headerRow[paybackColIndex]}" (Index ${paybackColIndex})`);
    
    console.log("\nECM Data (1-5):");
    let ecmCount = 0;
    for (let i = headerRowIndex + 1; i < data.length && ecmCount < 5; i++) {
      const row = data[i];
      if (!row[0]) continue; // Skip if no ECM No
      
      const investment = row[investmentColIndex];
      const saving = row[savingColIndex];
      const rawPayback = row[paybackColIndex];
      const calcYears = investment / saving;
      const calcMonths = calcYears * 12;
      
      console.log(`ECM ${row[0]}:`);
      console.log(`  Raw Payback Cell: ${rawPayback}`);
      console.log(`  Calculated Years: ${calcYears.toFixed(4)}`);
      console.log(`  Calculated Months: ${calcMonths.toFixed(4)}`);
      console.log(`  Unit Shown in Workbook: ${Math.abs(rawPayback - calcYears) < 0.01 ? 'Years' : Math.abs(rawPayback - calcMonths) < 0.01 ? 'Months' : 'Unknown'}`);
      ecmCount++;
    }
  }
}

run();
