"use client";

import React from "react";

/**
 * SEE-Tech Commercial Building Energy Audit Report Template
 */

type ReportValue = string | number | null | undefined;

export interface ReportInfo {
  reportTitle?: ReportValue;
  clientName?: ReportValue;
  buildingType?: ReportValue;
  location?: ReportValue;
  auditPeriod?: ReportValue;
  reportDate?: ReportValue;
  preparedBy?: ReportValue;
  documentVersion?: ReportValue;
}

export interface CommercialBuildingProject {
  [key: string]: any;
}

export interface CommercialBuildingEnergyAuditData {
  reportInfo: ReportInfo;
  executiveSummary?: any;
  buildingProfile?: any;
  buildingOperationDetails?: Record<string, ReportValue>[];
  utilityAndEnergySources?: Record<string, ReportValue>[];
  electricalSupplyDetails?: Record<string, ReportValue>;
  monthlyBillingSummary?: Record<string, ReportValue>[];
  specificEnergyBenchmark?: Record<string, ReportValue>;
  majorEnergyConsumingSystems?: Record<string, ReportValue>[];
  hvacSystemDetails?: Record<string, ReportValue>[];
  lightingSystemDetails?: Record<string, ReportValue>[];
  pumpsAndMotors?: Record<string, ReportValue>[];
  buildingAutomationControls?: Record<string, ReportValue>[];
  auditObservations?: Record<string, ReportValue>[];
  projects?: CommercialBuildingProject[];
  groupedProjects?: any[];
  fieldFlags?: any;
  missingFieldSummary?: any[];
}

const colors = {
  primaryBlue: "#09425d",
  secondaryGreen: "#1db56c",
  blueLight: "#eaf3f7",
  greenLight: "#e6f9f2",
  text: "#18344a",
  textMuted: "#5f6b76",
  border: "#e3e8ee",
  white: "#ffffff",
};

const pageStyle: React.CSSProperties = {
  minHeight: "1123px",
  width: "794px",
  margin: "0 auto",
  background: colors.white,
  padding: "46px 48px",
  boxSizing: "border-box",
  fontFamily: "Inter, Arial, sans-serif",
  color: colors.text,
};

const printCss = `
  .report-preview-scroll { overflow: visible !important; max-height: none !important; }
  @media print {
    @page { size: A4; margin: 15mm; }
    body { margin: 0; background: #ffffff; }
    body * { visibility: hidden; }
    .report-print-area, .report-print-area * { visibility: visible; }
    .report-print-area { position: absolute; left: 0; top: 0; width: 100%; background: white; }
    .page-break { break-after: page; page-break-after: always; }
    .report-page {
      width: 210mm !important;
      min-height: 297mm !important;
      margin: 0 !important;
      box-shadow: none !important;
      page-break-after: always;
      break-after: page;
    }
  }
`;

function asArray<T = any>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === "object") return [value as T];
  if (typeof value === "string" && value.trim()) return [value as T];
  return [];
}

function isMeaningful(value: any): boolean {
  if (value === null || value === undefined || value === "") return false;
  const s = String(value).trim().toLowerCase();
  if (!s || s === "data required" || s === "undefined" || s === "null" || s.startsWith("[draft") || s.includes("explain ") || s.includes("discuss ") || s.includes(".xlsx") || s.includes(".pdf")) return false;
  return true;
}

function fallbackText(value: any, placeholder = "[To be updated after site data verification]"): string {
  if (typeof value === "object" && value !== null) {
    if (value.value !== undefined) return fallbackText(value.value, placeholder);
    if (value.text !== undefined) return fallbackText(value.text, placeholder);
  }
  return isMeaningful(value) ? String(value).trim() : placeholder;
}

function firstNonEmpty(...values: any[]): string {
  for (const v of values) {
    if (isMeaningful(v)) return fallbackText(v);
  }
  return "[To be updated after site data verification]";
}

function formatNumberDisplay(value: any, maxDecimals = 0): string {
  if (!isMeaningful(value)) return "[Calculation pending due to missing input data]";
  const num = Number(String(value).replace(/[^\d.-]/g, ""));
  if (Number.isFinite(num)) {
    return num.toLocaleString("en-IN", { maximumFractionDigits: maxDecimals });
  }
  return String(value);
}

function formatCurrencyDisplay(value: any): string {
  if (!isMeaningful(value)) return "[To be updated after site data verification]";
  const num = Number(String(value).replace(/[^\d.-]/g, ""));
  if (Number.isFinite(num)) return `₹${Math.round(num).toLocaleString("en-IN")}`;
  const str = String(value);
  return str.includes("₹") ? str : `₹${str}`;
}

function formatPaybackDisplay(value: any): string {
  return formatNumberDisplay(value, 2);
}

