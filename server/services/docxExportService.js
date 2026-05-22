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
  BorderStyle,
  WidthType,
  PageBreak
} = require("docx");

/**
 * Ensures text is a string and not [object Object], undefined, or null.
 */
function safeText(value) {
  if (value === null || value === undefined) return "Data required";
  if (typeof value === "number" && Number.isNaN(value)) return "Data required";
  if (typeof value === "object") {
    const valStr = String(value.result || value.text || value);
    if (valStr === "[object Object]") return "Data required";
    return valStr.trim() || "Data required";
  }
  const str = String(value).trim();
  return str.length ? str : "Data required";
}

function formatINR(value) {
  if (value === null || value === undefined || value === "") return "Data required";
  const num = Number(String(value).replace(/[₹,\s]/g, ""));
  if (!Number.isNaN(num)) return `₹${Math.round(num).toLocaleString("en-IN")}`;
  const str = String(value);
  return str.includes("₹") ? str : `₹${str}`;
}

// ─── Document Helpers ────────────────────────────────────────────────────────

function heading1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
  });
}

function heading2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
  });
}

function heading3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
  });
}

function paragraph(text) {
  return new Paragraph({
    children: [new TextRun(safeText(text))],
    spacing: { after: 150 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function createTable(columns, rowsData) {
  const headerCells = columns.map(col => 
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: col.label, bold: true, color: "FFFFFF" })] })],
      shading: { fill: "09425D" },
      margins: { top: 100, bottom: 100, left: 100, right: 100 },
    })
  );

  const dataRows = (rowsData && rowsData.length ? rowsData : [{}]).map((row, idx) => {
    const isEven = idx % 2 === 0;
    const cells = columns.map(col => 
      new TableCell({
        children: [new Paragraph({ text: safeText(row[col.key]) })],
        shading: { fill: isEven ? "EAF3F7" : "FFFFFF" },
        margins: { top: 100, bottom: 100, left: 100, right: 100 },
      })
    );
    return new TableRow({ children: cells });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: headerCells }), ...dataRows],
  });
}

function keyValueTable(rowsData) {
  const dataRows = (rowsData && rowsData.length ? rowsData : [{}]).map((row, idx) => {
    const keys = Object.keys(row);
    const labelKey = keys[0];
    const valueKey = keys[1];
    const isEven = idx % 2 === 0;

    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: safeText(row[labelKey]), bold: true, color: "09425D" })] })],
          shading: { fill: isEven ? "EAF3F7" : "FFFFFF" },
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          width: { size: 30, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [new Paragraph({ text: safeText(row[valueKey]) })],
          shading: { fill: isEven ? "EAF3F7" : "FFFFFF" },
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          width: { size: 70, type: WidthType.PERCENTAGE },
        })
      ]
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: dataRows,
  });
}

// ─── Generators ──────────────────────────────────────────────────────────────

