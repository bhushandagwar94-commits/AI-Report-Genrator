const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  PageBreak,
} = require("docx");
const { asArray, normalizeReportForExport } = require("./llmProviderService");

function safeText(value) {
  if (value === null || value === undefined || value === "") return "";
  if (["string", "number", "boolean"].includes(typeof value)) {
    const s = String(value).trim();
    if (/^(data required|null|undefined|\[draft.*?\])$/i.test(s)) return "";
    return s;
  }
  if (typeof value === "object") {
    if (value.value !== undefined) return safeText(value.value);
    if (value.text !== undefined) return safeText(value.text);
    if (value.label !== undefined) return safeText(value.label);
    if (value.result !== undefined) return safeText(value.result);
    if (value.amount !== undefined && value.unit !== undefined) return `${value.amount} ${value.unit}`;
  }
  return "";
}

function displayText(value, placeholder = "") {
  const text = safeText(value).trim();
  return text ? text : placeholder;
}

function formatINR(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(String(value).replace(/[^\d.-]/g, ""));
  if (Number.isFinite(num)) {
    return `₹${Math.round(num).toLocaleString("en-IN")}`;
  }
  return displayText(value) || "";
}

function formatNumber(value, maxDecimals = 0) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(String(value).replace(/[^\d.-]/g, ""));
  if (Number.isFinite(num)) {
    return num.toLocaleString("en-IN", { maximumFractionDigits: maxDecimals });
  }
  return displayText(value);
}

