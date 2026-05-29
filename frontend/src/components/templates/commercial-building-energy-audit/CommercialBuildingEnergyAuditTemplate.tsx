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

  // 16 Detailed Consultant-Grade Sections
  existingCondition?: ReportValue;
  systemDescription?: ReportValue;
  engineeringAssessment?: ReportValue;
  rootCauseAnalysis?: ReportValue;
  recommendedMeasure?: ReportValue;
  technicalMethodology?: ReportValue;
  detailedKeyActivities?: Record<string, ReportValue>[];
  rationaleForSavings?: ReportValue;
  energyImpact?: Record<string, ReportValue>[];
  financialImpact?: Record<string, ReportValue>[];
  risksAndMitigation?: Record<string, ReportValue>[];
  implementationConsiderations?: ReportValue;
  monitoringAndVerificationPlan?: Record<string, ReportValue>[];
  oAndMRequirements?: ReportValue;
  implementationTimeline?: Record<string, ReportValue>[];
  conclusion?: ReportValue;
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
  fieldFlags?: Record<string, {
    flag: 0 | 1;
    source: string;
    valueType?: string;
    label?: string;
    sourceColumn?: string | null;
    message?: string;
  }>;
  missingFieldSummary?: {
    path: string;
    label: string;
    sourceExpected: string;
    message: string;
  }[];
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

function asArray<T = any>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === "object") return [value as T];
  if (typeof value === "string" && value.trim()) return [value as T];
  return [];
}

function safeText(value: any): string {
  if (value === null || value === undefined || value === "") return "Data required";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (value.value !== undefined) return safeText(value.value);
    if (value.text !== undefined) return safeText(value.text);
    if (value.label !== undefined) return safeText(value.label);
    if (value.amount !== undefined && value.unit !== undefined) return `${value.amount} ${value.unit}`;
    return "Data required";
  }
  return "Data required";
}

function safeValue(value: any): string {
  return safeText(value);
}

function renderCellContent(value: any) {
  if (React.isValidElement(value)) return value;
  return safeValue(value);
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
  return asArray(projects).reduce((sum, p) => sum + numberFrom(p.estimatedInvestment), 0);
}

function totalSavings(projects: CommercialBuildingProject[] = []) {
  return asArray(projects).reduce((sum, p) => sum + numberFrom(p.expectedAnnualCostSaving), 0);
}

function totalEnergy(projects: CommercialBuildingProject[] = []) {
  return asArray(projects).reduce((sum, p) => sum + numberFrom(p.expectedEnergySaving), 0);
}

function weightedPayback(projects: CommercialBuildingProject[] = []) {
  const inv = totalInvestment(projects);
  const sav = totalSavings(projects);
  return inv && sav ? (inv / sav).toFixed(2) : "Data required";
}

function displayText(value: any): string {
  const text = safeText(value).trim();
  return /^data required$/i.test(text) ? "" : text;
}

function removeDuplicateGroupNo(title: ReportValue, groupNo: string) {
  const rawTitle = displayText(title);
  if (!rawTitle) return "";
  const escapedGroupNo = groupNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return rawTitle.replace(new RegExp(`^${escapedGroupNo}[\\s:.-]*`, "i"), "").trim();
}

const showFieldFlags =
  // @ts-ignore
  (import.meta as any).env?.DEV &&
  // @ts-ignore
  (import.meta as any).env?.VITE_SHOW_FIELD_FLAGS === "true";

function getFieldFlag(data: CommercialBuildingEnergyAuditData, path: string) {
  return data?.fieldFlags?.[path] || null;
}

function FieldFlagBadge({ flag }: { flag?: number | null }) {
  if (!showFieldFlags || (flag !== 0 && flag !== 1)) return null;
  return (
    <span className={`field-flag-badge flag-${flag}`} aria-hidden="true">
      {flag}
    </span>
  );
}

