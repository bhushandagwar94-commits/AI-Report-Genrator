const { extractLightweightExcelData } = require("./services/lightweightExcelExtractor");
const path = require("path");

const files = [{
  filename: "VR Chennai ECM Sheet.xlsx",
  location: path.join(__dirname, "../collector/hotdir/VR Chennai ECM Sheet.xlsx")
}];

const result = extractLightweightExcelData(files, __dirname);

console.log("Extracted projects:");
for (const p of result.projects || []) {
  console.log(`ECM ${p.ecmNo}: payback=${p.paybackRaw}, energySaving=${p.energySavingRaw}, annualSaving=${p.annualSavingRaw}, investment=${p.investmentRaw}`);
}