function numberFrom(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const num = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function totalInvestment(projects = []) {
  return asArray(projects).reduce((sum, project) => sum + numberFrom(project.estimatedInvestment), 0);
}

function totalSavings(projects = []) {
  return asArray(projects).reduce((sum, project) => sum + numberFrom(project.expectedAnnualCostSaving), 0);
}

function totalEnergy(projects = []) {
  return asArray(projects).reduce((sum, project) => sum + numberFrom(project.expectedEnergySaving), 0);
}

function weightedPayback(projects = []) {
  const investment = totalInvestment(projects);
  const saving = totalSavings(projects);
  return investment && saving ? (investment / saving).toFixed(2) : "";
}

function removeDuplicateGroupNo(title, groupNo) {
  const rawTitle = displayText(title);
  if (!rawTitle) return "";
  const escaped = groupNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return rawTitle.replace(new RegExp(`^${escaped}[\\s:.-]*`, "i"), "").trim();
}

function formatGroupHeading(group, index) {
  const groupNo = displayText(group.groupNo) || `GR-${index + 1}`;
  const cleanTitle = removeDuplicateGroupNo(group.groupTitle, groupNo);
  return cleanTitle ? `${groupNo} ${cleanTitle}` : `${groupNo}`;
}

function getEcmNumberVal(valueOrProject) {
  if (valueOrProject && typeof valueOrProject === "object") {
    return displayText(valueOrProject.ecmNo) || displayText(valueOrProject.projectNumber) || displayText(valueOrProject.projectNo) || "";
  }
  return valueOrProject;
}

function formatEcmNumber(valueOrProject) {
  const raw = String(getEcmNumberVal(valueOrProject) ?? "").trim();
  if (!raw || raw === "[To be updated after site data verification]") return "";
  const match = raw.match(/\d+/);
  if (!match) return "ECM";
  return `ECM ${match[0]}`;
}

function classifyEcmType(ecm) {
  const title = String(ecm.projectTitle || ecm.title || ecm.ecmName || "").toLowerCase();
  if (title.includes("heat recovery") || title.includes("exhaust heat")) return "heat_recovery";
  if (title.includes("insulation") || title.includes("hot duct")) return "thermal_insulation";
  if (title.includes("ir heater") || title.includes("band heater") || title.includes("barrel heating")) return "ir_heater_retrofit";
  if (title.includes("servo") || title.includes("hydraulic")) return "servo_hydraulic_retrofit";
  if (title.includes("compressed air") || title.includes("booster compressor") || title.includes("air compressor")) return "compressed_air_management";
  if (title.includes("apfc") || title.includes("power factor") || title.includes("kvar")) return "apfc_power_factor_correction";
  if (title.includes("ahu") || title.includes("plug fan")) return "ahu_plug_fan_optimization";
  if (title.includes("chiller") || title.includes("cooling") || title.includes("chw") || title.includes("ct water") || title.includes("primary pump") || title.includes("secondary pump") || title.includes("ct segregation")) return "cooling_system_optimization";
  if (title.includes("ie5") || title.includes("motor retrofit") || title.includes("pmsm")) return "motor_retrofit_ie5";
  return "general";
}

function sanitizePromptLeakageText(text, ecmType) {
  let safe = String(text || "").trim();
  safe = safe.replace(/explain\s+cooling[^.]*\.?/gi, "");
  safe = safe.replace(/explain\s+hydraulic[^.]*\.?/gi, "");
  safe = safe.replace(/explain\s+thermal[^.]*\.?/gi, "");
  safe = safe.replace(/explain\s+compressed\s+air[^.]*\.?/gi, "");
  safe = safe.replace(/explain\s+motor\s+efficiency[^.]*\.?/gi, "");
  safe = safe.replace(/explain\s+power\s+factor[^.]*\.?/gi, "");
  safe = safe.replace(/explain\s+heat\s+recovery[^.]*\.?/gi, "");
  safe = safe.replace(/explain\s+insulation[^.]*\.?/gi, "");
  safe = safe.replace(/explain\s+servo[^.]*\.?/gi, "");
  safe = safe.replace(/explain\s+apfc[^.]*\.?/gi, "");
  safe = safe.replace(/explain\s+motor[^.]*\.?/gi, "");
  safe = safe.replace(/data\s+required[^.]*\.?/gi, "");
  safe = safe.replace(/\[draft\]?/gi, "");
  safe = safe.replace(/undefined/gi, "");
  safe = safe.replace(/null/gi, "");
  safe = safe.replace(/ecm\s+ecm/gi, "ECM");
  safe = safe.trim();

  if (!safe || safe === "[To be updated after site data verification]") {
    if (ecmType === "cooling_system_optimization") safe = "The existing cooling system includes equipment operating under conditions where flow, temperature differential, and load variation require verification for optimized energy performance.";
    else if (ecmType === "heat_recovery") safe = "The existing dryer system rejects usable heat through exhaust air, while incoming regeneration air continues to require primary heating energy.";
    else if (ecmType === "thermal_insulation") safe = "The existing hot duct surfaces are exposed or inadequately insulated, resulting in avoidable heat loss to the surrounding area.";
    else if (ecmType === "servo_hydraulic_retrofit") safe = "The existing hydraulic machine drive arrangement operates with energy consumption during idle and part-load portions of the machine cycle.";
    else if (ecmType === "compressed_air_management") safe = "The compressed air system requires measurement of pressure, flow, leakage, and compressor loading pattern to identify avoidable generation losses.";
    else if (ecmType === "apfc_power_factor_correction") safe = "The electrical system requires effective reactive power compensation to maintain power factor and reduce kVA/kVAh-related billing impact.";
    else if (ecmType === "ir_heater_retrofit") safe = "The existing band heating system operates with high surface temperatures, leading to convective heat losses to the ambient environment.";
    else if (ecmType === "ahu_plug_fan_optimization") safe = "The existing air handling system operates with conventional fan and drive arrangements, presenting opportunities for flow optimization and efficiency upgrades.";
    else if (ecmType === "motor_retrofit_ie5") safe = "The existing driven equipment is operated by standard-efficiency motors, resulting in higher power consumption for the given mechanical load.";
    else safe = "The existing system operates under baseline conditions that present measurable opportunities for energy performance optimization.";
  }
  return safe;
}

function buildProjectSummaryRows(ecm, cleanTitle, ecmNo) {
  return [
    { particular: "Project title", value: cleanTitle },
    { particular: "Project number", value: ecmNo || "" },
    { particular: "System", value: safeText(ecm.system) || safeText(ecm.category) || "[To be updated after site data verification]" },
    { particular: "Location", value: safeText(ecm.location) || "[To be updated after site data verification]" },
    { particular: "Equipment covered", value: safeText(ecm.equipmentCovered) || safeText(ecm.equipment) || "[To be updated after site data verification]" },
    { particular: "Existing operating condition", value: sanitizePromptLeakageText(safeText(ecm.existingSystemDescription) || safeText(ecm.existingOperatingCondition), classifyEcmType(ecm)) },
    { particular: "Proposed intervention", value: sanitizePromptLeakageText(safeText(ecm.proposedProjectDescription) || safeText(ecm.proposedIntervention), classifyEcmType(ecm)) },
    { particular: "Expected energy saving", value: safeText(ecm.expectedEnergySaving) ? `${formatNumber(ecm.expectedEnergySaving)} kWh/year` : "[Calculation pending]" },
    { particular: "Expected annual cost saving", value: safeText(ecm.expectedAnnualCostSaving) ? formatINR(ecm.expectedAnnualCostSaving) : "[Calculation pending]" },
    { particular: "Estimated investment", value: safeText(ecm.estimatedInvestment) ? formatINR(ecm.estimatedInvestment) : "[Calculation pending]" },
    { particular: "Simple payback period", value: safeText(ecm.simplePaybackPeriod) ? `${formatNumber(ecm.simplePaybackPeriod, 2)} years` : "[Calculation pending]" },
    { particular: "Implementation duration", value: safeText(ecm.implementationDuration) || "[To be updated after site data verification]" },
    { particular: "Implementation priority", value: safeText(ecm.priority) || safeText(ecm.implementationPriority) || "[To be updated after site data verification]" }
  ];
}

function buildBaselineDataRows(ecm) {
  let rows = ecm.baselineData || [];
  if (rows.length < 3) {
    rows = [
      { parameter: "Equipment rating", unit: "kW / TR / HP", value: "[To be updated after site data verification]" },
      { parameter: "Quantity", unit: "Nos.", value: "[To be updated after site data verification]" },
      { parameter: "Operating hours", unit: "hours/day", value: "[To be updated after site data verification]" },
      { parameter: "Operating days", unit: "days/year", value: "[To be updated after site data verification]" },
      { parameter: "Existing power consumption", unit: "kW", value: "[To be updated after site data verification]" },
      { parameter: "Annual operating hours", unit: "hours/year", value: "[To be updated after site data verification]" },
      { parameter: "Baseline annual consumption", unit: "kWh/year", value: safeText(ecm.baselineConsumption) || "[To be updated after site data verification]" },
      { parameter: "Average tariff", unit: "₹/kWh", value: "[To be updated after site data verification]" },
      { parameter: "Baseline annual energy cost", unit: "₹/year", value: "[To be updated after site data verification]" }
    ];
  }
  return rows;
}

function buildMeasurementRows(ecm) {
  let rows = ecm.baselineMeasurements || [];
  if (rows.length < 3) {
    rows = [
      { measurement: "Voltage", unit: "V", value: "[To be updated after site data verification]" },
      { measurement: "Current", unit: "A", value: "[To be updated after site data verification]" },
      { measurement: "Power factor", unit: "-", value: "[To be updated after site data verification]" },
      { measurement: "Measured power", unit: "kW", value: "[To be updated after site data verification]" },
      { measurement: "Flow / airflow", unit: "m3/hr / CFM", value: "[To be updated after site data verification]" },
      { measurement: "Pressure / head / static pressure", unit: "m / mmWC / bar", value: "[To be updated after site data verification]" },
      { measurement: "Temperature inlet", unit: "°C", value: "[To be updated after site data verification]" },
      { measurement: "Temperature outlet", unit: "°C", value: "[To be updated after site data verification]" },
      { measurement: "Operating frequency", unit: "Hz", value: "[To be updated after site data verification]" }
    ];
  }
  return rows;
}

function buildScopeOfWorkRows(ecmType, ecm) {
  let rows = ecm.scopeOfWork || ecm.scope || [];
  if (rows.length < 3) {
    rows = [
      { srNo: 1, scopeItem: "Detailed site measurement and final engineering" },
      { srNo: 2, scopeItem: "Supply of equipment / VFD / controller / motor / sensor / panel as applicable" },
      { srNo: 3, scopeItem: "Installation and integration with existing system" },
      { srNo: 4, scopeItem: "Cabling, piping or ducting modification, if required" },
      { srNo: 5, scopeItem: "Testing and commissioning" },
      { srNo: 6, scopeItem: "Performance monitoring" },
      { srNo: 7, scopeItem: "Operator training and handover" }
    ];
  }
  return rows;
}

function buildKeyActivityRows(ecmType, ecm) {
  let rows = ecm.keyActivities || ecm.keyActivitiesNarrative || ecm.activities || [];
  if (rows.length < 3) {
    rows = [
      { activity: "Site verification", details: "Confirm equipment rating, location and operating condition", responsibility: "SEE-Tech + Client" },
      { activity: "Design finalization", details: "Finalize technical specifications and control logic", responsibility: "SEE-Tech" },
      { activity: "Procurement", details: "Arrange equipment and accessories", responsibility: "SEE-Tech / Vendor" },
      { activity: "Installation", details: "Install system with minimum disturbance", responsibility: "SEE-Tech / Vendor" },
      { activity: "Integration", details: "Integrate with panel / BMS / controls", responsibility: "SEE-Tech" },
      { activity: "Trial run", details: "Operate under different load conditions", responsibility: "SEE-Tech + Client" },
      { activity: "Measurement", details: "Record before and after performance", responsibility: "SEE-Tech" },
      { activity: "Handover", details: "Submit performance report and train operators", responsibility: "SEE-Tech" }
    ];
  }
  return rows;
}

function buildEnergySavingCalculationRows(ecm) {
  let rows = ecm.energySavingCalculation || ecm.calculation || ecm.calculationBasis || ecm.assumptions || [];
  if (rows.length < 3) {
    rows = [
      { parameter: "Existing connected load / measured load", unit: "kW", value: "[To be updated after site data verification]" },
      { parameter: "Proposed load after project", unit: "kW", value: "[To be updated after site data verification]" },
      { parameter: "Load reduction", unit: "kW", value: "[To be updated after site data verification]" },
      { parameter: "Operating hours", unit: "hours/year", value: "[To be updated after site data verification]" },
      { parameter: "Annual energy saving", unit: "kWh/year", value: safeText(ecm.expectedEnergySaving) || safeText(ecm.energySaving) || "[Calculation pending]" },
      { parameter: "Average tariff", unit: "₹/kWh", value: "[To be updated after site data verification]" },
      { parameter: "Annual cost saving", unit: "₹/year", value: safeText(ecm.expectedAnnualCostSaving) || safeText(ecm.annualSaving) || "[Calculation pending]" },
      { parameter: "Estimated investment", unit: "₹", value: safeText(ecm.estimatedInvestment) || safeText(ecm.investment) || "[Calculation pending]" },
      { parameter: "Simple payback", unit: "years", value: safeText(ecm.simplePaybackPeriod) ? Number(ecm.simplePaybackPeriod).toFixed(2) : "[Calculation pending]" }
    ];
  }
  return rows;
}

function buildKeyMetricRows(ecm) {
  return [
    { srNo: 1, parameter: "Baseline consumption", value: safeText(ecm.baselineConsumption) || "[Calculation pending]" },
    { srNo: 2, parameter: "Energy saving", value: safeText(ecm.expectedEnergySaving) ? `${formatNumber(ecm.expectedEnergySaving)} kWh/year` : "[Calculation pending]" },
    { srNo: 3, parameter: "Percentage saving", value: safeText(ecm.percentSaving) ? `${formatNumber(ecm.percentSaving, 2)}%` : "[Calculation pending]" },
    { srNo: 4, parameter: "Cost saving", value: safeText(ecm.expectedAnnualCostSaving) ? formatINR(ecm.expectedAnnualCostSaving) : "[Calculation pending]" },
    { srNo: 5, parameter: "Estimated investment", value: safeText(ecm.estimatedInvestment) ? formatINR(ecm.estimatedInvestment) : "[Calculation pending]" },
    { srNo: 6, parameter: "Payback period", value: safeText(ecm.simplePaybackPeriod) ? `${formatNumber(ecm.simplePaybackPeriod, 2)} years` : "[Calculation pending]" },
    { srNo: 7, parameter: "CO2 reduction", value: safeText(ecm.co2ReductionPotential) ? `${formatNumber(ecm.co2ReductionPotential)} kgCO2/year` : "[Calculation pending]" }
  ];
}

function buildTechnicalSpecificationRows(ecmType, ecm) {
  let rows = ecm.technicalSpecificationTable || [];
  if (rows.length < 3) {
    rows = [
      { item: "Equipment / technology", specification: "[To be updated after site data verification]" },
      { item: "Capacity", specification: "[To be updated after site data verification]" },
      { item: "Quantity", specification: "[To be updated after site data verification]" },
      { item: "Motor efficiency class, if applicable", specification: "[To be updated after site data verification]" },
      { item: "VFD rating, if applicable", specification: "[To be updated after site data verification]" },
      { item: "Sensor type", specification: "[To be updated after site data verification]" },
      { item: "Controller / PLC / IoT system", specification: "[To be updated after site data verification]" },
      { item: "Communication", specification: "[To be updated after site data verification]" },
      { item: "Panel requirement", specification: "[To be updated after site data verification]" },
      { item: "Civil / mechanical modification", specification: "[To be updated after site data verification]" },
      { item: "Safety requirement", specification: "[To be updated after site data verification]" }
    ];
  }
  return rows;
}

function buildMvPlanRows(ecmType, ecm) {
  let rows = ecm.measurementVerificationPlan || ecm.mvPlan || ecm.measurementAndVerificationPlan || [];
  if (rows.length < 3) {
    rows = [
      { parameter: "Power consumption", baselineMeasurement: "kW before project", postImplementationMeasurement: "kW after project" },
      { parameter: "Operating hours", baselineMeasurement: "Existing operating schedule", postImplementationMeasurement: "Revised operating schedule" },
      { parameter: "Energy consumption", baselineMeasurement: "kWh/year baseline", postImplementationMeasurement: "kWh/year after project" },
      { parameter: "Performance parameter", baselineMeasurement: "ECM-type-specific parameter", postImplementationMeasurement: "Confirmed after commissioning" },
      { parameter: "Saving validation", baselineMeasurement: "Calculated from baseline", postImplementationMeasurement: "Verified from measured data" }
    ];
  }
  return rows;
}

function buildBenefitRows(ecmType, ecm) {
  let rows = ecm.benefitsOtherThanEnergySaving || ecm.benefits || ecm.otherBenefits || ecm.intangibleBenefits || [];
  if (rows.length < 3) {
    rows = [
      { benefit: "Reduced operating cost", description: "Lower electricity / fuel bill" },
      { benefit: "Improved reliability", description: "Better control and reduced stress on equipment" },
      { benefit: "Better comfort / process stability", description: "Stable process operation, comfort or utility performance" },
      { benefit: "Lower maintenance", description: "Reduced wear and tear" },
      { benefit: "Better monitoring", description: "Availability of performance data where monitoring is included" },
      { benefit: "Sustainability", description: "Reduction in CO2 emissions after verified saving" },
      { benefit: "Modernization", description: "Upgrade of old system with efficient technology" }
    ];
  }
  return rows;
}

function formatEcmHeading(sectionNumber, ecmNo, title) {
  const cleanEcmNo = formatEcmNumber(ecmNo);
  let cleanTitle = String(title ?? "").trim();
  cleanTitle = cleanTitle.replace(/^(ECM|Ecm|ecm)\s*\d*\s*[-–:]*\s*/i, '').trim();

  return cleanTitle
    ? `${sectionNumber} ${cleanEcmNo} – ${cleanTitle}`
    : `${sectionNumber} ${cleanEcmNo}`;
}

function heading1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 120, after: 60 } });
}

