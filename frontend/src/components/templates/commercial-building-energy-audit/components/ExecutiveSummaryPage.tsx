import React from "react";
import type { CommercialBuildingEnergyAuditData, ReportTableRow } from "../types";
import { formatINR, formatKWh, formatPayback, safeValue } from "../utils/formatting";
import {
  calculateTotalAnnualSavings,
  calculateTotalEnergySavings,
  calculateTotalInvestment,
  calculateWeightedPayback,
} from "../utils/calculations";
import MetricCard from "./MetricCard";
import ReportTable from "./ReportTable";
import SectionHeader from "./SectionHeader";

function renderList(value: unknown) {
  const items = Array.isArray(value) && value.length > 0 ? value : [value];
  return (
    <ul className="report-list">
      {items.map((item, index) => (
        <li key={index}>{safeValue(item as never)}</li>
      ))}
    </ul>
  );
}

export default function ExecutiveSummaryPage({ data }: { data: CommercialBuildingEnergyAuditData }) {
  const projectRows: ReportTableRow[] = data.projects.map((project) => ({
    projectNo: project.projectNo,
    projectTitle: project.projectTitle,
    system: project.system,
    energySaving: project.expectedEnergySaving,
    costSaving: project.expectedAnnualCostSaving,
    investment: project.estimatedInvestment,
    payback: project.simplePaybackPeriod,
    priority: project.implementationPriority,
  }));

  const categoryRows = data.projects.reduce<Record<string, ReportTableRow>>((acc, project) => {
    const system = safeValue(project.system);
    const existing = acc[system] || {
      system,
      projectCount: 0,
      totalSaving: 0,
      totalInvestment: 0,
    };
    const savings = Number(String(project.expectedAnnualCostSaving).replace(/[^\d.-]/g, "")) || 0;
    const investment = Number(String(project.estimatedInvestment).replace(/[^\d.-]/g, "")) || 0;
    acc[system] = {
      ...existing,
      projectCount: Number(existing.projectCount) + 1,
      totalSaving: Number(existing.totalSaving) + savings,
      totalInvestment: Number(existing.totalInvestment) + investment,
    };
    return acc;
  }, {});

  const calculatedInvestment = calculateTotalInvestment(data.projects);
  const calculatedAnnualSavings = calculateTotalAnnualSavings(data.projects);
  const calculatedEnergySavings = calculateTotalEnergySavings(data.projects);
  const calculatedPayback = calculateWeightedPayback(data.projects);

  return (
    <section className="report-page">
      <h1>Chapter 1: Executive Summary</h1>

      <SectionHeader number="1.1" title="Purpose of the Energy Audit" />
      <p>{safeValue(data.executiveSummary.purposeText)}</p>

      <SectionHeader number="1.2" title="Overall Energy Saving Potential" />
      <div className="metrics-grid">
        <MetricCard label="Annual Electricity Consumption" value={formatKWh(data.executiveSummary.totalAnnualElectricityConsumption)} />
        <MetricCard label="Annual Electricity Cost" value={formatINR(data.executiveSummary.annualElectricityCost)} unit="/year" />
        <MetricCard label="Average Tariff" value={data.executiveSummary.averageTariff} unit="₹/kWh" />
        <MetricCard label="Projects Identified" value={data.executiveSummary.numberOfProjects || data.projects.length} />
        <MetricCard label="Energy Saving Potential" value={data.executiveSummary.totalEnergySavingPotential || formatKWh(calculatedEnergySavings)} />
        <MetricCard label="Cost Saving Potential" value={data.executiveSummary.totalAnnualCostSavingPotential || formatINR(calculatedAnnualSavings)} unit="/year" />
        <MetricCard label="Estimated Investment" value={data.executiveSummary.totalEstimatedInvestment || formatINR(calculatedInvestment)} />
        <MetricCard label="Simple Payback" value={data.executiveSummary.simplePaybackPeriod || formatPayback(calculatedPayback)} />
        <MetricCard label="CO2 Reduction Potential" value={data.executiveSummary.co2ReductionPotential} unit="tCO2/year" />
      </div>

      <SectionHeader number="1.3" title="Summary of Identified Energy Saving Projects" />
      <ReportTable
        columns={[
          { key: "projectNo", header: "Project No." },
          { key: "projectTitle", header: "Project Title" },
          { key: "system", header: "System" },
          { key: "energySaving", header: "Energy Saving" },
          { key: "costSaving", header: "Cost Saving (₹/year)" },
          { key: "investment", header: "Investment (₹)" },
          { key: "payback", header: "Payback" },
          { key: "priority", header: "Priority" },
        ]}
        rows={projectRows}
      />

      <SectionHeader number="1.4" title="Project Grouping" />
      <ReportTable
        columns={[
          { key: "system", header: "Project Group / System" },
          { key: "projectCount", header: "No. of Projects", align: "center" },
        ]}
        rows={Object.values(categoryRows)}
      />

      <SectionHeader number="1.5" title="Category-Wise Financial Summary" />
      <ReportTable
        columns={[
          { key: "system", header: "Category" },
          { key: "totalSaving", header: "Annual Saving (₹/year)", align: "right" },
          { key: "totalInvestment", header: "Investment (₹)", align: "right" },
        ]}
        rows={Object.values(categoryRows)}
      />

      <SectionHeader number="1.6" title="Recommended Implementation Priority" />
      <ReportTable
        columns={[
          { key: "projectNo", header: "Project No." },
          { key: "projectTitle", header: "Project Title" },
          { key: "priority", header: "Priority" },
          { key: "payback", header: "Payback" },
        ]}
        rows={projectRows}
      />

      <SectionHeader number="1.7" title="Key Observations" />
      {renderList(data.executiveSummary.keyObservations)}

      <SectionHeader number="1.8" title="Conclusion and Way Forward" />
      <p>{safeValue(data.executiveSummary.conclusionAndWayForward)}</p>
    </section>
  );
}
