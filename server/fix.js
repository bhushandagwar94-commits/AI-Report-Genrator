const fs = require('fs');
let code = fs.readFileSync('services/lightweightExcelExtractor.js', 'utf8');

const additions = `
function isMallProjectSummaryHeader(row = []) {
  const text = row.map((v) => String(v || "").toLowerCase().trim()).join(" | ");

  return (
    /\\bno\\.?\\b/.test(text) &&
    /project/.test(text) &&
    /annual\\s*kwh\\s*saving/.test(text) &&
    /annual\\s*saving/.test(text) &&
    /investment/.test(text) &&
    /payback/.test(text)
  );
}

function parseLakhToRupees(value) {
  const n = parseNumberOrNull(value);
  return n === null ? null : n * 100000;
}

function classifyMallProjectSystem(title = "", no = null) {
  const t = String(title || "").toLowerCase();

  if (/chiller|chw|cooling tower|condenser|chws|delta-t|tube cleaning|refrigerant/.test(t)) {
    return "Chiller Plant / Cooling System";
  }

  if (/secondary chw pump|primary chw pump|pump|dp reset|vfd tuning|flow optimization/.test(t)) {
    return "Pumping System";
  }

  if (/cooling tower fan|ct fan|fan staging/.test(t)) {
    return "Cooling Tower Fan System";
  }

  if (/setpoint|bms|dynamic/.test(t)) {
    return "BMS / Controls Optimization";
  }

  return "Energy Conservation Measure";
}

function classifyMallProjectGroup(project) {
  const title = String(project.title || "").toLowerCase();

  if (/chiller|cooling tower|condenser|tube cleaning|refrigerant|chws/.test(title)) {
    return {
      groupNo: "GR-1",
      groupName: "Chiller Plant and Cooling System Optimization"
    };
  }

  if (/pump|dp reset|vfd|flow/.test(title)) {
    return {
      groupNo: "GR-2",
      groupName: "Pumping and Flow Optimization"
    };
  }

  if (/bms|setpoint|controls/.test(title)) {
    return {
      groupNo: "GR-3",
      groupName: "BMS and Controls Optimization"
    };
  }

  return {
    groupNo: "GR-4",
    groupName: "Operational Energy Optimization"
  };
}

`;

code = code.replace('function parseNumberOrNull(value) {', additions + '\nfunction parseNumberOrNull(value) {');

const extraFieldSynonyms = `
const EXTRA_FIELD_SYNONYMS = {
  ecmNo: [
    "no.",
    "no",
    "sr no",
    "serial no",
    "project no",
    "project number"
  ],

  title: [
    "project",
    "project name",
    "energy saving project",
    "measure",
    "recommendation"
  ],

  energySaving: [
    "annual kwh saving",
    "annual energy saving",
    "kwh saving",
    "energy saving",
    "annual kwh"
  ],

  annualSaving: [
    "annual saving ₹ lakh",
    "annual saving lakh",
    "annual saving rs lakh",
    "annual saving",
    "annual cost saving",
    "cost saving"
  ],

  investment: [
    "investment ₹ lakh",
    "investment lakh",
    "investment rs lakh",
    "investment",
    "capex",
    "project cost"
  ],

  payback: [
    "payback yrs",
    "payback years",
    "payback",
    "simple payback"
  ],

  priority: [
    "priority"
  ],

  actions: [
    "main actions",
    "actions",
    "implementation actions"
  ],

  rationale: [
    "saving rationale",
    "rationale",
    "basis of saving"
  ],

  seasonalApplicability: [
    "seasonal applicability",
    "applicability",
    "season"
  ],

  boqRef: [
    "boq ref.",
    "boq ref",
    "boq reference"
  ]
};

// merge synonyms safely
Object.keys(EXTRA_FIELD_SYNONYMS).forEach((key) => {
  if (FIELD_SYNONYMS[key]) {
    FIELD_SYNONYMS[key] = [...new Set([...FIELD_SYNONYMS[key], ...EXTRA_FIELD_SYNONYMS[key]])];
  } else {
    FIELD_SYNONYMS[key] = EXTRA_FIELD_SYNONYMS[key];
  }
});

`;
code = code.replace('const KNOWN_MTL_BADDI_COLUMN_MAP = {', extraFieldSynonyms + 'const KNOWN_MTL_BADDI_COLUMN_MAP = {');