function heading2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 120, after: 60 } });
}

function heading3(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 120, after: 60 } });
}

function paragraph(text) {
  return new Paragraph({
    children: [new TextRun(safeText(text))],
    spacing: { before: 0, after: 60, line: 240, lineRule: "auto" },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function tocLine(text, indent = 0, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, bold })],
    indent: { left: indent * 360 },
    spacing: { after: 60 },
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function createTable(columns, rowsData) {
  const safeColumns = asArray(columns).length ? asArray(columns) : [{ key: "value", label: "Value" }];
  const rows = asArray(rowsData).length ? asArray(rowsData) : [{}];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: safeColumns.map((col) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: col.label, bold: true, color: "FFFFFF" })], spacing: { before: 0, after: 0 } })],
            shading: { fill: "09425D" },
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
          })
        ),
      }),
      ...rows.map((row, idx) => {
        const normalized = row && typeof row === "object" ? row : { value: safeText(row) };
        const fill = idx % 2 === 0 ? "EAF3F7" : "FFFFFF";
        return new TableRow({
          children: safeColumns.map((col) =>
            new TableCell({
              children: [new Paragraph({ text: safeText(normalized[col.key]), spacing: { before: 0, after: 0 } })],
              shading: { fill },
              margins: { top: 40, bottom: 40, left: 60, right: 60 },
            })
          ),
        });
      }),
    ],
  });
}