function LabelWithFlag({
  data,
  path,
  label,
}: {
  data: CommercialBuildingEnergyAuditData;
  path: string;
  label: string;
}) {
  const meta = getFieldFlag(data, path);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {label}
      <FieldFlagBadge flag={meta?.flag} />
    </span>
  );
}

function formatGroupHeading(group: CommercialBuildingProjectGroup, index: number) {
  const subChapter = `3.${index + 1}`;
  const groupNo = displayText(group.groupNo) || `GR-${index + 1}`;
  const cleanTitle = removeDuplicateGroupNo(group.groupTitle, groupNo);
  return cleanTitle ? `${subChapter} ${groupNo} ${cleanTitle}` : `${subChapter} ${groupNo}`;
}

function formatEcmTitle(project: CommercialBuildingProject) {
  const projectTitle = displayText(project.projectTitle);
  if (!projectTitle) return "";
  const projectNo = displayText(project.projectNo);
  return projectNo ? `ECM ${projectNo} – ${projectTitle}` : projectTitle;
}

function formatEcmNumber(project: CommercialBuildingProject) {
  const projectNo = displayText(project.projectNo);
  return projectNo ? `ECM ${projectNo}` : "";
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
  const safeRows = asArray(rows);
  if (!safeRows.length) return [{}];
  return safeRows.map((row) => (row && typeof row === "object" ? row : { value: safeText(row) }));
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
                  {renderCellContent(row?.[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoverPage({ data, reportData }: { data: ReportInfo; reportData: CommercialBuildingEnergyAuditData }) {
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
            [<LabelWithFlag key="prepared-for" data={reportData} path="reportInfo.clientName" label="Prepared For" />, data.clientName],
            ["Building Type", data.buildingType],
            [<LabelWithFlag key="location" data={reportData} path="reportInfo.location" label="Location" />, data.location],
            [<LabelWithFlag key="audit-period" data={reportData} path="reportInfo.auditPeriod" label="Audit Period" />, data.auditPeriod],
            [<LabelWithFlag key="report-date" data={reportData} path="reportInfo.reportDate" label="Report Date" />, data.reportDate],
            [<LabelWithFlag key="prepared-by" data={reportData} path="reportInfo.preparedBy" label="Prepared By" />, data.preparedBy || "SEE-Tech Solutions"],
            ["Document Version", data.documentVersion],
          ].map(([label, value], i) => (
            <div key={`cover-row-${i}`} style={{ display: "grid", gridTemplateColumns: "180px 1fr", background: i % 2 === 0 ? colors.blueLight : colors.white, borderBottom: i === 6 ? "none" : `1px solid ${colors.border}` }}>
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

function TOCItem({ title, indent = 0 }: { title: string; indent?: number }) {
  return (
    <div
      style={{
        marginLeft: indent * 24,
        fontSize: indent === 0 ? 15 : indent === 1 ? 14 : 13,
        fontWeight: indent === 0 ? 700 : indent === 1 ? 600 : 400,
        lineHeight: 1.8,
        marginBottom: 4,
      }}
    >
      {title}
    </div>
  );
}

function TableOfContents({ groupedProjects = [] }: { groupedProjects?: CommercialBuildingProjectGroup[] }) {
  const safeGroupedProjects = asArray(groupedProjects);

  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Table of Contents" />
      <div style={{ color: colors.text, marginTop: 28 }}>
        <TOCItem title="Chapter 1. Executive Summary" />
        <TOCItem title="Chapter 2. Plant / Building Details and Energy Profile" />
        <TOCItem title="Chapter 3. Energy Saving Projects" />
        {safeGroupedProjects.map((group, groupIndex) => (
          <div key={`${displayText(group.groupNo) || groupIndex}`}>
            <TOCItem indent={1} title={formatGroupHeading(group, groupIndex)} />
            {asArray(group.projects)
              .map((project) => formatEcmTitle(project))
              .filter(Boolean)
              .map((title, projectIndex) => (
                <TOCItem key={`${title}-${projectIndex}`} indent={2} title={title} />
              ))}
          </div>
        ))}
        <TOCItem title="Chapter 4. Annexures" />
      </div>
    </section>
  );
}
function ExecutiveSummaryPage({ data }: { data: CommercialBuildingEnergyAuditData }) {
  const projects = asArray(data.projects);
  const groupedProjects = asArray(data.groupedProjects);
  const es = data.executiveSummary || {};
  const inv = es.totalEstimatedInvestment || totalInvestment(projects);
  const sav = es.totalAnnualCostSavingPotential || totalSavings(projects);
  const energy = es.totalEnergySavingPotential || totalEnergy(projects);

  const categorySummaryRows = (groupedProjects.length ? groupedProjects : [{
    groupNo: "GR-1",
    groupTitle: "Energy Saving Projects",
    projects,
    totalInvestment: inv,
    totalAnnualSaving: sav,
    totalEnergySaving: energy,
    weightedPayback: String(es.simplePaybackPeriod || weightedPayback(projects)),
  } as CommercialBuildingProjectGroup]).map((group, index) => ({
    category: formatGroupHeading(group, index).replace(/^3\.\d+\s*/, ""),
    count: asArray(group.projects).length,
    investment: formatINR(group.totalInvestment || totalInvestment(asArray(group.projects))),
    saving: formatINR(group.totalAnnualSaving || totalSavings(asArray(group.projects))),
    energy: safeValue(group.totalEnergySaving || totalEnergy(asArray(group.projects))),
    payback: safeValue(group.weightedPayback || weightedPayback(asArray(group.projects))),
  }));

  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Chapter 1: Executive Summary" />

      <SectionHeader number="1.1" title="Purpose of the Energy Audit" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(es.purposeText || `The purpose of this energy audit is to identify technically feasible, financially attractive and practically implementable energy-saving projects for ${safeValue(data.reportInfo.clientName)}. The audit has been carried out with the objective of converting energy-saving opportunities into actual implementation projects that reduce electricity cost, operating cost and carbon emissions.`)}
      </p>
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {"SEE-Tech approach: Energy Assessment -> Opportunity Identification -> Project Proposal -> Implementation -> Savings Delivery."}
      </p>

      <SectionHeader number="1.2" title="Overall Energy Saving Potential" />
      <ReportTable columns={[{ key: "particular", label: "Particular" }, { key: "value", label: "Value" }]} rows={[
        { particular: "Total annual electricity consumption", value: es.totalAnnualElectricityConsumption },
        { particular: "Annual electricity cost", value: formatINR(es.annualElectricityCost) },
        { particular: "Average electricity tariff considered", value: es.averageTariff },
        { particular: "Number of projects identified", value: es.numberOfProjects || projects.length },
        { particular: <LabelWithFlag data={data} path="executiveSummary.totalEnergySavingPotential" label="Total energy saving potential" />, value: energy },
        { particular: <LabelWithFlag data={data} path="executiveSummary.totalAnnualCostSavingPotential" label="Total annual cost saving potential" />, value: formatINR(sav) },
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
        { key: "investment", label: "Investment INR" },
        { key: "saving", label: "Annual Saving INR/year" },
        { key: "energy", label: "Energy Saving kWh/year" },
        { key: "payback", label: "Payback" },
        { key: "priority", label: "Priority" },
      ]} rows={projects.map((project, index) => ({
        projectNo: formatEcmNumber(project) || `ECM ${index + 1}`,
        project: displayText(project.projectTitle) || safeValue(project.projectTitle),
        system: project.system,
        investment: formatINR(project.estimatedInvestment),
        saving: formatINR(project.expectedAnnualCostSaving),
        energy: project.expectedEnergySaving,
        payback: project.simplePaybackPeriod,
        priority: project.implementationPriority,
      }))} />

      <SectionHeader number="1.4" title="Category-wise Summary" />
      <ReportTable compact columns={[
        { key: "category", label: "Category" },
        { key: "count", label: "No. of Projects" },
        { key: "investment", label: "Investment INR" },
        { key: "saving", label: "Annual Saving INR/year" },
        { key: "energy", label: "Energy Saving kWh/year" },
        { key: "payback", label: "Payback" },
      ]} rows={categorySummaryRows} />

      <SectionHeader number="1.5" title="Key Observations" />
      <ul style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {(asArray(es.keyObservations).length ? asArray(es.keyObservations) : [
          "Cooling, pumping, and compressed air opportunities generally contribute the largest energy-saving potential.",
          "Projects with simple controls, flow optimization, and high-efficiency retrofits are suitable early candidates for implementation.",
          "Reliable measurement, verification, and operator follow-through are important for sustaining savings after implementation.",
        ]).map((item, index) => <li key={index}>{safeValue(item)}</li>)}
      </ul>

      <SectionHeader number="1.6" title="Conclusion and Way Forward" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        Based on the audit findings, SEE-Tech recommends that {safeValue(data.reportInfo.clientName)} should proceed with detailed implementation planning for the identified energy-saving projects.
      </p>
      <ReportTable columns={[{ key: "step", label: "Step" }, { key: "action", label: "Action" }]} rows={asArray(es.conclusionAndWayForward).length ? asArray(es.conclusionAndWayForward) : [
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
        { particular: <LabelWithFlag data={data} path="reportInfo.facilityName" label="Name of facility" />, details: bp.facilityName || data.reportInfo.clientName },
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

      <SectionHeader number="2.2" title="Utility and Energy Sources" />
      <ReportTable columns={[
        { key: "areaFunction", label: "Area / Function" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "remarks", label: "Remarks" },
      ]} rows={data.buildingOperationDetails || [
        { areaFunction: "Office area" },
        { areaFunction: "Common area" },
        { areaFunction: "Basement / parking" },
      ]} />
      <ReportTable columns={[
        { key: "energySource", label: "Energy Source" },
        { key: "use", label: "Use" },
        { key: "annualConsumption", label: "Annual Consumption" },
        { key: "annualCost", label: "Annual Cost INR" },
      ]} rows={data.utilityAndEnergySources || [
        { energySource: "Grid electricity", use: "HVAC, lighting, pumps, plug loads" },
        { energySource: "Diesel", use: "DG backup" },
        { energySource: "PNG / LPG", use: "Kitchen, boiler, hot water" },
        { energySource: "Solar PV", use: "Captive generation" },
      ]} />
      <ReportTable columns={[{ key: "particular", label: "Particular" }, { key: "details", label: "Details" }]} rows={[
        { particular: "Supply voltage", details: esd.supplyVoltage },
        { particular: "Tariff category", details: esd.tariffCategory },
        { particular: "Contract demand / sanctioned load", details: esd.contractDemand },
        { particular: "Connected load", details: esd.connectedLoad },
        { particular: "Transformer capacity", details: esd.transformerCapacity },
        { particular: "Average power factor", details: esd.averagePowerFactor },
        { particular: "Billing type", details: esd.billingType || "kWh / kVAh / TOD" },
        { particular: "Average electricity tariff", details: esd.averageElectricityTariff || "INR/kWh" },
      ]} />

      <SectionHeader number="2.3" title="Major Energy Consuming Systems" />
      <ReportTable columns={[
        { key: "system", label: "System" },
        { key: "majorEquipment", label: "Major Equipment" },
        { key: "estimatedShare", label: "Estimated Share of Energy Consumption" },
        { key: "remarks", label: "Remarks" },
      ]} rows={data.majorEnergyConsumingSystems || [
        { system: "Cooling system", majorEquipment: "Chiller / pumps / cooling tower" },
        { system: "Production machines", majorEquipment: "Dryers, heaters, servo systems" },
        { system: "Compressed air", majorEquipment: "Air compressors and boosters" },
        { system: "Auxiliary systems", majorEquipment: "Fans, blowers, grinders, APFC" },
      ]} />
      <ReportTable compact columns={[
        { key: "equipment", label: "Equipment" },
        { key: "capacity", label: "Capacity" },
        { key: "quantity", label: "Quantity" },
        { key: "connectedLoad", label: "Connected Load" },
        { key: "controlSystem", label: "Control System" },
        { key: "remarks", label: "Remarks" },
      ]} rows={data.hvacSystemDetails || [{ equipment: "Chiller / VRF outdoor unit" }, { equipment: "AHU" }, { equipment: "Cooling tower" }]} />
      <ReportTable compact columns={[
        { key: "area", label: "Area" },
        { key: "existingFixture", label: "Existing Fixture" },
        { key: "wattage", label: "Wattage" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "controlType", label: "Control Type" },
      ]} rows={data.lightingSystemDetails || [{ area: "Office area" }, { area: "Production area" }, { area: "Outdoor" }]} />
      <ReportTable compact columns={[
        { key: "pumpOrMotor", label: "Pump / Motor" },
        { key: "application", label: "Application" },
        { key: "ratingKw", label: "Rating kW" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "controlMethod", label: "Control Method" },
        { key: "remarks", label: "Remarks" },
      ]} rows={data.pumpsAndMotors || [{ pumpOrMotor: "Process pump" }, { pumpOrMotor: "Secondary pump" }, { pumpOrMotor: "Booster compressor motor" }]} />
      <ReportTable compact columns={[
        { key: "system", label: "System" },
        { key: "controlPresent", label: "Control Present" },
        { key: "energyImpact", label: "Energy Impact" },
      ]} rows={data.buildingAutomationControls || [{ system: "Process automation" }, { system: "Compressed air management" }, { system: "Auxiliary fan controls" }]} />

      <SectionHeader number="2.4" title="Audit Observations" />
      <ReportTable columns={[{ key: "parameter", label: "Parameter" }, { key: "value", label: "Value" }]} rows={[
        { parameter: "Annual electricity consumption", value: benchmark.annualElectricityConsumption },
        { parameter: "Specific energy consumption", value: benchmark.specificEnergyConsumption },
        { parameter: "Reference / target benchmark", value: benchmark.referenceBenchmark },
        { parameter: "Improvement potential", value: benchmark.improvementPotential },
      ]} />
      <ReportTable columns={[
        { key: "observation", label: "Observation" },
        { key: "impact", label: "Impact" },
        { key: "recommendation", label: "Recommendation" },
      ]} rows={data.auditObservations || [
        { observation: "Optimization opportunities exist in cooling, production, compressed air, and auxiliary systems.", impact: "Higher than necessary energy consumption", recommendation: "Implement ECMs in a phased manner." },
        { observation: "Control improvements can reduce part-load losses.", impact: "Avoidable operating cost", recommendation: "Adopt automatic controls and monitoring." },
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

function ProjectChapterPage({ project }: { project: CommercialBuildingProject }) {
  const ecmTitle = formatEcmTitle(project) || safeValue(project.projectTitle || "ECM");

  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={2} title={ecmTitle} />

      <SectionHeader level={3} title="1. Existing Condition" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.existingCondition || project.existingSystemDescription || "Data required for Existing Condition.")}
      </p>

      <SectionHeader level={3} title="2. System Description" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.systemDescription || "Data required for System Description.")}
      </p>

      <SectionHeader level={3} title="3. Engineering Assessment" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.engineeringAssessment || project.problemGapIdentified || "Data required for Engineering Assessment.")}
      </p>

      <SectionHeader level={3} title="4. Root Cause Analysis" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.rootCauseAnalysis || "Data required for Root Cause Analysis.")}
      </p>

      <SectionHeader level={3} title="5. Recommended Measure" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.recommendedMeasure || project.proposedProjectDescription || "Data required for Recommended Measure.")}
      </p>

      <SectionHeader level={3} title="6. Technical Methodology" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.technicalMethodology || "Data required for Technical Methodology.")}
      </p>

      <SectionHeader level={3} title="7. Detailed Key Activities" />
      <ReportTable columns={[{ key: "activity", label: "Activity" }, { key: "description", label: "Description" }, { key: "responsibility", label: "Responsibility" }]} rows={project.detailedKeyActivities || project.keyActivities || [
        { activity: "Site Verification", description: "Confirm constraints", responsibility: "Client / Consultant" },
        { activity: "Engineering", description: "Design finalization", responsibility: "Contractor" },
        { activity: "Execution", description: "Installation & testing", responsibility: "Contractor" }
      ]} />

      <SectionHeader level={3} title="8. Rationale for Savings" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.rationaleForSavings || project.rationaleForEnergySaving || "Data required for Rationale for Savings.")}
      </p>

      <SectionHeader level={3} title="9. Energy Impact" />
      <ReportTable columns={[{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }]} rows={project.energyImpact || project.energySavingCalculation || [
        { parameter: "Annual energy saving", unit: "kWh/year", value: project.expectedEnergySaving },
      ]} />

      <SectionHeader level={3} title="10. Financial Impact" />
      <ReportTable columns={[{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }]} rows={project.financialImpact || [
        { parameter: "Expected annual cost saving", unit: "INR/year", value: project.expectedAnnualCostSaving },
        { parameter: "Estimated investment", unit: "INR", value: project.estimatedInvestment },
        { parameter: "Simple payback", unit: "years", value: project.simplePaybackPeriod },
      ]} />

      <SectionHeader level={3} title="11. Risks & Mitigation" />
      <ReportTable columns={[{ key: "risk", label: "Risk" }, { key: "mitigation", label: "Mitigation Strategy" }]} rows={project.risksAndMitigation || [
        { risk: "Operational downtime", mitigation: "Plan execution during scheduled shutdowns." },
        { risk: "Performance shortfall", mitigation: "Establish strict M&V guidelines post-commissioning." }
      ]} />

      <SectionHeader level={3} title="12. Implementation Considerations" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.implementationConsiderations || "Data required for Implementation Considerations.")}
      </p>

      <SectionHeader level={3} title="13. Monitoring & Verification Plan" />
      <ReportTable columns={[{ key: "parameter", label: "Parameter" }, { key: "baseline", label: "Baseline" }, { key: "postImplementation", label: "Post-Implementation" }]} rows={project.monitoringAndVerificationPlan || project.measurementVerificationPlan || [
        { parameter: "Energy consumption", baseline: "Historical data", postImplementation: "Continuous monitoring" },
      ]} />

      <SectionHeader level={3} title="14. O&M Requirements" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.oAndMRequirements || "Data required for O&M Requirements.")}
      </p>

      <SectionHeader level={3} title="15. Implementation Timeline" />
      <ReportTable columns={[{ key: "phase", label: "Phase" }, { key: "duration", label: "Duration" }]} rows={project.implementationTimeline || project.implementationDurationTable || [
        { phase: "Engineering and Procurement", duration: "TBD" },
        { phase: "Installation and Commissioning", duration: "TBD" },
      ]} />

      <SectionHeader level={3} title="16. Conclusion" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        {safeValue(project.conclusion || project.finalConclusion || project.projectConclusion || "Data required for Conclusion.")}
      </p>
    </section>
  );
}

