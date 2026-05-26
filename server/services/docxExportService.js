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

function safeText(value) {
  if (value === null || value === undefined || value === "") return "Data required";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (typeof value === "object") {
    if (value.value !== undefined) return safeText(value.value);
    if (value.text !== undefined) return safeText(value.text);
    if (value.label !== undefined) return safeText(value.label);
    if (value.result !== undefined) return safeText(value.result);
    if (value.amount !== undefined && value.unit !== undefined) return `${value.amount} ${value.unit}`;
  }
  return "Data required";
}

function displayText(value) {
  const text = safeText(value).trim();
  return /^data required$/i.test(text) ? "" : text;
}

function formatINR(value) {
  if (value === null || value === undefined || value === "") return "Data required";
  const num = Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isNaN(num)) return `INR ${Math.round(num).toLocaleString("en-IN")}`;
  return displayText(value) || "Data required";
}

function numberFrom(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const num = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function totalInvestment(projects = []) {
  return asArray(projects).reduce((sum, project) => sum + numberFrom(project.estimatedInvestment), 0);
}

function totalSavings(projects = []) {
  return asArray(projects).reduce((sum, project) => sum + numberFrom(project.expectedAnnualCostSaving), 0);
}

function totalEnergy(projects = []) {
  return asArray(projects).reduce((sum, project) => sum + numberFrom(project.expectedEnergySaving), 0);
}

function weightedPayback(projects = []) {
  const investment = totalInvestment(projects);
  const saving = totalSavings(projects);
  return investment && saving ? (investment / saving).toFixed(2) : "Data required";
}

function removeDuplicateGroupNo(title, groupNo) {
  const rawTitle = displayText(title);
  if (!rawTitle) return "";
  const escaped = groupNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return rawTitle.replace(new RegExp(`^${escaped}[\\s:.-]*`, "i"), "").trim();
}

function formatGroupHeading(group, index) {
  const subChapter = `3.${index + 1}`;
  const groupNo = displayText(group.groupNo) || `GR-${index + 1}`;
  const cleanTitle = removeDuplicateGroupNo(group.groupTitle, groupNo);
  return cleanTitle ? `${subChapter} ${groupNo} ${cleanTitle}` : `${subChapter} ${groupNo}`;
}

function formatEcmTitle(project) {
  const title = displayText(project.projectTitle);
  if (!title) return "";
  const number = displayText(project.projectNo);
  return number ? `ECM ${number} – ${title}` : title;
}

function formatEcmNumber(project) {
  const number = displayText(project.projectNo);
  return number ? `ECM ${number}` : "";
}

function heading1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } });
}

function heading2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 } });
}

function heading3(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 80 } });
}

function paragraph(text) {
  return new Paragraph({
    children: [new TextRun(safeText(text))],
    spacing: { after: 140 },
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
  const safeColumns = asArray(columns).length ? asArray(columns) : [{ key: "value", label: "Value" }];
  const rows = asArray(rowsData).length ? asArray(rowsData) : [{}];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: safeColumns.map((col) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: col.label, bold: true, color: "FFFFFF" })] })],
            shading: { fill: "09425D" },
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
          })
        ),
      }),
      ...rows.map((row, idx) => {
        const normalized = row && typeof row === "object" ? row : { value: safeText(row) };
        const fill = idx % 2 === 0 ? "EAF3F7" : "FFFFFF";
        return new TableRow({
          children: safeColumns.map((col) =>
            new TableCell({
              children: [new Paragraph({ text: safeText(normalized[col.key]) })],
              shading: { fill },
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
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
      const normalized = row && typeof row === "object" ? row : { label: "Value", value: safeText(row) };
      const keys = Object.keys(normalized);
      const labelKey = keys[0];
      const valueKey = keys[1] || keys[0];
      const fill = idx % 2 === 0 ? "EAF3F7" : "FFFFFF";
      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: safeText(normalized[labelKey]), bold: true, color: "09425D" })] })],
            shading: { fill },
            width: { size: 32, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: safeText(normalized[valueKey]) })],
            shading: { fill },
            width: { size: 68, type: WidthType.PERCENTAGE },
          }),
        ],
      });
    }),
  });
}