function keyValueTable(rowsData) {
  const rows = asArray(rowsData).length ? asArray(rowsData) : [{}];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, idx) => {
      const normalized = row && typeof row === "object" ? row : { label: "Value", value: safeText(row) };
      const keys = Object.keys(normalized);
      const labelKey = keys[0];
      const valueKey = keys[1] || keys[0];
      const fill = idx % 2 === 0 ? "EAF3F7" : "FFFFFF";
      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: safeText(normalized[labelKey]), bold: true, color: "09425D" })], spacing: { before: 0, after: 0 } })],
            shading: { fill },
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            width: { size: 32, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: safeText(normalized[valueKey]), spacing: { before: 0, after: 0 } })],
            shading: { fill },
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            width: { size: 68, type: WidthType.PERCENTAGE },
          }),
        ],
      });
    }),
  });
}

function generateCoverPage(info) {
  return [
    new Paragraph({ children: [new TextRun({ text: "SEE-Tech Solutions", bold: true, size: 36, color: "09425D" })], spacing: { after: 100 } }),
    new Paragraph({ children: [new TextRun({ text: "Commercial Building Energy Audit Report Format", size: 24, color: "5F6B76" })], spacing: { after: 1200 } }),
    new Paragraph({ children: [new TextRun({ text: safeText(info.reportTitle || "Detailed Energy Audit Report"), bold: true, size: 64, color: "09425D" })], spacing: { after: 400 } }),
    new Paragraph({ children: [new TextRun({ text: "Purpose: To identify implementable energy-saving projects with clear investment, savings, payback and execution roadmap.", size: 28, color: "18344A" })], spacing: { after: 800 } }),
    keyValueTable([
      { label: "Prepared For", value: info.clientName },
      { label: "Building Type", value: info.buildingType },
      { label: "Location", value: info.location },
      { label: "Audit Period", value: info.auditPeriod },
      { label: "Report Date", value: info.reportDate },
      { label: "Prepared By", value: info.preparedBy || "SEE-Tech Solutions" },
      { label: "Document Version", value: info.documentVersion },
    ]),
    pageBreak(),
  ];
}

function generateTableOfContents(groupedProjects) {
  const lines = [
    heading1("Table of Contents"),
    tocLine("Chapter 1. Executive Summary", 0, true),
    tocLine("1.1 Purpose of the Energy Audit", 1, false),
    tocLine("1.2 Overall Energy Saving Potential", 1, false),
    tocLine("1.3 Summary of Identified Energy Saving Projects", 1, false),
    tocLine("1.4 Project Grouping", 1, false),
    tocLine("1.5 Key Observations", 1, false),
    tocLine("1.6 Recommended Implementation Priority", 1, false),
    tocLine("1.7 Conclusion and Way Forward", 1, false),

    tocLine("Chapter 2. Plant / Building Details and Energy Profile", 0, true),
    tocLine("2.1 General Information", 1, false),
    tocLine("2.2 Building Operation Details", 1, false),
    tocLine("2.3 Utility and Energy Sources", 1, false),
    tocLine("2.4 Electrical Supply Details", 1, false),
    tocLine("2.5 Electricity Consumption and Billing Summary", 1, false),
    tocLine("2.6 Specific Energy Consumption Benchmark", 1, false),
    tocLine("2.7 Major Energy Consuming Systems", 1, false),
    tocLine("2.8 HVAC System Details", 1, false),
    tocLine("2.9 Lighting System Details", 1, false),
    tocLine("2.10 Pumps and Motors", 1, false),
    tocLine("2.11 Building Automation and Controls", 1, false),
    tocLine("2.12 Summary of Audit Observations", 1, false),

    tocLine("Chapter 3. Energy Saving Projects", 0, true),
  ];

  let globalEcmIndex = 0;
  asArray(groupedProjects).forEach((group, index) => {
    lines.push(tocLine(formatGroupHeading(group, index), 1, true));
    
    asArray(group.projects).forEach((project) => {
      globalEcmIndex++;
      const ecmTitleRaw = displayText(project.projectTitle) || displayText(project.title) || "ECM";
      const ecmNoRaw = getEcmNumberVal(project);
      const finalTitleString = formatEcmHeading(`3.${globalEcmIndex}`, ecmNoRaw, ecmTitleRaw);
      
      lines.push(tocLine(finalTitleString, 2, false));
    });
  });

  lines.push(tocLine("Chapter 4. Annexures", 0, true));
  lines.push(pageBreak());
  return lines;
}

function optionalTable(columns, rowsData, placeholder = "[To be updated after site data verification]") {
  const safeRows = asArray(rowsData).filter(row => {
    if (!row) return false;
    return Object.values(row).some(v => String(v || "").trim().length > 0 && !/^(data required|null|undefined|\[draft.*?\])$/i.test(String(v).trim()));
  });
  if (safeRows.length === 0) {
    return paragraph(placeholder);
  }
  return createTable(columns, safeRows);
}

function getPriorityLevel(project) {
  const pb = numberFrom(project.simplePaybackPeriod);
  if (pb > 0 && pb <= 1.5) return "High Priority";
  if (pb > 1.5 && pb <= 3.0) return "Medium Priority";
  if (pb > 3.0) return "Long-Term Priority";
  return "Medium Priority"; // Default
}

