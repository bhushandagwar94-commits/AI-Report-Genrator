const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} = require("docx");

function safeText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value)) return value.filter(Boolean).map(v => safeText(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function p(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text: safeText(text, ""),
      }),
    ],
  });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    children: [
      new TextRun({
        text: safeText(text, ""),
        bold: true,
      }),
    ],
  });
}

function cell(text) {
  return new TableCell({
    children: [p(text)],
  });
}

function simpleTable(rows) {
  const safeRows = Array.isArray(rows) && rows.length ? rows : [["Particular", "Value"]];
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: safeRows.map(row =>
      new TableRow({
        children: row.map(value => cell(value)),
      })
    ),
  });
}

async function renderSafeDocx(reportData = {}) {
  const ecms =
    reportData.ecms ||
    reportData.detailedEcMs ||
    reportData.detailedEcms ||
    [];

  const children = [
    heading("SEE-Tech Solutions"),
    heading("Detailed Energy Audit Report", HeadingLevel.HEADING_1),
    p(reportData.clientName || reportData.facilityName || "Energy Audit Report"),
    p("Prepared By: SEE-Tech Solutions"),
    p(""),

    heading("1. Executive Summary", HeadingLevel.HEADING_1),
    simpleTable([
      ["Particular", "Value"],
      ["Facility name", reportData.facilityName || reportData.clientName || ""],
      ["Annual kWh", reportData.annualKwh || ""],
      ["Annual electricity cost", reportData.annualElectricityCost || ""],
      ["ECM count", String(ecms.length || "")],
      ["Total energy saving", reportData.totalEnergySaving || ""],
      ["Total annual saving", reportData.totalAnnualSaving || ""],
    ]),

    p(""),
    heading("2. ECM Summary", HeadingLevel.HEADING_1),
    simpleTable([
      ["ECM No.", "Project Title", "System", "Energy Saving", "Annual Saving"],
      ...ecms.map((e, index) => [
        e.ecmNo || e.ecmNumber || index + 1,
        e.projectTitle || e.title || "",
        e.system || "",
        e.energySavingKwhYear || e.energySaving || "",
        e.annualSavingRsYear || e.annualSaving || "",
      ]),
    ]),

    p(""),
    heading("3. Detailed ECM Sheets", HeadingLevel.HEADING_1),
    ...ecms.flatMap((e, index) => [
      heading(`${index + 1}. ${e.projectTitle || e.title || "ECM"}`, HeadingLevel.HEADING_2),
      simpleTable([
        ["Particular", "Value"],
        ["ECM No.", e.ecmNo || e.ecmNumber || index + 1],
        ["Project title", e.projectTitle || e.title || ""],
        ["System", e.system || ""],
        ["Equipment covered", e.equipmentCovered || e.equipment || e.system || ""],
        ["Baseline kWh/year", e.baselineKwhYear || e.baselineEnergyKwhYear || ""],
        ["Saving %", e.savingPercent || e.savingPercentage || ""],
        ["Energy saving kWh/year", e.energySavingKwhYear || e.energySaving || ""],
        ["Annual saving Rs/year", e.annualSavingRsYear || e.annualSaving || ""],
        ["Investment Rs", e.investmentRs || e.investment || ""],
        ["Payback months", e.paybackMonths || e.payback || ""],
      ]),
      p(""),
      heading("Existing Condition", HeadingLevel.HEADING_3),
      p(e.existingCondition || e.currentCondition || e.observation || ""),
      heading("Problem / Gap", HeadingLevel.HEADING_3),
      p(e.problemGap || e.problemStatement || e.issue || ""),
      heading("Proposed Project", HeadingLevel.HEADING_3),
      p(e.proposedProject || e.projectTitle || e.title || ""),
      heading("Conclusion", HeadingLevel.HEADING_3),
      p(
        e.conclusion ||
        `${e.projectTitle || e.title || "This ECM"} is technically feasible based on the available audit data. Implementation should proceed after final site verification and vendor engineering.`
      ),
      p(""),
    ]),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

module.exports = { renderSafeDocx };