function generateCoverPage(info) {
  return [
    new Paragraph({
      children: [new TextRun({ text: "SEE-Tech Solutions", bold: true, size: 36, color: "09425D" })],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [new TextRun({ text: "Commercial Building Energy Audit Report Format", size: 24, color: "5F6B76" })],
      spacing: { after: 1500 }
    }),
    new Paragraph({
      children: [new TextRun({ text: safeText(info.reportTitle || "Detailed Energy Audit Report"), bold: true, size: 72, color: "09425D" })],
      spacing: { after: 500 }
    }),
    new Paragraph({
      children: [new TextRun({ text: "Commercial Buildings: Office | IT Park | Hotel | Hospital | Mall | Others", size: 32, color: "5F6B76" })],
      spacing: { after: 200 }
    }),
    new Paragraph({
      children: [new TextRun({ text: "Purpose: To identify implementable energy-saving projects with clear investment, savings, payback and execution roadmap.", size: 30, color: "18344A" })],
      spacing: { after: 1000 }
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
    new Paragraph({
      children: [new TextRun({ text: "Prepared by SEE-Tech Solutions", size: 24, color: "5F6B76" })],
      spacing: { before: 2000 }
    }),
    pageBreak(),
  ];
}

function generateExecutiveSummary(es, projects, clientName) {
  return [
    heading1("Chapter 1: Executive Summary"),
    
    heading2("1.1 Purpose of the Energy Audit"),
    paragraph(es.purposeText || `The purpose of this energy audit is to identify technically feasible, financially attractive and practically implementable energy-saving projects for ${safeText(clientName)}. The audit has been carried out with the objective of converting energy-saving opportunities into actual implementation projects that reduce electricity cost, operating cost and carbon emissions.`),
    paragraph("SEE-Tech approach: Energy Assessment → Opportunity Identification → Project Proposal → Implementation → Savings Delivery."),
    
    heading2("1.2 Overall Energy Saving Potential"),
    createTable(
      [{ key: "particular", label: "Particular" }, { key: "value", label: "Value" }],
      [
        { particular: "Total annual electricity consumption", value: es.totalAnnualElectricityConsumption },
        { particular: "Annual electricity cost", value: formatINR(es.annualElectricityCost) },
        { particular: "Average electricity tariff considered", value: es.averageTariff },
        { particular: "Number of projects identified", value: es.numberOfProjects || projects.length },
        { particular: "Total energy saving potential", value: es.totalEnergySavingPotential },
        { particular: "Total annual cost saving potential", value: formatINR(es.totalAnnualCostSavingPotential) },
        { particular: "Total estimated investment", value: formatINR(es.totalEstimatedInvestment) },
        { particular: "Simple payback period", value: es.simplePaybackPeriod },
        { particular: "CO2 reduction potential", value: es.co2ReductionPotential },
      ]
    ),

    heading2("1.3 Summary of Identified Energy Saving Projects"),
    paragraph("The following table is the key management decision table. It summarizes the projects recommended for implementation."),
    createTable(
      [
        { key: "projectNo", label: "Project No." },
        { key: "project", label: "Energy Saving Project" },
        { key: "system", label: "System" },
        { key: "investment", label: "Investment ₹" },
        { key: "saving", label: "Annual Saving ₹/year" },
        { key: "energy", label: "Energy Saving kWh/year" },
        { key: "payback", label: "Payback" },
        { key: "priority", label: "Priority" },
      ],
      projects.map((p, i) => ({
        projectNo: p.projectNo || `Project ${i + 1}`,
        project: p.projectTitle,
        system: p.system,
        investment: formatINR(p.estimatedInvestment),
        saving: formatINR(p.expectedAnnualCostSaving),
        energy: p.expectedEnergySaving,
        payback: p.simplePaybackPeriod,
        priority: p.implementationPriority,
      }))
    ),

    heading2("1.4 Conclusion and Way Forward"),
    paragraph(`Based on the audit findings, SEE-Tech recommends that ${safeText(clientName)} should proceed with detailed implementation planning for the identified energy-saving projects.`),
    createTable(
      [{ key: "step", label: "Step" }, { key: "action", label: "Action" }],
      es.conclusionAndWayForward?.length ? es.conclusionAndWayForward : [
        { step: 1, action: "Client review of identified projects" },
        { step: 2, action: "Joint selection of projects for implementation" },
        { step: 3, action: "Detailed engineering and vendor finalization" },
        { step: 4, action: "Submission of final techno-commercial proposal" },
        { step: 5, action: "Implementation, commissioning and performance monitoring" },
        { step: 6, action: "Savings validation and handover" },
      ]
    ),
    pageBreak(),
  ];
}

function generateProjectChapter(project, chapterNumber) {
  const n = (section) => `${chapterNumber}.${section}`;
  return [
    heading2(`${safeText(project.projectNo)} - ${safeText(project.projectTitle)}`),
    
    heading3(`${n(1)} Project Summary`),
    keyValueTable([
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
    ]),

    heading3(`${n(2)} Existing System Description`),
    paragraph(project.existingSystemDescription || `The existing system consists of ${safeText(project.equipmentCovered)}. The system is presently operated through ${safeText(project.existingOperatingCondition)}. During the audit, it was observed that the present operation does not fully match the actual building load variation, resulting in avoidable energy consumption.`),

    heading3(`${n(3)} Baseline Data and Measurements`),
    createTable(
      [{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }],
      project.baselineData || [
        { parameter: "Equipment rating", unit: "kW / TR / HP" },
        { parameter: "Quantity", unit: "Nos." },
        { parameter: "Operating hours", unit: "hours/day" },
        { parameter: "Baseline annual consumption", unit: "kWh/year" },
      ]
    ),

    heading3(`${n(4)} Problem / Gap Identified`),
    paragraph(project.problemGapIdentified || "The audit team observed that the existing system has potential for energy saving due to fixed-speed operation, over-capacity, higher operating hours, poor control, inefficient equipment, or absence of automation."),

    heading3(`${n(5)} Proposed Project`),
    paragraph(project.proposedProjectDescription || `It is proposed to implement ${safeText(project.proposedIntervention)} for ${safeText(project.equipmentCovered)}. The project includes supply, installation, testing and commissioning of major components and controls.`),

    heading3(`${n(6)} Scope of Work`),
    createTable(
      [{ key: "srNo", label: "Sr. No." }, { key: "scopeItem", label: "Scope Item" }],
      project.scopeOfWork || [
        { srNo: 1, scopeItem: "Detailed site measurement and final engineering" },
        { srNo: 2, scopeItem: "Supply of equipment / VFD / controller / motor / sensor / panel" },
        { srNo: 3, scopeItem: "Installation and integration with existing system" },
        { srNo: 4, scopeItem: "Testing and commissioning" },
      ]
    ),

    heading3(`${n(7)} Key Activities for Implementation`),
    createTable(
      [{ key: "activity", label: "Activity" }, { key: "details", label: "Details" }, { key: "responsibility", label: "Responsibility" }],
      project.keyActivities || [
        { activity: "Site verification", details: "Confirm equipment rating, location and operating condition", responsibility: "SEE-Tech + Client" },
        { activity: "Design finalization", details: "Finalize technical specifications and control logic", responsibility: "SEE-Tech" },
        { activity: "Procurement", details: "Arrange equipment and accessories", responsibility: "SEE-Tech / Vendor" },
        { activity: "Installation", details: "Install system with minimum disturbance", responsibility: "SEE-Tech" },
      ]
    ),

    heading3(`${n(8)} Rationale for Energy Saving`),
    paragraph(project.rationaleForEnergySaving || "Data required"),

    heading3(`${n(9)} Energy Saving Calculation`),
    createTable(
      [{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }],
      project.energySavingCalculation || [
        { parameter: "Existing connected load / measured load", unit: "kW" },
        { parameter: "Proposed load after project", unit: "kW" },
        { parameter: "Load reduction", unit: "kW" },
        { parameter: "Annual energy saving", unit: "kWh/year", value: project.expectedEnergySaving },
        { parameter: "Annual cost saving", unit: "₹/year", value: project.expectedAnnualCostSaving },
        { parameter: "Estimated investment", unit: "₹", value: project.estimatedInvestment },
        { parameter: "Simple payback", unit: "years", value: project.simplePaybackPeriod },
      ]
    ),

    heading3(`${n(10)} Carbon Footprint`),
    createTable(
      [{ key: "parameter", label: "Parameter" }, { key: "value", label: "Value" }],
      [
        { parameter: "Annual energy saving", value: project.carbonFootprint?.annualEnergySaving || project.expectedEnergySaving },
        { parameter: "Grid emission factor", value: project.carbonFootprint?.emissionFactor || "Data required" },
        { parameter: "Estimated CO2 reduction", value: project.carbonFootprint?.estimatedCO2Reduction || "Data required" },
      ]
    ),

    heading3(`${n(11)} Key Metrics`),
    createTable(
      [{ key: "srNo", label: "Sr. No." }, { key: "parameter", label: "Parameter" }, { key: "value", label: "Value" }],
      project.keyMetrics || [
        { srNo: 1, parameter: "Energy saving", value: project.expectedEnergySaving },
        { srNo: 2, parameter: "Cost saving", value: formatINR(project.expectedAnnualCostSaving) },
        { srNo: 3, parameter: "Estimated investment", value: formatINR(project.estimatedInvestment) },
        { srNo: 4, parameter: "Payback period", value: project.simplePaybackPeriod },
      ]
    ),

    heading3(`${n(12)} Technical Specifications`),
    createTable(
      [{ key: "item", label: "Item" }, { key: "specification", label: "Specification" }],
      project.technicalSpecifications || [
        { item: "Equipment / technology" }, { item: "Capacity" }, { item: "Quantity" },
      ]
    ),

    heading3(`${n(13)} Schematic / Conceptual Framework`),
    createTable(
      [{ key: "stage", label: "Stage" }, { key: "description", label: "Description" }],
      project.schematicFramework || [
        { stage: "Stage 1: Current State", description: "Existing inefficient or non-optimized operation" },
        { stage: "Stage 2: Intervention", description: "What SEE-Tech will install or modify" },
        { stage: "Stage 3: Physics of Saving", description: "Why energy will reduce after the intervention" },
        { stage: "Stage 4: Outcome", description: "kWh saving, ₹ saving, payback and reliability benefit" },
      ]
    ),

    heading3(`${n(14)} Implementation Duration`),
    createTable(
      [{ key: "activity", label: "Activity" }, { key: "duration", label: "Duration" }],
      project.implementationDurationTable || [
        { activity: "Engineering and approval", duration: "1 week" },
        { activity: "Procurement", duration: "2-4 weeks" },
        { activity: "Installation", duration: "1-2 weeks" },
        { activity: "Total expected duration", duration: project.implementationDuration || "Data required" },
      ]
    ),

    heading3(`${n(15)} Precautions / Aspects to be Taken Care Of`),
    createTable(
      [{ key: "area", label: "Area" }, { key: "precaution", label: "Precaution" }],
      project.precautions || [
        { area: "Technical suitability", precaution: "Confirm equipment rating, sizing and compatibility" },
        { area: "Operation", precaution: "Ensure project does not affect comfort, safety or process requirement" },
      ]
    ),

    heading3(`${n(16)} Measurement and Verification Plan`),
    createTable(
      [{ key: "parameter", label: "Parameter" }, { key: "baselineMeasurement", label: "Baseline Measurement" }, { key: "postImplementationMeasurement", label: "Post-Implementation Measurement" }],
      project.measurementVerificationPlan || [
        { parameter: "Power consumption", baselineMeasurement: "kW before project", postImplementationMeasurement: "kW after project" },
        { parameter: "Operating hours", baselineMeasurement: "Existing operating schedule", postImplementationMeasurement: "Revised operating schedule" },
        { parameter: "Energy consumption", baselineMeasurement: "kWh/year baseline", postImplementationMeasurement: "kWh/year after project" },
      ]
    ),

    heading3(`${n(17)} Benefits Other Than Energy Saving`),
    createTable(
      [{ key: "benefit", label: "Benefit" }, { key: "description", label: "Description" }],
      project.benefitsOtherThanEnergySaving || [
        { benefit: "Reduced operating cost", description: "Lower electricity / fuel bill" },
        { benefit: "Improved reliability", description: "Better control and reduced stress on equipment" },
        { benefit: "Better comfort", description: "Stable temperature / ventilation / lighting" },
      ]
    ),

    heading3(`${n(18)} Case Studies`),
    paragraph("The following reference case studies or similar implementation examples may be considered for understanding the practical relevance of this project."),
    createTable(
      [
        { key: "title", label: "Case Study" },
        { key: "clientType", label: "Client Type" },
        { key: "system", label: "System" },
        { key: "implementedMeasure", label: "Implemented Measure" },
        { key: "result", label: "Result" },
        { key: "relevance", label: "Relevance" },
      ],
      project.caseStudies && project.caseStudies.length ? project.caseStudies : [
        {
          title: "Data required",
          clientType: "Data required",
          system: project.system || "Data required",
          implementedMeasure: project.proposedIntervention || "Data required",
          result: "Data required",
          relevance: "Data required",
        },
      ]
    ),

    heading3(`${n(19)} Conclusion`),
    paragraph(project.finalConclusion || project.projectConclusion || `This project is technically feasible and financially attractive for implementation. The proposed intervention will reduce annual energy consumption by approximately ${safeText(project.expectedEnergySaving)}, resulting in annual cost saving of ${formatINR(project.expectedAnnualCostSaving)}/year. With an estimated investment of ${formatINR(project.estimatedInvestment)}, the simple payback period is expected to be ${safeText(project.simplePaybackPeriod)}. Considering the energy saving, operational improvement and sustainability benefits, this project is recommended for implementation under ${safeText(project.implementationPriority)}.`),
    pageBreak(),
  ];
}

async function buildCommercialBuildingEnergyAuditDocx(reportData) {
  const info = reportData.reportInfo || {};
  const es = reportData.executiveSummary || {};
  const projects = reportData.projects || [];
  const groupedProjects = reportData.groupedProjects || [];
  const bp = reportData.buildingProfile || {};
  const clientName = info.clientName || "Data required";

  const sectionsChildren = [
    ...generateCoverPage(info),
    ...generateExecutiveSummary(es, projects, clientName),
    heading1("Chapter 2: Plant / Building Details and Energy Profile"),
    paragraph("For commercial buildings, this chapter captures the building profile, utility details, major energy-consuming systems, operating pattern and audit observations."),
    heading2("2.1 General Information"),
    keyValueTable([
      { label: "Name of facility", value: bp.facilityName || info.clientName },
      { label: "Address", value: bp.address },
      { label: "Type of building", value: bp.typeOfBuilding || info.buildingType },
    ]),
    pageBreak()
  ];

  let currentChapter = 3;
  
  if (groupedProjects && groupedProjects.length > 0) {
    groupedProjects.forEach((group, index) => {
      const chapterNumber = currentChapter + index;
      sectionsChildren.push(heading1(`Chapter ${chapterNumber}: ${group.groupNo} ${safeText(group.groupTitle)}`));
      sectionsChildren.push(paragraph(`This chapter covers ${group.projects.length} energy conservation measures (ECMs) under the ${safeText(group.groupTitle)} category. The summary of these projects is provided below, followed by detailed descriptions of each individual project.`));
      
      sectionsChildren.push(heading2(`Group Summary`));
      sectionsChildren.push(createTable(
        [
          { key: "projectNo", label: "ECM No." },
          { key: "projectTitle", label: "ECM Name" },
          { key: "investment", label: "Investment ₹" },
          { key: "saving", label: "Annual Saving ₹/year" },
          { key: "energy", label: "Energy Saving kWh/year" },
          { key: "payback", label: "Payback" },
        ],
        group.projects.map((p) => ({
          projectNo: p.projectNo,
          projectTitle: p.projectTitle,
          investment: formatINR(p.estimatedInvestment),
          saving: formatINR(p.expectedAnnualCostSaving),
          energy: safeText(p.expectedEnergySaving),
          payback: safeText(p.simplePaybackPeriod),
        }))
      ));
      sectionsChildren.push(pageBreak());

      group.projects.forEach((proj) => {
        sectionsChildren.push(...generateProjectChapter(proj, chapterNumber));
      });
    });
  } else {
    projects.forEach((proj, idx) => {
      const chapterNumber = currentChapter + idx;
      sectionsChildren.push(...generateProjectChapter(proj, chapterNumber));
    });
  }

  // Annexure
  sectionsChildren.push(heading1("Annexure"));
  sectionsChildren.push(paragraph("Uploads and Data Sources used for this report have been omitted from this section. Please refer to the raw data files."));

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: sectionsChildren,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

module.exports = {
  buildCommercialBuildingEnergyAuditDocx,
};
