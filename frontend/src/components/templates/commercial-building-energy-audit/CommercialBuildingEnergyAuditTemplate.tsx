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
  const ecmNo = String(getEcmNumberVal(ecm) || "");
  if (ecmNo.includes("13")) return "heat_recovery";
  if (ecmNo.includes("14")) return "thermal_insulation";
  if (ecmNo.includes("15")) return "ir_heater_or_band_heater_retrofit";
  if (ecmNo.match(/1[6-9]|20/)) return "servo_hydraulic_retrofit";
  if (ecmNo.includes("21")) return "compressed_air_management";
  if (ecmNo.includes("12")) return "apfc_power_factor_correction";
  
  if (title.includes("heat recovery") || title.includes("exhaust heat")) return "heat_recovery";
  if (title.includes("insulation") || title.includes("hot duct")) return "thermal_insulation";
  if (title.includes("ir heater") || title.includes("band heater") || title.includes("barrel heating")) return "ir_heater_or_band_heater_retrofit";
  if (title.includes("servo") || title.includes("hydraulic")) return "servo_hydraulic_retrofit";
  if (title.includes("booster compressor")) return "booster_compressor_automation";
  if (title.includes("compressed air") || title.includes("booster compressor") || title.includes("air compressor")) return "compressed_air_management";
  if (title.includes("apfc") || title.includes("power factor") || title.includes("kvar")) return "apfc_power_factor_correction";
  if (title.includes("ahu") || title.includes("plug fan")) return "ahu_plug_fan_optimization";
  if (title.includes("chiller") || title.includes("cooling") || title.includes("chw") || title.includes("ct water") || title.includes("primary pump") || title.includes("secondary pump") || title.includes("ct segregation")) return "cooling_system_optimization";
  if (title.includes("pump") || title.includes("flow optimization")) return "pump_flow_optimization";
  if (title.includes("ie4") || title.includes("ie5") || title.includes("motor retrofit") || title.includes("pmsm")) return "motor_retrofit_ie4_ie5";
  if (title.includes("blower") || title.includes("direct drive")) return "blower_direct_drive_retrofit";
  if (title.includes("lighting") || title.includes("led")) return "lighting_efficiency";
  return "general_ecm";
}

function getProblemGapEntry(ecmType: string) {
  if (ecmType === "heat_recovery") return { system: "Heat recovery", gap: "Waste heat discharged without useful recovery" };
  if (ecmType === "thermal_insulation") return { system: "Insulation", gap: "Heat loss from exposed hot surfaces or ducts" };
  if (ecmType === "ir_heater_or_band_heater_retrofit") return { system: "IR heater retrofit", gap: "Conventional heater losses and lower heat-transfer effectiveness" };
  if (ecmType === "servo_hydraulic_retrofit") return { system: "Servo hydraulic", gap: "Idle and part-load hydraulic losses" };
  if (ecmType === "compressed_air_management" || ecmType === "booster_compressor_automation") return { system: "Compressed air", gap: "Leakage, pressure drop, higher generation pressure or inefficient compressor loading" };
  if (ecmType === "apfc_power_factor_correction") return { system: "APFC", gap: "Low power factor or kVA/kVAh billing loss" };
  if (ecmType === "ahu_plug_fan_optimization") return { system: "AHU / fan", gap: "Constant speed operation or inefficient fan arrangement" };
  if (ecmType === "cooling_system_optimization") return { system: "Cooling system", gap: "Poor flow/temperature control, high kW/TR or fixed-speed operation" };
  if (ecmType === "pump_flow_optimization") return { system: "Pump", gap: "Throttling, bypass or fixed-flow operation" };
  if (ecmType === "motor_retrofit_ie4_ie5") return { system: "Motor retrofit", gap: "Standard efficiency motor losses" };
  if (ecmType === "blower_direct_drive_retrofit") return { system: "Blower", gap: "Belt/transmission loss or non-optimized drive arrangement" };
  return { system: "System", gap: "[To be updated after site data verification]" };
}