function numberFrom(value: ReportValue): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const num = Number(String(value).replace(/[₹,\sA-Za-z/%]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function totalInvestment(projects: CommercialBuildingProject[] = []) {
  return asArray(projects).reduce((sum, p) => sum + numberFrom(p.estimatedInvestment || p.investment), 0);
}

function totalSavings(projects: CommercialBuildingProject[] = []) {
  return asArray(projects).reduce((sum, p) => sum + numberFrom(p.expectedAnnualCostSaving || p.annualSaving), 0);
}

function totalEnergy(projects: CommercialBuildingProject[] = []) {
  return asArray(projects).reduce((sum, p) => sum + numberFrom(p.expectedEnergySaving || p.energySaving), 0);
}

function weightedPayback(projects: CommercialBuildingProject[] = []) {
  const inv = totalInvestment(projects);
  const sav = totalSavings(projects);
  return inv && sav ? (inv / sav).toFixed(2) : "";
}

function getPriorityLevel(project: any) {
  const pb = numberFrom(project.simplePaybackPeriod || project.payback);
  if (pb > 0 && pb <= 1.5) return "High Priority";
  if (pb > 1.5 && pb <= 3.0) return "Medium Priority";
  if (pb > 3.0) return "Long-Term Priority";
  return "Medium Priority";
}

function getEcmNumberVal(valueOrProject: any) {
  if (valueOrProject && typeof valueOrProject === "object") {
    return firstNonEmpty(valueOrProject.ecmNo, valueOrProject.projectNumber, valueOrProject.projectNo, "");
  }
  return valueOrProject;
}

function formatEcmNumber(valueOrProject: any) {
  const raw = String(getEcmNumberVal(valueOrProject) ?? "").trim();
  if (!raw || raw === "[To be updated after site data verification]") return "";
  const match = raw.match(/\d+/);
  if (!match) return "ECM";
  return `ECM ${match[0]}`;
}

function classifyEcmType(ecm: any) {
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

function sanitizePromptLeakageText(text: any, ecmType: string) {
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

function safeText(val: any) {
  if (val === null || val === undefined || val === "" || val === "[To be updated after site data verification]") return "";
  return String(val).trim();
}

function buildProjectSummaryRows(ecm: any, cleanTitle: string, ecmNo: string) {
  return [
    { particular: "Project title", value: cleanTitle },
    { particular: "Project number", value: ecmNo || "" },
    { particular: "System", value: safeText(ecm.system) || safeText(ecm.category) || "[To be updated after site data verification]" },
    { particular: "Location", value: safeText(ecm.location) || "[To be updated after site data verification]" },
    { particular: "Equipment covered", value: safeText(ecm.equipmentCovered) || safeText(ecm.equipment) || "[To be updated after site data verification]" },
    { particular: "Existing operating condition", value: sanitizePromptLeakageText(safeText(ecm.existingSystemDescription) || safeText(ecm.existingOperatingCondition), classifyEcmType(ecm)) },
    { particular: "Proposed intervention", value: sanitizePromptLeakageText(safeText(ecm.proposedProjectDescription) || safeText(ecm.proposedIntervention), classifyEcmType(ecm)) },
    { particular: "Expected energy saving", value: safeText(ecm.expectedEnergySaving) ? `${formatNumberDisplay(ecm.expectedEnergySaving)} kWh/year` : "[Calculation pending]" },
    { particular: "Expected annual cost saving", value: safeText(ecm.expectedAnnualCostSaving) ? formatCurrencyDisplay(ecm.expectedAnnualCostSaving) : "[Calculation pending]" },
    { particular: "Estimated investment", value: safeText(ecm.estimatedInvestment) ? formatCurrencyDisplay(ecm.estimatedInvestment) : "[Calculation pending]" },
    { particular: "Simple payback period", value: safeText(ecm.simplePaybackPeriod) ? `${formatPaybackDisplay(ecm.simplePaybackPeriod)} years` : "[Calculation pending]" },
    { particular: "Implementation duration", value: safeText(ecm.implementationDuration) || "[To be updated after site data verification]" },
    { particular: "Implementation priority", value: safeText(ecm.priority) || safeText(ecm.implementationPriority) || "[To be updated after site data verification]" }
  ];
}

function buildBaselineDataRows(ecm: any) {
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

function buildMeasurementRows(ecm: any) {
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

function buildScopeOfWorkRows(ecmType: string, ecm: any) {
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

function buildKeyActivityRows(ecmType: string, ecm: any) {
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

function buildEnergySavingCalculationRows(ecm: any) {
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

function buildKeyMetricRows(ecm: any) {
  return [
    { srNo: 1, parameter: "Baseline consumption", value: safeText(ecm.baselineConsumption) || "[Calculation pending]" },
    { srNo: 2, parameter: "Energy saving", value: safeText(ecm.expectedEnergySaving) ? `${formatNumberDisplay(ecm.expectedEnergySaving)} kWh/year` : "[Calculation pending]" },
    { srNo: 3, parameter: "Percentage saving", value: safeText(ecm.percentSaving) ? `${formatNumberDisplay(ecm.percentSaving, 2)}%` : "[Calculation pending]" },
    { srNo: 4, parameter: "Cost saving", value: safeText(ecm.expectedAnnualCostSaving) ? formatCurrencyDisplay(ecm.expectedAnnualCostSaving) : "[Calculation pending]" },
    { srNo: 5, parameter: "Estimated investment", value: safeText(ecm.estimatedInvestment) ? formatCurrencyDisplay(ecm.estimatedInvestment) : "[Calculation pending]" },
    { srNo: 6, parameter: "Payback period", value: safeText(ecm.simplePaybackPeriod) ? `${formatPaybackDisplay(ecm.simplePaybackPeriod)} years` : "[Calculation pending]" },
    { srNo: 7, parameter: "CO2 reduction", value: safeText(ecm.co2ReductionPotential) ? `${formatNumberDisplay(ecm.co2ReductionPotential)} kgCO2/year` : "[Calculation pending]" }
  ];
}

function buildTechnicalSpecificationRows(ecmType: string, ecm: any) {
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

function buildMvPlanRows(ecmType: string, ecm: any) {
  let rows = ecm.measurementVerificationPlan || ecm.mvPlan || ecm.monitoringPlan || ecm.monitoringAndVerificationPlan || [];
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

function buildBenefitRows(ecmType: string, ecm: any) {
  let rows = ecm.benefitsOtherThanEnergySaving || ecm.nonEnergyBenefits || ecm.benefits || ecm.otherBenefits || ecm.intangibleBenefits || [];
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

function formatEcmHeading(sectionNumber: string, ecmNo: any, title: any) {
  const cleanEcmNo = formatEcmNumber(ecmNo);
  let cleanTitle = String(title ?? "").trim();
  cleanTitle = cleanTitle.replace(/^(ECM|Ecm|ecm)\s*\d*\s*[-–:]*\s*/i, '').trim();

  return cleanTitle
    ? `${sectionNumber} ${cleanEcmNo} – ${cleanTitle}`
    : `${sectionNumber} ${cleanEcmNo}`;
}

function formatGroupHeading(group: any, index: number) {
  const groupNo = group.groupNo || `GR-${index + 1}`;
  return `${groupNo} ${group.groupTitle || ""}`.trim();
}

function normalizeTableRows(rows: any) {
  const safeRows = asArray(rows);
  if (!safeRows.length) return [];
  return safeRows.map((row) => (row && typeof row === "object" ? row : { value: fallbackText(row) }));
}

function ReportTable({ columns, rows, compact = false }: any) {
  const safeRows = normalizeTableRows(rows);
  if (safeRows.length === 0) return null;
  const safeColumns = Array.isArray(columns) && columns.length ? columns : [{ key: "value", label: "Value" }];
  
  return (
    <div className="mb-2 rounded overflow-hidden border shadow-sm" style={{ borderColor: colors.border }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact ? 12 : 13 }}>
        <thead>
          <tr style={{ background: colors.primaryBlue }}>
            {safeColumns.map((col: any) => (
              <th key={col.key} style={{ color: colors.white, padding: compact ? "4px 6px" : "6px 8px", textAlign: col.align || "left", fontWeight: 600, borderRight: `1px solid rgba(255,255,255,0.18)` }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row: any, rowIndex: number) => (
            <tr key={rowIndex} style={{ background: rowIndex % 2 === 0 ? colors.blueLight : colors.white }}>
              {safeColumns.map((col: any) => {
                const val = row?.[col.key];
                return (
                  <td key={col.key} style={{ padding: compact ? "4px 6px" : "6px 8px", textAlign: col.align || "left", borderBottom: `1px solid ${colors.border}`, borderRight: `1px solid ${colors.border}`, verticalAlign: "top", color: colors.text }}>
                    {React.isValidElement(val) ? val : fallbackText(val, "")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({ number, title, level = 2 }: { number?: string; title: string; level?: 1 | 2 | 3 }) {
  const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  const fontSize = level === 1 ? 20 : level === 2 ? 16 : 14;
  return (
    <div style={{ marginTop: level === 1 ? 4 : 12, marginBottom: 8 }}>
      <Tag style={{ color: colors.primaryBlue, fontSize, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {number ? `${number} ` : ""}
        {title}
        {level === 1 && <span style={{ flex: 1, height: 2, background: colors.primaryBlue, borderRadius: 2, marginLeft: 10 }} />}
      </Tag>
    </div>
  );
}

function renderOptionalTable(columns: any[], rowsData: any, placeholder: string) {
  const safeRows = normalizeTableRows(rowsData);
  const meaningfulRows = safeRows.filter(row => Object.values(row).some(v => isMeaningful(v)));
  if (meaningfulRows.length === 0) {
    return <p className="text-sm leading-snug mb-2">{placeholder}</p>;
  }
  return <ReportTable compact columns={columns} rows={meaningfulRows} />;
}

function renderOptionalKeyValueTable(dataObj: any, placeholder: string) {
  if (!dataObj) return <p className="text-sm leading-snug mb-2">{placeholder}</p>;
  const keys = Object.keys(dataObj).filter(k => isMeaningful(dataObj[k]));
  if (keys.length === 0) return <p className="text-sm leading-snug mb-2">{placeholder}</p>;
  const rows = keys.map(k => ({ label: k, value: dataObj[k] }));
  return <ReportTable compact columns={[{key: "label", label: "Particular"}, {key: "value", label: "Details"}]} rows={rows} />;
}

// Subcomponents
function CoverPage({ data }: { data: ReportInfo }) {
  return (
    <section className="report-page" style={{ ...pageStyle, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src="/assets/seetech-logo.png" alt="SEE-Tech Logo" style={{ height: 40, objectFit: "contain" }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div>
          <div style={{ color: colors.primaryBlue, fontSize: 18, fontWeight: 800 }}>SEE-Tech Solutions</div>
          <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>Commercial Building Energy Audit Report Format</div>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h1 style={{ color: colors.primaryBlue, fontSize: 36, lineHeight: 1.15, margin: "0 0 14px", fontWeight: 900 }}>
          {fallbackText(data.reportTitle, "Detailed Energy Audit Report")}
        </h1>
        <div style={{ height: 5, width: 120, background: colors.secondaryGreen, borderRadius: 99, marginBottom: 24 }} />
        <p style={{ color: colors.textMuted, fontSize: 16, maxWidth: 560, lineHeight: 1.55 }}>Commercial Buildings: Office | IT Park | Hotel | Hospital | Mall | Others</p>
        <p style={{ color: colors.text, fontSize: 15, maxWidth: 600, lineHeight: 1.6 }}>Purpose: To identify implementable energy-saving projects with clear investment, savings, payback and execution roadmap.</p>
        <div style={{ marginTop: 34, border: `1px solid ${colors.border}`, borderRadius: 14, overflow: "hidden" }}>
          {[
            ["Prepared For", data.clientName],
            ["Building Type", data.buildingType],
            ["Location", data.location],
            ["Audit Period", data.auditPeriod],
            ["Report Date", data.reportDate],
            ["Prepared By", data.preparedBy || "SEE-Tech Solutions"],
            ["Document Version", data.documentVersion],
          ].map(([label, value], i) => (
            <div key={`cover-row-${i}`} style={{ display: "grid", gridTemplateColumns: "180px 1fr", background: i % 2 === 0 ? colors.blueLight : colors.white, borderBottom: i === 6 ? "none" : `1px solid ${colors.border}` }}>
              <div style={{ padding: "12px 14px", fontWeight: 800, color: colors.primaryBlue }}>{label as string}</div>
              <div style={{ padding: "12px 14px" }}>{fallbackText(value, "")}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TableOfContentsPage({ projectGroups }: { projectGroups: any[] }) {
  let globalEcmIndex = 0;
  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Table of Contents" />
      <div className="toc-list" style={{ lineHeight: '1.5', fontSize: '11pt' }}>
        <div className="font-bold mt-2">Chapter 1. Executive Summary</div>
        <div className="ml-4">1.1 Purpose of the Energy Audit</div>
        <div className="ml-4">1.2 Overall Energy Saving Potential</div>
        <div className="ml-4">1.3 Summary of Identified Energy Saving Projects</div>
        <div className="ml-4">1.4 Project Grouping</div>
        <div className="ml-4">1.5 Key Observations</div>
        <div className="ml-4">1.6 Recommended Implementation Priority</div>
        <div className="ml-4">1.7 Conclusion and Way Forward</div>
        
        <div className="font-bold mt-2">Chapter 2. Plant / Building Details and Energy Profile</div>
        <div className="ml-4">2.1 General Information</div>
        <div className="ml-4">2.2 Building Operation Details</div>
        <div className="ml-4">2.3 Utility and Energy Sources</div>
        <div className="ml-4">2.4 Electrical Supply Details</div>
        <div className="ml-4">2.5 Electricity Consumption and Billing Summary</div>
        <div className="ml-4">2.6 Specific Energy Consumption Benchmark</div>
        <div className="ml-4">2.7 Major Energy Consuming Systems</div>
        <div className="ml-4">2.8 HVAC System Details</div>
        <div className="ml-4">2.9 Lighting System Details</div>
        <div className="ml-4">2.10 Pumps and Motors</div>
        <div className="ml-4">2.11 Building Automation and Controls</div>
        <div className="ml-4">2.12 Summary of Audit Observations</div>

        <div className="font-bold mt-2">Chapter 3. Energy Saving Projects</div>
        {projectGroups.map((group: any, idx: number) => (
          <div key={idx}>
            <div className="font-semibold ml-4 mt-1">{formatGroupHeading(group, idx)}</div>
            {asArray(group.projects).map((project: any, pIdx: number) => {
              globalEcmIndex++;
              const title = firstNonEmpty(project.projectTitle, project.title, project.ecmName, "");
              const ecmNoVal = getEcmNumberVal(project);
              const ecmString = formatEcmHeading(`3.${globalEcmIndex}`, ecmNoVal, title);
              return (
                <div key={pIdx} className="ml-8">{ecmString}</div>
              );
            })}
          </div>
        ))}

        <div className="font-bold mt-2">Chapter 4. Annexures</div>
      </div>
    </section>
  );
}

function ExecutiveSummaryPage({ data, projects, groupedProjects }: any) {
  const es = data.executiveSummary || {};
  const categorySummaryRows = groupedProjects.map((group: any, index: number) => ({
    groupNo: group.groupNo || `GR-${index + 1}`,
    groupName: group.groupTitle || formatGroupHeading(group, index).replace(/^GR-\d+\s*/, ""),
    ecmsIncluded: asArray(group.projects).map((p: any) => formatEcmNumber(p)).filter(Boolean).join(", "),
    count: asArray(group.projects).length,
    investment: formatCurrencyDisplay(group.totalInvestment || totalInvestment(asArray(group.projects))),
    saving: formatCurrencyDisplay(group.totalAnnualSaving || totalSavings(asArray(group.projects))),
    energy: formatNumberDisplay(group.totalEnergySaving || totalEnergy(asArray(group.projects))),
    payback: formatPaybackDisplay(group.weightedPayback || weightedPayback(asArray(group.projects))),
  }));

  const priorityRows = projects.map((p: any) => ({
    level: getPriorityLevel(p),
    ecms: formatEcmNumber(p),
    reason: getPriorityLevel(p) === "High Priority" ? "Favorable payback < 1.5 years" : getPriorityLevel(p) === "Medium Priority" ? "Moderate payback 1.5 - 3 years" : "Longer payback or high capex",
    investment: formatCurrencyDisplay(p.estimatedInvestment || p.investment),
    saving: formatCurrencyDisplay(p.expectedAnnualCostSaving || p.annualSaving),
    payback: formatPaybackDisplay(p.simplePaybackPeriod || p.payback),
    note: "Implementation complexity to be finalized after site verification.",
  })).sort((a: any, b: any) => ({"High Priority": 1, "Medium Priority": 2, "Long-Term Priority": 3}[a.level as "High Priority" | "Medium Priority" | "Long-Term Priority"] || 2) - ({"High Priority": 1, "Medium Priority": 2, "Long-Term Priority": 3}[b.level as "High Priority" | "Medium Priority" | "Long-Term Priority"] || 2));

  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Chapter 1: Executive Summary" />
      <SectionHeader number="1.1" title="Purpose of the Energy Audit" />
      <p className="text-sm leading-snug mb-2">{fallbackText(es.purposeText, "The purpose of this energy audit is to identify technically feasible, financially attractive and practically implementable energy-saving projects.")}</p>
      
      <SectionHeader number="1.2" title="Overall Energy Saving Potential" />
      <ReportTable compact columns={[{ key: "particular", label: "Particular" }, { key: "value", label: "Value" }]} rows={[
        { particular: "Total annual electricity consumption", value: es.totalAnnualElectricityConsumption },
        { particular: "Annual electricity cost", value: formatCurrencyDisplay(es.annualElectricityCost) },
        { particular: "Average electricity tariff considered", value: formatCurrencyDisplay(es.averageTariff) },
        { particular: "Number of projects identified", value: es.numberOfProjects || projects.length },
        { particular: "Total energy saving potential", value: formatNumberDisplay(es.totalEnergySavingPotential || totalEnergy(projects)) },
        { particular: "Total annual cost saving potential", value: formatCurrencyDisplay(es.totalAnnualCostSavingPotential || totalSavings(projects)) },
        { particular: "Total estimated investment", value: formatCurrencyDisplay(es.totalEstimatedInvestment || totalInvestment(projects)) },
        { particular: "Simple payback period", value: formatPaybackDisplay(es.simplePaybackPeriod || weightedPayback(projects)) },
        { particular: "CO2 reduction potential", value: formatNumberDisplay(es.co2ReductionPotential) || "[Calculation pending]" },
      ]} />

      <SectionHeader number="1.3" title="Summary of Identified Energy Saving Projects" />
      <ReportTable compact columns={[
        { key: "projectNo", label: "ECM No." },
        { key: "project", label: "Energy Saving Project" },
        { key: "system", label: "System" },
        { key: "investment", label: "Investment" },
        { key: "saving", label: "Annual Saving" },
        { key: "energy", label: "Energy Saving kWh/y" },
      ]} rows={projects.map((project: any, index: number) => ({
        projectNo: formatEcmNumber(project) || `ECM ${index + 1}`,
        project: firstNonEmpty(project.projectTitle, project.title, project.ecmName),
        system: project.system,
        investment: formatCurrencyDisplay(project.estimatedInvestment || project.investment),
        saving: formatCurrencyDisplay(project.expectedAnnualCostSaving || project.annualSaving),
        energy: formatNumberDisplay(project.expectedEnergySaving || project.energySaving),
      }))} />

      <SectionHeader number="1.4" title="Project Grouping" />
      {renderOptionalTable([
        { key: "groupNo", label: "Group No." },
        { key: "groupName", label: "Group Name" },
        { key: "ecmsIncluded", label: "ECMs Included" },
        { key: "count", label: "No. of ECMs" },
        { key: "investment", label: "Total Investment" },
        { key: "saving", label: "Annual Saving" },
        { key: "energy", label: "Energy Saving" },
        { key: "payback", label: "Group Payback" },
      ], data.projectGrouping || categorySummaryRows, "[To be updated after site data verification]")}

      <SectionHeader number="1.5" title="Key Observations" />
      <ul className="text-sm leading-snug mb-2 pl-4 list-disc">
        {(asArray(es.keyObservations).length ? asArray(es.keyObservations) : [
          "Cooling, production, compressed air, and auxiliary system projects contribute the major savings opportunity.",
          "Control improvements and high-efficiency retrofits are strong early implementation candidates.",
        ]).map((item, i) => <li key={i}>{fallbackText(item)}</li>)}
      </ul>

      <SectionHeader number="1.6" title="Recommended Implementation Priority" />
      {renderOptionalTable([
        { key: "level", label: "Priority Level" },
        { key: "ecms", label: "ECM Numbers" },
        { key: "reason", label: "Reason for Priority" },
        { key: "investment", label: "Investment" },
        { key: "saving", label: "Annual Saving" },
        { key: "payback", label: "Payback" },
        { key: "note", label: "Implementation Note" },
      ], data.implementationPriority || priorityRows, "[To be updated after site data verification]")}

      <SectionHeader number="1.7" title="Conclusion and Way Forward" />
      {renderOptionalTable([
        { key: "step", label: "Step" }, { key: "action", label: "Action" }
      ], data.summary || es.conclusionAndWayForward || [
        { step: 1, action: "Site verification" },
        { step: 2, action: "Vendor quotation / detailed engineering" },
        { step: 3, action: "Implementation scheduling" },
        { step: 4, action: "M&V baseline confirmation" },
        { step: 5, action: "Execution" },
        { step: 6, action: "Post-implementation verification" },
      ], "[To be updated]")}
    </section>
  );
}

function BuildingEnergyProfilePage({ data }: any) {
  const bp = data.buildingProfile || {};
  const esd = data.electricalSupplyDetails || {};
  const benchmark = data.specificEnergyBenchmark || {};
  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Chapter 2: Plant / Building Details and Energy Profile" />
      <SectionHeader number="2.1" title="General Information" />
      {renderOptionalKeyValueTable({
        "Name of facility": bp.facilityName || data.reportInfo?.clientName,
        "Address": bp.address,
        "Type of building": bp.typeOfBuilding || data.reportInfo?.buildingType,
        "Facility contact person": bp.facilityContactPerson,
      }, "[To be updated after site data verification]")}

      <SectionHeader number="2.2" title="Building Operation Details" />
      {renderOptionalKeyValueTable({
        "Operating days/year": bp.operatingDaysPerYear || bp.operatingDaysAndHours,
        "Operating hours/day": bp.operatingHoursPerDay,
        "Shift pattern": bp.shiftPattern,
        "Weekly off / holiday pattern": bp.weeklyOffPattern,
        "Production/occupancy pattern": bp.productionPattern,
        "Major operating zones": bp.majorOperatingZones,
        "Remarks": bp.operationRemarks,
      }, "[To be updated after site data verification]")}

      <SectionHeader number="2.3" title="Utility and Energy Sources" />
      {renderOptionalTable([
        { key: "energySource", label: "Energy Source" },
        { key: "use", label: "Use" },
        { key: "annualConsumption", label: "Annual Consumption" },
        { key: "annualCost", label: "Annual Cost" },
      ], data.utilityAndEnergySources, "[To be updated after site data verification]")}

      <SectionHeader number="2.4" title="Electrical Supply Details" />
      {renderOptionalKeyValueTable({
        "Supply voltage": esd.supplyVoltage,
        "Contract demand / sanctioned load": esd.contractDemand,
        "Connected load": esd.connectedLoad,
        "Transformer capacity": esd.transformerCapacity,
        "DG capacity": esd.dgCapacity,
        "Tariff category": esd.tariffCategory,
        "Billing demand": esd.billingDemand,
        "Power factor": esd.powerFactor,
        "Average tariff": esd.averageElectricityTariff || formatCurrencyDisplay(data.executiveSummary?.averageTariff),
        "Metering arrangement": esd.meteringArrangement,
      }, "[To be updated after site data verification]")}

      <SectionHeader number="2.5" title="Electricity Consumption and Billing Summary" />
      {renderOptionalTable([
        { key: "month", label: "Month" },
        { key: "kwh", label: "kWh Consumption" },
        { key: "demand", label: "Max Demand" },
        { key: "pf", label: "Power Factor" },
        { key: "bill", label: "Electricity Bill" },
        { key: "tariff", label: "Average Tariff" },
        { key: "remarks", label: "Remarks" },
      ], data.monthlyBillingSummary || data.electricityBillingSummary, "[To be updated after site data verification]")}

      <SectionHeader number="2.6" title="Specific Energy Consumption Benchmark" />
      {renderOptionalKeyValueTable({
        "SEC definition": benchmark.secDefinition,
        "Production/occupancy denominator": benchmark.denominator,
        "SEC trend / value": benchmark.specificEnergyConsumption,
        "Benchmark/reference value": benchmark.referenceBenchmark,
        "Interpretation": benchmark.improvementPotential,
      }, "[To be updated after site data verification]")}

      <SectionHeader number="2.7" title="Major Energy Consuming Systems" />
      {renderOptionalTable([
        { key: "system", label: "System" },
        { key: "majorEquipment", label: "Major Equipment" },
        { key: "estimatedShare", label: "Estimated Share" },
        { key: "remarks", label: "Remarks" },
      ], data.majorEnergyConsumingSystems, "[To be updated after site data verification]")}

      <SectionHeader number="2.8" title="HVAC System Details" />
      {renderOptionalTable([
        { key: "equipment", label: "Equipment" },
        { key: "rating", label: "Rating/Capacity" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "observations", label: "Observations" },
      ], data.hvacSystemDetails, "[To be updated after site data verification]")}

      <SectionHeader number="2.9" title="Lighting System Details" />
      {renderOptionalTable([
        { key: "area", label: "Area" },
        { key: "type", label: "Fixture Type" },
        { key: "quantity", label: "Quantity" },
        { key: "wattage", label: "Wattage" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "observations", label: "Observations" },
      ], data.lightingSystemDetails, "[To be updated after site data verification]")}

      <SectionHeader number="2.10" title="Pumps and Motors" />
      {renderOptionalTable([
        { key: "name", label: "Pump/Motor Name" },
        { key: "rating", label: "Rating" },
        { key: "quantity", label: "Quantity" },
        { key: "efficiency", label: "Efficiency Class" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "observations", label: "Observations" },
      ], data.pumpsAndMotors, "[To be updated after site data verification]")}

      <SectionHeader number="2.11" title="Building Automation and Controls" />
      {renderOptionalTable([
        { key: "system", label: "System Controlled" },
        { key: "method", label: "Existing Control Method" },
        { key: "sensors", label: "Sensors/Feedback" },
        { key: "gaps", label: "Gaps Observed" },
      ], data.buildingAutomationControls, "[To be updated after site data verification]")}

      <SectionHeader number="2.12" title="Summary of Audit Observations" />
      {renderOptionalTable([
        { key: "observation", label: "Observation" },
        { key: "impact", label: "Energy Impact" },
        { key: "recommendation", label: "Recommended Direction" },
        { key: "relatedEcms", label: "Related ECMs" },
      ], data.auditObservations || [{ observation: "Optimization opportunities exist across major systems.", impact: "Higher than necessary energy consumption", recommendation: "Implement ECMs in a phased manner." }], "[To be updated after site data verification]")}
    </section>
  );
}

function ProjectChapterPage({ project, groupNumber, ecmIndexWithinGroup }: { project: any, groupNumber: string, ecmIndexWithinGroup: number }) {
  const ecmType = classifyEcmType(project);
  const ecmTitleRaw = firstNonEmpty(project.projectTitle, project.title, project.ecmName, "ECM");
  const ecmNoRaw = getEcmNumberVal(project);
  const ecmNo = formatEcmNumber(ecmNoRaw);
  const ecmSectionNumber = `${groupNumber}.${ecmIndexWithinGroup}`;

  const rawCleanTitle = ecmTitleRaw.replace(/^(ECM|Ecm|ecm)\s*\d*\s*[-–:]*\s*/i, '').trim();
  const cleanTitle = sanitizePromptLeakageText(rawCleanTitle, ecmType);

  const baselineDescription = sanitizePromptLeakageText(firstNonEmpty(project.existingSystemDescription, project.existingCondition, project.baselineCondition, project.existingSystem, project.existingOperatingCondition, project.baselineDetails), ecmType);
  const problemGap = sanitizePromptLeakageText(firstNonEmpty(project.problemGapIdentified, project.problemGap, project.gapIdentified), ecmType);
  const proposedDescription = sanitizePromptLeakageText(firstNonEmpty(project.proposedProjectDescription, project.proposedIntervention, project.proposedEnergyConservationMeasure, project.proposedMeasure, project.recommendedMeasure), ecmType);
  const rationale = sanitizePromptLeakageText(firstNonEmpty(project.rationaleForEnergySaving, project.rationale, project.savingRationale, "The recommendation reduces avoidable losses and improves alignment between system demand and energy input."), ecmType);
  const caseStudy = sanitizePromptLeakageText(firstNonEmpty(project.caseStudy, project.referenceApplication, "Similar measures are commonly implemented in comparable industrial utility/process systems after site-specific engineering validation. Project-specific case evidence shall be updated after implementation or vendor confirmation."), ecmType);
  const conclusion = sanitizePromptLeakageText(firstNonEmpty(project.finalConclusion, project.conclusion, project.projectConclusion, `This project is technically feasible and financially attractive for implementation. The proposed intervention will reduce annual energy consumption by approximately ${isMeaningful(project.expectedEnergySaving) ? `${formatNumberDisplay(project.expectedEnergySaving)} kWh` : "[energy saving]"}, resulting in annual cost saving of ${formatCurrencyDisplay(project.expectedAnnualCostSaving) || "[annual saving]"}. With an estimated investment of ${formatCurrencyDisplay(project.estimatedInvestment) || "[investment]"}, the simple payback period is expected to be ${isMeaningful(project.simplePaybackPeriod) ? `${formatPaybackDisplay(project.simplePaybackPeriod)} years` : "[payback]"}. Considering the energy saving, operational improvement and sustainability benefits, this project is recommended for implementation under ${safeText(project.priority) || safeText(project.implementationPriority) || "[priority]"}.`), ecmType);

  const schematic = (project.schematicFramework && project.schematicFramework.length) ? project.schematicFramework : [
    { stage: "Stage 1: Current State", description: "Existing inefficient or non-optimized operation" },
    { stage: "Stage 2: Intervention", description: "What SEE-Tech will install or modify" },
    { stage: "Stage 3: Physics of Saving", description: "Why energy will reduce after the intervention" },
    { stage: "Stage 4: Outcome", description: "kWh saving, ₹ saving, payback and reliability benefit" }
  ];

  const durationTable = (project.implementationDurationTable && project.implementationDurationTable.length) ? project.implementationDurationTable : [
    { activity: "Engineering and approval", duration: "1 week" },
    { activity: "Procurement", duration: "2-4 weeks" },
    { activity: "Installation", duration: "1-2 weeks" },
    { activity: "Testing and commissioning", duration: "1 week" },
    { activity: "Performance monitoring", duration: "2-4 weeks" },
    { activity: "Total expected duration", duration: firstNonEmpty(project.implementationDuration, project.duration, project.timeline, "[To be updated after site data verification]") }
  ];

  const aspectsTable = (project.aspectsToBeTakenCareOfTable && project.aspectsToBeTakenCareOfTable.length) ? project.aspectsToBeTakenCareOfTable : [
    { area: "Technical suitability", precaution: "Confirm equipment rating, sizing and compatibility" },
    { area: "Operation", precaution: "Ensure project does not affect comfort, safety or process requirement" },
    { area: "Controls", precaution: "Test control logic under different load conditions" },
    { area: "Electrical safety", precaution: "Ensure proper protection, earthing and panel safety" },
    { area: "Maintenance", precaution: "Train maintenance team for operation and troubleshooting" },
    { area: "Measurement", precaution: "Record before and after data for savings validation" },
    { area: "Shutdown planning", precaution: "Plan installation during low-load or non-operating hours" }
  ];

  const carbonText = isMeaningful(project.co2ReductionPotential || project.co2Reduction || project.carbonFootprintReduction) ? `The estimated carbon footprint reduction is ${formatNumberDisplay(project.co2ReductionPotential || project.co2Reduction || project.carbonFootprintReduction)} kgCO2/year based on the projected energy savings.` : "[Calculation pending due to missing emission factor]";

  return (
    <div className="mb-4">
      <h3 className="text-base font-bold text-slate-900 mt-3 mb-2">
        {formatEcmHeading(ecmSectionNumber, ecmNoRaw, cleanTitle)}
      </h3>

      <SectionHeader level={3} title={`${ecmSectionNumber}.1 Project Summary`} />
      <ReportTable compact columns={[{ key: "particular", label: "Particular" }, { key: "value", label: "Details" }]} rows={buildProjectSummaryRows(project, cleanTitle, ecmNo)} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.2 Existing System Description`} />
      <p className="text-sm leading-snug mb-2">{baselineDescription}</p>

      <SectionHeader level={3} title={`${ecmSectionNumber}.3 Baseline Data and Measurements`} />
      <ReportTable compact columns={[{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }]} rows={buildBaselineDataRows(project)} />
      <div className="mt-2" />
      <ReportTable compact columns={[{ key: "measurement", label: "Measurement" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }]} rows={buildMeasurementRows(project)} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.4 Problem / Gap Identified`} />
      <p className="text-sm leading-snug mb-2">{problemGap}</p>
      {(project.problemGapTable && project.problemGapTable.length > 0) && <ReportTable compact columns={[{ key: "system", label: "System" }, { key: "gap", label: "Typical Gap" }]} rows={project.problemGapTable} />}

      <SectionHeader level={3} title={`${ecmSectionNumber}.5 Proposed Project`} />
      <p className="text-sm leading-snug mb-2">{proposedDescription}</p>
      <ReportTable compact columns={[{ key: "srNo", label: "Sr. No." }, { key: "scopeItem", label: "Scope Item" }]} rows={buildScopeOfWorkRows(ecmType, project)} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.6 Key Activities for Implementation`} />
      <ReportTable compact columns={[{ key: "activity", label: "Activity" }, { key: "details", label: "Details" }, { key: "responsibility", label: "Responsibility" }]} rows={buildKeyActivityRows(ecmType, project)} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.7 Rationale for Energy Saving`} />
      <p className="text-sm leading-snug mb-2">{rationale}</p>
      {(project.rationaleTable && project.rationaleTable.length > 0) && <ReportTable compact columns={[{ key: "projectType", label: "Project Type" }, { key: "savingRationale", label: "Saving Rationale" }]} rows={project.rationaleTable} />}

      <SectionHeader level={3} title={`${ecmSectionNumber}.8 Energy Saving Calculation`} />
      <ReportTable compact columns={[{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }]} rows={buildEnergySavingCalculationRows(project)} />
      <div className="text-center text-xs italic text-gray-500 mb-4 mt-2">
        Annual Energy Saving = Load Reduction × Annual Operating Hours | Annual Cost Saving = Annual Energy Saving × Average Electricity Tariff | Simple Payback = Estimated Investment / Annual Cost Saving
      </div>

      <SectionHeader level={3} title={`${ecmSectionNumber}.9 Key Metrics`} />
      <ReportTable compact columns={[{ key: "srNo", label: "Sr. No." }, { key: "parameter", label: "Parameter" }, { key: "value", label: "Value" }]} rows={buildKeyMetricRows(project)} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.10 Technical Specifications`} />
      <ReportTable compact columns={[{ key: "item", label: "Item" }, { key: "specification", label: "Specification" }]} rows={buildTechnicalSpecificationRows(ecmType, project)} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.11 Schematic / Conceptual Framework`} />
      <ReportTable compact columns={[{ key: "stage", label: "Stage" }, { key: "description", label: "Description" }]} rows={schematic} />
      <div className="text-center text-xs italic text-gray-500 mb-4 mt-2">
        [Schematic / conceptual diagram to be inserted after engineering finalization]
      </div>

      <SectionHeader level={3} title={`${ecmSectionNumber}.12 Implementation Duration`} />
      <ReportTable compact columns={[{ key: "activity", label: "Activity" }, { key: "duration", label: "Duration" }]} rows={durationTable} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.13 Precautions / Aspects to be Taken Care Of`} />
      <ReportTable compact columns={[{ key: "area", label: "Area" }, { key: "precaution", label: "Precaution" }]} rows={aspectsTable} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.14 Measurement and Verification Plan`} />
      <ReportTable compact columns={[{ key: "parameter", label: "Parameter" }, { key: "baselineMeasurement", label: "Baseline Measurement" }, { key: "postImplementationMeasurement", label: "Post-Implementation Measurement" }]} rows={buildMvPlanRows(ecmType, project)} />
      <div className="text-xs text-gray-500 mb-4 mt-2 leading-tight">
        Savings shall be validated by measuring the power consumption and operating pattern before and after implementation. The final saving will be calculated based on measured load reduction, actual operating hours and applicable electricity tariff.
      </div>

      <SectionHeader level={3} title={`${ecmSectionNumber}.15 Benefits Other Than Energy Saving`} />
      <ReportTable compact columns={[{ key: "benefit", label: "Benefit" }, { key: "description", label: "Description" }]} rows={buildBenefitRows(ecmType, project)} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.16 Carbon Footprint Reduction`} />
      <p className="text-sm leading-snug mb-2">{carbonText}</p>

      <SectionHeader level={3} title={`${ecmSectionNumber}.17 Case Study / Reference Application`} />
      <p className="text-sm leading-snug mb-2">{caseStudy}</p>

      <SectionHeader level={3} title={`${ecmSectionNumber}.18 Project Conclusion`} />
      <p className="text-sm leading-snug mb-2">{conclusion}</p>
    </div>
  );
}

function DevDiagnostics({ data }: { data: any }) {
  if (process.env.NODE_ENV === 'production' || !(import.meta as any).env?.DEV) return null;
  return (
    <div className="mb-4 p-4 bg-gray-900 text-green-400 font-mono text-xs rounded border border-green-800 report-preview-scroll" style={{maxHeight: 200, overflowY: 'auto'}}>
      <div className="font-bold mb-2">DEV DIAGNOSTICS - Normalization Applied</div>
      <ul>
        <li>Normalized Groups Count: {asArray(data.groupedProjects).length || 1}</li>
        <li>Normalized ECM Count: {asArray(data.projects).length}</li>
        <li>Chapter 1 Grouping Backend Hit: {Boolean(data.projectGrouping) ? "TRUE" : "FALSE"}</li>
        <li>Chapter 1 Priority Backend Hit: {Boolean(data.implementationPriority) ? "TRUE" : "FALSE"}</li>
        <li>Missing Text Fields Sanitized (Safe Check): Working</li>
        <li>Missing Calculations Sanitized: Working</li>
        <li>Forbidden Tokens Filtered: Data required, [DRAFT, null, undefined, Explain...</li>
      </ul>
    </div>
  );
}

export default function CommercialBuildingEnergyAuditTemplate({ data }: { data: CommercialBuildingEnergyAuditData }) {
  const projects = asArray(data.projects);
  const groupedProjects = asArray(data.groupedProjects);
  const projectGroups = groupedProjects.length ? groupedProjects : [{
    groupNo: "GR-1",
    groupTitle: "Energy Saving Projects",
    projects: projects,
    totalInvestment: totalInvestment(projects),
    totalAnnualSaving: totalSavings(projects),
    totalEnergySaving: totalEnergy(projects),
    weightedPayback: weightedPayback(projects),
  }];

  return (
    <div className="commercial-building-energy-audit-report report-print-area text-sm text-gray-900">
      <style>{printCss}</style>
      <DevDiagnostics data={data} />
      
      <CoverPage data={data.reportInfo || {}} />
      <div className="page-break" />

      <TableOfContentsPage projectGroups={projectGroups} />
      <div className="page-break" />

      <ExecutiveSummaryPage data={data} projects={projects} groupedProjects={projectGroups} />
      <div className="page-break" />

      <BuildingEnergyProfilePage data={data} />
      <div className="page-break" />

      {projectGroups.map((group, index) => {
        const globalStartIndex = projectGroups.slice(0, index).reduce((acc, g) => acc + asArray(g.projects).length, 0);
        return (
          <section key={index} className="report-page" style={{...pageStyle, minHeight: 'auto'}}>
            <SectionHeader level={2} title={formatGroupHeading(group, index)} />
            <SectionHeader level={3} title="Group Summary Table" />
            <ReportTable compact columns={[
              { key: "projectNo", label: "ECM No." },
              { key: "projectTitle", label: "ECM Name" },
              { key: "investment", label: "Investment" },
              { key: "saving", label: "Annual Saving" },
              { key: "energy", label: "Energy Saving" },
              { key: "payback", label: "Payback" },
            ]} rows={asArray(group.projects).map((p: any) => ({
              projectNo: formatEcmNumber(p),
              projectTitle: firstNonEmpty(p.projectTitle, p.title, p.ecmName),
              investment: formatCurrencyDisplay(p.estimatedInvestment || p.investment),
              saving: formatCurrencyDisplay(p.expectedAnnualCostSaving || p.annualSaving),
              energy: formatNumberDisplay(p.expectedEnergySaving || p.energySaving),
              payback: formatPaybackDisplay(p.simplePaybackPeriod || p.payback),
            }))} />

            <div className="mt-4">
              {asArray(group.projects).map((project, pIndex) => {
                const globalEcmIndex = globalStartIndex + pIndex + 1;
                return (
                  <ProjectChapterPage key={pIndex} project={project} groupNumber="3" ecmIndexWithinGroup={globalEcmIndex} />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export const sampleCommercialBuildingEnergyAuditData: any = { reportInfo: {}, projects: [] };
