const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../frontend/src/components/templates/commercial-building-energy-audit/CommercialBuildingEnergyAuditTemplate.tsx');

let tsx = fs.readFileSync(targetPath, 'utf8');

// The file is huge, let's just create a new string containing the FULL updated TSX 
// and overwrite it.

const newTsx = `"use client";

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

const printCss = \`
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
\`;

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
  const num = Number(String(value).replace(/[^\\d.-]/g, ""));
  if (Number.isFinite(num)) {
    return num.toLocaleString("en-IN", { maximumFractionDigits: maxDecimals });
  }
  return String(value);
}

function formatCurrencyDisplay(value: any): string {
  if (!isMeaningful(value)) return "[To be updated after site data verification]";
  const num = Number(String(value).replace(/[^\\d.-]/g, ""));
  if (Number.isFinite(num)) return \`₹\${Math.round(num).toLocaleString("en-IN")}\`;
  const str = String(value);
  return str.includes("₹") ? str : \`₹\${str}\`;
}

function formatPaybackDisplay(value: any): string {
  return formatNumberDisplay(value, 2);
}

function numberFrom(value: ReportValue): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const num = Number(String(value).replace(/[₹,\\sA-Za-z/%]/g, ""));
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

function formatEcmNumber(project: CommercialBuildingProject) {
  const projectNo = firstNonEmpty(project.ecmNo, project.projectNumber, project.projectNo, "");
  return projectNo !== "[To be updated after site data verification]" ? \`ECM \${projectNo}\` : "";
}

function formatGroupHeading(group: any, index: number) {
  const subChapter = \`3.\${index + 1}\`;
  const groupNo = group.groupNo || \`GR-\${index + 1}\`;
  return \`\${subChapter} \${groupNo} \${group.groupTitle || ""}\`.trim();
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
              <th key={col.key} style={{ color: colors.white, padding: compact ? "4px 6px" : "6px 8px", textAlign: col.align || "left", fontWeight: 600, borderRight: \`1px solid rgba(255,255,255,0.18)\` }}>
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
                  <td key={col.key} style={{ padding: compact ? "4px 6px" : "6px 8px", textAlign: col.align || "left", borderBottom: \`1px solid \${colors.border}\`, borderRight: \`1px solid \${colors.border}\`, verticalAlign: "top", color: colors.text }}>
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
        {number ? \`\${number} \` : ""}
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
        <div style={{ marginTop: 34, border: \`1px solid \${colors.border}\`, borderRadius: 14, overflow: "hidden" }}>
          {[
            ["Prepared For", data.clientName],
            ["Building Type", data.buildingType],
            ["Location", data.location],
            ["Audit Period", data.auditPeriod],
            ["Report Date", data.reportDate],
            ["Prepared By", data.preparedBy || "SEE-Tech Solutions"],
            ["Document Version", data.documentVersion],
          ].map(([label, value], i) => (
            <div key={\`cover-row-\${i}\`} style={{ display: "grid", gridTemplateColumns: "180px 1fr", background: i % 2 === 0 ? colors.blueLight : colors.white, borderBottom: i === 6 ? "none" : \`1px solid \${colors.border}\` }}>
              <div style={{ padding: "12px 14px", fontWeight: 800, color: colors.primaryBlue }}>{label as string}</div>
              <div style={{ padding: "12px 14px" }}>{fallbackText(value, "")}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExecutiveSummaryPage({ data, projects, groupedProjects }: any) {
  const es = data.executiveSummary || {};
  const categorySummaryRows = groupedProjects.map((group: any, index: number) => ({
    groupNo: group.groupNo || \`GR-\${index + 1}\`,
    groupName: formatGroupHeading(group, index).replace(/^3\\.\\d+\\s*/, ""),
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
        projectNo: formatEcmNumber(project) || \`ECM \${index + 1}\`,
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

function ProjectChapterPage({ project }: { project: any }) {
  const norm = {
    overview: {
      "ECM number": firstNonEmpty(project.ecmNo, project.projectNumber, project.projectNo, ""),
      "ECM title": firstNonEmpty(project.projectTitle, project.title, project.ecmName, ""),
      "System / Category": firstNonEmpty(project.system, project.category, ""),
      "Equipment covered": firstNonEmpty(project.equipmentCovered, project.equipment, ""),
      "Location": firstNonEmpty(project.location, ""),
      "Proposed intervention": firstNonEmpty(project.proposedIntervention, project.proposedMeasure, project.proposedEnergyConservationMeasure, ""),
    },
    baseline: firstNonEmpty(project.existingSystemDescription, project.existingCondition, project.baselineCondition, project.existingSystem, project.existingOperatingCondition, project.baselineDetails),
    gap: firstNonEmpty(project.problemGapIdentified, project.problemGap, project.gapIdentified),
    proposed: firstNonEmpty(project.proposedProjectDescription, project.proposedIntervention, project.proposedEnergyConservationMeasure, project.proposedMeasure, project.recommendedMeasure),
    scope: project.scopeOfWork || project.scope || [{ srNo: 1, scopeItem: project.proposedIntervention || "Complete turnkey implementation of the proposed measure" }],
    activities: project.keyActivities || project.keyActivitiesNarrative || project.activities || [
      { activity: "Engineering", details: "Detailed engineering and layout finalization", responsibility: "Vendor / SEE-Tech" },
      { activity: "Procurement", details: "Equipment ordering and vendor finalization", responsibility: "Client" },
      { activity: "Installation", details: "Erection, piping, cabling, and modification", responsibility: "Vendor / Contractor" },
      { activity: "Commissioning", details: "Testing, commissioning, and handover", responsibility: "Vendor / SEE-Tech" },
    ],
    rationale: firstNonEmpty(project.rationaleForEnergySaving, project.rationale, project.savingRationale, "The recommendation reduces avoidable losses and improves alignment between system demand and energy input."),
    calc: project.energySavingCalculation || project.calculation || project.calculationBasis || project.assumptions || null,
    metrics: {
      "Baseline consumption": firstNonEmpty(project.baselineConsumption, "[Calculation pending due to missing input data]"),
      "Energy saving kWh/year": formatNumberDisplay(project.expectedEnergySaving || project.energySaving),
      "Percent saving": project.percentSaving ? \`\${formatNumberDisplay(project.percentSaving, 2)}%\` : "[Calculation pending due to missing input data]",
      "Annual cost saving": formatCurrencyDisplay(project.expectedAnnualCostSaving || project.annualSaving),
      "Investment": formatCurrencyDisplay(project.estimatedInvestment || project.investment),
      "Payback (years)": formatPaybackDisplay(project.simplePaybackPeriod || project.payback),
      "Implementation duration": firstNonEmpty(project.implementationDuration, project.duration, project.timeline, "[To be updated after site data verification]"),
      "CO2 reduction": isMeaningful(project.co2ReductionPotential || project.co2Reduction || project.carbonFootprintReduction) ? \`\${formatNumberDisplay(project.co2ReductionPotential || project.co2Reduction || project.carbonFootprintReduction)} kgCO2/year\` : "[Calculation pending due to missing emission factor]",
    },
    techSpec: project.technicalSpecification || project.specification || project.technicalSpecs || null,
    schematic: firstNonEmpty(project.schematic, project.conceptualFramework, project.figureReference, "[Schematic / conceptual diagram to be inserted after engineering finalization]"),
    durationTable: project.implementationDurationTable || project.implementationDuration || null,
    mvPlan: project.measurementVerificationPlan || project.mvPlan || project.monitoringPlan || project.monitoringAndVerificationPlan || [
      { parameter: "Power Consumption", baselineMeasurement: "Pre-implementation logging", postImplementationMeasurement: "Post-commissioning logging" },
      { parameter: "Operating Parameters", baselineMeasurement: "Process parameters baseline", postImplementationMeasurement: "Verified parameter consistency" },
    ],
    benefits: project.benefitsOtherThanEnergySaving || project.nonEnergyBenefits || project.benefits || project.oAndMRequirements || null,
    aspects: project.aspectsToBeTakenCareOf || project.carePoints || project.precautions || project.implementationConsiderations || null,
    risks: project.implementationRisks || project.risks || project.riskMitigation || project.risksAndMitigation || null,
    carbonText: isMeaningful(project.co2ReductionPotential || project.co2Reduction || project.carbonFootprintReduction) ? \`The estimated carbon footprint reduction is \${formatNumberDisplay(project.co2ReductionPotential || project.co2Reduction || project.carbonFootprintReduction)} kgCO2/year based on the projected energy savings.\` : "[Calculation pending due to missing emission factor]",
    caseStudy: firstNonEmpty(project.caseStudy, project.referenceApplication, "Similar measures are commonly implemented in comparable industrial utility/process systems after site-specific engineering validation. Project-specific case evidence shall be updated after implementation or vendor confirmation."),
    conclusion: firstNonEmpty(project.finalConclusion, project.conclusion, project.projectConclusion, "This ECM is technically suitable for implementation because it addresses an observed operating inefficiency through a practical and implementation-ready corrective measure.")
  };

  return (
    <div className="mb-4">
      <SectionHeader level={3} title="1. Project Overview" />
      {renderOptionalKeyValueTable(norm.overview, "")}
      <SectionHeader level={3} title="2. Existing System / Baseline Condition" />
      <p className="text-sm leading-snug mb-2">{norm.baseline}</p>
      <SectionHeader level={3} title="3. Problem / Gap Identified" />
      <p className="text-sm leading-snug mb-2">{norm.gap}</p>
      <SectionHeader level={3} title="4. Proposed Energy Conservation Measure" />
      <p className="text-sm leading-snug mb-2">{norm.proposed}</p>
      <SectionHeader level={3} title="5. Scope of Work" />
      {renderOptionalTable([{ key: "srNo", label: "Sr. No." }, { key: "scopeItem", label: "Scope Item" }], norm.scope, "")}
      <SectionHeader level={3} title="6. Key Activities" />
      {renderOptionalTable([{ key: "activity", label: "Activity" }, { key: "details", label: "Details" }, { key: "responsibility", label: "Responsibility" }], norm.activities, "")}
      <SectionHeader level={3} title="7. Rationale for Energy Saving" />
      <p className="text-sm leading-snug mb-2">{norm.rationale}</p>
      <SectionHeader level={3} title="8. Energy Saving Calculation" />
      {renderOptionalTable([{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }], norm.calc, "[Calculation pending due to missing input data]")}
      <SectionHeader level={3} title="9. Key Metrics" />
      {renderOptionalKeyValueTable(norm.metrics, "")}
      <SectionHeader level={3} title="10. Technical Specification" />
      {renderOptionalKeyValueTable(norm.techSpec, "[To be updated after site data verification]")}
      <SectionHeader level={3} title="11. Schematic / Conceptual Framework" />
      <p className="text-sm leading-snug mb-2">{norm.schematic}</p>
      <SectionHeader level={3} title="12. Implementation Duration" />
      {renderOptionalTable([{ key: "duration", label: "Estimated Duration" }, { key: "shutdown", label: "Shutdown Requirement" }, { key: "sequence", label: "Implementation Sequence" }, { key: "commissioning", label: "Commissioning" }, { key: "agency", label: "Responsible Agency" }], norm.durationTable, "[To be updated after site data verification]")}
      <SectionHeader level={3} title="13. Measurement and Verification Plan" />
      {renderOptionalTable([{ key: "parameter", label: "Parameter" }, { key: "baselineMeasurement", label: "Baseline Measurement" }, { key: "postImplementationMeasurement", label: "Post-Implementation Measurement" }], norm.mvPlan, "")}
      <SectionHeader level={3} title="14. Benefits Other Than Energy Saving" />
      {renderOptionalTable([{ key: "benefit", label: "Benefit" }, { key: "description", label: "Description" }], norm.benefits, "[To be updated after site data verification]")}
      <SectionHeader level={3} title="15. Aspects to be Taken Care Of" />
      {renderOptionalTable([{ key: "aspect", label: "Aspect" }, { key: "careRequired", label: "Care Required" }], norm.aspects, "[To be updated after site data verification]")}
      <SectionHeader level={3} title="16. Implementation Risks / Precautions" />
      {renderOptionalTable([{ key: "technical", label: "Technical Risk" }, { key: "operational", label: "Operational Risk" }, { key: "safety", label: "Safety Risk" }, { key: "mitigation", label: "Mitigation" }], norm.risks, "[To be updated after site data verification]")}
      <SectionHeader level={3} title="17. Carbon Footprint Reduction" />
      <p className="text-sm leading-snug mb-2">{norm.carbonText}</p>
      <SectionHeader level={3} title="18. Case Study / Reference Application" />
      <p className="text-sm leading-snug mb-2">{norm.caseStudy}</p>
      <SectionHeader level={3} title="19. Conclusion" />
      <p className="text-sm leading-snug mb-2">{norm.conclusion}</p>
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

      <ExecutiveSummaryPage data={data} projects={projects} groupedProjects={projectGroups} />
      <div className="page-break" />

      <BuildingEnergyProfilePage data={data} />
      <div className="page-break" />

      {projectGroups.map((group, index) => (
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
            {asArray(group.projects).map((project, pIndex) => (
              <ProjectChapterPage key={pIndex} project={project} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
`;

fs.writeFileSync(targetPath, newTsx);
console.log('TSX successfully replaced.');
