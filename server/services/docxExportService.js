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
const { enforceReportQuality } = require("./reportQualityEnforcer");

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
    if (value.amount !== undefined && value.unit !== undefined)
      return `${value.amount} ${value.unit}`;
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
  return asArray(projects).reduce(
    (sum, project) => sum + numberFrom(project.estimatedInvestment),
    0
  );
}

function totalSavings(projects = []) {
  return asArray(projects).reduce(
    (sum, project) => sum + numberFrom(project.expectedAnnualCostSaving),
    0
  );
}

function totalEnergy(projects = []) {
  return asArray(projects).reduce(
    (sum, project) => sum + numberFrom(project.expectedEnergySaving),
    0
  );
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
    return (
      displayText(valueOrProject.ecmNo) ||
      displayText(valueOrProject.projectNumber) ||
      displayText(valueOrProject.projectNo) ||
      ""
    );
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
  const title = String(
    ecm.projectTitle || ecm.title || ecm.ecmName || ""
  ).toLowerCase();
  const ecmNo = String(getEcmNumberVal(ecm) || "");
  if (ecmNo.includes("13")) return "heat_recovery";
  if (ecmNo.includes("14")) return "thermal_insulation";
  if (ecmNo.includes("15")) return "ir_heater_retrofit";
  if (ecmNo.match(/1[6-9]|20/)) return "servo_hydraulic_retrofit";
  if (ecmNo.includes("21")) return "compressed_air_management";
  if (ecmNo.includes("12")) return "apfc_power_factor_correction";

  if (title.includes("heat recovery") || title.includes("exhaust heat"))
    return "heat_recovery";
  if (title.includes("insulation") || title.includes("hot duct"))
    return "thermal_insulation";
  if (
    title.includes("ir heater") ||
    title.includes("band heater") ||
    title.includes("barrel heating")
  )
    return "ir_heater_retrofit";
  if (title.includes("servo") || title.includes("hydraulic"))
    return "servo_hydraulic_retrofit";
  if (
    title.includes("compressed air") ||
    title.includes("booster compressor") ||
    title.includes("air compressor")
  )
    return "compressed_air_management";
  if (
    title.includes("apfc") ||
    title.includes("power factor") ||
    title.includes("kvar")
  )
    return "apfc_power_factor_correction";
  if (title.includes("ahu") || title.includes("plug fan"))
    return "ahu_plug_fan_optimization";
  if (
    title.includes("chiller") ||
    title.includes("cooling") ||
    title.includes("chw") ||
    title.includes("ct water") ||
    title.includes("primary pump") ||
    title.includes("secondary pump") ||
    title.includes("ct segregation")
  )
    return "cooling_system_optimization";
  if (
    title.includes("ie5") ||
    title.includes("motor retrofit") ||
    title.includes("pmsm")
  )
    return "motor_retrofit_ie5";
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
    if (ecmType === "cooling_system_optimization")
      safe =
        "The existing cooling system includes equipment operating under conditions where flow, temperature differential, and load variation require verification for optimized energy performance.";
    else if (ecmType === "heat_recovery")
      safe =
        "The existing dryer system rejects usable heat through exhaust air, while incoming regeneration air continues to require primary heating energy.";
    else if (ecmType === "thermal_insulation")
      safe =
        "The existing hot duct surfaces are exposed or inadequately insulated, resulting in avoidable heat loss to the surrounding area.";
    else if (ecmType === "servo_hydraulic_retrofit")
      safe =
        "The existing hydraulic machine drive arrangement operates with energy consumption during idle and part-load portions of the machine cycle.";
    else if (ecmType === "compressed_air_management")
      safe =
        "The compressed air system requires measurement of pressure, flow, leakage, and compressor loading pattern to identify avoidable generation losses.";
    else if (ecmType === "apfc_power_factor_correction")
      safe =
        "The electrical system requires effective reactive power compensation to maintain power factor and reduce kVA/kVAh-related billing impact.";
    else if (ecmType === "ir_heater_retrofit")
      safe =
        "The existing band heating system operates with high surface temperatures, leading to convective heat losses to the ambient environment.";
    else if (ecmType === "ahu_plug_fan_optimization")
      safe =
        "The existing air handling system operates with conventional fan and drive arrangements, presenting opportunities for flow optimization and efficiency upgrades.";
    else if (ecmType === "motor_retrofit_ie5")
      safe =
        "The existing driven equipment is operated by standard-efficiency motors, resulting in higher power consumption for the given mechanical load.";
    else
      safe =
        "The existing system operates under baseline conditions that present measurable opportunities for energy performance optimization.";
  }
  return safe;
}

function buildProjectSummaryRows(ecm, cleanTitle, ecmNo) {
  return [
    { particular: "Project title", value: cleanTitle },
    { particular: "Project number", value: ecmNo || "" },
    {
      particular: "System",
      value:
        safeText(ecm.system) ||
        safeText(ecm.category) ||
        "[To be updated after site data verification]",
    },
    {
      particular: "Location",
      value:
        safeText(ecm.location) ||
        "[To be updated after site data verification]",
    },
    {
      particular: "Equipment covered",
      value:
        safeText(ecm.equipmentCovered) ||
        safeText(ecm.equipment) ||
        "[To be updated after site data verification]",
    },
    {
      particular: "Existing operating condition",
      value: sanitizePromptLeakageText(
        safeText(ecm.existingSystemDescription) ||
          safeText(ecm.existingOperatingCondition),
        classifyEcmType(ecm)
      ),
    },
    {
      particular: "Proposed intervention",
      value: sanitizePromptLeakageText(
        safeText(ecm.proposedProjectDescription) ||
          safeText(ecm.proposedIntervention),
        classifyEcmType(ecm)
      ),
    },
    {
      particular: "Expected energy saving",
      value: safeText(ecm.expectedEnergySaving)
        ? `${formatNumber(ecm.expectedEnergySaving)} kWh/year`
        : "[Calculation pending]",
    },
    {
      particular: "Expected annual cost saving",
      value: safeText(ecm.expectedAnnualCostSaving)
        ? formatINR(ecm.expectedAnnualCostSaving)
        : "[Calculation pending]",
    },
    {
      particular: "Estimated investment",
      value: safeText(ecm.estimatedInvestment)
        ? formatINR(ecm.estimatedInvestment)
        : "[Calculation pending]",
    },
    {
      particular: "Simple payback period",
      value: safeText(ecm.simplePaybackPeriod)
        ? `${formatNumber(ecm.simplePaybackPeriod, 2)} years`
        : "[Calculation pending]",
    },
    {
      particular: "Implementation duration",
      value:
        safeText(ecm.implementationDuration) ||
        "[To be updated after site data verification]",
    },
    {
      particular: "Implementation priority",
      value:
        safeText(ecm.priority) ||
        safeText(ecm.implementationPriority) ||
        "[To be updated after site data verification]",
    },
  ];
}

function buildBaselineDataRows(ecm) {
  let rows = ecm.baselineData || [];
  if (rows.length < 3) {
    rows = [
      {
        parameter: "Equipment rating",
        unit: "kW / TR / HP",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Quantity",
        unit: "Nos.",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Operating hours",
        unit: "hours/day",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Operating days",
        unit: "days/year",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Existing power consumption",
        unit: "kW",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Annual operating hours",
        unit: "hours/year",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Baseline annual consumption",
        unit: "kWh/year",
        value:
          safeText(ecm.baselineConsumption) ||
          "[To be updated after site data verification]",
      },
      {
        parameter: "Average tariff",
        unit: "₹/kWh",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Baseline annual energy cost",
        unit: "₹/year",
        value: "[To be updated after site data verification]",
      },
    ];
  }
  return rows;
}