function getRationaleEntry(ecmType: string) {
  if (ecmType === "heat_recovery") return { projectType: "Heat recovery", savingRationale: "Recovered exhaust heat reduces primary heating duty." };
  if (ecmType === "thermal_insulation") return { projectType: "Insulation", savingRationale: "Reduced surface heat loss lowers reheating energy demand." };
  if (ecmType === "ir_heater_or_band_heater_retrofit") return { projectType: "IR heater retrofit", savingRationale: "Improved heat transfer and reduced surface losses reduce heater energy demand." };
  if (ecmType === "servo_hydraulic_retrofit") return { projectType: "Servo hydraulic", savingRationale: "Motor speed and torque follow machine cycle demand, reducing idle and part-load losses." };
  if (ecmType === "compressed_air_management" || ecmType === "booster_compressor_automation") return { projectType: "Compressed air", savingRationale: "Leakage reduction, pressure optimization and loading control reduce specific power." };
  if (ecmType === "apfc_power_factor_correction") return { projectType: "APFC", savingRationale: "Improved power factor reduces kVA demand and kVAh billing losses." };
  if (ecmType === "ahu_plug_fan_optimization") return { projectType: "AHU / fan", savingRationale: "Higher fan efficiency and better airflow control reduce fan power." };
  if (ecmType === "cooling_system_optimization") return { projectType: "Cooling system", savingRationale: "Lower condenser temperature, improved flow control and reduced chiller lift improve kW/TR." };
  if (ecmType === "pump_flow_optimization") return { projectType: "Pump VFD", savingRationale: "Pump affinity laws allow large power reduction when speed/flow is reduced." };
  if (ecmType === "motor_retrofit_ie4_ie5") return { projectType: "IE5 motor retrofit", savingRationale: "Higher motor efficiency reduces electrical losses." };
  if (ecmType === "blower_direct_drive_retrofit") return { projectType: "Blower direct drive", savingRationale: "Direct drive removes transmission losses and improves drive efficiency." };
  return { projectType: "Project", savingRationale: "[To be updated after site data verification]" };
}

function getMvParamValue(ecmType: string) {
  if (ecmType === "cooling_system_optimization") return "kW/TR, CHW/CW temperature, flow, pump/fan kW";
  if (ecmType === "heat_recovery") return "Exhaust air temperature, inlet air temperature, heater kW, operating hours";
  if (ecmType === "thermal_insulation") return "Surface temperature, duct temperature, heater load, operating hours";
  if (ecmType === "ir_heater_or_band_heater_retrofit") return "Heater kW, barrel temperature, heating cycle, surface temperature";
  if (ecmType === "servo_hydraulic_retrofit") return "Hydraulic motor kW, cycle time, idle load, operating hours";
  if (ecmType === "compressed_air_management" || ecmType === "booster_compressor_automation") return "Pressure, flow, leakage, compressor kW";
  if (ecmType === "apfc_power_factor_correction") return "PF, kVA, kVAh, reactive power compensation";
  if (ecmType === "ahu_plug_fan_optimization" || ecmType === "blower_direct_drive_retrofit") return "Airflow, static pressure, fan kW";
  if (ecmType === "pump_flow_optimization") return "Flow, head, pressure, pump kW";
  if (ecmType === "motor_retrofit_ie4_ie5") return "Motor input kW, load factor, operating hours";
  return "ECM-type-specific parameter";
}

