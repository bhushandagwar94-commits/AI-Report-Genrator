"use client";

import React from "react";

/**
 * SEE-Tech Commercial Building Energy Audit Report Template
 * Fixed React/TSX template based on SEE-Tech's Commercial Building Energy Audit Report Format.
 * Model should NOT generate layout. Model should return JSON matching CommercialBuildingEnergyAuditData.
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

export interface ExecutiveSummary {
  purposeText?: ReportValue;
  totalAnnualElectricityConsumption?: ReportValue;
  annualElectricityCost?: ReportValue;
  averageTariff?: ReportValue;
  numberOfProjects?: ReportValue;
  totalEnergySavingPotential?: ReportValue;
  totalAnnualCostSavingPotential?: ReportValue;
  totalEstimatedInvestment?: ReportValue;
  simplePaybackPeriod?: ReportValue;
  co2ReductionPotential?: ReportValue;
  keyObservations?: ReportValue[];
  conclusionAndWayForward?: { step?: ReportValue; action?: ReportValue }[];
}

export interface BuildingProfile {
  facilityName?: ReportValue;
  address?: ReportValue;
  typeOfBuilding?: ReportValue;
  yearOfConstruction?: ReportValue;
  totalBuiltUpArea?: ReportValue;
  conditionedArea?: ReportValue;
  numberOfFloors?: ReportValue;
  occupancyType?: ReportValue;
  averageOccupancy?: ReportValue;
  operatingDaysAndHours?: ReportValue;
  facilityContactPerson?: ReportValue;
  auditDate?: ReportValue;
  seeTechAuditTeam?: ReportValue;
}

export interface CommercialBuildingProject {
  projectNo?: ReportValue;
  projectTitle?: ReportValue;
  system?: ReportValue;
  location?: ReportValue;
  equipmentCovered?: ReportValue;
  existingOperatingCondition?: ReportValue;
  proposedIntervention?: ReportValue;
  expectedEnergySaving?: ReportValue;
  expectedAnnualCostSaving?: ReportValue;
  estimatedInvestment?: ReportValue;
  simplePaybackPeriod?: ReportValue;
  implementationDuration?: ReportValue;
  implementationPriority?: ReportValue;
  existingSystemDescription?: ReportValue;
  baselineData?: Record<string, ReportValue>[];
  measurementData?: Record<string, ReportValue>[];
  problemGapIdentified?: ReportValue;
  typicalGapTable?: Record<string, ReportValue>[];
  proposedProjectDescription?: ReportValue;
  scopeOfWork?: Record<string, ReportValue>[];
  keyActivities?: Record<string, ReportValue>[];
  rationaleForEnergySaving?: ReportValue;
  savingRationaleTable?: Record<string, ReportValue>[];
  energySavingCalculation?: Record<string, ReportValue>[];
  keyMetrics?: Record<string, ReportValue>[];
  technicalSpecifications?: Record<string, ReportValue>[];
  schematicFramework?: Record<string, ReportValue>[];
  implementationDurationTable?: Record<string, ReportValue>[];
  precautions?: Record<string, ReportValue>[];
  measurementVerificationPlan?: Record<string, ReportValue>[];
  benefitsOtherThanEnergySaving?: Record<string, ReportValue>[];
  projectConclusion?: ReportValue;
  carbonFootprint?: {
    annualEnergySaving?: ReportValue;
    emissionFactor?: ReportValue;
    estimatedCO2Reduction?: ReportValue;
    calculationBasis?: ReportValue;
    remarks?: ReportValue;
  };
  caseStudies?: {
    title?: ReportValue;
    clientType?: ReportValue;
    system?: ReportValue;
    implementedMeasure?: ReportValue;
    result?: ReportValue;
    relevance?: ReportValue;
  }[];
  finalConclusion?: ReportValue;
  images?: { src?: ReportValue; caption?: ReportValue }[];
}

export interface CommercialBuildingEnergyAuditData {
  reportInfo: ReportInfo;
  executiveSummary?: ExecutiveSummary;
  buildingProfile?: BuildingProfile;
  buildingOperationDetails?: Record<string, ReportValue>[];
  utilityAndEnergySources?: Record<string, ReportValue>[];
  electricalSupplyDetails?: Record<string, ReportValue>;
  electricityBillingSummary?: Record<string, ReportValue>[];
  specificEnergyBenchmark?: Record<string, ReportValue>;
  majorEnergyConsumingSystems?: Record<string, ReportValue>[];
  hvacSystemDetails?: Record<string, ReportValue>[];
  lightingSystemDetails?: Record<string, ReportValue>[];
  pumpsAndMotors?: Record<string, ReportValue>[];
  buildingAutomationControls?: Record<string, ReportValue>[];
  auditObservations?: Record<string, ReportValue>[];
  projects?: CommercialBuildingProject[];
  groupedProjects?: CommercialBuildingProjectGroup[];
}

export interface CommercialBuildingProjectGroup {
  groupNo: string;
  groupTitle: string;
  projects: CommercialBuildingProject[];
  totalInvestment: number | string;
  totalAnnualSaving: number | string;
  totalEnergySaving: number | string;
  weightedPayback: string;
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
  .report-preview-scroll {
    overflow: visible !important;
    max-height: none !important;
  }
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

function safeValue(value: ReportValue): string {
  if (value === null || value === undefined) return "Data required";
  if (typeof value === "number" && Number.isNaN(value)) return "Data required";
  const str = String(value).trim();
  return str.length ? str : "Data required";
}

function formatINR(value: ReportValue): string {
  if (value === null || value === undefined || value === "") return "Data required";
  const num = Number(String(value).replace(/[₹,\s]/g, ""));
  if (!Number.isNaN(num)) return `₹${Math.round(num).toLocaleString("en-IN")}`;
  const str = String(value);
  return str.includes("₹") ? str : `₹${str}`;
}

function numberFrom(value: ReportValue): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const num = Number(String(value).replace(/[₹,\sA-Za-z/%]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function totalInvestment(projects: CommercialBuildingProject[] = []) {
  return projects.reduce((sum, p) => sum + numberFrom(p.estimatedInvestment), 0);
}

function totalSavings(projects: CommercialBuildingProject[] = []) {
  return projects.reduce((sum, p) => sum + numberFrom(p.expectedAnnualCostSaving), 0);
}

function totalEnergy(projects: CommercialBuildingProject[] = []) {
  return projects.reduce((sum, p) => sum + numberFrom(p.expectedEnergySaving), 0);
}

function weightedPayback(projects: CommercialBuildingProject[] = []) {
  const inv = totalInvestment(projects);
  const sav = totalSavings(projects);
  return inv && sav ? (inv / sav).toFixed(2) : "Data required";
}

function SectionHeader({ number, title, level = 2 }: { number?: string; title: string; level?: 1 | 2 | 3 }) {
  const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  const fontSize = level === 1 ? 22 : level === 2 ? 17 : 15;
  return (
    <div style={{ marginTop: level === 1 ? 4 : 22, marginBottom: 12 }}>
      <Tag style={{ color: colors.primaryBlue, fontSize, fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
        {number ? `${number} ` : ""}
        {title}
        {level === 1 && <span style={{ flex: 1, height: 3, background: colors.primaryBlue, borderRadius: 4, marginLeft: 12 }} />}
      </Tag>
    </div>
  );
}

function normalizeTableRows(rows: any) {
  if (Array.isArray(rows)) {
    return rows.length ? rows : [{}];
  }
  if (rows && typeof rows === "object") {
    return [rows];
  }
  return [{}];
}

function ReportTable({
  columns,
  rows,
  compact = false,
}: {
  columns: { key: string; label: string; width?: string | number; align?: "left" | "right" | "center" }[];
  rows?: Record<string, any>[] | Record<string, any> | null;
  compact?: boolean;
}) {
  const safeRows = normalizeTableRows(rows);
  const safeColumns = Array.isArray(columns) && columns.length
    ? columns
    : [{ key: "value", label: "Value" }];

  return (
    <div style={{ margin: "12px 0 20px", borderRadius: 10, overflow: "hidden", border: `1px solid ${colors.border}`, boxShadow: "0 2px 12px rgba(24,52,74,0.08)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact ? 12 : 13 }}>
        <thead>
          <tr style={{ background: colors.primaryBlue }}>
            {safeColumns.map((col) => (
              <th key={col.key} style={{ color: colors.white, padding: compact ? "8px 9px" : "10px 12px", textAlign: col.align || "left", fontWeight: 700, width: col.width, borderRight: `1px solid rgba(255,255,255,0.18)` }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ background: rowIndex % 2 === 0 ? colors.blueLight : colors.white }}>
              {safeColumns.map((col) => (
                <td key={col.key} style={{ padding: compact ? "8px 9px" : "10px 12px", textAlign: col.align || "left", borderBottom: `1px solid ${colors.border}`, borderRight: `1px solid ${colors.border}`, verticalAlign: "top", color: colors.text }}>
                  {safeValue(row?.[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
          {safeValue(data.reportTitle || "Detailed Energy Audit Report")}
        </h1>
        <div style={{ height: 5, width: 120, background: colors.secondaryGreen, borderRadius: 99, marginBottom: 24 }} />
        <p style={{ color: colors.textMuted, fontSize: 16, maxWidth: 560, lineHeight: 1.55 }}>
          Commercial Buildings: Office | IT Park | Hotel | Hospital | Mall | Others
        </p>
        <p style={{ color: colors.text, fontSize: 15, maxWidth: 600, lineHeight: 1.6 }}>
          Purpose: To identify implementable energy-saving projects with clear investment, savings, payback and execution roadmap.
        </p>

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
            <div key={String(label)} style={{ display: "grid", gridTemplateColumns: "180px 1fr", background: i % 2 === 0 ? colors.blueLight : colors.white, borderBottom: i === 6 ? "none" : `1px solid ${colors.border}` }}>
              <div style={{ padding: "12px 14px", fontWeight: 800, color: colors.primaryBlue }}>{label}</div>
              <div style={{ padding: "12px 14px" }}>{safeValue(value)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: colors.textMuted }}>Prepared by SEE-Tech Solutions</div>
    </section>
  );
}

function TableOfContents({ groupedProjects = [] }: { groupedProjects?: CommercialBuildingProjectGroup[] }) {
  let chapterIndex = 3;
  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Table of Contents" />
      <ol style={{ color: colors.text, fontSize: 14, lineHeight: 1.9, marginTop: 28 }}>
        <li><b>Executive Summary</b></li>
        <li><b>Plant / Building Details and Energy Profile</b></li>
        {groupedProjects.length > 0 ? groupedProjects.map((g, i) => (
          <li key={i}>
            <b>{chapterIndex + i}. {g.groupNo} {safeValue(g.groupTitle)}</b>
            <ol style={{ paddingLeft: 20, listStyleType: "none" }}>
              {g.projects.map((p, j) => (
                <li key={j}>{safeValue(p.projectNo || j + 1)} – {safeValue(p.projectTitle)}</li>
              ))}
            </ol>
          </li>
        )) : <li><b>3. Energy Saving Projects</b></li>}
        <li><b>Annexures</b></li>
      </ol>
    </section>
  );
}

function ExecutiveSummaryPage({ data }: { data: CommercialBuildingEnergyAuditData }) {
  const projects = data.projects || [];
  const es = data.executiveSummary || {};
  const inv = es.totalEstimatedInvestment || totalInvestment(projects);
  const sav = es.totalAnnualCostSavingPotential || totalSavings(projects);
  const energy = es.totalEnergySavingPotential || totalEnergy(projects);

  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Chapter 1: Executive Summary" />

      <SectionHeader number="1.1" title="Purpose of the Energy Audit" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(es.purposeText || `The purpose of this energy audit is to identify technically feasible, financially attractive and practically implementable energy-saving projects for ${safeValue(data.reportInfo.clientName)}. The audit has been carried out with the objective of converting energy-saving opportunities into actual implementation projects that reduce electricity cost, operating cost and carbon emissions.`)}
      </p>
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>SEE-Tech approach: Energy Assessment → Opportunity Identification → Project Proposal → Implementation → Savings Delivery.</p>

      <SectionHeader number="1.2" title="Overall Energy Saving Potential" />
      <ReportTable columns={[{ key: "particular", label: "Particular" }, { key: "value", label: "Value" }]} rows={[
        { particular: "Total annual electricity consumption", value: es.totalAnnualElectricityConsumption },
        { particular: "Annual electricity cost", value: formatINR(es.annualElectricityCost) },
        { particular: "Average electricity tariff considered", value: es.averageTariff },
        { particular: "Number of projects identified", value: es.numberOfProjects || projects.length },
        { particular: "Total energy saving potential", value: energy },
        { particular: "Total annual cost saving potential", value: formatINR(sav) },
        { particular: "Total estimated investment", value: formatINR(inv) },
        { particular: "Simple payback period", value: es.simplePaybackPeriod || weightedPayback(projects) },
        { particular: "CO2 reduction potential", value: es.co2ReductionPotential },
      ]} />

      <SectionHeader number="1.3" title="Summary of Identified Energy Saving Projects" />
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>The following table is the key management decision table. It summarizes the projects recommended for implementation.</p>
      <ReportTable compact columns={[
        { key: "projectNo", label: "Project No." },
        { key: "project", label: "Energy Saving Project" },
        { key: "system", label: "System" },
        { key: "investment", label: "Investment ₹" },
        { key: "saving", label: "Annual Saving ₹/year" },
        { key: "energy", label: "Energy Saving kWh/year" },
        { key: "payback", label: "Payback" },
        { key: "priority", label: "Priority" },
      ]} rows={projects.map((p, i) => ({
        projectNo: p.projectNo || `Project ${i + 1}`,
        project: p.projectTitle,
        system: p.system,
        investment: formatINR(p.estimatedInvestment),
        saving: formatINR(p.expectedAnnualCostSaving),
        energy: p.expectedEnergySaving,
        payback: p.simplePaybackPeriod,
        priority: p.implementationPriority,
      }))} />

      <SectionHeader number="1.4" title="Project Grouping" />
      <ReportTable columns={[
        { key: "group", label: "Group" },
        { key: "category", label: "Project Category" },
        { key: "typical", label: "Typical Projects" },
      ]} rows={[
        { group: "GR-1", category: "HVAC System Optimization", typical: "Chiller, VRF/VRV, AHU, cooling tower, chilled water pumps" },
        { group: "GR-2", category: "Pumps, Motors and Ventilation", typical: "Domestic pumps, STP pumps, exhaust fans, parking ventilation" },
        { group: "GR-3", category: "Electrical System and Demand Optimization", typical: "APFC, kVAh billing, demand control, transformer loading" },
        { group: "GR-4", category: "Lighting and Controls", typical: "LED retrofit, occupancy sensors, daylight control, timer-based control" },
        { group: "GR-5", category: "Hot Water / Thermal System", typical: "Heat pump, boiler optimization, solar hot water, heat recovery" },
        { group: "GR-6", category: "Renewable Energy and Monitoring", typical: "Solar PV, energy dashboard, IoT metering, sub-metering" },
      ]} />

      <SectionHeader number="1.5" title="Category-Wise Financial Summary" />
      <ReportTable compact columns={[
        { key: "group", label: "Group" },
        { key: "count", label: "No. of Projects" },
        { key: "investment", label: "Investment ₹" },
        { key: "saving", label: "Annual Saving ₹/year" },
        { key: "energy", label: "Energy Saving kWh/year" },
        { key: "payback", label: "Payback" },
      ]} rows={[
        { group: "HVAC system" },
        { group: "Pumps and motors" },
        { group: "Lighting" },
        { group: "Electrical system" },
        { group: "Hot water / thermal system" },
        { group: "Renewable energy / monitoring" },
        { group: "Total", count: projects.length, investment: formatINR(inv), saving: formatINR(sav), energy, payback: es.simplePaybackPeriod || weightedPayback(projects) },
      ]} />

      <SectionHeader number="1.6" title="Recommended Implementation Priority" />
      <ReportTable columns={[
        { key: "priority", label: "Priority" },
        { key: "criteria", label: "Criteria" },
        { key: "action", label: "Recommended Action" },
      ]} rows={[
        { priority: "Immediate", criteria: "Low investment, quick payback, no operational risk", action: "Approve immediately" },
        { priority: "Short Term", criteria: "Moderate investment, payback generally below 2 years", action: "Take budgetary approval" },
        { priority: "Medium Term", criteria: "Higher investment or needs shutdown planning", action: "Plan phase-wise" },
        { priority: "Strategic", criteria: "High investment, long-term decarbonization benefit", action: "Include in annual capex plan" },
      ]} />

      <SectionHeader number="1.7" title="Key Observations" />
      <ul style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {(es.keyObservations?.length ? es.keyObservations : [
          "HVAC operation and control generally provide the highest saving potential in commercial buildings.",
          "Fixed-speed pumps and fans should be reviewed for VFD-based operation wherever load varies.",
          "Lighting systems should be reviewed for LED retrofit, lux optimization and occupancy-based control.",
          "Power factor, kVAh billing and demand management should be checked for billing-related savings.",
          "Energy monitoring, BMS logic and operator practices are critical for sustaining savings after implementation.",
        ]).map((item, i) => <li key={i}>{safeValue(item)}</li>)}
      </ul>

      <SectionHeader number="1.8" title="Conclusion and Way Forward" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        Based on the audit findings, SEE-Tech recommends that {safeValue(data.reportInfo.clientName)} should proceed with detailed implementation planning for the identified energy-saving projects.
      </p>
      <ReportTable columns={[{ key: "step", label: "Step" }, { key: "action", label: "Action" }]} rows={es.conclusionAndWayForward?.length ? es.conclusionAndWayForward : [
        { step: 1, action: "Client review of identified projects" },
        { step: 2, action: "Joint selection of projects for implementation" },
        { step: 3, action: "Detailed engineering and vendor finalization" },
        { step: 4, action: "Submission of final techno-commercial proposal" },
        { step: 5, action: "Implementation, commissioning and performance monitoring" },
        { step: 6, action: "Savings validation and handover" },
      ]} />
    </section>
  );
}

function BuildingEnergyProfilePage({ data }: { data: CommercialBuildingEnergyAuditData }) {
  const bp = data.buildingProfile || {};
  const esd = data.electricalSupplyDetails || {};
  const benchmark = data.specificEnergyBenchmark || {};

  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Chapter 2: Plant / Building Details and Energy Profile" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>For commercial buildings, this chapter captures the building profile, utility details, major energy-consuming systems, operating pattern and audit observations.</p>

      <SectionHeader number="2.1" title="General Information" />
      <ReportTable columns={[{ key: "particular", label: "Particular" }, { key: "details", label: "Details" }]} rows={[
        { particular: "Name of facility", details: bp.facilityName || data.reportInfo.clientName },
        { particular: "Address", details: bp.address },
        { particular: "Type of building", details: bp.typeOfBuilding || data.reportInfo.buildingType },
        { particular: "Year of construction", details: bp.yearOfConstruction },
        { particular: "Total built-up area", details: bp.totalBuiltUpArea },
        { particular: "Conditioned area", details: bp.conditionedArea },
        { particular: "Number of floors", details: bp.numberOfFloors },
        { particular: "Occupancy type", details: bp.occupancyType },
        { particular: "Average occupancy", details: bp.averageOccupancy },
        { particular: "Operating days and hours", details: bp.operatingDaysAndHours },
        { particular: "Facility contact person", details: bp.facilityContactPerson },
        { particular: "Audit date", details: bp.auditDate },
        { particular: "SEE-Tech audit team", details: bp.seeTechAuditTeam },
      ]} />

      <SectionHeader number="2.2" title="Building Operation Details" />
      <ReportTable columns={[
        { key: "areaFunction", label: "Area / Function" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "remarks", label: "Remarks" },
      ]} rows={data.buildingOperationDetails || [
        { areaFunction: "Office area" }, { areaFunction: "Common area" }, { areaFunction: "Basement / parking" },
        { areaFunction: "Server room / data room" }, { areaFunction: "Kitchen", remarks: "Applicable for hotel / hospital" },
      ]} />

      <SectionHeader number="2.3" title="Utility and Energy Sources" />
      <ReportTable columns={[
        { key: "energySource", label: "Energy Source" },
        { key: "use", label: "Use" },
        { key: "annualConsumption", label: "Annual Consumption" },
        { key: "annualCost", label: "Annual Cost ₹" },
      ]} rows={data.utilityAndEnergySources || [
        { energySource: "Grid electricity", use: "HVAC, lighting, pumps, plug loads" },
        { energySource: "Diesel", use: "DG backup" },
        { energySource: "PNG / LPG", use: "Kitchen, boiler, hot water" },
        { energySource: "Solar PV", use: "Captive generation" },
      ]} />

      <SectionHeader number="2.4" title="Electrical Supply Details" />
      <ReportTable columns={[{ key: "particular", label: "Particular" }, { key: "details", label: "Details" }]} rows={[
        { particular: "Supply voltage", details: esd.supplyVoltage },
        { particular: "Consumer number", details: esd.consumerNumber },
        { particular: "Tariff category", details: esd.tariffCategory },
        { particular: "Contract demand / sanctioned load", details: esd.contractDemand },
        { particular: "Connected load", details: esd.connectedLoad },
        { particular: "Transformer capacity", details: esd.transformerCapacity },
        { particular: "DG capacity", details: esd.dgCapacity },
        { particular: "APFC panel capacity", details: esd.apfcPanelCapacity },
        { particular: "Average power factor", details: esd.averagePowerFactor },
        { particular: "Billing type", details: esd.billingType || "kWh / kVAh / TOD" },
        { particular: "Average electricity tariff", details: esd.averageElectricityTariff || "₹/kWh" },
      ]} />

      <SectionHeader number="2.5" title="Electricity Consumption and Billing Summary" />
      <ReportTable compact columns={[
        { key: "month", label: "Month" }, { key: "kwh", label: "kWh" }, { key: "kvah", label: "kVAh" },
        { key: "maximumDemandKva", label: "Maximum Demand kVA" }, { key: "pf", label: "PF" },
        { key: "billAmount", label: "Bill Amount ₹" }, { key: "specificConsumption", label: "Specific Consumption" },
      ]} rows={data.electricityBillingSummary || ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Total / Average"].map(month => ({ month }))} />

      <SectionHeader number="2.6" title="Specific Energy Consumption Benchmark" />
      <ReportTable columns={[{ key: "buildingType", label: "Building Type" }, { key: "recommendedBenchmark", label: "Recommended Benchmark" }]} rows={[
        { buildingType: "Office building", recommendedBenchmark: "kWh/sq.ft/year" },
        { buildingType: "IT park", recommendedBenchmark: "kWh/sq.ft/year and kWh/workstation/year" },
        { buildingType: "Hotel", recommendedBenchmark: "kWh/occupied room night" },
        { buildingType: "Hospital", recommendedBenchmark: "kWh/bed/day or kWh/sq.ft/year" },
        { buildingType: "Mall", recommendedBenchmark: "kWh/sq.ft/year" },
      ]} />
      <ReportTable columns={[{ key: "parameter", label: "Parameter" }, { key: "value", label: "Value" }]} rows={[
        { parameter: "Annual electricity consumption", value: benchmark.annualElectricityConsumption },
        { parameter: "Built-up area", value: benchmark.builtUpArea },
        { parameter: "Conditioned area", value: benchmark.conditionedArea },
        { parameter: "Annual occupancy / room nights / bed days", value: benchmark.annualOccupancy },
        { parameter: "Specific energy consumption", value: benchmark.specificEnergyConsumption },
        { parameter: "Reference / target benchmark", value: benchmark.referenceBenchmark },
        { parameter: "Improvement potential", value: benchmark.improvementPotential },
      ]} />

      <SectionHeader number="2.7" title="Major Energy-Consuming Systems" />
      <ReportTable columns={[
        { key: "system", label: "System" }, { key: "majorEquipment", label: "Major Equipment" },
        { key: "estimatedShare", label: "Estimated Share of Energy Consumption" }, { key: "remarks", label: "Remarks" },
      ]} rows={data.majorEnergyConsumingSystems || [
        { system: "HVAC", majorEquipment: "Chiller / VRF / AHU / pumps / cooling tower" },
        { system: "Lighting", majorEquipment: "Indoor / outdoor / parking / facade" },
        { system: "Pumps", majorEquipment: "Domestic / STP / hot water / HVAC" },
        { system: "Plug loads", majorEquipment: "Office equipment / appliances" },
      ]} />

      <SectionHeader number="2.8" title="HVAC System Details" />
      <ReportTable compact columns={[
        { key: "equipment", label: "Equipment" }, { key: "capacity", label: "Capacity" }, { key: "quantity", label: "Quantity" },
        { key: "connectedLoad", label: "Connected Load" }, { key: "controlSystem", label: "Control System" }, { key: "remarks", label: "Remarks" },
      ]} rows={data.hvacSystemDetails || [
        { equipment: "Chiller / VRF outdoor unit" }, { equipment: "AHU" }, { equipment: "FCU" },
        { equipment: "Cooling tower" }, { equipment: "Chilled water pump" }, { equipment: "Condenser water pump" },
      ]} />
      <p style={{ fontSize: 13, lineHeight: 1.6 }}>The HVAC system is one of the major energy-consuming systems in the building. During the audit, operating hours, loading pattern, temperature settings, pump and fan operation, control philosophy and maintenance condition should be reviewed.</p>

      <SectionHeader number="2.9" title="Lighting System Details" />
      <ReportTable compact columns={[
        { key: "area", label: "Area" }, { key: "existingFixture", label: "Existing Fixture" }, { key: "wattage", label: "Wattage" },
        { key: "quantity", label: "Quantity" }, { key: "operatingHours", label: "Operating Hours" }, { key: "controlType", label: "Control Type" },
      ]} rows={data.lightingSystemDetails || [
        { area: "Office area" }, { area: "Corridor" }, { area: "Parking" }, { area: "Outdoor" }, { area: "Back-of-house" },
      ]} />

      <SectionHeader number="2.10" title="Pumps and Motors" />
      <ReportTable compact columns={[
        { key: "pumpOrMotor", label: "Pump / Motor" }, { key: "application", label: "Application" }, { key: "ratingKw", label: "Rating kW" },
        { key: "quantity", label: "Quantity" }, { key: "operatingHours", label: "Operating Hours" },
        { key: "controlMethod", label: "Control Method" }, { key: "remarks", label: "Remarks" },
      ]} rows={data.pumpsAndMotors || [
        { pumpOrMotor: "Domestic water pump" }, { pumpOrMotor: "Hydro-pneumatic pump" }, { pumpOrMotor: "STP pump / blower" }, { pumpOrMotor: "HVAC pump" },
      ]} />

      <SectionHeader number="2.11" title="Building Automation and Controls" />
      <ReportTable columns={[
        { key: "system", label: "System" }, { key: "existingControl", label: "Existing Control" },
        { key: "observation", label: "Observation" }, { key: "savingOpportunity", label: "Saving Opportunity" },
      ]} rows={data.buildingAutomationControls || [
        { system: "HVAC scheduling", existingControl: "Manual / BMS / Timer" },
        { system: "AHU control", existingControl: "On-off / VFD / CO2 control" },
        { system: "Pump control", existingControl: "Manual / pressure-based / VFD" },
        { system: "Lighting control", existingControl: "Manual / timer / sensor" },
        { system: "Parking ventilation", existingControl: "Manual / timer / CO sensor" },
      ]} />

      <SectionHeader number="2.12" title="Summary of Audit Observations" />
      <ReportTable columns={[
        { key: "srNo", label: "Sr. No." }, { key: "observation", label: "Observation" },
        { key: "impact", label: "Impact" }, { key: "recommendedProject", label: "Recommended Project" },
      ]} rows={data.auditObservations || [
        { srNo: 1, impact: "High energy consumption" },
        { srNo: 2, impact: "Higher demand / kVAh billing" },
        { srNo: 3, impact: "Excess operating hours" },
        { srNo: 4, impact: "Inefficient equipment" },
        { srNo: 5, impact: "Poor control / manual operation" },
      ]} />
    </section>
  );
}

function ImageBlock({ src, caption }: { src?: ReportValue; caption?: ReportValue }) {
  if (!src) {
    return (
      <div style={{ border: `1px dashed ${colors.border}`, background: colors.blueLight, borderRadius: 10, padding: 18, color: colors.textMuted, textAlign: "center", margin: "14px 0 18px" }}>
        Image required
      </div>
    );
  }
  return (
    <figure style={{ margin: "14px 0 20px", textAlign: "center" }}>
      <img src={String(src)} alt={safeValue(caption)} style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 10, border: `1px solid ${colors.border}` }} />
      <figcaption style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>{safeValue(caption)}</figcaption>
    </figure>
  );
}

function ProjectChapterPage({ project, chapterNumber }: { project: CommercialBuildingProject; chapterNumber: number }) {
  const n = (sectionNumber: number) => {
    const base = chapterNumber || project?.chapterNumber || String(project?.projectNo).replace(/\D/g, "") || "3";
    return `${base}.${sectionNumber}`;
  };

  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={2} title={`${safeValue(project.projectNo)} – ${safeValue(project.projectTitle)}`} />

      <SectionHeader level={3} title="Project Summary" />
      <ReportTable columns={[{ key: "particular", label: "Particular" }, { key: "details", label: "Details" }]} rows={[
        { particular: "Project title", details: project.projectTitle },
        { particular: "Project number", details: project.projectNo },
        { particular: "System", details: project.system },
        { particular: "Location", details: project.location },
        { particular: "Equipment covered", details: project.equipmentCovered },
        { particular: "Existing operating condition", details: project.existingOperatingCondition },
        { particular: "Proposed intervention", details: project.proposedIntervention },
        { particular: "Expected energy saving", details: project.expectedEnergySaving },
        { particular: "Expected annual cost saving", details: formatINR(project.expectedAnnualCostSaving) },
        { particular: "Estimated investment", details: formatINR(project.estimatedInvestment) },
        { particular: "Simple payback period", details: project.simplePaybackPeriod },
        { particular: "Implementation duration", details: project.implementationDuration },
        { particular: "Implementation priority", details: project.implementationPriority },
      ]} />

      <SectionHeader number={n(2)} title="Existing System Description" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>{safeValue(project.existingSystemDescription || `The existing system consists of ${safeValue(project.equipmentCovered)}. The system is presently operated through ${safeValue(project.existingOperatingCondition)}. During the audit, it was observed that the present operation does not fully match the actual building load variation, resulting in avoidable energy consumption.`)}</p>

      <SectionHeader number={n(3)} title="Baseline Data and Measurements" />
      <ReportTable columns={[{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }]} rows={project.baselineData || [
        { parameter: "Equipment rating", unit: "kW / TR / HP" },
        { parameter: "Quantity", unit: "Nos." },
        { parameter: "Operating hours", unit: "hours/day" },
        { parameter: "Operating days", unit: "days/year" },
        { parameter: "Existing power consumption", unit: "kW" },
        { parameter: "Annual operating hours", unit: "hours/year" },
        { parameter: "Baseline annual consumption", unit: "kWh/year" },
        { parameter: "Average tariff", unit: "₹/kWh" },
        { parameter: "Baseline annual energy cost", unit: "₹/year" },
      ]} />
      <ReportTable columns={[{ key: "measurement", label: "Measurement" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }]} rows={project.measurementData || [
        { measurement: "Voltage", unit: "V" },
        { measurement: "Current", unit: "A" },
        { measurement: "Power factor", unit: "-" },
        { measurement: "Measured power", unit: "kW" },
        { measurement: "Flow / airflow", unit: "m3/hr / CFM" },
        { measurement: "Pressure / head / static pressure", unit: "m / mmWC / bar" },
        { measurement: "Temperature inlet", unit: "deg C" },
        { measurement: "Temperature outlet", unit: "deg C" },
        { measurement: "Operating frequency", unit: "Hz" },
      ]} />

      <SectionHeader number={n(4)} title="Problem / Gap Identified" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>{safeValue(project.problemGapIdentified || "The audit team observed that the existing system has potential for energy saving due to fixed-speed operation, over-capacity, higher operating hours, poor control, inefficient equipment, or absence of automation.")}</p>
      <ReportTable columns={[{ key: "system", label: "System" }, { key: "typicalGap", label: "Typical Gap" }]} rows={project.typicalGapTable || [
        { system: "AHU / fan", typicalGap: "Constant speed operation despite variable occupancy" },
        { system: "Pump", typicalGap: "Throttling, bypass or fixed-flow operation" },
        { system: "Chiller", typicalGap: "High kW/TR due to poor condenser temperature or low delta-T" },
        { system: "Lighting", typicalGap: "High wattage and manual operation" },
        { system: "APFC", typicalGap: "Low PF or kVAh billing loss" },
        { system: "Hot water", typicalGap: "High cost from electric heater / boiler" },
        { system: "Solar PV", typicalGap: "Available roof area not utilized" },
        { system: "BMS", typicalGap: "No monitoring of actual energy performance" },
      ]} />

      <SectionHeader number={n(5)} title="Proposed Project" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>{safeValue(project.proposedProjectDescription || `It is proposed to implement ${safeValue(project.proposedIntervention)} for ${safeValue(project.equipmentCovered)}. The project includes supply, installation, testing and commissioning of major components and controls.`)}</p>
      <ReportTable columns={[{ key: "srNo", label: "Sr. No." }, { key: "scopeItem", label: "Scope Item" }]} rows={project.scopeOfWork || [
        { srNo: 1, scopeItem: "Detailed site measurement and final engineering" },
        { srNo: 2, scopeItem: "Supply of equipment / VFD / controller / motor / sensor / panel" },
        { srNo: 3, scopeItem: "Installation and integration with existing system" },
        { srNo: 4, scopeItem: "Cabling, piping or ducting modification, if required" },
        { srNo: 5, scopeItem: "Testing and commissioning" },
        { srNo: 6, scopeItem: "Performance monitoring" },
        { srNo: 7, scopeItem: "Operator training and handover" },
      ]} />

      <SectionHeader number={n(6)} title="Key Activities for Implementation" />
      <ReportTable columns={[{ key: "activity", label: "Activity" }, { key: "details", label: "Details" }, { key: "responsibility", label: "Responsibility" }]} rows={project.keyActivities || [
        { activity: "Site verification", details: "Confirm equipment rating, location and operating condition", responsibility: "SEE-Tech + Client" },
        { activity: "Design finalization", details: "Finalize technical specifications and control logic", responsibility: "SEE-Tech" },
        { activity: "Procurement", details: "Arrange equipment and accessories", responsibility: "SEE-Tech / Vendor" },
        { activity: "Installation", details: "Install system with minimum disturbance", responsibility: "SEE-Tech" },
        { activity: "Integration", details: "Integrate with panel / BMS / controls", responsibility: "SEE-Tech" },
        { activity: "Trial run", details: "Operate under different load conditions", responsibility: "SEE-Tech + Client" },
        { activity: "Measurement", details: "Record before and after performance", responsibility: "SEE-Tech" },
        { activity: "Handover", details: "Submit performance report and train operators", responsibility: "SEE-Tech" },
      ]} />

      <SectionHeader number={n(7)} title="Rationale for Energy Saving" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>{safeValue(project.rationaleForEnergySaving)}</p>
      <ReportTable columns={[{ key: "projectType", label: "Project Type" }, { key: "savingRationale", label: "Saving Rationale" }]} rows={project.savingRationaleTable || [
        { projectType: "Fan or pump VFD", savingRationale: "Fans and pumps follow affinity laws; reduction in speed results in significant reduction in power." },
        { projectType: "IE4 / IE5 motor retrofit", savingRationale: "Higher motor efficiency reduces electrical losses and improves system efficiency." },
        { projectType: "Lighting retrofit", savingRationale: "LED fixtures provide required lux level at lower wattage; controls reduce operating hours." },
        { projectType: "APFC / kVAh optimization", savingRationale: "Improved power factor reduces kVA demand and billing losses." },
        { projectType: "Heat pump", savingRationale: "Heat is transferred instead of directly generated, reducing electricity per unit of hot water." },
        { projectType: "Solar PV", savingRationale: "Part of grid electricity consumption is replaced by captive renewable generation." },
      ]} />

      <SectionHeader number={n(8)} title="Energy Saving Calculation" />
      <ReportTable columns={[{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }]} rows={project.energySavingCalculation || [
        { parameter: "Existing connected load / measured load", unit: "kW" },
        { parameter: "Proposed load after project", unit: "kW" },
        { parameter: "Load reduction", unit: "kW" },
        { parameter: "Operating hours", unit: "hours/year" },
        { parameter: "Annual energy saving", unit: "kWh/year", value: project.expectedEnergySaving },
        { parameter: "Average tariff", unit: "₹/kWh" },
        { parameter: "Annual cost saving", unit: "₹/year", value: project.expectedAnnualCostSaving },
        { parameter: "Estimated investment", unit: "₹", value: project.estimatedInvestment },
        { parameter: "Simple payback", unit: "years", value: project.simplePaybackPeriod },
      ]} />
      <p style={{ fontSize: 12.5, lineHeight: 1.6 }}>Annual Energy Saving = Load Reduction x Annual Operating Hours | Annual Cost Saving = Annual Energy Saving x Average Electricity Tariff | Simple Payback = Estimated Investment / Annual Cost Saving</p>

      <SectionHeader number={n(9)} title="Carbon Footprint" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        The proposed project will contribute to carbon footprint reduction by lowering annual electricity consumption. The CO2 reduction shall be calculated based on the annual energy saving and applicable grid emission factor.
      </p>
      <ReportTable columns={[{ key: "parameter", label: "Parameter" }, { key: "value", label: "Value" }]} rows={[
        { parameter: "Annual energy saving", value: project.carbonFootprint?.annualEnergySaving || project.expectedEnergySaving },
        { parameter: "Grid emission factor", value: project.carbonFootprint?.emissionFactor || "Data required" },
        { parameter: "Estimated CO2 reduction", value: project.carbonFootprint?.estimatedCO2Reduction || "Data required" },
        { parameter: "Calculation basis", value: project.carbonFootprint?.calculationBasis || "Annual Energy Saving x Grid Emission Factor" },
        { parameter: "Remarks", value: project.carbonFootprint?.remarks || "Data required" },
      ]} />

      <SectionHeader number={n(10)} title="Key Metrics" />
      <ReportTable columns={[{ key: "srNo", label: "Sr. No." }, { key: "parameter", label: "Parameter" }, { key: "value", label: "Value" }]} rows={project.keyMetrics || [
        { srNo: 1, parameter: "Baseline consumption", value: "Data required" },
        { srNo: 2, parameter: "Energy saving", value: project.expectedEnergySaving },
        { srNo: 3, parameter: "Percentage saving", value: "Data required" },
        { srNo: 4, parameter: "Cost saving", value: formatINR(project.expectedAnnualCostSaving) },
        { srNo: 5, parameter: "Estimated investment", value: formatINR(project.estimatedInvestment) },
        { srNo: 6, parameter: "Payback period", value: project.simplePaybackPeriod },
        { srNo: 7, parameter: "CO2 reduction", value: "Data required" },
      ]} />

      <SectionHeader number={n(11)} title="Technical Specifications" />
      <ReportTable columns={[{ key: "item", label: "Item" }, { key: "specification", label: "Specification" }]} rows={project.technicalSpecifications || [
        { item: "Equipment / technology" }, { item: "Capacity" }, { item: "Quantity" },
        { item: "Motor efficiency class, if applicable", specification: "IE4 / IE5" },
        { item: "VFD rating, if applicable" }, { item: "Sensor type" }, { item: "Controller / PLC / IoT system" },
        { item: "Communication", specification: "Modbus / BACnet / Cloud / BMS" },
        { item: "Panel requirement" }, { item: "Civil / mechanical modification" }, { item: "Safety requirement" },
      ]} />

      <SectionHeader number={n(12)} title="Schematic / Conceptual Framework" />
      <ReportTable columns={[{ key: "stage", label: "Stage" }, { key: "description", label: "Description" }]} rows={project.schematicFramework || [
        { stage: "Stage 1: Current State", description: "Existing inefficient or non-optimized operation" },
        { stage: "Stage 2: Intervention", description: "What SEE-Tech will install or modify" },
        { stage: "Stage 3: Physics of Saving", description: "Why energy will reduce after the intervention" },
        { stage: "Stage 4: Outcome", description: "kWh saving, ₹ saving, payback and reliability benefit" },
      ]} />
      {(project.images && project.images.length ? project.images : [{ src: "", caption: "" }]).map((img, index) => (
        <ImageBlock key={index} src={img.src} caption={img.caption} />
      ))}

      <SectionHeader number={n(13)} title="Implementation Duration" />
      <ReportTable columns={[{ key: "activity", label: "Activity" }, { key: "duration", label: "Duration" }]} rows={project.implementationDurationTable || [
        { activity: "Engineering and approval", duration: "1 week" },
        { activity: "Procurement", duration: "2-4 weeks" },
        { activity: "Installation", duration: "1-2 weeks" },
        { activity: "Testing and commissioning", duration: "1 week" },
        { activity: "Performance monitoring", duration: "2-4 weeks" },
        { activity: "Total expected duration", duration: project.implementationDuration || "Data required" },
      ]} />

      <SectionHeader number={n(14)} title="Precautions / Aspects to be Taken Care Of" />
      <ReportTable columns={[{ key: "area", label: "Area" }, { key: "precaution", label: "Precaution" }]} rows={project.precautions || [
        { area: "Technical suitability", precaution: "Confirm equipment rating, sizing and compatibility" },
        { area: "Operation", precaution: "Ensure project does not affect comfort, safety or process requirement" },
        { area: "Controls", precaution: "Test control logic under different load conditions" },
        { area: "Electrical safety", precaution: "Ensure proper protection, earthing and panel safety" },
        { area: "Maintenance", precaution: "Train maintenance team for operation and troubleshooting" },
        { area: "Measurement", precaution: "Record before and after data for savings validation" },
        { area: "Shutdown planning", precaution: "Plan installation during low-load or non-operating hours" },
      ]} />

      <SectionHeader number={n(15)} title="Measurement and Verification Plan" />
      <ReportTable columns={[{ key: "parameter", label: "Parameter" }, { key: "baselineMeasurement", label: "Baseline Measurement" }, { key: "postImplementationMeasurement", label: "Post-Implementation Measurement" }]} rows={project.measurementVerificationPlan || [
        { parameter: "Power consumption", baselineMeasurement: "kW before project", postImplementationMeasurement: "kW after project" },
        { parameter: "Operating hours", baselineMeasurement: "Existing operating schedule", postImplementationMeasurement: "Revised operating schedule" },
        { parameter: "Energy consumption", baselineMeasurement: "kWh/year baseline", postImplementationMeasurement: "kWh/year after project" },
        { parameter: "Performance parameter", baselineMeasurement: "Flow / pressure / temperature / lux / PF", postImplementationMeasurement: "Confirmed after commissioning" },
        { parameter: "Saving validation", baselineMeasurement: "Calculated from baseline", postImplementationMeasurement: "Verified from measured data" },
      ]} />

      <SectionHeader number={n(16)} title="Benefits Other Than Energy Saving" />
      <ReportTable columns={[{ key: "benefit", label: "Benefit" }, { key: "description", label: "Description" }]} rows={project.benefitsOtherThanEnergySaving || [
        { benefit: "Reduced operating cost", description: "Lower electricity / fuel bill" },
        { benefit: "Improved reliability", description: "Better control and reduced stress on equipment" },
        { benefit: "Better comfort", description: "Stable temperature / ventilation / lighting" },
        { benefit: "Lower maintenance", description: "Reduced wear and tear" },
        { benefit: "Better monitoring", description: "Availability of real-time performance data" },
        { benefit: "Sustainability", description: "Reduction in CO2 emissions" },
        { benefit: "Modernization", description: "Upgrade of old system with efficient technology" },
      ]} />

      <SectionHeader number={n(17)} title="Case Studies" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        The following reference case studies or similar implementation examples may be considered for understanding the practical relevance of this project.
      </p>
      <ReportTable compact columns={[
        { key: "title", label: "Case Study" },
        { key: "clientType", label: "Client Type" },
        { key: "system", label: "System" },
        { key: "implementedMeasure", label: "Implemented Measure" },
        { key: "result", label: "Result" },
        { key: "relevance", label: "Relevance" },
      ]} rows={project.caseStudies && project.caseStudies.length ? project.caseStudies : [
        {
          title: "Data required",
          clientType: "Data required",
          system: project.system || "Data required",
          implementedMeasure: project.proposedIntervention || "Data required",
          result: "Data required",
          relevance: "Data required",
        },
      ]} />

      <SectionHeader level={3} title="Case Studies" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.finalConclusion || project.projectConclusion || `This project is technically feasible and financially attractive for implementation. The proposed intervention will reduce annual energy consumption by approximately ${safeValue(project.expectedEnergySaving)}, resulting in annual cost saving of ${formatINR(project.expectedAnnualCostSaving)}/year. With an estimated investment of ${formatINR(project.estimatedInvestment)}, the simple payback period is expected to be ${safeValue(project.simplePaybackPeriod)}. Considering the energy saving, operational improvement and sustainability benefits, this project is recommended for implementation under ${safeValue(project.implementationPriority)}.`)}
      </p>
    </section>
  );
}

export const sampleCommercialBuildingEnergyAuditData: CommercialBuildingEnergyAuditData = {
  reportInfo: {
    reportTitle: "Detailed Energy Audit Report",
    clientName: "[Client / Building Name]",
    buildingType: "Office / IT Park / Hotel / Hospital / Commercial Building",
    location: "[City, State]",
    auditPeriod: "[Dates]",
    reportDate: "[Month Year]",
    preparedBy: "SEE-Tech Solutions",
    documentVersion: "Draft / Final",
  },
  executiveSummary: {
    totalAnnualElectricityConsumption: "[kWh/year]",
    annualElectricityCost: "₹[value]/year",
    averageTariff: "₹[value]/kWh",
    numberOfProjects: "[Nos.]",
    totalEnergySavingPotential: "[kWh/year]",
    totalAnnualCostSavingPotential: "₹[value]/year",
    totalEstimatedInvestment: "₹[value]",
    simplePaybackPeriod: "[months / years]",
    co2ReductionPotential: "[tCO2/year]",
  },
  projects: [
    {
      projectNo: "Project 1",
      projectTitle: "[Chiller / HVAC optimization]",
      system: "HVAC",
      implementationPriority: "High",
      expectedEnergySaving: "[kWh/year]",
      expectedAnnualCostSaving: "₹[value]/year",
      estimatedInvestment: "₹[value]",
      simplePaybackPeriod: "[months / years]",
      implementationDuration: "[weeks]",
      carbonFootprint: {
        annualEnergySaving: "[kWh/year]",
        emissionFactor: "Data required",
        estimatedCO2Reduction: "Data required",
        calculationBasis: "Annual Energy Saving x Grid Emission Factor",
        remarks: "Data required",
      },
      caseStudies: [
        {
          title: "Data required",
          clientType: "Data required",
          system: "HVAC",
          implementedMeasure: "Data required",
          result: "Data required",
          relevance: "Data required",
        },
      ],
      finalConclusion: "Data required",
    },
  ],
};

export default function CommercialBuildingEnergyAuditTemplate({
  data,
}: {
  data: CommercialBuildingEnergyAuditData;
}) {
  const groupedProjects = data.groupedProjects || [];
  let currentChapter = 3;

  return (
    <div className="commercial-building-energy-audit-report report-print-area">
      <style>{printCss}</style>

      <CoverPage data={data.reportInfo} />
      <div className="page-break" />

      <TableOfContents groupedProjects={groupedProjects} />
      <div className="page-break" />

      <ExecutiveSummaryPage data={data} />
      <div className="page-break" />

      <BuildingEnergyProfilePage data={data} />
      <div className="page-break" />

      {groupedProjects.length ? (
        groupedProjects.map((group, index) => {
          const chapterNumber = currentChapter + index;
          return (
            <React.Fragment key={group.groupNo}>
              <section className="report-page" style={pageStyle}>
                <SectionHeader level={1} title={`Chapter ${chapterNumber}: ${group.groupNo} ${safeValue(group.groupTitle)}`} />
                <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
                  This chapter covers {group.projects.length} energy conservation measures (ECMs) under the {safeValue(group.groupTitle)} category. 
                  The summary of these projects is provided below, followed by detailed descriptions of each individual project.
                </p>
                
                <SectionHeader level={2} title="Group Summary" />
                <ReportTable compact columns={[
                  { key: "projectNo", label: "ECM No." },
                  { key: "projectTitle", label: "ECM Name" },
                  { key: "investment", label: "Investment ₹" },
                  { key: "saving", label: "Annual Saving ₹/year" },
                  { key: "energy", label: "Energy Saving kWh/year" },
                  { key: "payback", label: "Payback" },
                ]} rows={group.projects.map((p) => ({
                  projectNo: p.projectNo,
                  projectTitle: p.projectTitle,
                  investment: formatINR(p.estimatedInvestment),
                  saving: formatINR(p.expectedAnnualCostSaving),
                  energy: safeValue(p.expectedEnergySaving),
                  payback: safeValue(p.simplePaybackPeriod),
                }))} />
              </section>
              <div className="page-break" />

              {group.projects.map((project, pIndex) => (
                <React.Fragment key={`${project.projectNo || pIndex}`}>
                  <ProjectChapterPage project={project} chapterNumber={chapterNumber} />
                  <div className="page-break" />
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        })
      ) : (
        <ProjectChapterPage chapterNumber={3} project={{ projectNo: "Project 1", projectTitle: "[Name of Energy Saving Project]" }} />
      )}
    </div>
  );
}
