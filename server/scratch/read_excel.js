const XLSX = require('xlsx');
const path = require('path');
const workbook = XLSX.readFile(path.join(__dirname, "../../collector/hotdir/VR Chennai ECM Sheet (1) EXPLE.xlsx"));
const sheet = workbook.Sheets['ECM'];
const data = XLSX.utils.sheet_to_json(sheet, {header: 1});
console.log("Header:", data[3][14]);
console.log("ECM 1:", data[4][14]);
console.log("ECM 1 Investment:", data[4][13]);
console.log("ECM 1 Savings:", data[4][12]);