function generateCoverPage(info) {
  return [
    new Paragraph({ children: [new TextRun({ text: "SEE-Tech Solutions", bold: true, size: 36, color: "09425D" })], spacing: { after: 100 } }),
    new Paragraph({ children: [new TextRun({ text: "Commercial Building Energy Audit Report Format", size: 24, color: "5F6B76" })], spacing: { after: 1200 } }),
    new Paragraph({ children: [new TextRun({ text: safeText(info.reportTitle || "Detailed Energy Audit Report"), bold: true, size: 64, color: "09425D" })], spacing: { after: 400 } }),
    new Paragraph({ children: [new TextRun({ text: "Purpose: To identify implementable energy-saving projects with clear investment, savings, payback and execution roadmap.", size: 28, color: "18344A" })], spacing: { after: 800 } }),
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
    tocLine("Chapter 2. Plant / Building Details and Energy Profile", 0, true),
    tocLine("Chapter 3. Energy Saving Projects", 0, true),
  ];

  asArray(groupedProjects).forEach((group, index) => {
    lines.push(tocLine(formatGroupHeading(group, index), 1, true));
    asArray(group.projects)
      .map((project) => formatEcmTitle(project))
      .filter(Boolean)
      .forEach((title) => lines.push(tocLine(title, 2, false)));
  });

  lines.push(tocLine("Chapter 4. Annexures", 0, true));
  lines.push(pageBreak());
  return lines;
}