function buildMeasurementRows(ecm) {
  let rows = ecm.baselineMeasurements || [];
  if (rows.length < 3) {
    rows = [
      {
        measurement: "Voltage",
        unit: "V",
        value: "[To be updated after site data verification]",
      },
      {
        measurement: "Current",
        unit: "A",
        value: "[To be updated after site data verification]",
      },
      {
        measurement: "Power factor",
        unit: "-",
        value: "[To be updated after site data verification]",
      },
      {
        measurement: "Measured power",
        unit: "kW",
        value: "[To be updated after site data verification]",
      },
      {
        measurement: "Flow / airflow",
        unit: "m3/hr / CFM",
        value: "[To be updated after site data verification]",
      },
      {
        measurement: "Pressure / head / static pressure",
        unit: "m / mmWC / bar",
        value: "[To be updated after site data verification]",
      },
      {
        measurement: "Temperature inlet",
        unit: "°C",
        value: "[To be updated after site data verification]",
      },
      {
        measurement: "Temperature outlet",
        unit: "°C",
        value: "[To be updated after site data verification]",
      },
      {
        measurement: "Operating frequency",
        unit: "Hz",
        value: "[To be updated after site data verification]",
      },
    ];
  }
  return rows;
}

function buildScopeOfWorkRows(ecmType, ecm) {
  let rows = ecm.scopeOfWork || ecm.scope || [];
  if (rows.length < 3) {
    rows = [
      { srNo: 1, scopeItem: "Detailed site measurement and final engineering" },
      {
        srNo: 2,
        scopeItem:
          "Supply of equipment / VFD / controller / motor / sensor / panel as applicable",
      },
      {
        srNo: 3,
        scopeItem: "Installation and integration with existing system",
      },
      {
        srNo: 4,
        scopeItem: "Cabling, piping or ducting modification, if required",
      },
      { srNo: 5, scopeItem: "Testing and commissioning" },
      { srNo: 6, scopeItem: "Performance monitoring" },
      { srNo: 7, scopeItem: "Operator training and handover" },
    ];
  }
  return rows;
}

function buildKeyActivityRows(ecmType, ecm) {
  let rows =
    ecm.keyActivities || ecm.keyActivitiesNarrative || ecm.activities || [];
  if (rows.length < 3) {
    rows = [
      {
        activity: "Site verification",
        details: "Confirm equipment rating, location and operating condition",
        responsibility: "SEE-Tech + Client",
      },
      {
        activity: "Design finalization",
        details: "Finalize technical specifications and control logic",
        responsibility: "SEE-Tech",
      },
      {
        activity: "Procurement",
        details: "Arrange equipment and accessories",
        responsibility: "SEE-Tech / Vendor",
      },
      {
        activity: "Installation",
        details: "Install system with minimum disturbance",
        responsibility: "SEE-Tech / Vendor",
      },
      {
        activity: "Integration",
        details: "Integrate with panel / BMS / controls",
        responsibility: "SEE-Tech",
      },
      {
        activity: "Trial run",
        details: "Operate under different load conditions",
        responsibility: "SEE-Tech + Client",
      },
      {
        activity: "Measurement",
        details: "Record before and after performance",
        responsibility: "SEE-Tech",
      },
      {
        activity: "Handover",
        details: "Submit performance report and train operators",
        responsibility: "SEE-Tech",
      },
    ];
  }
  return rows;
}

function buildEnergySavingCalculationRows(ecm) {
  let rows =
    ecm.energySavingCalculation ||
    ecm.calculation ||
    ecm.calculationBasis ||
    ecm.assumptions ||
    [];
  if (rows.length < 3) {
    rows = [
      {
        parameter: "Existing connected load / measured load",
        unit: "kW",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Proposed load after project",
        unit: "kW",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Load reduction",
        unit: "kW",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Operating hours",
        unit: "hours/year",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Annual energy saving",
        unit: "kWh/year",
        value:
          safeText(ecm.expectedEnergySaving) ||
          safeText(ecm.energySaving) ||
          "[Calculation pending]",
      },
      {
        parameter: "Average tariff",
        unit: "₹/kWh",
        value: "[To be updated after site data verification]",
      },
      {
        parameter: "Annual cost saving",
        unit: "₹/year",
        value:
          safeText(ecm.expectedAnnualCostSaving) ||
          safeText(ecm.annualSaving) ||
          "[Calculation pending]",
      },
      {
        parameter: "Estimated investment",
        unit: "₹",
        value:
          safeText(ecm.estimatedInvestment) ||
          safeText(ecm.investment) ||
          "[Calculation pending]",
      },
      {
        parameter: "Simple payback",
        unit: "years",
        value: safeText(ecm.simplePaybackPeriod)
          ? Number(ecm.simplePaybackPeriod).toFixed(2)
          : "[Calculation pending]",
      },
    ];
  }
  return rows;
}

function buildKeyMetricRows(ecm) {
  return [
    {
      srNo: 1,
      parameter: "Baseline consumption",
      value: safeText(ecm.baselineConsumption) || "[Calculation pending]",
    },
    {
      srNo: 2,
      parameter: "Energy saving",
      value: safeText(ecm.expectedEnergySaving)
        ? `${formatNumber(ecm.expectedEnergySaving)} kWh/year`
        : "[Calculation pending]",
    },
    {
      srNo: 3,
      parameter: "Percentage saving",
      value: safeText(ecm.percentSaving)
        ? `${formatNumber(ecm.percentSaving, 2)}%`
        : "[Calculation pending]",
    },
    {
      srNo: 4,
      parameter: "Cost saving",
      value: safeText(ecm.expectedAnnualCostSaving)
        ? formatINR(ecm.expectedAnnualCostSaving)
        : "[Calculation pending]",
    },
    {
      srNo: 5,
      parameter: "Estimated investment",
      value: safeText(ecm.estimatedInvestment)
        ? formatINR(ecm.estimatedInvestment)
        : "[Calculation pending]",
    },
    {
      srNo: 6,
      parameter: "Payback period",
      value: safeText(ecm.simplePaybackPeriod)
        ? `${formatNumber(ecm.simplePaybackPeriod, 2)} years`
        : "[Calculation pending]",
    },
    {
      srNo: 7,
      parameter: "CO2 reduction",
      value: safeText(ecm.co2ReductionPotential)
        ? `${formatNumber(ecm.co2ReductionPotential)} kgCO2/year`
        : "[Calculation pending]",
    },
  ];
}

function buildTechnicalSpecificationRows(ecmType, ecm) {
  let rows = ecm.technicalSpecificationTable || [];
  if (rows.length < 3) {
    rows = [
      {
        item: "Equipment / technology",
        specification: "[To be updated after site data verification]",
      },
      {
        item: "Capacity",
        specification: "[To be updated after site data verification]",
      },
      {
        item: "Quantity",
        specification: "[To be updated after site data verification]",
      },
      {
        item: "Motor efficiency class, if applicable",
        specification: "[To be updated after site data verification]",
      },
      {
        item: "VFD rating, if applicable",
        specification: "[To be updated after site data verification]",
      },
      {
        item: "Sensor type",
        specification: "[To be updated after site data verification]",
      },
      {
        item: "Controller / PLC / IoT system",
        specification: "[To be updated after site data verification]",
      },
      {
        item: "Communication",
        specification: "[To be updated after site data verification]",
      },
      {
        item: "Panel requirement",
        specification: "[To be updated after site data verification]",
      },
      {
        item: "Civil / mechanical modification",
        specification: "[To be updated after site data verification]",
      },
      {
        item: "Safety requirement",
        specification: "[To be updated after site data verification]",
      },
    ];
  }
  return rows;
}

