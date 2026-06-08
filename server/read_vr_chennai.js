const XLSX = require("xlsx");
const path = require("path");

const filePath = path.join(__dirname, "../collector/hotdir/VR Chennai ECM Sheet.xlsx");
const workbook = XLSX.readFile(filePath);
const worksheet = workbook.Sheets["ECM"];
const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", blankrows: false });
for (let i = 4; i < 30; i++) {
  const row = rows[i] || [];
  console.log(`Row ${i}: ECMNo=${row[0]}, Title=${String(row[3]).substring(0, 50)}`);
}