function generateExecutiveSummary(report, projects, groupedProjects) {
  const es = report.executiveSummary || {};
  const investment = es.totalEstimatedInvestment || totalInvestment(projects);
  const saving = es.totalAnnualCostSavingPotential || totalSavings(projects);
  const energy = es.totalEnergySavingPotential || totalEnergy(projects);
  const categoryRows = (groupedProjects.length ? groupedProjects : [{ groupNo: "GR-1", groupTitle: "Energy Saving Projects", projects }]).map((group, index) => ({
    groupNo: displayText(group.groupNo) || `GR-${index + 1}`,
    groupName: formatGroupHeading(group, index),
    ecmsIncluded: asArray(group.projects).map(p => formatEcmNumber(p)).filter(Boolean).join(", "),
    count: asArray(group.projects).length,
    investment: formatINR(group.totalInvestment || totalInvestment(asArray(group.projects))),
    saving: formatINR(group.totalAnnualSaving || totalSavings(asArray(group.projects))),
    energy: formatNumber(group.totalEnergySaving || totalEnergy(asArray(group.projects))),
    payback: formatNumber(group.weightedPayback || weightedPayback(asArray(group.projects)), 2),
  }));

  const priorityRows = projects.map(p => {
    return {
      level: getPriorityLevel(p),
      ecms: formatEcmNumber(p),
      reason: getPriorityLevel(p) === "High Priority" ? "Favorable payback < 1.5 years" : getPriorityLevel(p) === "Medium Priority" ? "Moderate payback 1.5 - 3 years" : "Longer payback or high capex",
      investment: formatINR(p.estimatedInvestment),
      saving: formatINR(p.expectedAnnualCostSaving),
      payback: formatNumber(p.simplePaybackPeriod, 2),
      note: "Implementation complexity to be finalized after site verification.",
    };
  }).sort((a, b) => {
    const order = { "High Priority": 1, "Medium Priority": 2, "Long-Term Priority": 3 };
    return order[a.level] - order[b.level];
  });

  return [
    heading1("Chapter 1: Executive Summary"),
    heading2("1.1 Purpose of the Energy Audit"),
    paragraph(es.purposeText || `The purpose of this energy audit is to identify technically feasible, financially attractive and practically implementable energy-saving projects for ${safeText(report.reportInfo?.clientName)}.`),
    heading2("1.2 Overall Energy Saving Potential"),
    createTable(
      [{ key: "particular", label: "Particular" }, { key: "value", label: "Value" }],
      [
        { particular: "Total annual electricity consumption", value: es.totalAnnualElectricityConsumption },
        { particular: "Annual electricity cost", value: formatINR(es.annualElectricityCost) },
        { particular: "Average electricity tariff considered", value: formatINR(es.averageTariff) },
        { particular: "Number of projects identified", value: es.numberOfProjects || projects.length },
        { particular: "Total energy saving potential", value: formatNumber(energy) },
        { particular: "Total annual cost saving potential", value: formatINR(saving) },
        { particular: "Total estimated investment", value: formatINR(investment) },
        { particular: "Simple payback period", value: formatNumber(es.simplePaybackPeriod || weightedPayback(projects), 2) },
        { particular: "CO2 reduction potential", value: formatNumber(es.co2ReductionPotential) || "[Calculation pending due to missing emission factor]" },
      ]
    ),
    heading2("1.3 Summary of Identified Energy Saving Projects"),
    createTable(
      [
        { key: "projectNo", label: "ECM No." },
        { key: "project", label: "Energy Saving Project" },
        { key: "system", label: "System" },
        { key: "investment", label: "Investment" },
        { key: "saving", label: "Annual Saving" },
        { key: "energy", label: "Energy Saving kWh/y" },
      ],
      projects.map((project, index) => ({
        projectNo: formatEcmNumber(project) || `ECM ${index + 1}`,
        project: displayText(project.projectTitle) || safeText(project.projectTitle),
        system: project.system,
        investment: formatINR(project.estimatedInvestment),
        saving: formatINR(project.expectedAnnualCostSaving),
        energy: formatNumber(project.expectedEnergySaving),
      }))
    ),
    heading2("1.4 Project Grouping"),
    paragraph("The identified Energy Conservation Measures (ECMs) are grouped into technical and functional categories below to facilitate structured implementation and system-level improvements."),
    optionalTable(
      [
        { key: "groupNo", label: "Group No." },
        { key: "groupName", label: "Group Name" },
        { key: "ecmsIncluded", label: "ECMs Included" },
        { key: "count", label: "No. of ECMs" },
        { key: "investment", label: "Total Investment" },
        { key: "saving", label: "Annual Saving" },
        { key: "energy", label: "Energy Saving" },
        { key: "payback", label: "Group Payback" },
      ],
      categoryRows
    ),
    heading2("1.5 Key Observations"),
    ...(asArray(es.keyObservations).length ? asArray(es.keyObservations) : [
      "Cooling, production, compressed air, and auxiliary system projects contribute the major savings opportunity.",
      "Control improvements and high-efficiency retrofits are strong early implementation candidates.",
      "Measurement and verification are required to sustain savings after implementation.",
    ]).map((item) => paragraph(item)),
    heading2("1.6 Recommended Implementation Priority"),
    paragraph("Projects have been classified into High, Medium, and Long-Term priorities based on payback duration and implementation feasibility."),
    optionalTable(
      [
        { key: "level", label: "Priority Level" },
        { key: "ecms", label: "ECM Numbers" },
        { key: "reason", label: "Reason for Priority" },
        { key: "investment", label: "Investment" },
        { key: "saving", label: "Annual Saving" },
        { key: "payback", label: "Payback" },
        { key: "note", label: "Implementation Note" },
      ],
      priorityRows
    ),
    heading2("1.7 Conclusion and Way Forward"),
    paragraph(`Based on the audit findings, SEE-Tech recommends that ${displayText(report.reportInfo?.clientName, "the client")} proceed with detailed implementation planning for the identified energy-saving projects. The suggested steps are:`),
    optionalTable(
      [{ key: "step", label: "Step" }, { key: "action", label: "Action" }],
      [
        { step: 1, action: "Site verification" },
        { step: 2, action: "Vendor quotation / detailed engineering" },
        { step: 3, action: "Implementation scheduling" },
        { step: 4, action: "M&V baseline confirmation" },
        { step: 5, action: "Execution" },
        { step: 6, action: "Post-implementation verification" },
      ]
    ),
    pageBreak(),
  ];
}

function optionalKeyValueTable(dataObj, placeholder = "[To be updated after site data verification]") {
  if (!dataObj) return paragraph(placeholder);
  const safeKeys = Object.keys(dataObj).filter(k => dataObj[k] !== undefined && dataObj[k] !== null && String(dataObj[k]).trim() !== "" && !/^(data required|null|undefined|\[draft.*?\])$/i.test(String(dataObj[k]).trim()));
  if (safeKeys.length === 0) {
    return paragraph(placeholder);
  }
  return keyValueTable(safeKeys.map(k => ({ label: k, value: dataObj[k] })));
}