const newScoreSheetLogic = `
function scoreSheet(sheetName, rows = []) {
  let score = 0;
  const name = String(sheetName || "").toLowerCase();

  if (name.includes("project summary")) score += 1000;
  if (name.includes("project")) score += 300;
  if (name.includes("summary")) score += 300;
  if (name.includes("energy")) score += 100;
  if (name.includes("saving")) score += 100;

  const headerIndex = rows.findIndex((row) => isMallProjectSummaryHeader(row));
  if (headerIndex >= 0) {
    score += 2000;
    return {
      sheetName,
      score,
      bestHeaderRowIndex: headerIndex,
      validRows: rows.length - headerIndex - 1
    };
  }
`;
code = code.replace(/function scoreSheet\(sheetName, rows = \[\]\) \{\n  let score = 0;\n  const name = String\(sheetName \|\| ""\)\.toLowerCase\(\);\n/, newScoreSheetLogic);

const buildProjectsReplacement = `
  const headerRow = bestSheet.rows[headerRowIndex] || [];
  let columnMap = {};
  let isMallSummary = false;

  if (isMallProjectSummaryHeader(headerRow)) {
    isMallSummary = true;
    columnMap = {
      ecmNo: { columnIndex: 0, column: "A", header: "No." },
      title: { columnIndex: 1, column: "B", header: "Project" },
      seasonalApplicability: { columnIndex: 2, column: "C", header: "Seasonal applicability" },
      rationale: { columnIndex: 3, column: "D", header: "Saving rationale" },
      grossKwSavingSummer: { columnIndex: 4, column: "E", header: "Gross kW saving during 3-chiller months" },
      grossKwSavingWinter: { columnIndex: 5, column: "F", header: "Gross kW saving during 2-chiller months" },
      energySaving: { columnIndex: 6, column: "G", header: "Annual kWh saving" },
      annualSaving: { columnIndex: 7, column: "H", header: "Annual saving ₹ lakh" },
      investment: { columnIndex: 8, column: "I", header: "Investment ₹ lakh" },
      payback: { columnIndex: 9, column: "J", header: "Payback yrs" },
      priority: { columnIndex: 10, column: "K", header: "Priority" },
      actions: { columnIndex: 11, column: "L", header: "Main actions" },
      boqRef: { columnIndex: 12, column: "M", header: "BOQ ref." }
    };
    console.log("[MALL_PROJECT_SUMMARY_FORMAT_DETECTED]", {
      sheetName: bestSheet.sheetName,
      headerRowIndex,
      columnMap
    });
  } else if (shouldForceKnownColumnMap(primaryFileName, headerRow)) {
`;
code = code.replace('  const headerRow = bestSheet.rows[headerRowIndex] || [];\n  let columnMap = {};\n\n  if (shouldForceKnownColumnMap(primaryFileName, headerRow)) {', buildProjectsReplacement);

const projectLoopReplacement = `
  const projects = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < bestSheet.rows.length; rowIndex += 1) {
    const row = bestSheet.rows[rowIndex];
    if (!row || !row.some((cell) => String(cell || "").trim())) continue;
    
    if (isMallSummary) {
      const no = parseNumberOrNull(row[0]);
      const title = String(row[1] || "").trim();

      if (!no || !title) continue;
      if (title.toLowerCase().includes("total")) continue;

      const project = {
        ecmNo: \`ECM \${no}\`,
        title,
        projectTitle: title,

        system: classifyMallProjectSystem(title, no),

        seasonalApplicability: row[2] || "",
        savingRationale: row[3] || "",
        grossKwSavingSummer: parseNumberOrNull(row[4]),
        grossKwSavingWinter: parseNumberOrNull(row[5]),

        energySavingRaw: parseNumberOrNull(row[6]),
        annualSavingRaw: parseLakhToRupees(row[7]),
        investmentRaw: parseLakhToRupees(row[8]),
        paybackRaw: parseNumberOrNull(row[9]),

        energySaving: formatEnergy(parseNumberOrNull(row[6])),
        annualSaving: formatMoney(parseLakhToRupees(row[7])),
        investment: formatMoney(parseLakhToRupees(row[8])),
        payback: formatPayback(parseNumberOrNull(row[9])),

        priority: row[10] || "",
        mainActions: row[11] || "",
        boqRef: row[12] || "",

        sourceFile: primaryFile.originalname || primaryFile.filename,
        sourceSheet: bestSheet.sheetName,
        sourceRow: headerRowIndex + 1 + rowIndex - headerRowIndex,

        extractionConfidence: 0.95,
        extractionFormat: "mall_project_summary_v1",
        fallbackGenerated: false,
        isFallback: false,
        sourceType: "deterministic_excel_extraction",

        fieldSources: {
          ecmNo: { column: "A", rawValue: row[0], sourceType: "excel_cell" },
          title: { column: "B", rawValue: row[1], sourceType: "excel_cell" },
          energySaving: { column: "G", rawValue: row[6], sourceType: "excel_cell" },
          annualSaving: { column: "H", rawValue: row[7], sourceType: "excel_cell_lakh_to_rupees" },
          investment: { column: "I", rawValue: row[8], sourceType: "excel_cell_lakh_to_rupees" },
          payback: { column: "J", rawValue: row[9], sourceType: "excel_cell" }
        }
      };
      projects.push(project);
    } else {
      if (!isLikelyProjectRow(row, columnMap)) continue;

      const project = buildProjectFromRow({
        row,
        rowIndex: rowIndex + 1,
        columnMap,
        fileName: primaryFileName,
        sheetName: bestSheet.sheetName,
      });

      if (!project.title) continue;
      if (/^(total|subtotal|summary)$/i.test(project.title)) continue;
      projects.push(project);
    }
  }
  
  if (isMallSummary) {
    let standaloneEnergySaving = null;
    let standaloneAnnualSaving = null;
    let totalInvestment = null;
    let standalonePayback = null;
    let bundledEnergySaving = null;
    let bundledAnnualSaving = null;
    let bundledPayback = null;

    bestSheet.rows.slice(0, headerRowIndex).forEach(row => {
      const text = row.map(c => String(c||"").trim().toLowerCase()).join(" ");
      if (text.includes("standalone annual energy saving")) standaloneEnergySaving = parseNumberOrNull(row.find(v => parseNumberOrNull(v) !== null) || text.replace(/[^0-9.]/g, ""));
      if (text.includes("standalone annual saving")) standaloneAnnualSaving = parseLakhToRupees(row.find(v => parseNumberOrNull(v) !== null) || text.replace(/[^0-9.]/g, ""));
      if (text.includes("total indicative investment")) totalInvestment = parseLakhToRupees(row.find(v => parseNumberOrNull(v) !== null) || text.replace(/[^0-9.]/g, ""));
      if (text.includes("standalone simple payback")) standalonePayback = parseNumberOrNull(row.find(v => parseNumberOrNull(v) !== null) || text.replace(/[^0-9.]/g, ""));
      
      if (text.includes("bundled annual energy saving")) bundledEnergySaving = parseNumberOrNull(row.find(v => parseNumberOrNull(v) !== null) || text.replace(/[^0-9.]/g, ""));
      if (text.includes("bundled annual saving") && !text.includes("energy")) bundledAnnualSaving = parseLakhToRupees(row.find(v => parseNumberOrNull(v) !== null) || text.replace(/[^0-9.]/g, ""));
      if (text.includes("bundled simple payback")) bundledPayback = parseNumberOrNull(row.find(v => parseNumberOrNull(v) !== null) || text.replace(/[^0-9.]/g, ""));
    });

    extractionDebug.mallSummary = {
      standaloneEnergySaving,
      standaloneAnnualSaving,
      totalInvestment,
      standalonePayback,
      bundledEnergySaving,
      bundledAnnualSaving,
      bundledPayback
    };
  }
`;
code = code.replace(/  const projects = \[\];\n  for \(let rowIndex = headerRowIndex \+ 1; rowIndex < bestSheet\.rows\.length; rowIndex \+= 1\) \{[\s\S]*?projects\.push\(project\);\n  \}/, projectLoopReplacement);

fs.writeFileSync('services/lightweightExcelExtractor.js', code);

let pcode = fs.readFileSync('services/projectQualityFilter.js', 'utf8');
pcode = pcode.replace('function looksLikeFallbackEquipmentRow(project = {}) {', 'function looksLikeFallbackEquipmentRow(project = {}) {\n  if (project.extractionFormat === "mall_project_summary_v1") { return false; }');
fs.writeFileSync('services/projectQualityFilter.js', pcode);

console.log("Done");