function EnergySavingProjectsIntroPage() {
  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Chapter 3: Energy Saving Projects" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
        This chapter presents the identified energy conservation measures grouped by system and application area. Each group includes a summary table followed by detailed ECM descriptions.
      </p>
    </section>
  );
}

function AnnexuresPage() {
  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Chapter 4: Annexures" />

      <SectionHeader number="4.1" title="Uploaded Data Sources" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>Uploaded spreadsheets, measurements, and supporting documents used for this report are referenced here.</p>

      <SectionHeader number="4.2" title="Assumptions" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>Savings, investment, and implementation assumptions are based on the data made available during the audit and SEE-Tech engineering judgment where direct readings were not available.</p>

      <SectionHeader number="4.3" title="Image / Figure References" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>Photographs, schematics, and reference figures included in the report are listed in this section.</p>

      <SectionHeader number="4.4" title="Calculation Notes" />
      <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>Calculation notes, formulas, and validation references supporting the ECM analysis are documented here.</p>
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
  const groupedProjects = asArray(data.groupedProjects);
  const projectGroups = groupedProjects.length
    ? groupedProjects
    : [
        {
          groupNo: "GR-1",
          groupTitle: "Energy Saving Projects",
          projects: asArray(data.projects),
          totalInvestment: totalInvestment(asArray(data.projects)),
          totalAnnualSaving: totalSavings(asArray(data.projects)),
          totalEnergySaving: totalEnergy(asArray(data.projects)),
          weightedPayback: weightedPayback(asArray(data.projects)),
        },
      ];

  return (
    <div className="commercial-building-energy-audit-report report-print-area">
      <style>{printCss}</style>

      <CoverPage data={data.reportInfo} reportData={data} />
      <div className="page-break" />

      <TableOfContents groupedProjects={projectGroups} />
      <div className="page-break" />

      <ExecutiveSummaryPage data={data} />
      <div className="page-break" />

      <BuildingEnergyProfilePage data={data} />
      <div className="page-break" />

      <EnergySavingProjectsIntroPage />
      <div className="page-break" />

      {projectGroups.map((group, index) => (
        <React.Fragment key={`${displayText(group.groupNo) || index}`}>
          <section className="report-page" style={pageStyle}>
            <SectionHeader level={2} title={formatGroupHeading(group, index)} />
            <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
              {safeValue(
                (group as any).summaryParagraph ||
                `This section covers ${asArray(group.projects).length} energy conservation measures under the ${displayText(group.groupTitle) || displayText(group.groupNo) || "selected"} category.`
              )}
            </p>
            <SectionHeader level={3} title="Group Observation" />
            <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
              {safeValue(
                (group as any).technicalObservation ||
                "The measures in this group are intended to improve system control discipline, reduce avoidable losses, and support a more structured implementation roadmap."
              )}
            </p>
            <SectionHeader level={3} title="Implementation Focus" />
            <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>
              {safeValue(
                (group as any).implementationStrategy ||
                "Implementation should combine site verification, detailed engineering, coordinated execution, and post-commissioning performance review."
              )}
            </p>
            <SectionHeader level={3} title="Group Summary Table" />
            <ReportTable compact columns={[
              { key: "projectNo", label: "ECM No." },
              { key: "projectTitle", label: "ECM Name" },
              { key: "investment", label: "Investment INR" },
              { key: "saving", label: "Annual Saving INR/year" },
              { key: "energy", label: "Energy Saving kWh/year" },
              { key: "payback", label: "Payback" },
            ]} rows={asArray(group.projects).map((project) => ({
              projectNo: formatEcmNumber(project),
              projectTitle: displayText(project.projectTitle) || safeValue(project.projectTitle),
              investment: formatINR(project.estimatedInvestment),
              saving: formatINR(project.expectedAnnualCostSaving),
              energy: safeValue(project.expectedEnergySaving),
              payback: safeValue(project.simplePaybackPeriod),
            }))} />
          </section>
          <div className="page-break" />

          {asArray(group.projects).map((project, projectIndex) => (
            <React.Fragment key={`${displayText(project.projectNo) || projectIndex}-${displayText(project.projectTitle) || "project"}`}>
              <ProjectChapterPage project={project} />
              <div className="page-break" />
            </React.Fragment>
          ))}
        </React.Fragment>
      ))}

      <AnnexuresPage />
    </div>
  );
}