function generateBuildingProfile(report) {
  const bp = report.buildingProfile || {};
  const esd = report.electricalSupplyDetails || {};
  const benchmark = report.specificEnergyBenchmark || {};
  return [
    heading1("Chapter 2: Plant / Building Details and Energy Profile"),
    
    heading2("2.1 General Information"),
    optionalKeyValueTable({
      "Name of facility": bp.facilityName || report.reportInfo?.clientName,
      "Address": bp.address,
      "Type of building": bp.typeOfBuilding || report.reportInfo?.buildingType,
      "Facility contact person": bp.facilityContactPerson,
    }),

    heading2("2.2 Building Operation Details"),
    optionalKeyValueTable({
      "Operating days/year": bp.operatingDaysPerYear || bp.operatingDaysAndHours,
      "Operating hours/day": bp.operatingHoursPerDay,
      "Shift pattern": bp.shiftPattern,
      "Weekly off / holiday pattern": bp.weeklyOffPattern,
      "Production/occupancy pattern": bp.productionPattern,
      "Major operating zones": bp.majorOperatingZones,
      "Remarks": bp.operationRemarks,
    }),

    heading2("2.3 Utility and Energy Sources"),
    optionalTable(
      [
        { key: "energySource", label: "Energy Source" },
        { key: "use", label: "Use" },
        { key: "annualConsumption", label: "Annual Consumption" },
        { key: "annualCost", label: "Annual Cost" },
      ],
      report.utilityAndEnergySources
    ),

    heading2("2.4 Electrical Supply Details"),
    optionalKeyValueTable({
      "Supply voltage": esd.supplyVoltage,
      "Contract demand / sanctioned load": esd.contractDemand,
      "Connected load": esd.connectedLoad,
      "Transformer capacity": esd.transformerCapacity,
      "DG capacity": esd.dgCapacity,
      "Tariff category": esd.tariffCategory,
      "Billing demand": esd.billingDemand,
      "Power factor": esd.powerFactor,
      "Average tariff": esd.averageElectricityTariff || formatINR(report.executiveSummary?.averageTariff),
      "Metering arrangement": esd.meteringArrangement,
    }),

    heading2("2.5 Electricity Consumption and Billing Summary"),
    optionalTable(
      [
        { key: "month", label: "Month" },
        { key: "kwh", label: "kWh Consumption" },
        { key: "demand", label: "Max Demand" },
        { key: "pf", label: "Power Factor" },
        { key: "bill", label: "Electricity Bill" },
        { key: "tariff", label: "Average Tariff" },
        { key: "remarks", label: "Remarks" },
      ],
      report.monthlyBillingSummary
    ),

    heading2("2.6 Specific Energy Consumption Benchmark"),
    optionalKeyValueTable({
      "SEC definition": benchmark.secDefinition,
      "Production/occupancy denominator": benchmark.denominator,
      "SEC trend / value": benchmark.specificEnergyConsumption,
      "Benchmark/reference value": benchmark.referenceBenchmark,
      "Interpretation": benchmark.improvementPotential,
    }),

    heading2("2.7 Major Energy Consuming Systems"),
    optionalTable(
      [
        { key: "system", label: "System" },
        { key: "majorEquipment", label: "Major Equipment" },
        { key: "estimatedShare", label: "Estimated Share" },
        { key: "remarks", label: "Remarks" },
      ],
      report.majorEnergyConsumingSystems
    ),

    heading2("2.8 HVAC System Details"),
    optionalTable(
      [
        { key: "equipment", label: "Equipment (Chillers/AHUs/etc)" },
        { key: "rating", label: "Rating/Capacity" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "observations", label: "Observations" },
      ],
      report.hvacSystemDetails
    ),

    heading2("2.9 Lighting System Details"),
    optionalTable(
      [
        { key: "area", label: "Area" },
        { key: "type", label: "Fixture Type" },
        { key: "quantity", label: "Quantity" },
        { key: "wattage", label: "Wattage" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "observations", label: "Observations" },
      ],
      report.lightingSystemDetails
    ),

    heading2("2.10 Pumps and Motors"),
    optionalTable(
      [
        { key: "name", label: "Pump/Motor Name" },
        { key: "rating", label: "Rating" },
        { key: "quantity", label: "Quantity" },
        { key: "efficiency", label: "Efficiency Class" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "observations", label: "Observations" },
      ],
      report.pumpAndMotorDetails
    ),

    heading2("2.11 Building Automation and Controls"),
    optionalTable(
      [
        { key: "system", label: "System Controlled" },
        { key: "method", label: "Existing Control Method" },
        { key: "sensors", label: "Sensors/Feedback" },
        { key: "gaps", label: "Gaps Observed" },
      ],
      report.automationAndControls
    ),

    heading2("2.12 Summary of Audit Observations"),
    optionalTable(
      [
        { key: "observation", label: "Observation" },
        { key: "impact", label: "Energy Impact" },
        { key: "recommendation", label: "Recommended Direction" },
        { key: "relatedEcms", label: "Related ECMs" },
      ],
      report.auditObservations || [
        { observation: "Optimization opportunities exist across major systems.", impact: "Higher than necessary energy consumption", recommendation: "Implement ECMs in a phased manner." },
      ]
    ),
    pageBreak(),
  ];
}

function getFallbackActivities() {
  return [
    { activity: "Engineering", details: "Detailed engineering and layout finalization", responsibility: "Vendor / SEE-Tech" },
    { activity: "Procurement", details: "Equipment ordering and vendor finalization", responsibility: "Client" },
    { activity: "Installation", details: "Erection, piping, cabling, and modification", responsibility: "Vendor / Contractor" },
    { activity: "Commissioning", details: "Testing, commissioning, and handover", responsibility: "Vendor / SEE-Tech" },
  ];
}