function buildMvPlanRows(ecmType, ecm) {
  let paramValue = "ECM-type-specific parameter";
  if (ecmType === "cooling_system_optimization")
    paramValue = "Flow, head, pressure, kW, CHW/CW temperature";
  else if (ecmType === "heat_recovery")
    paramValue =
      "Exhaust air temperature, inlet air temperature, heater kW, operating hours";
  else if (ecmType === "thermal_insulation" || ecmType === "ir_heater_retrofit")
    paramValue =
      "Surface temperature, duct temperature, heater load, operating hours";
  else if (ecmType === "servo_hydraulic_retrofit")
    paramValue = "Hydraulic motor kW, cycle time, idle load, operating hours";
  else if (ecmType === "compressed_air_management")
    paramValue = "Pressure, flow, leakage, compressor kW";
  else if (ecmType === "apfc_power_factor_correction")
    paramValue = "PF, kVA, kVAh, reactive power compensation";
  else if (ecmType === "ahu_plug_fan_optimization")
    paramValue = "Airflow, static pressure, fan kW";

  let rows =
    ecm.measurementVerificationPlan ||
    ecm.mvPlan ||
    ecm.measurementAndVerificationPlan ||
    [];
  if (rows.length < 3) {
    rows = [
      {
        parameter: "Power consumption",
        baselineMeasurement: "kW before project",
        postImplementationMeasurement: "kW after project",
      },
      {
        parameter: "Operating hours",
        baselineMeasurement: "Existing operating schedule",
        postImplementationMeasurement: "Revised operating schedule",
      },
      {
        parameter: "Energy consumption",
        baselineMeasurement: "kWh/year baseline",
        postImplementationMeasurement: "kWh/year after project",
      },
      {
        parameter: "Performance parameter",
        baselineMeasurement: paramValue,
        postImplementationMeasurement: "Confirmed after commissioning",
      },
      {
        parameter: "Saving validation",
        baselineMeasurement: "Calculated from baseline",
        postImplementationMeasurement: "Verified from measured data",
      },
    ];
  }
  return rows;
}

function buildBenefitRows(ecmType, ecm) {
  let rows =
    ecm.benefitsOtherThanEnergySaving ||
    ecm.benefits ||
    ecm.otherBenefits ||
    ecm.intangibleBenefits ||
    [];
  if (rows.length < 3) {
    rows = [
      {
        benefit: "Reduced operating cost",
        description: "Lower electricity / fuel bill",
      },
      {
        benefit: "Improved reliability",
        description: "Better control and reduced stress on equipment",
      },
      {
        benefit: "Better comfort / process stability",
        description: "Stable process operation, comfort or utility performance",
      },
      { benefit: "Lower maintenance", description: "Reduced wear and tear" },
      {
        benefit: "Better monitoring",
        description:
          "Availability of performance data where monitoring is included",
      },
      {
        benefit: "Sustainability",
        description: "Reduction in CO2 emissions after verified saving",
      },
      {
        benefit: "Modernization",
        description: "Upgrade of old system with efficient technology",
      },
    ];
  }
  return rows;
}

function formatEcmHeading(sectionNumber, ecmNo, title) {
  const cleanEcmNo = formatEcmNumber(ecmNo);
  let cleanTitle = String(title ?? "").trim();
  cleanTitle = cleanTitle
    .replace(/^(ECM|Ecm|ecm)\s*\d*\s*[-–:]*\s*/i, "")
    .trim();

  return cleanTitle
    ? `${sectionNumber} ${cleanEcmNo} – ${cleanTitle}`
    : `${sectionNumber} ${cleanEcmNo}`;
}

function heading1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 120, after: 60 },
  });
}

function heading2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 120, after: 60 },
  });
}

function heading3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 120, after: 60 },
  });
}

function bulletParagraphsFromText(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^•\s*/, "").trim())
    .filter(Boolean)
    .map((line) =>
      new Paragraph({
        text: line,
        bullet: { level: 0 },
        spacing: { after: 120 }
      })
    );
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
  const safeColumns = asArray(columns).length
    ? asArray(columns)
    : [{ key: "value", label: "Value" }];
  const rows = asArray(rowsData).length ? asArray(rowsData) : [{}];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: safeColumns.map(
          (col) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: col.label,
                      bold: true,
                      color: "FFFFFF",
                    }),
                  ],
                  spacing: { before: 0, after: 0 },
                }),
              ],
              shading: { fill: "09425D" },
              margins: { top: 40, bottom: 40, left: 60, right: 60 },
            })
        ),
      }),
      ...rows.map((row, idx) => {
        const normalized =
          row && typeof row === "object" ? row : { value: safeText(row) };
        const fill = idx % 2 === 0 ? "EAF3F7" : "FFFFFF";
        return new TableRow({
          children: safeColumns.map(
            (col) =>
              new TableCell({
                children: [
                  new Paragraph({
                    text: safeText(normalized[col.key]),
                    spacing: { before: 0, after: 0 },
                  }),
                ],
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
      const normalized =
        row && typeof row === "object"
          ? row
          : { label: "Value", value: safeText(row) };
      const keys = Object.keys(normalized);
      const labelKey = keys[0];
      const valueKey = keys[1] || keys[0];
      const fill = idx % 2 === 0 ? "EAF3F7" : "FFFFFF";
      return new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: safeText(normalized[labelKey]),
                    bold: true,
                    color: "09425D",
                  }),
                ],
                spacing: { before: 0, after: 0 },
              }),
            ],
            shading: { fill },
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            width: { size: 32, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [
              new Paragraph({
                text: safeText(normalized[valueKey]),
                spacing: { before: 0, after: 0 },
              }),
            ],
            shading: { fill },
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            width: { size: 68, type: WidthType.PERCENTAGE },
          }),
        ],
      });
    }),
  });
}

function mandatoryTable(
  columns,
  rowsData,
  placeholder = "[To be updated after site data verification]"
) {
  const safeColumns = asArray(columns).length
    ? asArray(columns)
    : [{ key: "value", label: "Value" }];
  const rows = asArray(rowsData);
  if (rows.length === 0) {
    const emptyRow = {};
    safeColumns.forEach((c) => (emptyRow[c.key] = placeholder));
    return createTable(safeColumns, [emptyRow]);
  }

  const mappedRows = rows.map((r) => {
    const newRow = { ...r };
    safeColumns.forEach((c) => {
      let val = newRow[c.key];
      if (
        val === undefined ||
        val === null ||
        String(val).trim() === "" ||
        /^(data required|null|undefined|\[draft.*?\])$/i.test(
          String(val).trim()
        )
      ) {
        newRow[c.key] = placeholder;
      }
    });
    return newRow;
  });
  return createTable(safeColumns, mappedRows);
}

function mandatoryKeyValueTable(
  dataObj,
  placeholder = "[To be updated after site data verification]"
) {
  const safeObj = { ...dataObj };
  const keys = Object.keys(safeObj);
  if (keys.length === 0) {
    return keyValueTable([{ label: "Details", value: placeholder }]);
  }
  keys.forEach((k) => {
    let val = safeObj[k];
    if (
      val === undefined ||
      val === null ||
      String(val).trim() === "" ||
      /^(data required|null|undefined|\[draft.*?\])$/i.test(String(val).trim())
    ) {
      safeObj[k] = placeholder;
    }
  });
  return keyValueTable(keys.map((k) => ({ label: k, value: safeObj[k] })));
}

