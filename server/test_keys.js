const { extractLightweightExcelData } = require("./services/lightweightExcelExtractor");
const path = require("path");

const files = [{
  filename: "VR Chennai ECM Sheet.xlsx",
  location: path.join(__dirname, "../collector/hotdir/VR Chennai ECM Sheet.xlsx")
}];

const result = extractLightweightExcelData(files, __dirname);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(project|ecm|measure)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

console.log("Checking ECM 10, 11, 12:");
for (const p of result.projects || []) {
  if (p.ecmNo >= 10 && p.ecmNo <= 12) {
    console.log(`ECM ${p.ecmNo}`);
    console.log(`  projectNo: ${p.projectNo}, ecmNo: ${p.ecmNo}`);
    const no = normalizeText(p.projectNo || p.ecmNo || "");
    const title = normalizeText(p.title);
    console.log(`  duplicateTitleKey: ${no}|${title}`);
    
    // stableKey
    const system = normalizeText(p.system || p.category || "");
    const equipment = normalizeText(p.equipmentCovered || p.equipment || "");
    const stableKey = [no, title, system || equipment].filter(Boolean).join("|");
    console.log(`  stableKey: ${stableKey}`);
  }
}