function generateProjectChapter(project, groupNumber, ecmIndexWithinGroup) {
  const ecmType = classifyEcmType(project);
  const ecmTitleRaw = displayText(project.projectTitle) || displayText(project.title) || displayText(project.ecmName) || "ECM";
  const ecmNoRaw = getEcmNumberVal(project);
  const ecmNo = formatEcmNumber(ecmNoRaw);
  const ecmSectionNumber = `${groupNumber}.${ecmIndexWithinGroup}`;

  const rawCleanTitle = ecmTitleRaw.replace(/^(ECM|Ecm|ecm)\s*\d*\s*[-–:]*\s*/i, '').trim();
  const cleanTitle = sanitizePromptLeakageText(rawCleanTitle, ecmType);

  let lines = [
    new Paragraph({
      children: [new TextRun({ text: formatEcmHeading(ecmSectionNumber, ecmNoRaw, cleanTitle), bold: true, size: 28, color: "09425D" })],
      spacing: { before: 240, after: 120 },
    }),
    
    // 3.x.1 Project Summary
    heading3(`${ecmSectionNumber}.1 Project Summary`),
    createTable(
      [{ key: "particular", label: "Particular" }, { key: "value", label: "Details" }],
      buildProjectSummaryRows(project, cleanTitle, ecmNo)
    ),

    // 3.x.2 Existing System Description
    heading3(`${ecmSectionNumber}.2 Existing System Description`),
    paragraph(sanitizePromptLeakageText(project.existingSystemDescription || project.existingOperatingCondition || project.baselineDetails, ecmType)),

    // 3.x.3 Baseline Data and Measurements
    heading3(`${ecmSectionNumber}.3 Baseline Data and Measurements`),
    createTable(
      [{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }],
      buildBaselineDataRows(project)
    ),
    new Paragraph({ spacing: { after: 120 } }),
    createTable(
      [{ key: "measurement", label: "Measurement" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }],
      buildMeasurementRows(project)
    ),

    // 3.x.4 Problem / Gap Identified
    heading3(`${ecmSectionNumber}.4 Problem / Gap Identified`),
    paragraph(sanitizePromptLeakageText(project.problemGapIdentified, ecmType)),
    (project.problemGapTable && project.problemGapTable.length > 0) ? optionalTable(
      [{ key: "system", label: "System" }, { key: "gap", label: "Typical Gap" }],
      project.problemGapTable
    ) : new Paragraph({ text: "" }),

    // 3.x.5 Proposed Project
    heading3(`${ecmSectionNumber}.5 Proposed Project`),
    paragraph(sanitizePromptLeakageText(project.proposedProjectDescription || project.proposedIntervention, ecmType)),
    createTable(
      [{ key: "srNo", label: "Sr. No." }, { key: "scopeItem", label: "Scope Item" }],
      buildScopeOfWorkRows(ecmType, project)
    ),

    // 3.x.6 Key Activities for Implementation
    heading3(`${ecmSectionNumber}.6 Key Activities for Implementation`),
    createTable(
      [{ key: "activity", label: "Activity" }, { key: "details", label: "Details" }, { key: "responsibility", label: "Responsibility" }],
      buildKeyActivityRows(ecmType, project)
    ),

    // 3.x.7 Rationale for Energy Saving
    heading3(`${ecmSectionNumber}.7 Rationale for Energy Saving`),
    paragraph(sanitizePromptLeakageText(project.rationaleForEnergySaving || "The recommendation reduces avoidable losses and improves alignment between system demand and energy input.", ecmType)),
    (project.rationaleTable && project.rationaleTable.length > 0) ? optionalTable(
      [{ key: "projectType", label: "Project Type" }, { key: "savingRationale", label: "Saving Rationale" }],
      project.rationaleTable
    ) : new Paragraph({ text: "" }),

    // 3.x.8 Energy Saving Calculation
    heading3(`${ecmSectionNumber}.8 Energy Saving Calculation`),
    createTable(
      [{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }],
      buildEnergySavingCalculationRows(project)
    ),
    new Paragraph({
      children: [new TextRun({ text: "Annual Energy Saving = Load Reduction × Annual Operating Hours | Annual Cost Saving = Annual Energy Saving × Average Electricity Tariff | Simple Payback = Estimated Investment / Annual Cost Saving", italics: true, size: 20, color: "5F6B76" })],
      spacing: { before: 60, after: 120 },
      alignment: AlignmentType.CENTER
    }),

    // 3.x.9 Key Metrics
    heading3(`${ecmSectionNumber}.9 Key Metrics`),
    createTable(
      [{ key: "srNo", label: "Sr. No." }, { key: "parameter", label: "Parameter" }, { key: "value", label: "Value" }],
      buildKeyMetricRows(project)
    ),

    // 3.x.10 Technical Specifications
    heading3(`${ecmSectionNumber}.10 Technical Specifications`),
    createTable(
      [{ key: "item", label: "Item" }, { key: "specification", label: "Specification" }],
      buildTechnicalSpecificationRows(ecmType, project)
    ),

    // 3.x.11 Schematic / Conceptual Framework
    heading3(`${ecmSectionNumber}.11 Schematic / Conceptual Framework`),
    createTable(
      [{ key: "stage", label: "Stage" }, { key: "description", label: "Description" }],
      (project.schematicFramework && project.schematicFramework.length) ? project.schematicFramework : [
        { stage: "Stage 1: Current State", description: "Existing inefficient or non-optimized operation" },
        { stage: "Stage 2: Intervention", description: "What SEE-Tech will install or modify" },
        { stage: "Stage 3: Physics of Saving", description: "Why energy will reduce after the intervention" },
        { stage: "Stage 4: Outcome", description: "kWh saving, ₹ saving, payback and reliability benefit" }
      ]
    ),
    new Paragraph({
      children: [new TextRun({ text: "[Schematic / conceptual diagram to be inserted after engineering finalization]", italics: true, size: 20, color: "5F6B76" })],
      spacing: { before: 60, after: 120 },
      alignment: AlignmentType.CENTER
    }),

    // 3.x.12 Implementation Duration
    heading3(`${ecmSectionNumber}.12 Implementation Duration`),
    createTable(
      [{ key: "activity", label: "Activity" }, { key: "duration", label: "Duration" }],
      (project.implementationDurationTable && project.implementationDurationTable.length) ? project.implementationDurationTable : [
        { activity: "Engineering and approval", duration: "1 week" },
        { activity: "Procurement", duration: "2-4 weeks" },
        { activity: "Installation", duration: "1-2 weeks" },
        { activity: "Testing and commissioning", duration: "1 week" },
        { activity: "Performance monitoring", duration: "2-4 weeks" },
        { activity: "Total expected duration", duration: safeText(project.implementationDuration) || "[To be updated after site data verification]" }
      ]
    ),

    // 3.x.13 Precautions / Aspects to be Taken Care Of
    heading3(`${ecmSectionNumber}.13 Precautions / Aspects to be Taken Care Of`),
    createTable(
      [{ key: "area", label: "Area" }, { key: "precaution", label: "Precaution" }],
      (project.aspectsToBeTakenCareOfTable && project.aspectsToBeTakenCareOfTable.length) ? project.aspectsToBeTakenCareOfTable : [
        { area: "Technical suitability", precaution: "Confirm equipment rating, sizing and compatibility" },
        { area: "Operation", precaution: "Ensure project does not affect comfort, safety or process requirement" },
        { area: "Controls", precaution: "Test control logic under different load conditions" },
        { area: "Electrical safety", precaution: "Ensure proper protection, earthing and panel safety" },
        { area: "Maintenance", precaution: "Train maintenance team for operation and troubleshooting" },
        { area: "Measurement", precaution: "Record before and after data for savings validation" },
        { area: "Shutdown planning", precaution: "Plan installation during low-load or non-operating hours" }
      ]
    ),

    // 3.x.14 Measurement and Verification Plan
    heading3(`${ecmSectionNumber}.14 Measurement and Verification Plan`),
    createTable(
      [{ key: "parameter", label: "Parameter" }, { key: "baselineMeasurement", label: "Baseline Measurement" }, { key: "postImplementationMeasurement", label: "Post-Implementation Measurement" }],
      buildMvPlanRows(ecmType, project)
    ),
    new Paragraph({
      children: [new TextRun({ text: "Savings shall be validated by measuring the power consumption and operating pattern before and after implementation. The final saving will be calculated based on measured load reduction, actual operating hours and applicable electricity tariff.", size: 20, color: "5F6B76" })],
      spacing: { before: 60, after: 120 }
    }),

    // 3.x.15 Benefits Other Than Energy Saving
    heading3(`${ecmSectionNumber}.15 Benefits Other Than Energy Saving`),
    createTable(
      [{ key: "benefit", label: "Benefit" }, { key: "description", label: "Description" }],
      buildBenefitRows(ecmType, project)
    ),

    // 3.x.16 Carbon Footprint Reduction
    heading3(`${ecmSectionNumber}.16 Carbon Footprint Reduction`),
    paragraph(project.co2ReductionPotential 
      ? `The estimated carbon footprint reduction is ${formatNumber(project.co2ReductionPotential)} kgCO2/year based on the projected energy savings.` 
      : "[Calculation pending due to missing emission factor]"
    ),

    // 3.x.17 Case Study / Reference Application
    heading3(`${ecmSectionNumber}.17 Case Study / Reference Application`),
    paragraph(sanitizePromptLeakageText(project.caseStudy || "Similar measures are commonly implemented in comparable industrial utility/process systems after site-specific engineering validation. Project-specific case evidence shall be updated after implementation or vendor confirmation.", ecmType)),

    // 3.x.18 Project Conclusion
    heading3(`${ecmSectionNumber}.18 Project Conclusion`),
    paragraph(
      sanitizePromptLeakageText(`This project is technically feasible and financially attractive for implementation. The proposed intervention will reduce annual energy consumption by approximately ${safeText(project.expectedEnergySaving) ? `${formatNumber(project.expectedEnergySaving)} kWh` : "[energy saving]"}, resulting in annual cost saving of ${safeText(project.expectedAnnualCostSaving) ? formatINR(project.expectedAnnualCostSaving) : "[annual saving]"}. With an estimated investment of ${safeText(project.estimatedInvestment) ? formatINR(project.estimatedInvestment) : "[investment]"}, the simple payback period is expected to be ${safeText(project.simplePaybackPeriod) ? `${formatNumber(project.simplePaybackPeriod, 2)} years` : "[payback]"}. Considering the energy saving, operational improvement and sustainability benefits, this project is recommended for implementation under ${safeText(project.priority) || safeText(project.implementationPriority) || "[priority]"}.`, ecmType)
    ),
  ];

  return lines;
}