function generateCoverPage(info) {
  return [
    new Paragraph({
      children: [
        new TextRun({
          text: "SEE-Tech Solutions",
          bold: true,
          size: 36,
          color: "09425D",
        }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Commercial Building Energy Audit Report Format",
          size: 24,
          color: "5F6B76",
        }),
      ],
      spacing: { after: 1200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: safeText(info.reportTitle || "Detailed Energy Audit Report"),
          bold: true,
          size: 64,
          color: "09425D",
        }),
      ],
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Purpose: To identify implementable energy-saving projects with clear investment, savings, payback and execution roadmap.",
          size: 28,
          color: "18344A",
        }),
      ],
      spacing: { after: 800 },
    }),
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
    tocLine("1.2 Key Objectives", 1, false),
    tocLine("1.3 Scope of Assessment", 1, false),
    tocLine("1.4 Expected Outcomes", 1, false),
    tocLine("1.5 Strategic Importance", 1, false),
    tocLine("1.6 Key Findings", 1, false),
    tocLine("1.7 Financial Highlights", 1, false),
    tocLine("1.8 Energy Saving Potential", 1, false),
    tocLine("1.9 Recommended Implementation Approach", 1, false),

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
      const ecmTitleRaw =
        displayText(project.projectTitle) ||
        displayText(project.title) ||
        "ECM";
      const ecmNoRaw = getEcmNumberVal(project);
      const finalTitleString = formatEcmHeading(
        `3.${globalEcmIndex}`,
        ecmNoRaw,
        ecmTitleRaw
      );

      lines.push(tocLine(finalTitleString, 2, false));
    });
  });

  lines.push(tocLine("Chapter 4. Annexures", 0, true));
  lines.push(pageBreak());
  return lines;
}