function generateExecutiveSummary(report, projects, groupedProjects) {
  const es = report.executiveSummary || {};
  const investment = es.totalEstimatedInvestment || totalInvestment(projects);
  const saving = es.totalAnnualCostSavingPotential || totalSavings(projects);
  const energy = es.totalEnergySavingPotential || totalEnergy(projects);
  const categoryRows = (groupedProjects.length ? groupedProjects : [{ groupNo: "GR-1", groupTitle: "Energy Saving Projects", projects }]).map((group, index) => ({
    category: formatGroupHeading(group, index).replace(/^3\.\d+\s*/, ""),
    count: asArray(group.projects).length,
    investment: formatINR(group.totalInvestment || totalInvestment(asArray(group.projects))),
    saving: formatINR(group.totalAnnualSaving || totalSavings(asArray(group.projects))),
    energy: safeText(group.totalEnergySaving || totalEnergy(asArray(group.projects))),
    payback: safeText(group.weightedPayback || weightedPayback(asArray(group.projects))),
  }));

  return [
    heading1("Chapter 1: Executive Summary"),
    heading2("1.1 Purpose of the Energy Audit"),
    paragraph(es.purposeText || `The purpose of this energy audit is to identify technically feasible, financially attractive and practically implementable energy-saving projects for ${safeText(report.reportInfo?.clientName)}.`),
    heading2("1.2 Overall Energy Saving Potential"),
    createTable(
      [{ key: "particular", label: "Particular" }, { key: "value", label: "Value" }],
      [
        { particular: "Total annual electricity consumption", value: es.totalAnnualElectricityConsumption },
        { particular: "Annual electricity cost", value: formatINR(es.annualElectricityCost) },
        { particular: "Average electricity tariff considered", value: es.averageTariff },
        { particular: "Number of projects identified", value: es.numberOfProjects || projects.length },
        { particular: "Total energy saving potential", value: energy },
        { particular: "Total annual cost saving potential", value: formatINR(saving) },
        { particular: "Total estimated investment", value: formatINR(investment) },
        { particular: "Simple payback period", value: es.simplePaybackPeriod || weightedPayback(projects) },
        { particular: "CO2 reduction potential", value: es.co2ReductionPotential },
      ]
    ),
    heading2("1.3 Summary of Identified Energy Saving Projects"),
    createTable(
      [
        { key: "projectNo", label: "Project No." },
        { key: "project", label: "Energy Saving Project" },
        { key: "system", label: "System" },
        { key: "investment", label: "Investment INR" },
        { key: "saving", label: "Annual Saving INR/year" },
        { key: "energy", label: "Energy Saving kWh/year" },
      ],
      projects.map((project, index) => ({
        projectNo: formatEcmNumber(project) || `ECM ${index + 1}`,
        project: displayText(project.projectTitle) || safeText(project.projectTitle),
        system: project.system,
        investment: formatINR(project.estimatedInvestment),
        saving: formatINR(project.expectedAnnualCostSaving),
        energy: safeText(project.expectedEnergySaving),
      }))
    ),
    heading2("1.4 Category-wise Summary"),
    createTable(
      [
        { key: "category", label: "Category" },
        { key: "count", label: "No. of Projects" },
        { key: "investment", label: "Investment INR" },
        { key: "saving", label: "Annual Saving INR/year" },
        { key: "energy", label: "Energy Saving kWh/year" },
        { key: "payback", label: "Payback" },
      ],
      categoryRows
    ),
    heading2("1.5 Key Observations"),
    ...(asArray(es.keyObservations).length ? asArray(es.keyObservations) : [
      "Cooling, production, compressed air, and auxiliary system projects contribute the major savings opportunity.",
      "Control improvements and high-efficiency retrofits are strong early implementation candidates.",
      "Measurement and verification are required to sustain savings after implementation.",
    ]).map((item) => paragraph(item)),
    heading2("1.6 Conclusion and Way Forward"),
    paragraph(`Based on the audit findings, SEE-Tech recommends that ${safeText(report.reportInfo?.clientName)} should proceed with detailed implementation planning for the identified energy-saving projects.`),
    createTable(
      [{ key: "step", label: "Step" }, { key: "action", label: "Action" }],
      asArray(es.conclusionAndWayForward).length
        ? asArray(es.conclusionAndWayForward)
        : [
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

function generateBuildingProfile(report) {
  const bp = report.buildingProfile || {};
  const esd = report.electricalSupplyDetails || {};
  const benchmark = report.specificEnergyBenchmark || {};
  return [
    heading1("Chapter 2: Plant / Building Details and Energy Profile"),
    heading2("2.1 General Information"),
    keyValueTable([
      { label: "Name of facility", value: bp.facilityName || report.reportInfo?.clientName },
      { label: "Address", value: bp.address },
      { label: "Type of building", value: bp.typeOfBuilding || report.reportInfo?.buildingType },
      { label: "Operating days and hours", value: bp.operatingDaysAndHours },
      { label: "Facility contact person", value: bp.facilityContactPerson },
    ]),
    heading2("2.2 Utility and Energy Sources"),
    createTable(
      [
        { key: "energySource", label: "Energy Source" },
        { key: "use", label: "Use" },
        { key: "annualConsumption", label: "Annual Consumption" },
        { key: "annualCost", label: "Annual Cost INR" },
      ],
      report.utilityAndEnergySources || [
        { energySource: "Grid electricity", use: "Main electrical loads" },
        { energySource: "Diesel", use: "DG backup" },
      ]
    ),
    keyValueTable([
      { label: "Supply voltage", value: esd.supplyVoltage },
      { label: "Tariff category", value: esd.tariffCategory },
      { label: "Contract demand / sanctioned load", value: esd.contractDemand },
      { label: "Average electricity tariff", value: esd.averageElectricityTariff || "INR/kWh" },
    ]),
    heading2("2.3 Major Energy Consuming Systems"),
    createTable(
      [
        { key: "system", label: "System" },
        { key: "majorEquipment", label: "Major Equipment" },
        { key: "estimatedShare", label: "Estimated Share" },
        { key: "remarks", label: "Remarks" },
      ],
      report.majorEnergyConsumingSystems || [
        { system: "Cooling system", majorEquipment: "Chiller / pumps / cooling tower" },
        { system: "Production machines", majorEquipment: "Dryers / heaters / servo systems" },
        { system: "Compressed air", majorEquipment: "Compressors / boosters" },
      ]
    ),
    heading2("2.4 Audit Observations"),
    keyValueTable([
      { label: "Annual electricity consumption", value: benchmark.annualElectricityConsumption },
      { label: "Specific energy consumption", value: benchmark.specificEnergyConsumption },
      { label: "Reference / target benchmark", value: benchmark.referenceBenchmark },
      { label: "Improvement potential", value: benchmark.improvementPotential },
    ]),
    createTable(
      [
        { key: "observation", label: "Observation" },
        { key: "impact", label: "Impact" },
        { key: "recommendation", label: "Recommendation" },
      ],
      report.auditObservations || [
        { observation: "Optimization opportunities exist across major systems.", impact: "Higher than necessary energy consumption", recommendation: "Implement ECMs in a phased manner." },
      ]
    ),
    pageBreak(),
  ];
}

function generateProjectChapter(project) {
  return [
    heading3(formatEcmTitle(project) || safeText(project.projectTitle || "ECM")),
    keyValueTable([
      { particular: "Project title", details: project.projectTitle },
      { particular: "Project number", details: formatEcmNumber(project) || project.projectNo },
      { particular: "System", details: project.system },
      { particular: "Location", details: project.location },
      { particular: "Equipment covered", details: project.equipmentCovered },
      { particular: "Proposed intervention", details: project.proposedIntervention },
      { particular: "Expected energy saving", details: project.expectedEnergySaving },
      { particular: "Expected annual cost saving", details: formatINR(project.expectedAnnualCostSaving) },
      { particular: "Estimated investment", details: formatINR(project.estimatedInvestment) },
      { particular: "Simple payback period", details: project.simplePaybackPeriod },
    ]),
    paragraph(project.existingSystemDescription || project.problemGapIdentified || "The audit team observed an energy-saving opportunity in the current operating condition."),
    createTable(
      [{ key: "parameter", label: "Parameter" }, { key: "unit", label: "Unit" }, { key: "value", label: "Value" }],
      project.energySavingCalculation || [
        { parameter: "Annual energy saving", unit: "kWh/year", value: project.expectedEnergySaving },
        { parameter: "Annual cost saving", unit: "INR/year", value: project.expectedAnnualCostSaving },
        { parameter: "Estimated investment", unit: "INR", value: project.estimatedInvestment },
        { parameter: "Simple payback", unit: "years", value: project.simplePaybackPeriod },
      ]
    ),
    pageBreak(),
  ];
}

function generateAnnexures() {
  return [
    heading1("Chapter 4: Annexures"),
    heading2("4.1 Uploaded Data Sources"),
    paragraph("Uploaded spreadsheets, measurements, and supporting documents used for this report are referenced here."),
    heading2("4.2 Assumptions"),
    paragraph("Savings, investment, and implementation assumptions are based on the data made available during the audit and SEE-Tech engineering judgment where direct readings were not available."),
    heading2("4.3 Image / Figure References"),
    paragraph("Photographs, schematics, and reference figures included in the report are listed in this section."),
    heading2("4.4 Calculation Notes"),
    paragraph("Calculation notes, formulas, and validation references supporting the ECM analysis are documented here."),
  ];
}

async function buildCommercialBuildingEnergyAuditDocx(reportData) {
  const report = normalizeReportForExport(reportData);
  const projects = asArray(report.projects);
  const groupedProjects = asArray(report.groupedProjects).length
    ? asArray(report.groupedProjects)
    : [{
        groupNo: "GR-1",
        groupTitle: "Energy Saving Projects",
        projects,
        totalInvestment: totalInvestment(projects),
        totalAnnualSaving: totalSavings(projects),
        totalEnergySaving: totalEnergy(projects),
        weightedPayback: weightedPayback(projects),
      }];

  if (!projects.length) {
    throw new Error("No valid ECM projects available for export.");
  }

  const children = [
    ...generateCoverPage(report.reportInfo || {}),
    ...generateTableOfContents(groupedProjects),
    ...generateExecutiveSummary(report, projects, groupedProjects),
    ...generateBuildingProfile(report),
    heading1("Chapter 3: Energy Saving Projects"),
    paragraph("This chapter presents the identified energy conservation measures grouped by system and application area. Each group includes a summary table followed by detailed ECM descriptions."),
    pageBreak(),
  ];

  groupedProjects.forEach((group, index) => {
    const groupProjects = asArray(group.projects);
    children.push(heading2(formatGroupHeading(group, index)));
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
          projectTitle: displayText(project.projectTitle) || safeText(project.projectTitle),
          investment: formatINR(project.estimatedInvestment),
          saving: formatINR(project.expectedAnnualCostSaving),
          energy: safeText(project.expectedEnergySaving),
          payback: safeText(project.simplePaybackPeriod),
        }))
      )
    );
    children.push(pageBreak());
    groupProjects.forEach((project) => children.push(...generateProjectChapter(project)));
  });

  children.push(...generateAnnexures());

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

module.exports = {
  buildCommercialBuildingEnergyAuditDocx,
};