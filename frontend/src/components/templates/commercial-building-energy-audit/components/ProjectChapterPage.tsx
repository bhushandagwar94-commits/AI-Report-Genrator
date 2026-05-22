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
  const n = (section: number) => `${chapterNumber}.${section}`;

  return (
    <section className="report-page project-page">
      <h1>Chapter {chapterNumber}: {safeValue(project.projectTitle)}</h1>

      <SectionHeader number={n(1)} title="Project Summary" />
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

      <SectionHeader number={n(2)} title="Existing System Description" />
      <p>{safeValue(project.existingSystemDescription)}</p>

      <SectionHeader number={n(3)} title="Baseline Data and Measurements" />
      <FlexibleTable data={project.baselineData} caption="Baseline Data" />
      <FlexibleTable data={project.measurementData} caption="Measurement Data" />

      <SectionHeader number={n(4)} title="Problem / Gap Identified" />
      <p>{safeValue(project.problemGapIdentified)}</p>
      <FlexibleTable data={project.typicalGapTable} caption="Typical Gap Table" />

      <SectionHeader number={n(5)} title="Proposed Project" />
      <p>{safeValue(project.proposedProjectDescription)}</p>
      {renderList(project.scopeOfWork)}

      <SectionHeader number={n(6)} title="Key Activities for Implementation" />
      {renderList(project.keyActivities)}

      <SectionHeader number={n(7)} title="Rationale for Energy Saving" />
      <p>{safeValue(project.rationaleForEnergySaving)}</p>
      <FlexibleTable data={project.savingRationaleTable} caption="Saving Rationale" />

      <SectionHeader number={n(8)} title="Energy Saving Calculation" />
      <FlexibleTable data={project.energySavingCalculation} />

      <SectionHeader number={n(9)} title="Carbon Footprint" />
      <p>
        The proposed project will contribute to carbon footprint reduction by lowering annual electricity consumption. The CO2 reduction shall be calculated based on the annual energy saving and applicable grid emission factor.
      </p>
      <ReportTable
        columns={[
          { key: "parameter", header: "Parameter" },
          { key: "value", header: "Value" },
        ]}
        rows={[
          {
            parameter: "Annual energy saving",
            value: project.carbonFootprint?.annualEnergySaving || project.expectedEnergySaving,
          },
          {
            parameter: "Grid emission factor",
            value: project.carbonFootprint?.emissionFactor || "Data required",
          },
          {
            parameter: "Estimated CO2 reduction",
            value: project.carbonFootprint?.estimatedCO2Reduction || "Data required",
          },
          {
            parameter: "Calculation basis",
            value: project.carbonFootprint?.calculationBasis || "Annual Energy Saving x Grid Emission Factor",
          },
          {
            parameter: "Remarks",
            value: project.carbonFootprint?.remarks || "Data required",
          },
        ]}
      />

      <SectionHeader number={n(10)} title="Key Metrics" />
      <FlexibleTable data={project.keyMetrics} />

      <SectionHeader number={n(11)} title="Technical Specifications" />
      <FlexibleTable data={project.technicalSpecifications} />

      <SectionHeader number={n(12)} title="Schematic / Conceptual Framework" />
      <p>{safeValue(project.schematicFramework)}</p>
      <div className="image-grid">
        {(project.images?.length ? project.images : [undefined]).map((image, index) => (
          <ImageBlock key={index} image={image} />
        ))}
      </div>

      <SectionHeader number={n(13)} title="Implementation Duration" />
      <p>{safeValue(project.implementationDuration)}</p>
      <FlexibleTable data={project.implementationDurationTable} />

      <SectionHeader number={n(14)} title="Precautions / Aspects to be Taken Care Of" />
      {renderList(project.precautions)}

      <SectionHeader number={n(15)} title="Measurement and Verification Plan" />
      {renderList(project.measurementVerificationPlan)}

      <SectionHeader number={n(16)} title="Benefits Other Than Energy Saving" />
      {renderList(project.benefitsOtherThanEnergySaving)}

      <SectionHeader number={n(17)} title="Case Studies" />
      <p>
        {safeValue(
          "The following reference case studies or similar implementation examples may be considered for understanding the practical relevance of this project."
        )}
      </p>
      <ReportTable
        columns={[
          { key: "title", header: "Case Study" },
          { key: "clientType", header: "Client Type" },
          { key: "system", header: "System" },
          { key: "implementedMeasure", header: "Implemented Measure" },
          { key: "result", header: "Result" },
          { key: "relevance", header: "Relevance" },
        ]}
        rows={
          Array.isArray(project.caseStudies) && project.caseStudies.length > 0
            ? project.caseStudies.map((item) => ({
                title: item?.title,
                clientType: item?.clientType,
                system: item?.system,
                implementedMeasure: item?.implementedMeasure,
                result: item?.result,
                relevance: item?.relevance,
              }))
            : [
                {
                  title: "Data required",
                  clientType: "Data required",
                  system: project.system || "Data required",
                  implementedMeasure: project.proposedIntervention || "Data required",
                  result: "Data required",
                  relevance: "Data required",
                },
              ]
        }
      />

      <SectionHeader number={n(18)} title="Conclusion" />
      <p>
        {safeValue(
          project.finalConclusion ||
            project.projectConclusion ||
            `This project is technically feasible and financially attractive for implementation. The proposed intervention will reduce annual energy consumption by approximately ${safeValue(
              project.expectedEnergySaving
            )}, resulting in annual cost saving of ${safeValue(project.expectedAnnualCostSaving)}/year. With an estimated investment of ${safeValue(
              project.estimatedInvestment
            )}, the simple payback period is expected to be ${safeValue(
              project.simplePaybackPeriod
            )}. Considering the energy saving, operational improvement and sustainability benefits, this project is recommended for implementation under ${safeValue(
              project.implementationPriority
            )}.`
        )}
      </p>
    </section>
  );
}