function sanitizePromptLeakageText(text: any, ecmType: string) {
  let safe = String(text || "").trim();
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
  safe = safe.trim();

  if (!safe || safe === "[To be updated after site data verification]") {
    if (ecmType === "cooling_system_optimization") safe = "The existing cooling system includes equipment operating under conditions where flow, temperature differential, and load variation require verification for optimized energy performance.";
    else if (ecmType === "heat_recovery") safe = "The existing dryer system rejects usable heat through exhaust air, while incoming regeneration air continues to require primary heating energy.";
    else if (ecmType === "thermal_insulation") safe = "The existing hot duct surfaces are exposed or inadequately insulated, resulting in avoidable heat loss to the surrounding area.";
    else if (ecmType === "servo_hydraulic_retrofit") safe = "The existing hydraulic machine drive arrangement operates with energy consumption during idle and part-load portions of the machine cycle.";
    else if (ecmType === "compressed_air_management") safe = "The compressed air system requires measurement of pressure, flow, leakage, and compressor loading pattern to identify avoidable generation losses.";
    else if (ecmType === "apfc_power_factor_correction") safe = "The electrical system requires effective reactive power compensation to maintain power factor and reduce kVA/kVAh-related billing impact.";
    else if (ecmType === "ir_heater_or_band_heater_retrofit") safe = "The existing band heating system operates with high surface temperatures, leading to convective heat losses to the ambient environment.";
    else if (ecmType === "ahu_plug_fan_optimization") safe = "The existing air handling system operates with conventional fan and drive arrangements, presenting opportunities for flow optimization and efficiency upgrades.";
    else if (ecmType === "pump_flow_optimization") safe = "The existing pumping arrangement appears to operate with fixed or excess flow, indicating avoidable energy use where actual process demand varies over time.";
    else if (ecmType === "motor_retrofit_ie4_ie5") safe = "The existing driven equipment is operated by standard-efficiency motors, resulting in higher power consumption for the given mechanical load.";
    else if (ecmType === "blower_direct_drive_retrofit") safe = "The existing blower drive arrangement includes avoidable transmission losses and requires verification of airflow and pressure stability for optimized operation.";
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
  const paramValue = getMvParamValue(ecmType);

  let rows = ecm.measurementVerificationPlan || ecm.mvPlan || ecm.monitoringPlan || ecm.monitoringAndVerificationPlan || [];
  if (rows.length < 3) {
    rows = [
      { parameter: "Power consumption", baselineMeasurement: "kW before project", postImplementationMeasurement: "kW after project" },
      { parameter: "Operating hours", baselineMeasurement: "Existing operating schedule", postImplementationMeasurement: "Revised operating schedule" },
      { parameter: "Energy consumption", baselineMeasurement: "kWh/year baseline", postImplementationMeasurement: "kWh/year after project" },
      { parameter: "Performance parameter", baselineMeasurement: paramValue, postImplementationMeasurement: "Confirmed after commissioning" },
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


function renderMandatoryTable(columns: any[], rowsData: any, placeholder: string = "[To be updated after site data verification]") {
  const safeColumns = asArray(columns).length ? asArray(columns) : [{ key: "value", label: "Value" }];
  const safeRows = normalizeTableRows(rowsData);
  
  if (safeRows.length === 0) {
    const emptyRow: any = {};
    safeColumns.forEach(c => emptyRow[c.key] = placeholder);
    return <ReportTable compact columns={safeColumns} rows={[emptyRow]} />;
  }

  const mappedRows = safeRows.map(r => {
    const newRow = { ...r };
    safeColumns.forEach(c => {
      let val = newRow[c.key];
      if (val === undefined || val === null || String(val).trim() === "" || /^(data required|null|undefined|\[draft.*?\])$/i.test(String(val).trim())) {
        newRow[c.key] = placeholder;
      }
    });
    return newRow;
  });

  return <ReportTable compact columns={safeColumns} rows={mappedRows} />;
}

function renderMandatoryKeyValueTable(dataObj: any, placeholder: string = "[To be updated after site data verification]") {
  const safeObj = { ...(dataObj || {}) };
  const keys = Object.keys(safeObj);
  if (keys.length === 0) {
    return <ReportTable compact columns={[{key: "label", label: "Particular"}, {key: "value", label: "Details"}]} rows={[{ label: "Details", value: placeholder }]} />;
  }

  keys.forEach(k => {
    let val = safeObj[k];
    if (val === undefined || val === null || String(val).trim() === "" || /^(data required|null|undefined|\[draft.*?\])$/i.test(String(val).trim())) {
      safeObj[k] = placeholder;
    }
  });

  const rows = keys.map(k => ({ label: k, value: safeObj[k] }));
  return <ReportTable compact columns={[{key: "label", label: "Particular"}, {key: "value", label: "Details"}]} rows={rows} />;
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

  const renderList = (items: any, defaultItems: string[]) => (
    <ul className="text-sm leading-snug mb-4 pl-4 list-disc">
      {(asArray(items).length ? asArray(items) : defaultItems).map((item, i) => (
        <li key={i} className="mb-1">{fallbackText(item)}</li>
      ))}
    </ul>
  );

  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Chapter 1: Executive Summary" />
      
      <SectionHeader number="1.1" title="Purpose of the Energy Audit" />
      {renderList(es.purposeText, [
        "The purpose of this detailed energy audit is to identify practical energy conservation measures that can be implemented through a disciplined combination of engineering review, operating assessment, and project-level prioritization.",
        "The audit translates observed system inefficiencies into implementation-ready opportunities so management can plan energy cost reduction actions with clear technical scope, operational relevance, and execution focus."
      ])}
      
      <SectionHeader number="1.2" title="Key Objectives" />
      {renderList(es.keyObjectives, [
        "Identify and quantify energy-saving opportunities across all major utility and process systems.",
        "Provide a structured roadmap for implementing control improvements, equipment efficiency upgrades, and system optimization initiatives.",
        "Establish baseline performance metrics to enable effective post-implementation measurement and verification."
      ])}

      <SectionHeader number="1.3" title="Scope of Assessment" />
      {renderList(es.scopeOfAssessment, [
        "Comprehensive review of historical energy consumption patterns and utility billing data.",
        "Detailed performance evaluation of major energy-consuming systems including HVAC, compressed air, pumping, and production machinery.",
        "Assessment of existing control logic, operating practices, and maintenance procedures impacting energy efficiency."
      ])}

      <SectionHeader number="1.4" title="Expected Outcomes" />
      {renderList(es.expectedOutcomes, [
        "A prioritized portfolio of energy conservation measures (ECMs) categorized by technical feasibility and financial return.",
        "Clear recommendations for immediate operational improvements requiring minimal capital investment.",
        "Strategic guidance for long-term capital planning related to major equipment replacements and system retrofits."
      ])}

      <SectionHeader number="1.5" title="Strategic Importance" />
      {renderList(es.strategicImportance, [
        "Enhances operational resilience by reducing exposure to energy price volatility and supply constraints.",
        "Supports corporate sustainability goals through quantifiable reductions in carbon emissions and environmental impact.",
        "Improves overall facility competitiveness by lowering production costs and optimizing resource utilization."
      ])}

      <SectionHeader number="1.6" title="Key Findings" />
      {renderList(es.keyFindings || es.keyObservations, [
        "The identified ECM portfolio covers multiple functional systems, allowing management to sequence implementation across operational improvements, control upgrades, and equipment-efficiency measures instead of treating all projects as a single package.",
        "Measures linked to operating control, load matching, and reduction of avoidable system losses are generally suitable early implementation candidates because they strengthen performance discipline while preparing the site team for larger retrofit actions.",
        "Projects associated with major utility systems and continuously operating process support equipment warrant close management attention because sustained operating hours make these systems important contributors to the overall energy-improvement roadmap."
      ])}

      <SectionHeader number="1.7" title="Financial Highlights" />
      {renderList(es.financialHighlightsNarrative, [
        "The proposed energy conservation measures offer a highly attractive financial return, driven by significant reductions in annual operating costs.",
        "A balanced mix of low-cost operational improvements and high-return capital projects provides a robust investment portfolio for management consideration."
      ])}
      <div className="mb-4">
        <ReportTable compact columns={[{ key: "particular", label: "Overall Energy Saving Potential" }, { key: "value", label: "Value" }]} rows={[
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
      </div>

      <SectionHeader number="1.8" title="Energy Saving Potential" />
      {renderList(es.energySavingPotentialNarrative, [
        "Substantial energy savings can be achieved through a combination of enhanced system controls, elimination of avoidable losses, and targeted equipment upgrades.",
        "The projected energy reductions are grounded in verified baseline data and conservative engineering calculations to ensure reliable and achievable outcomes."
      ])}
      <div className="mb-4">
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
      </div>

      <SectionHeader number="1.9" title="Recommended Implementation Approach" />
      {renderList(es.recommendedImplementationApproach || es.conclusionAndWayForward, [
        "Review the identified ECM portfolio group-wise so implementation can be sequenced across quick operational actions, control improvements, and larger retrofit measures.",
        "Confirm project-wise priority, execution windows, and cross-functional ownership with plant, maintenance, production, and electrical teams before detailed engineering begins.",
        "Develop detailed engineering, technical specifications, and integration requirements for the shortlisted measures, including instrumentation, controls, and safety interfaces.",
        "Carry out installation, control tuning, testing, and commissioning with documented baseline reference and post-implementation performance checks."
      ])}
      
      <div className="mt-4 mb-4 font-bold text-sm">1.9.1 Project Grouping</div>
      <div className="mb-4">
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
      </div>

      <div className="mt-4 mb-4 font-bold text-sm">1.9.2 Recommended Implementation Priority</div>
      <div className="mb-4">
        {renderOptionalTable([
          { key: "level", label: "Priority Level" },
          { key: "ecms", label: "ECM Numbers" },
          { key: "reason", label: "Reason for Priority" },
          { key: "investment", label: "Investment" },
          { key: "saving", label: "Annual Saving" },
          { key: "payback", label: "Payback" },
          { key: "note", label: "Implementation Note" },
        ], data.implementationPriority || priorityRows, "[To be updated after site data verification]")}
      </div>
      
      <div className="mt-4 mb-4 font-bold text-sm">1.9.3 Action Plan</div>
      {renderOptionalTable([
        { key: "step", label: "Step" }, { key: "action", label: "Action" }
      ], data.summary || [
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
      {renderMandatoryKeyValueTable({
        "Name of facility": bp.facilityName || data.reportInfo?.clientName,
        "Address": bp.address,
        "Type of building": bp.typeOfBuilding || data.reportInfo?.buildingType,
        "Year of construction": bp.yearOfConstruction,
        "Total built-up area": bp.totalBuiltUpArea,
        "Conditioned area": bp.conditionedArea,
        "Number of floors": bp.numberOfFloors,
        "Occupancy type": bp.occupancyType,
        "Average occupancy": bp.averageOccupancy,
        "Operating days and hours": bp.operatingDaysAndHours,
        "Facility contact person": bp.facilityContactPerson,
        "Audit date": data.reportInfo?.auditPeriod,
        "SEE-Tech audit team": data.reportInfo?.preparedBy || "SEE-Tech Solutions",
      })}

      <SectionHeader number="2.2" title="Building Operation Details" />
      {renderMandatoryTable([
        { key: "area", label: "Area / Function" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "remarks", label: "Remarks" },
      ], asArray(data.buildingOperationDetails).length ? data.buildingOperationDetails : [
        { area: "Office area" },
        { area: "Common area" },
        { area: "Basement / parking" },
        { area: "Server room / data room" },
        { area: "Kitchen" },
        { area: "Laundry" },
        { area: "Guest rooms" },
        { area: "Patient rooms / wards" },
        { area: "OT / ICU / critical areas" }
      ])}

      <SectionHeader number="2.3" title="Utility and Energy Sources" />
      {renderMandatoryTable([
        { key: "energySource", label: "Energy Source" },
        { key: "use", label: "Use" },
        { key: "annualConsumption", label: "Annual Consumption" },
        { key: "annualCost", label: "Annual Cost ₹" },
      ], asArray(data.utilityAndEnergySources).length ? data.utilityAndEnergySources : [
        { energySource: "Grid electricity", use: "HVAC, lighting, pumps, plug loads" },
        { energySource: "Diesel", use: "DG backup" },
        { energySource: "PNG / LPG", use: "Kitchen, boiler, hot water" },
        { energySource: "Solar PV", use: "Captive generation" },
        { energySource: "Solar thermal", use: "Hot water" },
        { energySource: "Other", use: "" }
      ])}

      <SectionHeader number="2.4" title="Electrical Supply Details" />
      {renderMandatoryKeyValueTable({
        "Supply voltage": esd.supplyVoltage,
        "Consumer number": esd.consumerNumber,
        "Tariff category": esd.tariffCategory,
        "Contract demand / sanctioned load": esd.contractDemand || esd.sanctionedLoad,
        "Connected load": esd.connectedLoad,
        "Transformer capacity": esd.transformerCapacity,
        "DG capacity": esd.dgCapacity,
        "APFC panel capacity": esd.apfcPanelCapacity,
        "Average power factor": esd.powerFactor || esd.averagePowerFactor,
        "Billing type": esd.billingType,
        "Average electricity tariff": esd.averageElectricityTariff || formatCurrencyDisplay(data.executiveSummary?.averageTariff),
      })}

      <SectionHeader number="2.5" title="Electricity Consumption and Billing Summary" />
      {renderMandatoryTable([
        { key: "month", label: "Month" },
        { key: "kwh", label: "kWh" },
        { key: "kvah", label: "kVAh" },
        { key: "demand", label: "Maximum Demand kVA" },
        { key: "pf", label: "PF" },
        { key: "bill", label: "Bill Amount ₹" },
        { key: "sec", label: "Specific Consumption" },
      ], asArray(data.monthlyBillingSummary || data.electricityBillingSummary).length ? (data.monthlyBillingSummary || data.electricityBillingSummary) : [
        { month: "Apr" }, { month: "May" }, { month: "Jun" }, { month: "Jul" },
        { month: "Aug" }, { month: "Sep" }, { month: "Oct" }, { month: "Nov" },
        { month: "Dec" }, { month: "Jan" }, { month: "Feb" }, { month: "Mar" },
        { month: "Total / Average" }
      ])}

      <SectionHeader number="2.6" title="Specific Energy Consumption Benchmark" />
      {renderMandatoryTable([
        { key: "buildingType", label: "Building Type" },
        { key: "benchmark", label: "Recommended Benchmark" },
      ], [
        { buildingType: "Office building", benchmark: "kWh/sq.ft/year" },
        { buildingType: "IT park", benchmark: "kWh/sq.ft/year and kWh/workstation/year" },
        { buildingType: "Hotel", benchmark: "kWh/occupied room night" },
        { buildingType: "Hospital", benchmark: "kWh/bed/day or kWh/sq.ft/year" },
        { buildingType: "Mall", benchmark: "kWh/sq.ft/year" },
        { buildingType: "Educational building", benchmark: "kWh/student/year or kWh/sq.ft/year" }
      ])}
      <br/>
      {renderMandatoryKeyValueTable({
        "Annual electricity consumption": benchmark.annualElectricityConsumption,
        "Built-up area": benchmark.builtUpArea,
        "Conditioned area": benchmark.conditionedArea,
        "Annual occupancy / room nights / bed days": benchmark.annualOccupancy,
        "Specific energy consumption": benchmark.specificEnergyConsumption,
        "Reference / target benchmark": benchmark.referenceBenchmark,
        "Improvement potential": benchmark.improvementPotential,
      })}

      <SectionHeader number="2.7" title="Major Energy-Consuming Systems" />
      {renderMandatoryTable([
        { key: "system", label: "System" },
        { key: "majorEquipment", label: "Major Equipment" },
        { key: "estimatedShare", label: "Estimated Share of Energy Consumption" },
        { key: "remarks", label: "Remarks" },
      ], asArray(data.majorEnergyConsumingSystems).length ? data.majorEnergyConsumingSystems : [
        { system: "HVAC", majorEquipment: "Chiller / VRF / AHU / pumps / cooling tower" },
        { system: "Lighting", majorEquipment: "Indoor / outdoor / parking / facade" },
        { system: "Pumps", majorEquipment: "Domestic / STP / hot water / HVAC" },
        { system: "Plug loads", majorEquipment: "Office equipment / appliances" },
        { system: "Server / IT loads", majorEquipment: "UPS, PAC, server room" },
        { system: "Kitchen / laundry", majorEquipment: "Hotel / hospital loads" },
        { system: "Hot water system", majorEquipment: "Boiler / heat pump / solar" },
        { system: "Lifts / escalators", majorEquipment: "Vertical transport" }
      ])}

      <SectionHeader number="2.8" title="HVAC System Details" />
      {renderMandatoryTable([
        { key: "equipment", label: "Equipment" },
        { key: "capacity", label: "Capacity" },
        { key: "quantity", label: "Quantity" },
        { key: "connectedLoad", label: "Connected Load" },
        { key: "controlSystem", label: "Control System" },
        { key: "remarks", label: "Remarks" },
      ], asArray(data.hvacSystemDetails).length ? data.hvacSystemDetails : [
        { equipment: "Chiller / VRF outdoor unit" },
        { equipment: "AHU" },
        { equipment: "FCU" },
        { equipment: "Cooling tower" },
        { equipment: "Chilled water pump" },
        { equipment: "Condenser water pump" },
        { equipment: "Fresh air unit" },
        { equipment: "Exhaust / ventilation fan" }
      ])}
      <p className="text-sm leading-snug mb-2">The HVAC system is one of the major energy-consuming systems in the building. During the audit, operating hours, loading pattern, temperature settings, pump and fan operation, control philosophy and maintenance condition should be reviewed. The main opportunities may relate to variable speed operation, AHU scheduling, chiller efficiency, fresh air optimization, cooling tower performance or set point optimization.</p>

      <SectionHeader number="2.9" title="Lighting System Details" />
      {renderMandatoryTable([
        { key: "area", label: "Area" },
        { key: "type", label: "Existing Fixture" },
        { key: "wattage", label: "Wattage" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "control", label: "Control Type" },
      ], asArray(data.lightingSystemDetails).length ? data.lightingSystemDetails : [
        { area: "Office area" },
        { area: "Corridor" },
        { area: "Parking" },
        { area: "Outdoor" },
        { area: "Back-of-house" },
        { area: "Guest room / ward" }
      ])}
      <p className="text-sm leading-snug mb-2">Lighting energy consumption can be reduced through LED retrofit, lux optimization and occupancy-based controls. Corridors, parking areas, toilets, staircases and service areas are usually suitable for sensors or timer-based control.</p>

      <SectionHeader number="2.10" title="Pumps and Motors" />
      {renderMandatoryTable([
        { key: "name", label: "Pump / Motor" },
        { key: "application", label: "Application" },
        { key: "rating", label: "Rating kW" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "control", label: "Control Method" },
        { key: "remarks", label: "Remarks" },
      ], asArray(data.pumpsAndMotors || data.pumpAndMotorDetails).length ? (data.pumpsAndMotors || data.pumpAndMotorDetails) : [
        { name: "Domestic water pump" },
        { name: "Hydro-pneumatic pump" },
        { name: "STP pump / blower" },
        { name: "Hot water pump" },
        { name: "HVAC pump" },
        { name: "Exhaust fan" }
      ])}

      <SectionHeader number="2.11" title="Building Automation and Controls" />
      {renderMandatoryTable([
        { key: "system", label: "System" },
        { key: "existingControl", label: "Existing Control" },
        { key: "observation", label: "Observation" },
        { key: "savingOpportunity", label: "Saving Opportunity" },
      ], asArray(data.buildingAutomationControls || data.automationAndControls).length ? (data.buildingAutomationControls || data.automationAndControls) : [
        { system: "HVAC scheduling" },
        { system: "AHU control" },
        { system: "Pump control" },
        { system: "Lighting control" },
        { system: "Parking ventilation" },
        { system: "Temperature set point" },
        { system: "Energy monitoring" }
      ])}

      <SectionHeader number="2.12" title="Summary of Audit Observations" />
      {renderMandatoryTable([
        { key: "srNo", label: "Sr. No." },
        { key: "observation", label: "Observation" },
        { key: "impact", label: "Impact" },
        { key: "recommendation", label: "Recommended Project" },
      ], asArray(data.auditObservations).length ? data.auditObservations : [
        { srNo: 1, observation: "[To be updated after site data verification]", impact: "High energy consumption" },
        { srNo: 2, observation: "[To be updated after site data verification]", impact: "Higher demand / kVAh billing" },
        { srNo: 3, observation: "[To be updated after site data verification]", impact: "Excess operating hours" },
        { srNo: 4, observation: "[To be updated after site data verification]", impact: "Inefficient equipment" },
        { srNo: 5, observation: "[To be updated after site data verification]", impact: "Poor control / manual operation" }
      ])}
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
      <ReportTable compact columns={[{ key: "system", label: "System" }, { key: "gap", label: "Typical Gap" }]} rows={(project.problemGapTable && project.problemGapTable.length > 0) ? project.problemGapTable : [getProblemGapEntry(ecmType)]} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.5 Proposed Project`} />
      <p className="text-sm leading-snug mb-2">{proposedDescription}</p>
      <ReportTable compact columns={[{ key: "srNo", label: "Sr. No." }, { key: "scopeItem", label: "Scope Item" }]} rows={buildScopeOfWorkRows(ecmType, project)} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.6 Key Activities for Implementation`} />
      <ReportTable compact columns={[{ key: "activity", label: "Activity" }, { key: "details", label: "Details" }, { key: "responsibility", label: "Responsibility" }]} rows={buildKeyActivityRows(ecmType, project)} />

      <SectionHeader level={3} title={`${ecmSectionNumber}.7 Rationale for Energy Saving`} />
      <p className="text-sm leading-snug mb-2">{rationale}</p>
      <ReportTable compact columns={[{ key: "projectType", label: "Project Type" }, { key: "savingRationale", label: "Saving Rationale" }]} rows={(project.rationaleTable && project.rationaleTable.length > 0) ? project.rationaleTable : [getRationaleEntry(ecmType)]} />

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
  const isDev = typeof process !== 'undefined' ? process.env?.NODE_ENV === 'development' : (import.meta as any).env?.DEV;
  const shouldShowDiagnostics =
    isDev &&
    typeof window !== 'undefined' &&
    window.localStorage?.getItem('showReportDiagnostics') === 'true';

  if (!shouldShowDiagnostics) return null;

  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const projects = groups.flatMap((group: any) =>
    Array.isArray(group?.projects) ? group.projects : []
  );

  const projectGroupingHit = Boolean(
    data?.executiveSummary?.projectGrouping ||
      data?.projectGrouping ||
      data?.chapter1?.projectGrouping
  );

  const priorityHit = Boolean(
    data?.executiveSummary?.recommendedImplementationPriority ||
      data?.recommendedImplementationPriority ||
      data?.chapter1?.recommendedImplementationPriority
  );

  return (
    <div className="mb-4 rounded border border-emerald-500 bg-slate-950 p-4 font-mono text-xs text-emerald-300">
      <div>DEV DIAGNOSTICS - Normalization Applied</div>
      <div>Normalized Groups Count: {groups.length}</div>
      <div>Normalized ECM Count: {projects.length}</div>
      <div>Chapter 1 Grouping Backend Hit: {String(projectGroupingHit).toUpperCase()}</div>
      <div>Chapter 1 Priority Backend Hit: {String(priorityHit).toUpperCase()}</div>
      <div>Missing Text Fields Sanitized: Working</div>
      <div>Missing Calculations Sanitized: Working</div>
      <div>Forbidden Tokens Filtered: Data required, [DRAFT], null, undefined, Explain...</div>
    </div>
  );
}

export default function CommercialBuildingEnergyAuditTemplate({ data }: { data: CommercialBuildingEnergyAuditData }) {
  const projects = asArray(data.projects);
  const groupedProjects = asArray(data.groupedProjects);
  
  console.log("REPORT GROUPED PROJECTS");
  console.log(data.groupedProjects);

  console.log("REPORT PROJECTS");
  console.log(data.projects);
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
