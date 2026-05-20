import React from "react";
import type {
  CommercialBuildingProject,
  FlexibleTableData,
  PrimitiveValue,
  ReportTableColumn,
  ReportTableRow,
} from "../types";
import { safeValue } from "../utils/formatting";
import ImageBlock from "./ImageBlock";
import ReportTable from "./ReportTable";
import SectionHeader from "./SectionHeader";

function renderList(value: PrimitiveValue[] | PrimitiveValue) {
  const items = Array.isArray(value) && value.length > 0 ? value : [value];
  return (
    <ul className="report-list">
      {items.map((item, index) => (
        <li key={index}>{safeValue(item)}</li>
      ))}
    </ul>
  );
}

function isObjectRecord(value: unknown): value is Record<string, PrimitiveValue> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function rowsFromFlexibleData(data: FlexibleTableData): ReportTableRow[] {
  if (Array.isArray(data)) return data as ReportTableRow[];
  if (isObjectRecord(data)) {
    return Object.entries(data).map(([parameter, value]) => ({
      parameter,
      value,
    }));
  }
  return [{ parameter: "Details", value: data }];
}

function columnsForFlexibleData(data: FlexibleTableData): ReportTableColumn[] {
  if (Array.isArray(data) && data.length > 0 && isObjectRecord(data[0])) {
    return Object.keys(data[0]).map((key) => ({
      key,
      header: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (char) => char.toUpperCase()),
    }));
  }
  return [
    { key: "parameter", header: "Parameter" },
    { key: "value", header: "Value" },
  ];
}

function FlexibleTable({ data, caption }: { data: FlexibleTableData; caption?: string }) {
  return (
    <ReportTable
      caption={caption}
      columns={columnsForFlexibleData(data)}
      rows={rowsFromFlexibleData(data)}
    />
  );
}

export default function ProjectChapterPage({
  project,
  chapterNumber,
}: {
  project: CommercialBuildingProject;
  chapterNumber: number;
}) {
  return (
    <section className="report-page project-page">
      <h1>Chapter {chapterNumber}: {safeValue(project.projectTitle)}</h1>

      <SectionHeader number={`${chapterNumber}.1`} title="Project Summary" />
      <ReportTable
        columns={[
          { key: "parameter", header: "Parameter" },
          { key: "value", header: "Details" },
        ]}
        rows={[
          { parameter: "Project No.", value: project.projectNo },
          { parameter: "Project Title", value: project.projectTitle },
          { parameter: "System", value: project.system },
          { parameter: "Location", value: project.location },
          { parameter: "Equipment Covered", value: project.equipmentCovered },
          { parameter: "Existing Operating Condition", value: project.existingOperatingCondition },
          { parameter: "Proposed Intervention", value: project.proposedIntervention },
          { parameter: "Expected Energy Saving", value: project.expectedEnergySaving },
          { parameter: "Expected Annual Cost Saving", value: project.expectedAnnualCostSaving },
          { parameter: "Estimated Investment", value: project.estimatedInvestment },
          { parameter: "Simple Payback Period", value: project.simplePaybackPeriod },
          { parameter: "Implementation Duration", value: project.implementationDuration },
          { parameter: "Implementation Priority", value: project.implementationPriority },
        ]}
      />

      <SectionHeader number={`${chapterNumber}.2`} title="Existing System Description" />
      <p>{safeValue(project.existingSystemDescription)}</p>

      <SectionHeader number={`${chapterNumber}.3`} title="Baseline Data and Measurements" />
      <FlexibleTable data={project.baselineData} caption="Baseline Data" />
      <FlexibleTable data={project.measurementData} caption="Measurement Data" />

      <SectionHeader number={`${chapterNumber}.4`} title="Problem / Gap Identified" />
      <p>{safeValue(project.problemGapIdentified)}</p>
      <FlexibleTable data={project.typicalGapTable} caption="Typical Gap Table" />

      <SectionHeader number={`${chapterNumber}.5`} title="Proposed Project" />
      <p>{safeValue(project.proposedProjectDescription)}</p>
      {renderList(project.scopeOfWork)}

      <SectionHeader number={`${chapterNumber}.6`} title="Key Activities for Implementation" />
      {renderList(project.keyActivities)}

      <SectionHeader number={`${chapterNumber}.7`} title="Rationale for Energy Saving" />
      <p>{safeValue(project.rationaleForEnergySaving)}</p>
      <FlexibleTable data={project.savingRationaleTable} caption="Saving Rationale" />

      <SectionHeader number={`${chapterNumber}.8`} title="Energy Saving Calculation" />
      <FlexibleTable data={project.energySavingCalculation} />

      <SectionHeader number={`${chapterNumber}.9`} title="Key Metrics" />
      <FlexibleTable data={project.keyMetrics} />

      <SectionHeader number={`${chapterNumber}.10`} title="Technical Specifications" />
      <FlexibleTable data={project.technicalSpecifications} />

      <SectionHeader number={`${chapterNumber}.11`} title="Schematic / Conceptual Framework" />
      <p>{safeValue(project.schematicFramework)}</p>
      <div className="image-grid">
        {(project.images?.length ? project.images : [undefined]).map((image, index) => (
          <ImageBlock key={index} image={image} />
        ))}
      </div>

      <SectionHeader number={`${chapterNumber}.12`} title="Implementation Duration" />
      <p>{safeValue(project.implementationDuration)}</p>
      <FlexibleTable data={project.implementationDurationTable} />

      <SectionHeader number={`${chapterNumber}.13`} title="Precautions / Aspects to be Taken Care Of" />
      {renderList(project.precautions)}

      <SectionHeader number={`${chapterNumber}.14`} title="Measurement and Verification Plan" />
      {renderList(project.measurementVerificationPlan)}

      <SectionHeader number={`${chapterNumber}.15`} title="Benefits Other Than Energy Saving" />
      {renderList(project.benefitsOtherThanEnergySaving)}

      <SectionHeader number={`${chapterNumber}.16`} title="Project Conclusion" />
      <p>{safeValue(project.projectConclusion)}</p>
    </section>
  );
}