function generateAnnexures() {
  return [
    heading1("Chapter 4: Annexures"),
    heading2("4.1 Uploaded Data Sources"),
    paragraph("Uploaded spreadsheets, measurements, and supporting documents used for this report are referenced here."),
    heading2("4.2 Assumptions"),
    paragraph("Savings, investment, and implementation assumptions are based on the data made available during the audit and SEE-Tech engineering judgment where direct readings were not available."),
    heading2("4.3 Image / Figure References"),
    paragraph("Photographs, schematics, and reference figures included in the report are listed in this section."),
    heading2("4.4 Calculation Notes"),
    paragraph("Calculation notes, formulas, and validation references supporting the ECM analysis are documented here."),
  ];
}

function removeDataRequired(obj) {
  if (typeof obj === "string") {
    return /^data required$/i.test(obj.trim()) ? "" : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(removeDataRequired);
  }
  if (obj && typeof obj === "object") {
    const clean = {};
    for (const key of Object.keys(obj)) {
      clean[key] = removeDataRequired(obj[key]);
    }
    return clean;
  }
  return obj;
}

async function buildCommercialBuildingEnergyAuditDocx(reportData) {
  const cleanReportData = removeDataRequired(reportData);
  const report = normalizeReportForExport(cleanReportData);
  const projects = asArray(report.projects);
  const groupedProjects = asArray(report.groupedProjects).length
    ? asArray(report.groupedProjects)
    : [{
        groupNo: "GR-1",
        groupTitle: "Energy Saving Projects",
        projects,
        totalInvestment: totalInvestment(projects),
        totalAnnualSaving: totalSavings(projects),
        totalEnergySaving: totalEnergy(projects),
        weightedPayback: weightedPayback(projects),
      }];

  if (!projects.length) {
    throw new Error("No valid ECM projects available for export.");
  }

  const children = [
    ...generateCoverPage(report.reportInfo || {}),
    ...generateTableOfContents(groupedProjects),
    ...generateExecutiveSummary(report, projects, groupedProjects),
    ...generateBuildingProfile(report),
    heading1("Chapter 3: Energy Saving Projects"),
    paragraph("This chapter presents the identified energy conservation measures grouped by system and application area. Each group includes a summary table followed by detailed ECM descriptions."),
    pageBreak(),
  ];

  let globalStartIndex = 0;
  groupedProjects.forEach((group, index) => {
    const groupProjects = asArray(group.projects);
    children.push(heading2(formatGroupHeading(group, index)));
    children.push(paragraph(group.summaryParagraph || `This section covers ${groupProjects.length} energy conservation measures under the ${safeText(group.groupTitle)} category.`));
    children.push(heading3("Group Observation"));
    children.push(paragraph(group.technicalObservation || "The measures in this group focus on improving system control discipline, reducing avoidable losses, and supporting a more structured implementation roadmap."));
    children.push(heading3("Implementation Focus"));
    children.push(paragraph(group.implementationStrategy || "Implementation should combine site verification, detailed engineering, coordinated execution, and post-commissioning performance review."));
    children.push(
      createTable(
        [
          { key: "projectNo", label: "ECM No." },
          { key: "projectTitle", label: "ECM Name" },
          { key: "investment", label: "Investment INR" },
          { key: "saving", label: "Annual Saving INR/year" },
          { key: "energy", label: "Energy Saving kWh/year" },
          { key: "payback", label: "Payback" },
        ],
        groupProjects.map((project) => ({
          projectNo: formatEcmNumber(project),
          projectTitle: displayText(project.projectTitle) || safeText(project.projectTitle),
          investment: formatINR(project.estimatedInvestment),
          saving: formatINR(project.expectedAnnualCostSaving),
          energy: safeText(project.expectedEnergySaving),
          payback: safeText(project.simplePaybackPeriod),
        }))
      )
    );
    children.push(pageBreak());
    groupProjects.forEach((project, pIndex) => {
      const globalEcmIndex = globalStartIndex + pIndex + 1;
      children.push(...generateProjectChapter(project, "3", globalEcmIndex));
    });
    globalStartIndex += groupProjects.length;
  });

  children.push(...generateAnnexures());

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

module.exports = {
  buildCommercialBuildingEnergyAuditDocx,
};