function optionalTable(
  columns,
  rowsData,
  placeholder = "[To be updated after site data verification]"
) {
  const safeRows = asArray(rowsData).filter((row) => {
    if (!row) return false;
    return Object.values(row).some(
      (v) =>
        String(v || "").trim().length > 0 &&
        !/^(data required|null|undefined|\[draft.*?\])$/i.test(String(v).trim())
    );
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
  const categoryRows = (
    groupedProjects.length
      ? groupedProjects
      : [{ groupNo: "GR-1", groupTitle: "Energy Saving Projects", projects }]
  ).map((group, index) => ({
    groupNo: displayText(group.groupNo) || `GR-${index + 1}`,
    groupName: formatGroupHeading(group, index),
    ecmsIncluded: asArray(group.projects)
      .map((p) => formatEcmNumber(p))
      .filter(Boolean)
      .join(", "),
    count: asArray(group.projects).length,
    investment: formatINR(
      group.totalInvestment || totalInvestment(asArray(group.projects))
    ),
    saving: formatINR(
      group.totalAnnualSaving || totalSavings(asArray(group.projects))
    ),
    energy: formatNumber(
      group.totalEnergySaving || totalEnergy(asArray(group.projects))
    ),
    payback: formatNumber(
      group.weightedPayback || weightedPayback(asArray(group.projects)),
      2
    ),
  }));

  const priorityRows = projects
    .map((p) => {
      return {
        level: getPriorityLevel(p),
        ecms: formatEcmNumber(p),
        reason:
          getPriorityLevel(p) === "High Priority"
            ? "Favorable payback < 1.5 years"
            : getPriorityLevel(p) === "Medium Priority"
              ? "Moderate payback 1.5 - 3 years"
              : "Longer payback or high capex",
        investment: formatINR(p.estimatedInvestment),
        saving: formatINR(p.expectedAnnualCostSaving),
        payback: formatNumber(p.simplePaybackPeriod, 2),
        note: "Implementation complexity to be finalized after site verification.",
      };
    })
    .sort((a, b) => {
      const order = {
        "High Priority": 1,
        "Medium Priority": 2,
        "Long-Term Priority": 3,
      };
      return order[a.level] - order[b.level];
    });

  const renderBulletList = (items, defaultItems) => {
    const arr = asArray(items).length ? asArray(items) : defaultItems;
    return arr.map((item) => paragraph("• " + safeText(item)));
  };

  return [
    heading1("Chapter 1: Executive Summary"),

    heading2("1.1 Purpose of the Energy Audit"),
    ...renderBulletList(es.purposeText, [
      "The purpose of this detailed energy audit is to identify practical energy conservation measures that can be implemented through a disciplined combination of engineering review, operating assessment, and project-level prioritization.",
      "The audit translates observed system inefficiencies into implementation-ready opportunities so management can plan energy cost reduction actions with clear technical scope, operational relevance, and execution focus.",
    ]),

    heading2("1.2 Key Objectives"),
    ...renderBulletList(es.keyObjectives, [
      "Identify and quantify energy-saving opportunities across all major utility and process systems.",
      "Provide a structured roadmap for implementing control improvements, equipment efficiency upgrades, and system optimization initiatives.",
      "Establish baseline performance metrics to enable effective post-implementation measurement and verification.",
    ]),

    heading2("1.3 Scope of Assessment"),
    ...renderBulletList(es.scopeOfAssessment, [
      "Comprehensive review of historical energy consumption patterns and utility billing data.",
      "Detailed performance evaluation of major energy-consuming systems including HVAC, compressed air, pumping, and production machinery.",
      "Assessment of existing control logic, operating practices, and maintenance procedures impacting energy efficiency.",
    ]),

    heading2("1.4 Expected Outcomes"),
    ...renderBulletList(es.expectedOutcomes, [
      "A prioritized portfolio of energy conservation measures (ECMs) categorized by technical feasibility and financial return.",
      "Clear recommendations for immediate operational improvements requiring minimal capital investment.",
      "Strategic guidance for long-term capital planning related to major equipment replacements and system retrofits.",
    ]),

    heading2("1.5 Strategic Importance"),
    ...renderBulletList(es.strategicImportance, [
      "Enhances operational resilience by reducing exposure to energy price volatility and supply constraints.",
      "Supports corporate sustainability goals through quantifiable reductions in carbon emissions and environmental impact.",
      "Improves overall facility competitiveness by lowering production costs and optimizing resource utilization.",
    ]),

    heading2("1.6 Key Findings"),
    ...renderBulletList(es.keyFindings || es.keyObservations, [
      "The identified ECM portfolio covers multiple functional systems, allowing management to sequence implementation across operational improvements, control upgrades, and equipment-efficiency measures instead of treating all projects as a single package.",
      "Measures linked to operating control, load matching, and reduction of avoidable system losses are generally suitable early implementation candidates because they strengthen performance discipline while preparing the site team for larger retrofit actions.",
      "Projects associated with major utility systems and continuously operating process support equipment warrant close management attention because sustained operating hours make these systems important contributors to the overall energy-improvement roadmap.",
    ]),

    heading2("1.7 Financial Highlights"),
    ...renderBulletList(es.financialHighlightsNarrative, [
      "The proposed energy conservation measures offer a highly attractive financial return, driven by significant reductions in annual operating costs.",
      "A balanced mix of low-cost operational improvements and high-return capital projects provides a robust investment portfolio for management consideration.",
    ]),
    createTable(
      [
        { key: "particular", label: "Particular" },
        { key: "value", label: "Value" },
      ],
      [
        {
          particular: "Total annual electricity consumption",
          value: es.totalAnnualElectricityConsumption,
        },
        {
          particular: "Annual electricity cost",
          value: formatINR(es.annualElectricityCost),
        },
        {
          particular: "Average electricity tariff considered",
          value: formatINR(es.averageTariff),
        },
        {
          particular: "Number of projects identified",
          value: es.numberOfProjects || projects.length,
        },
        {
          particular: "Total energy saving potential",
          value: formatNumber(energy),
        },
        {
          particular: "Total annual cost saving potential",
          value: formatINR(saving),
        },
        {
          particular: "Total estimated investment",
          value: formatINR(investment),
        },
        {
          particular: "Simple payback period",
          value: formatNumber(
            es.simplePaybackPeriod || weightedPayback(projects),
            2
          ),
        },
        {
          particular: "CO2 reduction potential",
          value:
            formatNumber(es.co2ReductionPotential) ||
            "[Calculation pending due to missing emission factor]",
        },
      ]
    ),

    heading2("1.8 Energy Saving Potential"),
    ...renderBulletList(es.energySavingPotentialNarrative, [
      "Substantial energy savings can be achieved through a combination of enhanced system controls, elimination of avoidable losses, and targeted equipment upgrades.",
      "The projected energy reductions are grounded in verified baseline data and conservative engineering calculations to ensure reliable and achievable outcomes.",
    ]),
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
        project:
          displayText(project.projectTitle) || safeText(project.projectTitle),
        system: project.system,
        investment: formatINR(project.estimatedInvestment),
        saving: formatINR(project.expectedAnnualCostSaving),
        energy: formatNumber(project.expectedEnergySaving),
      }))
    ),

    heading2("1.9 Recommended Implementation Approach"),
    ...renderBulletList(
      es.recommendedImplementationApproach || es.conclusionAndWayForward,
      [
        "Review the identified ECM portfolio group-wise so implementation can be sequenced across quick operational actions, control improvements, and larger retrofit measures.",
        "Confirm project-wise priority, execution windows, and cross-functional ownership with plant, maintenance, production, and electrical teams before detailed engineering begins.",
        "Develop detailed engineering, technical specifications, and integration requirements for the shortlisted measures, including instrumentation, controls, and safety interfaces.",
        "Carry out installation, control tuning, testing, and commissioning with documented baseline reference and post-implementation performance checks.",
      ]
    ),

    heading3("1.9.1 Project Grouping"),
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

    heading3("1.9.2 Recommended Implementation Priority"),
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

    heading3("1.9.3 Action Plan"),
    optionalTable(
      [
        { key: "step", label: "Step" },
        { key: "action", label: "Action" },
      ],
      report.summary || [
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

function optionalKeyValueTable(
  dataObj,
  placeholder = "[To be updated after site data verification]"
) {
  if (!dataObj) return paragraph(placeholder);
  const safeKeys = Object.keys(dataObj).filter(
    (k) =>
      dataObj[k] !== undefined &&
      dataObj[k] !== null &&
      String(dataObj[k]).trim() !== "" &&
      !/^(data required|null|undefined|\[draft.*?\])$/i.test(
        String(dataObj[k]).trim()
      )
  );
  if (safeKeys.length === 0) {
    return paragraph(placeholder);
  }
  return keyValueTable(safeKeys.map((k) => ({ label: k, value: dataObj[k] })));
}

function generateBuildingProfile(report) {
  const bp = report.buildingProfile || {};
  const esd = report.electricalSupplyDetails || {};
  const benchmark = report.specificEnergyBenchmark || {};
  const placeholder = "[To be updated after site data verification]";
  return [
    heading1("Chapter 2: Plant / Building Details and Energy Profile"),

    heading2("2.1 General Information"),
    mandatoryKeyValueTable({
      "Name of facility": bp.facilityName || report.reportInfo?.clientName,
      Address: bp.address,
      "Type of building": bp.typeOfBuilding || report.reportInfo?.buildingType,
      "Year of construction": bp.yearOfConstruction,
      "Total built-up area": bp.totalBuiltUpArea,
      "Conditioned area": bp.conditionedArea,
      "Number of floors": bp.numberOfFloors,
      "Occupancy type": bp.occupancyType,
      "Average occupancy": bp.averageOccupancy,
      "Operating days and hours": bp.operatingDaysAndHours,
      "Facility contact person": bp.facilityContactPerson,
      "Audit date": report.reportInfo?.auditPeriod,
      "SEE-Tech audit team":
        report.reportInfo?.preparedBy || "SEE-Tech Solutions",
    }),

    heading2("2.2 Building Operation Details"),
    mandatoryTable(
      [
        { key: "area", label: "Area / Function" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "remarks", label: "Remarks" },
      ],
      asArray(report.buildingOperationDetails).length
        ? report.buildingOperationDetails
        : [
            { area: "Office area" },
            { area: "Common area" },
            { area: "Basement / parking" },
            { area: "Server room / data room" },
            { area: "Kitchen" },
            { area: "Laundry" },
            { area: "Guest rooms" },
            { area: "Patient rooms / wards" },
            { area: "OT / ICU / critical areas" },
          ]
    ),

    heading2("2.3 Utility and Energy Sources"),
    mandatoryTable(
      [
        { key: "energySource", label: "Energy Source" },
        { key: "use", label: "Use" },
        { key: "annualConsumption", label: "Annual Consumption" },
        { key: "annualCost", label: "Annual Cost ₹" },
      ],
      asArray(report.utilityAndEnergySources).length
        ? report.utilityAndEnergySources
        : [
            {
              energySource: "Grid electricity",
              use: "HVAC, lighting, pumps, plug loads",
            },
            { energySource: "Diesel", use: "DG backup" },
            { energySource: "PNG / LPG", use: "Kitchen, boiler, hot water" },
            { energySource: "Solar PV", use: "Captive generation" },
            { energySource: "Solar thermal", use: "Hot water" },
            { energySource: "Other", use: "" },
          ]
    ),

    heading2("2.4 Electrical Supply Details"),
    mandatoryKeyValueTable({
      "Supply voltage": esd.supplyVoltage,
      "Consumer number": esd.consumerNumber,
      "Tariff category": esd.tariffCategory,
      "Contract demand / sanctioned load":
        esd.contractDemand || esd.sanctionedLoad,
      "Connected load": esd.connectedLoad,
      "Transformer capacity": esd.transformerCapacity,
      "DG capacity": esd.dgCapacity,
      "APFC panel capacity": esd.apfcPanelCapacity,
      "Average power factor": esd.powerFactor || esd.averagePowerFactor,
      "Billing type": esd.billingType,
      "Average electricity tariff":
        esd.averageElectricityTariff ||
        formatINR(report.executiveSummary?.averageTariff),
    }),

    heading2("2.5 Electricity Consumption and Billing Summary"),
    mandatoryTable(
      [
        { key: "month", label: "Month" },
        { key: "kwh", label: "kWh" },
        { key: "kvah", label: "kVAh" },
        { key: "demand", label: "Maximum Demand kVA" },
        { key: "pf", label: "PF" },
        { key: "bill", label: "Bill Amount ₹" },
        { key: "sec", label: "Specific Consumption" },
      ],
      asArray(report.monthlyBillingSummary).length
        ? report.monthlyBillingSummary
        : [
            { month: "Apr" },
            { month: "May" },
            { month: "Jun" },
            { month: "Jul" },
            { month: "Aug" },
            { month: "Sep" },
            { month: "Oct" },
            { month: "Nov" },
            { month: "Dec" },
            { month: "Jan" },
            { month: "Feb" },
            { month: "Mar" },
            { month: "Total / Average" },
          ]
    ),

    heading2("2.6 Specific Energy Consumption Benchmark"),
    mandatoryTable(
      [
        { key: "buildingType", label: "Building Type" },
        { key: "benchmark", label: "Recommended Benchmark" },
      ],
      [
        { buildingType: "Office building", benchmark: "kWh/sq.ft/year" },
        {
          buildingType: "IT park",
          benchmark: "kWh/sq.ft/year and kWh/workstation/year",
        },
        { buildingType: "Hotel", benchmark: "kWh/occupied room night" },
        {
          buildingType: "Hospital",
          benchmark: "kWh/bed/day or kWh/sq.ft/year",
        },
        { buildingType: "Mall", benchmark: "kWh/sq.ft/year" },
        {
          buildingType: "Educational building",
          benchmark: "kWh/student/year or kWh/sq.ft/year",
        },
      ]
    ),
    mandatoryKeyValueTable({
      "Annual electricity consumption": benchmark.annualElectricityConsumption,
      "Built-up area": benchmark.builtUpArea,
      "Conditioned area": benchmark.conditionedArea,
      "Annual occupancy / room nights / bed days": benchmark.annualOccupancy,
      "Specific energy consumption": benchmark.specificEnergyConsumption,
      "Reference / target benchmark": benchmark.referenceBenchmark,
      "Improvement potential": benchmark.improvementPotential,
    }),

    heading2("2.7 Major Energy-Consuming Systems"),
    mandatoryTable(
      [
        { key: "system", label: "System" },
        { key: "majorEquipment", label: "Major Equipment" },
        {
          key: "estimatedShare",
          label: "Estimated Share of Energy Consumption",
        },
        { key: "remarks", label: "Remarks" },
      ],
      asArray(report.majorEnergyConsumingSystems).length
        ? report.majorEnergyConsumingSystems
        : [
            {
              system: "HVAC",
              majorEquipment: "Chiller / VRF / AHU / pumps / cooling tower",
            },
            {
              system: "Lighting",
              majorEquipment: "Indoor / outdoor / parking / facade",
            },
            {
              system: "Pumps",
              majorEquipment: "Domestic / STP / hot water / HVAC",
            },
            {
              system: "Plug loads",
              majorEquipment: "Office equipment / appliances",
            },
            {
              system: "Server / IT loads",
              majorEquipment: "UPS, PAC, server room",
            },
            {
              system: "Kitchen / laundry",
              majorEquipment: "Hotel / hospital loads",
            },
            {
              system: "Hot water system",
              majorEquipment: "Boiler / heat pump / solar",
            },
            {
              system: "Lifts / escalators",
              majorEquipment: "Vertical transport",
            },
          ]
    ),

    heading2("2.8 HVAC System Details"),
    mandatoryTable(
      [
        { key: "equipment", label: "Equipment" },
        { key: "capacity", label: "Capacity" },
        { key: "quantity", label: "Quantity" },
        { key: "connectedLoad", label: "Connected Load" },
        { key: "controlSystem", label: "Control System" },
        { key: "remarks", label: "Remarks" },
      ],
      asArray(report.hvacSystemDetails).length
        ? report.hvacSystemDetails
        : [
            { equipment: "Chiller / VRF outdoor unit" },
            { equipment: "AHU" },
            { equipment: "FCU" },
            { equipment: "Cooling tower" },
            { equipment: "Chilled water pump" },
            { equipment: "Condenser water pump" },
            { equipment: "Fresh air unit" },
            { equipment: "Exhaust / ventilation fan" },
          ]
    ),
    paragraph(
      "The HVAC system is one of the major energy-consuming systems in the building. During the audit, operating hours, loading pattern, temperature settings, pump and fan operation, control philosophy and maintenance condition should be reviewed. The main opportunities may relate to variable speed operation, AHU scheduling, chiller efficiency, fresh air optimization, cooling tower performance or set point optimization."
    ),

    heading2("2.9 Lighting System Details"),
    mandatoryTable(
      [
        { key: "area", label: "Area" },
        { key: "type", label: "Existing Fixture" },
        { key: "wattage", label: "Wattage" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "control", label: "Control Type" },
      ],
      asArray(report.lightingSystemDetails).length
        ? report.lightingSystemDetails
        : [
            { area: "Office area" },
            { area: "Corridor" },
            { area: "Parking" },
            { area: "Outdoor" },
            { area: "Back-of-house" },
            { area: "Guest room / ward" },
          ]
    ),
    paragraph(
      "Lighting energy consumption can be reduced through LED retrofit, lux optimization and occupancy-based controls. Corridors, parking areas, toilets, staircases and service areas are usually suitable for sensors or timer-based control."
    ),

    heading2("2.10 Pumps and Motors"),
    mandatoryTable(
      [
        { key: "name", label: "Pump / Motor" },
        { key: "application", label: "Application" },
        { key: "rating", label: "Rating kW" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "control", label: "Control Method" },
        { key: "remarks", label: "Remarks" },
      ],
      asArray(report.pumpAndMotorDetails).length
        ? report.pumpAndMotorDetails
        : [
            { name: "Domestic water pump" },
            { name: "Hydro-pneumatic pump" },
            { name: "STP pump / blower" },
            { name: "Hot water pump" },
            { name: "HVAC pump" },
            { name: "Exhaust fan" },
          ]
    ),

    heading2("2.11 Building Automation and Controls"),
    mandatoryTable(
      [
        { key: "system", label: "System" },
        { key: "existingControl", label: "Existing Control" },
        { key: "observation", label: "Observation" },
        { key: "savingOpportunity", label: "Saving Opportunity" },
      ],
      asArray(report.automationAndControls).length
        ? report.automationAndControls
        : [
            { system: "HVAC scheduling" },
            { system: "AHU control" },
            { system: "Pump control" },
            { system: "Lighting control" },
            { system: "Parking ventilation" },
            { system: "Temperature set point" },
            { system: "Energy monitoring" },
          ]
    ),

    heading2("2.12 Summary of Audit Observations"),
    mandatoryTable(
      [
        { key: "srNo", label: "Sr. No." },
        { key: "observation", label: "Observation" },
        { key: "impact", label: "Impact" },
        { key: "recommendation", label: "Recommended Project" },
      ],
      asArray(report.auditObservations).length
        ? report.auditObservations
        : [
            {
              srNo: 1,
              observation: "[To be updated after site data verification]",
              impact: "High energy consumption",
            },
            {
              srNo: 2,
              observation: "[To be updated after site data verification]",
              impact: "Higher demand / kVAh billing",
            },
            {
              srNo: 3,
              observation: "[To be updated after site data verification]",
              impact: "Excess operating hours",
            },
            {
              srNo: 4,
              observation: "[To be updated after site data verification]",
              impact: "Inefficient equipment",
            },
            {
              srNo: 5,
              observation: "[To be updated after site data verification]",
              impact: "Poor control / manual operation",
            },
          ]
    ),
    pageBreak(),
  ];
}

function getFallbackActivities() {
  return [
    {
      activity: "Engineering",
      details: "Detailed engineering and layout finalization",
      responsibility: "Vendor / SEE-Tech",
    },
    {
      activity: "Procurement",
      details: "Equipment ordering and vendor finalization",
      responsibility: "Client",
    },
    {
      activity: "Installation",
      details: "Erection, piping, cabling, and modification",
      responsibility: "Vendor / Contractor",
    },
    {
      activity: "Commissioning",
      details: "Testing, commissioning, and handover",
      responsibility: "Vendor / SEE-Tech",
    },
  ];
}

function generateProjectChapter(project, groupNumber, ecmIndexWithinGroup) {
  const ecmType = classifyEcmType(project);
  const ecmTitleRaw =
    displayText(project.projectTitle) ||
    displayText(project.title) ||
    displayText(project.ecmName) ||
    "ECM";
  const ecmNoRaw = getEcmNumberVal(project);
  const ecmNo = formatEcmNumber(ecmNoRaw);
  const ecmSectionNumber = `${groupNumber}.${ecmIndexWithinGroup}`;

  const rawCleanTitle = ecmTitleRaw
    .replace(/^(ECM|Ecm|ecm)\s*\d*\s*[-–:]*\s*/i, "")
    .trim();
  const cleanTitle = sanitizePromptLeakageText(rawCleanTitle, ecmType);

  let lines = [
    new Paragraph({
      children: [
        new TextRun({
          text: formatEcmHeading(ecmSectionNumber, ecmNoRaw, cleanTitle),
          bold: true,
          size: 28,
          color: "09425D",
        }),
      ],
      spacing: { before: 240, after: 120 },
    }),

    // 3.x.1 Project Summary
    heading3(`${ecmSectionNumber}.1 Project Summary`),
    createTable(
      [
        { key: "particular", label: "Particular" },
        { key: "value", label: "Details" },
      ],
      buildProjectSummaryRows(project, cleanTitle, ecmNo)
    ),

    // 3.x.2 Existing System Description
    heading3(`${ecmSectionNumber}.2 Existing System Description`),
    ...bulletParagraphsFromText(
      sanitizePromptLeakageText(
        project.existingSystemDescription ||
          project.existingOperatingCondition ||
          project.baselineDetails,
        ecmType
      )
    ),

    // 3.x.3 Baseline Data and Measurements
    heading3(`${ecmSectionNumber}.3 Baseline Data and Measurements`),
    createTable(
      [
        { key: "parameter", label: "Parameter" },
        { key: "unit", label: "Unit" },
        { key: "value", label: "Value" },
      ],
      buildBaselineDataRows(project)
    ),
    new Paragraph({ spacing: { after: 120 } }),
    createTable(
      [
        { key: "measurement", label: "Measurement" },
        { key: "unit", label: "Unit" },
        { key: "value", label: "Value" },
      ],
      buildMeasurementRows(project)
    ),

    // 3.x.4 Problem / Gap Identified
    heading3(`${ecmSectionNumber}.4 Problem / Gap Identified`),
    ...bulletParagraphsFromText(sanitizePromptLeakageText(project.problemGapIdentified, ecmType)),
    mandatoryTable(
      [
        { key: "system", label: "System" },
        { key: "gap", label: "Typical Gap" },
      ],
      project.problemGapTable && project.problemGapTable.length > 0
        ? project.problemGapTable
        : [
            {
              system:
                ecmType === "heat_recovery"
                  ? "Heat recovery"
                  : ecmType === "thermal_insulation"
                    ? "Insulation"
                    : ecmType === "ir_heater_retrofit"
                      ? "Insulation"
                      : ecmType === "apfc_power_factor_correction"
                        ? "APFC"
                        : ecmType === "compressed_air_management"
                          ? "Compressed air"
                          : "System",
              gap:
                ecmType === "heat_recovery"
                  ? "Waste heat discharged without useful recovery"
                  : ecmType === "thermal_insulation"
                    ? "Heat loss from exposed hot surfaces or ducts"
                    : ecmType === "ir_heater_retrofit"
                      ? "Heat loss from exposed hot surfaces or ducts"
                      : ecmType === "apfc_power_factor_correction"
                        ? "Low PF or kVAh billing loss"
                        : ecmType === "compressed_air_management"
                          ? "Air leakage, pressure drops, inefficient generation"
                          : "[To be updated after site data verification]",
            },
          ]
    ),

    // 3.x.5 Proposed Project
    heading3(`${ecmSectionNumber}.5 Proposed Project`),
    ...bulletParagraphsFromText(
      sanitizePromptLeakageText(
        project.proposedProjectDescription || project.proposedIntervention || project.proposedProject,
        ecmType
      )
    ),
    createTable(
      [
        { key: "srNo", label: "Sr. No." },
        { key: "scopeItem", label: "Scope Item" },
      ],
      buildScopeOfWorkRows(ecmType, project)
    ),

    // 3.x.6 Key Activities for Implementation
    heading3(`${ecmSectionNumber}.6 Key Activities for Implementation`),
    createTable(
      [
        { key: "activity", label: "Activity" },
        { key: "details", label: "Details" },
        { key: "responsibility", label: "Responsibility" },
      ],
      buildKeyActivityRows(ecmType, project)
    ),

    // 3.x.7 Rationale for Energy Saving
    heading3(`${ecmSectionNumber}.7 Rationale for Energy Saving`),
    ...bulletParagraphsFromText(
      sanitizePromptLeakageText(project.rationaleForEnergySaving, ecmType)
    ),
    mandatoryTable(
      [
        { key: "projectType", label: "Project Type" },
        { key: "savingRationale", label: "Saving Rationale" },
      ],
      project.rationaleTable && project.rationaleTable.length > 0
        ? project.rationaleTable
        : [
            {
              projectType:
                ecmType === "heat_recovery"
                  ? "Heat recovery"
                  : ecmType === "thermal_insulation"
                    ? "Insulation"
                    : ecmType === "ir_heater_retrofit"
                      ? "Insulation"
                      : ecmType === "apfc_power_factor_correction"
                        ? "APFC"
                        : ecmType === "compressed_air_management"
                          ? "Compressed air"
                          : "Project",
              savingRationale: "[To be updated after site data verification]",
            },
          ]
    ),

    // 3.x.8 Energy Saving Calculation
    heading3(`${ecmSectionNumber}.8 Energy Saving Calculation`),
    createTable(
      [
        { key: "parameter", label: "Parameter" },
        { key: "unit", label: "Unit" },
        { key: "value", label: "Value" },
      ],
      buildEnergySavingCalculationRows(project)
    ),
    new Paragraph({
      children: [
        new TextRun({
          text: "Annual Energy Saving = Load Reduction × Annual Operating Hours | Annual Cost Saving = Annual Energy Saving × Average Electricity Tariff | Simple Payback = Estimated Investment / Annual Cost Saving",
          italics: true,
          size: 20,
          color: "5F6B76",
        }),
      ],
      spacing: { before: 60, after: 120 },
      alignment: AlignmentType.CENTER,
    }),

    // 3.x.9 Key Metrics
    heading3(`${ecmSectionNumber}.9 Key Metrics`),
    createTable(
      [
        { key: "srNo", label: "Sr. No." },
        { key: "parameter", label: "Parameter" },
        { key: "value", label: "Value" },
      ],
      buildKeyMetricRows(project)
    ),

    // 3.x.10 Technical Specifications
    heading3(`${ecmSectionNumber}.10 Technical Specifications`),
    createTable(
      [
        { key: "item", label: "Item" },
        { key: "specification", label: "Specification" },
      ],
      buildTechnicalSpecificationRows(ecmType, project)
    ),

    // 3.x.11 Schematic / Conceptual Framework
    heading3(`${ecmSectionNumber}.11 Schematic / Conceptual Framework`),
    createTable(
      [
        { key: "stage", label: "Stage" },
        { key: "description", label: "Description" },
      ],
      project.schematicFramework && project.schematicFramework.length
        ? project.schematicFramework
        : [
            {
              stage: "Stage 1: Current State",
              description: "Existing inefficient or non-optimized operation",
            },
            {
              stage: "Stage 2: Intervention",
              description: "What SEE-Tech will install or modify",
            },
            {
              stage: "Stage 3: Physics of Saving",
              description: "Why energy will reduce after the intervention",
            },
            {
              stage: "Stage 4: Outcome",
              description:
                "kWh saving, ₹ saving, payback and reliability benefit",
            },
          ]
    ),
    new Paragraph({
      children: [
        new TextRun({
          text: "[Schematic / conceptual diagram to be inserted after engineering finalization]",
          italics: true,
          size: 20,
          color: "5F6B76",
        }),
      ],
      spacing: { before: 60, after: 120 },
      alignment: AlignmentType.CENTER,
    }),

    // 3.x.12 Implementation Duration
    heading3(`${ecmSectionNumber}.12 Implementation Duration`),
    createTable(
      [
        { key: "activity", label: "Activity" },
        { key: "duration", label: "Duration" },
      ],
      project.implementationDurationTable &&
        project.implementationDurationTable.length
        ? project.implementationDurationTable
        : [
            { activity: "Engineering and approval", duration: "1 week" },
            { activity: "Procurement", duration: "2-4 weeks" },
            { activity: "Installation", duration: "1-2 weeks" },
            { activity: "Testing and commissioning", duration: "1 week" },
            { activity: "Performance monitoring", duration: "2-4 weeks" },
            {
              activity: "Total expected duration",
              duration:
                safeText(project.implementationDuration) ||
                "[To be updated after site data verification]",
            },
          ]
    ),

    // 3.x.13 Precautions / Aspects to be Taken Care Of
    heading3(
      `${ecmSectionNumber}.13 Precautions / Aspects to be Taken Care Of`
    ),
    ...bulletParagraphsFromText(sanitizePromptLeakageText(project.aspectsToBeTakenCareOf || project.precautions, ecmType)),
    createTable(
      [
        { key: "area", label: "Area" },
        { key: "precaution", label: "Precaution" },
      ],
      project.aspectsToBeTakenCareOfTable &&
        project.aspectsToBeTakenCareOfTable.length
        ? project.aspectsToBeTakenCareOfTable
        : [
            {
              area: "Technical suitability",
              precaution: "Confirm equipment rating, sizing and compatibility",
            },
            {
              area: "Operation",
              precaution:
                "Ensure project does not affect comfort, safety or process requirement",
            },
            {
              area: "Controls",
              precaution: "Test control logic under different load conditions",
            },
            {
              area: "Electrical safety",
              precaution: "Ensure proper protection, earthing and panel safety",
            },
            {
              area: "Maintenance",
              precaution:
                "Train maintenance team for operation and troubleshooting",
            },
            {
              area: "Measurement",
              precaution: "Record before and after data for savings validation",
            },
            {
              area: "Shutdown planning",
              precaution:
                "Plan installation during low-load or non-operating hours",
            },
          ]
    ),

    // 3.x.14 Measurement and Verification Plan
    heading3(`${ecmSectionNumber}.14 Measurement and Verification Plan`),
    ...bulletParagraphsFromText(sanitizePromptLeakageText(project.measurementVerificationPlan || project.mvPlan, ecmType)),
    createTable(
      [
        { key: "parameter", label: "Parameter" },
        { key: "baselineMeasurement", label: "Baseline Measurement" },
        {
          key: "postImplementationMeasurement",
          label: "Post-Implementation Measurement",
        },
      ],
      buildMvPlanRows(ecmType, project)
    ),
    new Paragraph({
      children: [
        new TextRun({
          text: "Savings shall be validated by measuring the power consumption and operating pattern before and after implementation. The final saving will be calculated based on measured load reduction, actual operating hours and applicable electricity tariff.",
          size: 20,
          color: "5F6B76",
        }),
      ],
      spacing: { before: 60, after: 120 },
    }),

    // 3.x.15 Benefits Other Than Energy Saving
    heading3(`${ecmSectionNumber}.15 Benefits Other Than Energy Saving`),
    ...bulletParagraphsFromText(sanitizePromptLeakageText(project.benefitsOtherThanEnergySaving || project.benefits, ecmType)),
    createTable(
      [
        { key: "benefit", label: "Benefit" },
        { key: "description", label: "Description" },
      ],
      buildBenefitRows(ecmType, project)
    ),

    // 3.x.16 Carbon Footprint Reduction
    heading3(`${ecmSectionNumber}.16 Carbon Footprint Reduction`),
    paragraph(
      project.co2ReductionPotential
        ? `The estimated carbon footprint reduction is ${formatNumber(project.co2ReductionPotential)} kgCO2/year based on the projected energy savings.`
        : "[Calculation pending due to missing emission factor]"
    ),

    // 3.x.17 Case Study / Reference Application
    heading3(`${ecmSectionNumber}.17 Case Study / Reference Application`),
    ...bulletParagraphsFromText(sanitizePromptLeakageText(project.caseStudy, ecmType)),

    // 3.x.18 Project Conclusion
    heading3(`${ecmSectionNumber}.18 Project Conclusion`),
    ...bulletParagraphsFromText(sanitizePromptLeakageText(project.conclusion || project.finalConclusion, ecmType)),
  ];

  return lines;
}

function generateAnnexures() {
  return [
    heading1("Chapter 4: Annexures"),
    heading2("4.1 Uploaded Data Sources"),
    paragraph(
      "Uploaded spreadsheets, measurements, and supporting documents used for this report are referenced here."
    ),
    heading2("4.2 Assumptions"),
    paragraph(
      "Savings, investment, and implementation assumptions are based on the data made available during the audit and SEE-Tech engineering judgment where direct readings were not available."
    ),
    heading2("4.3 Image / Figure References"),
    paragraph(
      "Photographs, schematics, and reference figures included in the report are listed in this section."
    ),
    heading2("4.4 Calculation Notes"),
    paragraph(
      "Calculation notes, formulas, and validation references supporting the ECM analysis are documented here."
    ),
  ];
}

function removeDataRequired(obj) {
  if (typeof obj === "string") {
    let safe = obj.trim();
    safe = safe.replace(/\[DRAFT - QC REVIEW REQUIRED\]/gi, "");
    safe = safe.replace(/data required[^.]*\.?/gi, "");
    safe = safe.replace(/undefined/gi, "");
    safe = safe.replace(/null/gi, "");
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
    safe = safe.replace(/ecm\s+ecm/gi, "ECM");
    if (!safe.trim()) return "";
    return safe.trim();
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
async function buildCommercialBuildingEnergyAuditDocx(rawReportData) {
  const enforcedReportData = enforceReportQuality(rawReportData);
  const cleanReportData = removeDataRequired(enforcedReportData);
  const report = normalizeReportForExport(cleanReportData);
  const projects = asArray(report.projects);
  const groupedProjects = asArray(report.groupedProjects).length
    ? asArray(report.groupedProjects)
    : [
        {
          groupNo: "GR-1",
          groupTitle: "Energy Saving Projects",
          projects,
          totalInvestment: totalInvestment(projects),
          totalAnnualSaving: totalSavings(projects),
          totalEnergySaving: totalEnergy(projects),
          weightedPayback: weightedPayback(projects),
        },
      ];

  if (!projects.length) {
    throw new Error("No valid ECM projects available for export.");
  }

  const children = [
    ...generateCoverPage(report.reportInfo || {}),
    ...generateTableOfContents(groupedProjects),
    ...generateExecutiveSummary(report, projects, groupedProjects),
    ...generateBuildingProfile(report),
    heading1("Chapter 3: Energy Saving Projects"),
    paragraph(
      "This chapter presents the identified energy conservation measures grouped by system and application area. Each group includes a summary table followed by detailed ECM descriptions."
    ),
    pageBreak(),
  ];

  let globalStartIndex = 0;
  groupedProjects.forEach((group, index) => {
    const groupProjects = asArray(group.projects);
    children.push(heading2(formatGroupHeading(group, index)));
    children.push(
      paragraph(
        group.summaryParagraph ||
          `This section covers ${groupProjects.length} energy conservation measures under the ${safeText(group.groupTitle)} category.`
      )
    );
    children.push(heading3("Group Observation"));
    children.push(
      paragraph(
        group.technicalObservation ||
          "The measures in this group focus on improving system control discipline, reducing avoidable losses, and supporting a more structured implementation roadmap."
      )
    );
    children.push(heading3("Implementation Focus"));
    children.push(
      paragraph(
        group.implementationStrategy ||
          "Implementation should combine site verification, detailed engineering, coordinated execution, and post-commissioning performance review."
      )
    );
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
          projectTitle:
            displayText(project.projectTitle) || safeText(project.projectTitle),
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
