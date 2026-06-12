const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  HeadingLevel,
  WidthType,
  AlignmentType,
  PageBreak,
} = require("docx");
const {
  asArray,
  buildExtractedDataContext,
  cleanText,
} = require("./extractedDataContextService");
const {
  formatIndianNumber,
  formatInr,
  formatKva,
  formatKvah,
  formatKwh,
  formatKw,
  formatMonths,
  formatPercent,
  formatPf,
  formatYears,
} = require("./reportFormattingService");



function isVrChennaiReport(reportData = {}, extractedDataContext = null) {
  const extractionFormat = cleanText(reportData.extractionFormat || reportData.reportInfo?.extractionFormat).toLowerCase();
  if (extractionFormat.includes("vr_chennai")) return true;

  const sourceFiles = extractedDataContext?.extractionAudit?.sourceFiles || reportData?.extractedDataContext?.extractionAudit?.sourceFiles || [];
  if (sourceFiles.some((file) => cleanText(file).toLowerCase().includes("vr chennai ecm sheet"))) return true;

  const bills = extractedDataContext?.monthlyBills || reportData?.extractedDataContext?.monthlyBills || [];
  const projects = extractedDataContext?.ecmProjects || reportData?.extractedDataContext?.ecmProjects || [];
  return bills.length >= 12 && projects.length === 14;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function addMissingInput(context, section, missingInput, whyRequired, suggestedSource, criticality = "Medium") {
  const exists = context.missingInputs.some(
    (item) => cleanText(item.section) === cleanText(section) && cleanText(item.missingInput) === cleanText(missingInput)
  );
  if (!exists) {
    context.missingInputs.push({ section, missingInput, whyRequired, suggestedSource, criticality });
  }
}

function getProjectNumber(project = {}) {
  const match = String(project.ecmNo || project.serialNo || "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function bulletize(text) {
  return cleanText(text)
    .split(/\r?\n|(?<=\.)\s+(?=\d+\.)/)
    .map((item) => cleanText(item.replace(/^[\d.)\-\s]+/, "")))
    .filter(Boolean);
}

function shortFallback(text, fallback, context, section, missingInput, whyRequired, suggestedSource, criticality = "Medium") {
  if (cleanText(text)) return cleanText(text);
  addMissingInput(context, section, missingInput, whyRequired, suggestedSource, criticality);
  return fallback;
}



function mvBullets(project) {
  const no = getProjectNumber(project);
  if (no === 1) {
    return [
      "Compare monthly recorded demand and billed demand before and after contract demand revision.",
      "Verify demand charge reduction from utility bills.",
      "Confirm no demand penalty occurs after revision.",
    ];
  }

  const title = cleanText(project.projectTitle).toLowerCase();
  if (/chiller|cooling tower/.test(title) || [2, 3, 4, 5, 18].includes(no)) {
    return [
      "Record chiller kW, CHWS/CHWR temperature, condenser water temperature and cooling tower operation.",
      "Compare kW/TR before and after implementation.",
      "Normalize comparison for cooling load and operating hours.",
    ];
  }
  if (/pump/.test(title) || [6, 7, 8].includes(no)) {
    return [
      "Measure pump kW, flow/head or differential pressure, VFD frequency and operating hours.",
      "Compare before/after kW under similar load.",
      "Verify stable flow or pressure after control changes.",
    ];
  }
  if (/ahu|air washer|hrw|scrubber|blower/.test(title) || [9, 10, 11, 12, 13].includes(no)) {
    return [
      "Measure motor kW, airflow, static pressure and operating hours.",
      "Compare before and after fan or blower energy use.",
      "Verify ventilation, comfort or process requirement is maintained.",
    ];
  }
  return [
    "Track operating setpoints, equipment staging, run hours and monthly energy consumption.",
    "Verify changes through BMS logs and utility trend.",
  ];
}

function benefitBullets(project) {
  const system = cleanText(project.system || project.projectTitle);
  return [
    `Reduces energy use in the ${system} system.`,
    "Lowers annual electricity cost based on the extracted billing tariff.",
    "Supports more stable and controllable operation.",
  ];
}

function conclusionBullets(project) {
  return [
    `${project.ecmNo} is supported by the uploaded ECM source data.`,
    "Financial metrics are taken directly from extracted source values.",
    "Proceed with implementation after the remaining Annexure B inputs are field-verified, where applicable.",
  ];
}

function buildConnectedLoadRows(context) {
  return context.connectedLoad.summaryByAssetType.map((row) => ({
    system: row.assetType,
    quantity: String(row.quantity),
    connectedLoad: formatKw(row.totalKw),
    annualConsumption: formatKwh(row.totalAnnualConsumption, "kWh/year"),
    share: formatPercent(row.percentageShare),
    remarks: row.remarks,
  }));
}

function buildMonthlyBillRows(context) {
  return context.monthlyBills.map((bill) => {
    let kwh = bill.totalKwh;
    let kvah = bill.totalKvah;
    let pf = bill.powerFactor;

    if (kwh && kvah && !pf) {
      const calculatedPf = kwh / kvah;
      if (calculatedPf > 1 || calculatedPf < 0.5) {
        kvah = "Verify from bill PDF";
        pf = "Verify from bill PDF";
      } else {
        pf = calculatedPf;
      }
    } else if (kwh && !kvah && pf) {
      if (pf > 1 || pf < 0.5) {
        kvah = "Verify from bill PDF";
        pf = "Verify from bill PDF";
      }
    }

    return {
      month: bill.monthLabel,
      kwh: formatKwh(kwh, "kWh"),
      kvah: typeof kvah === "string" ? kvah : formatKvah(kvah),
      md: formatKva(bill.recordedDemandKva),
      pf: typeof pf === "string" ? pf : formatPf(pf),
      billAmount: formatInr(bill.netAmountPayable),
      averageTariff: bill.totalKwh > 0 ? `${formatInr(bill.netAmountPayable / bill.totalKwh)}/kWh` : "",
    };
  });
}

function buildEcmDetail(project, context) {
  const baselineNotes = shortFallback(
    project.baselineNotes,
    "To be updated",
    context,
    "Detailed ECM Sheets",
    `${project.ecmNo} existing condition details`,
    "Required to expand the existing-condition narrative.",
    "ECM sheet / site verification",
    "Medium"
  );

  const problemGap = shortFallback(
    project.rationaleForEnergySaving,
    "To be updated",
    context,
    "Detailed ECM Sheets",
    `${project.ecmNo} problem statement`,
    "Required to explain the basis of the ECM recommendation.",
    "ECM sheet / site verification",
    "Medium"
  );

  const proposedProject = cleanText([project.projectTitle, project.briefInformationAdvantages].filter(Boolean).join(". "));
  if (!proposedProject) {
    addMissingInput(context, "Detailed ECM Sheets", `${project.ecmNo} proposed project narrative`, "Required to explain the proposed implementation scope.", "ECM sheet", "Medium");
  }

  const activities = bulletize(project.projectActivities);
  if (!activities.length) {
    addMissingInput(context, "Detailed ECM Sheets", `${project.ecmNo} project activities`, "Required to show implementation steps in the ECM detail.", "ECM sheet", "Medium");
  }

  const costingBackup = context.costing.matchedCostingByEcm?.[project.ecmNo] || [];
  if (!costingBackup.length && /ECM (6|7|8|9|10|11|12|13)/.test(project.ecmNo)) {
    addMissingInput(context, "ECM Costing", `Costing backup not found for ${project.ecmNo}.`, "Required to support BOQ and implementation costing backup.", "Costing / Blower Costing sheet", "High");
  }

  return {
    ecmNo: project.ecmNo,
    projectTitle: project.projectTitle,
    system: project.system,
    equipmentCovered: project.equipmentName,
    baselineKwhFormatted: formatKwh(project.baselineKwhPerYearRaw, "kWh/year"),
    savingPercentFormatted: formatPercent(project.savingPercentRaw),
    energySavingFormatted: formatKwh(project.energySavingRaw, "kWh/year"),
    annualSavingFormatted: formatInr(project.annualSavingRaw),
    investmentFormatted: formatInr(project.investmentRaw),
    paybackMonthsFormatted: formatMonths(project.paybackMonthsRaw),
    paybackYearsFormatted: formatYears(project.paybackYearsRaw),
    existingCondition: cleanText([project.equipmentName, baselineNotes].filter(Boolean).join(". ")),
    problemGap,
    proposedProject: proposedProject || "Proposed project description is not available in uploaded data and is listed in Annexure B.",
    projectActivities: activities.length ? activities : ["Project activities are not available in uploaded data and are listed in Annexure B."],
    energySavingCalculationRows: [
      ["Baseline kWh/year", formatKwh(project.baselineKwhPerYearRaw, "kWh/year")],
      ["Saving %", formatPercent(project.savingPercentRaw)],
      ["Energy saving kWh/year", formatKwh(project.energySavingRaw, "kWh/year")],
      ["Annual saving Rs/year", formatInr(project.annualSavingRaw)],
      ["Investment Rs", formatInr(project.investmentRaw)],
      ["Payback, months", formatMonths(project.paybackMonthsRaw)],
      ["Payback, years", formatYears(project.paybackYearsRaw)],
    ],
    mvPlan: mvBullets(project),
    benefits: benefitBullets(project),
    conclusion: conclusionBullets(project),
    costingBackup,
  };
}

function buildDefaultMissingInputs(context) {
  if (!context.projectInfo.address) {
    addMissingInput(context, "Facility and Billing Profile", "Facility address", "Required for cover page and site identification.", "Client/site profile", "Medium");
  }
  addMissingInput(context, "Benchmarking", "Built-up area", "Required for SEC benchmark.", "Building drawing / client data", "Medium");
  addMissingInput(context, "Benchmarking", "Conditioned area", "Required for HVAC benchmark.", "HVAC layout / BMS", "Medium");
  addMissingInput(context, "Detailed ECM Sheets", "Chiller TR rating", "Required for kW/TR validation.", "Chiller nameplate / BMS", "High");
  addMissingInput(context, "Detailed ECM Sheets", "Pump head and flow", "Required for pump ECM validation.", "Pump datasheet / site measurement", "High");
  addMissingInput(context, "Detailed ECM Sheets", "AHU CFM and static pressure confirmation", "Required for plug fan ECM validation.", "AHU schedule / site measurement", "High");
  addMissingInput(context, "Reporting", "CO2 emission factor", "Required for carbon calculation.", "Client-approved factor", "Low");
}

function buildVrChennaiClientReadyModel(reportData = {}, extractedDataInput = {}) {
  const context = extractedDataInput?.projectInfo && extractedDataInput?.electricalProfile
    ? cloneJson(extractedDataInput)
    : buildExtractedDataContext({
        uploadedFiles: reportData?.uploadedFiles || [],
        workbookExtractions: reportData?.extractedDataContext || extractedDataInput || {},
        reportData,
      });

  buildDefaultMissingInputs(context);

  function groupMissingInputs(missingInputs = []) {
    const map = new Map();
    for (const item of missingInputs) {
      const ecmMatch = String(item.missingInput || "").match(/ECM\s+(\d+)/i);
      const baseInput = ecmMatch ? String(item.missingInput).replace(/ECM\s+\d+/i, "").trim() : item.missingInput;
      const key = `${item.section}|${baseInput}|${item.whyRequired}|${item.suggestedSource}|${item.criticality}`;
      
      if (!map.has(key)) {
        map.set(key, { ...item, ecmList: [] });
      }
      if (ecmMatch) {
        map.get(key).ecmList.push(ecmMatch[1]);
      }
    }
    
    return Array.from(map.values()).map(item => {
      if (item.ecmList.length > 0) {
        const ecmNumbers = [...new Set(item.ecmList)].sort((a, b) => Number(a) - Number(b));
        const baseInput = String(item.missingInput).replace(/ECM\s+\d+/i, "").trim();
        item.missingInput = `ECM ${ecmNumbers.join(", ")} ${baseInput}`.trim();
      }
      return item;
    });
  }

  context._originalMissingInputsCount = context.missingInputs.length;
  context.missingInputs = groupMissingInputs(context.missingInputs);

  const hasExplicitEcmGrouping = reportData?.hasExplicitEcmGrouping === true;
  const groups = hasExplicitEcmGrouping && Array.isArray(reportData?.groups) ? reportData.groups : [];
  
  let ecmDetails = [];
  if (hasExplicitEcmGrouping && groups.length > 0) {
    ecmDetails = groups.flatMap((group) => group.projects.map((project) => ({
      ...buildEcmDetail(project, context),
      groupNo: group.groupNo,
      groupName: group.groupName,
    })));
  } else {
    // If no explicit grouping, use projects list and preserve source order
    const projects = Array.isArray(reportData?.projects) && reportData.projects.length > 0 
      ? reportData.projects 
      : context.ecmProjects;
    
    ecmDetails = projects.map((project) => ({
      ...buildEcmDetail(project, context),
      groupNo: null,
      groupName: null,
    }));
  }

  const totalEnergySaving = Number(context.ecmProjects.reduce((sum, project) => sum + (project.energySavingRaw || 0), 0).toFixed(0));
  const totalAnnualSaving = Number(context.ecmProjects.reduce((sum, project) => sum + (project.annualSavingRaw || 0), 0).toFixed(0));
  const totalInvestment = Number(context.ecmProjects.reduce((sum, project) => sum + (project.investmentRaw || 0), 0).toFixed(0));
  const overallPaybackYears = totalAnnualSaving > 0 ? Number((totalInvestment / totalAnnualSaving).toFixed(2)) : null;

  const executiveSummaryRows = [
    ["Facility name", context.projectInfo.facilityName || context.projectInfo.clientName],
    ["Building type", context.projectInfo.buildingType || "Commercial Mall / Retail Building"],
    ["Service number", context.electricalProfile.serviceNo],
    ["Contract demand", formatKva(context.electricalProfile.contractDemandKva)],
    ["Tariff", context.electricalProfile.tariffCategory],
    ["Supply voltage", context.electricalProfile.supplyVoltage],
    ["Annual kWh", formatKwh(context.electricalProfile.annualKwh, "kWh")],
    ["Annual electricity cost", formatInr(context.electricalProfile.annualBillAmount)],
    ["Average tariff", context.electricalProfile.averageTariff ? `${formatInr(context.electricalProfile.averageTariff)}/kWh` : ""],
    ["ECM count", String(context.ecmProjects.length)],
    ["Total energy saving", formatKwh(totalEnergySaving, "kWh/year")],
    ["Total annual saving", formatInr(totalAnnualSaving)],
    ["Total investment", formatInr(totalInvestment)],
    ["Overall payback, years", formatYears(overallPaybackYears)],
    ["Overall payback, months", formatMonths(overallPaybackYears !== null ? overallPaybackYears * 12 : null)],
  ].filter(([, value]) => cleanText(value));

  const facilityProfileRows = [
    ["Client name", context.projectInfo.clientName],
    ["Facility name", context.projectInfo.facilityName],
    ["Address", context.projectInfo.address],
    ["Location", context.projectInfo.location],
    ["Building type", context.projectInfo.buildingType],
    ["Audit period", context.projectInfo.auditPeriod],
    ["Report date", context.projectInfo.reportDate],
    ["Prepared by", context.projectInfo.preparedBy],
    ["Service number", context.electricalProfile.serviceNo],
    ["Tariff", context.electricalProfile.tariffCategory],
    ["Contract demand", formatKva(context.electricalProfile.contractDemandKva)],
    ["Permitted MD", formatKva(context.electricalProfile.permittedMdKva)],
    ["Supply voltage", context.electricalProfile.supplyVoltage],
    ["Transformer capacity", formatKva(context.electricalProfile.transformerCapacityKva)],
    ["Average power factor", formatPf(context.electricalProfile.averagePowerFactor)],
  ].filter(([, value]) => cleanText(value));

  const extractedDataSummaryRows = [
    ["Client name", context.projectInfo.clientName],
    ["Service number", context.electricalProfile.serviceNo],
    ["Monthly bills extracted", String(context.monthlyBills.length)],
    ["ECMs extracted", String(context.ecmProjects.length)],
    ["Connected load systems", String(context.connectedLoad.summaryByAssetType.length)],
    ["PDF files detected", String(context.pdfBillExtraction.filesDetected || 0)],
    ["PDF files parsed", String(context.pdfBillExtraction.filesParsed || 0)],
  ];

  const pdfStatusRows = [
    ["Files detected", String(context.pdfBillExtraction.filesDetected || 0)],
    ["Files parsed", String(context.pdfBillExtraction.filesParsed || 0)],
    ["Files failed", String(asArray(context.pdfBillExtraction.filesFailed).length)],
    ["Warnings", asArray(context.pdfBillExtraction.warnings).join("; ")],
  ];

  const groupSummaryRows = groups.map((group) => ({
    groupNo: group.groupNo,
    groupName: group.groupName,
    ecmCount: String(group.projects.length),
    totalEnergySaving: formatKwh(group.totalEnergySaving, "kWh/year"),
    totalAnnualSaving: formatInr(group.totalAnnualSaving),
    totalInvestment: formatInr(group.totalInvestment),
    payback: formatYears(group.weightedPaybackYears),
  }));

  const ecmSummaryRows = context.ecmProjects
    .map((project) => ({
      ecmNo: project.ecmNo,
      projectTitle: project.projectTitle,
      system: project.system,
      energySaving: formatKwh(project.energySavingRaw, "kWh/year"),
      annualSaving: formatInr(project.annualSavingRaw),
      investment: formatInr(project.investmentRaw),
      paybackMonths: formatMonths(project.paybackMonthsRaw),
    }));

  const consolidatedMvRows = ecmDetails.map((detail) => ({
    ecmNo: detail.ecmNo,
    projectTitle: detail.projectTitle,
    mvPlan: detail.mvPlan.join("; "),
  }));

  const mainReportText = [
    context.projectInfo.facilityName,
    context.projectInfo.buildingType,
    ...executiveSummaryRows.map((row) => `${row[0]}: ${row[1]}`),
    ...facilityProfileRows.map((row) => `${row[0]}: ${row[1]}`),
    ...buildConnectedLoadRows(context).map((row) => `${row.system} ${row.quantity} ${row.connectedLoad} ${row.annualConsumption}`),
    ...ecmDetails.flatMap((detail) => [
      `${detail.ecmNo} ${detail.projectTitle}`,
      detail.existingCondition,
      detail.problemGap,
      detail.proposedProject,
      ...detail.projectActivities,
      ...detail.mvPlan,
      ...detail.benefits,
      ...detail.conclusion,
    ]),
  ].join("\n");

  const fullText = [
    mainReportText,
    ...context.missingInputs.map((item) => `${item.section}: ${item.missingInput} | ${item.whyRequired}`),
    ...asArray(context.pdfBillExtraction.filesFailed).map((item) => `${item.fileName}: ${item.reason}`),
  ].join("\n");

  return {
    title: "Detailed Energy Audit Report",
    context,
    hasExplicitEcmGrouping,
    groups,
    executiveSummaryRows,
    facilityProfileRows,
    monthlyBillRows: buildMonthlyBillRows(context),
    connectedLoadRows: buildConnectedLoadRows(context),
    ecmSummaryRows,
    groupSummaryRows,
    ecmDetails,
    consolidatedMvRows,
    extractedDataSummaryRows,
    pdfStatusRows,
    missingInputsRows: context.missingInputs,
    mainReportText,
    plainText: fullText,
  };
}

function paragraph(text, options = {}) {
  return new Paragraph({
    text: cleanText(text),
    spacing: { after: options.after ?? 120 },
    alignment: options.alignment || AlignmentType.LEFT,
    heading: options.heading,
  });
}

function bulletParagraph(text) {
  return new Paragraph({
    text: cleanText(text),
    bullet: { level: 0 },
    spacing: { after: 80 },
  });
}

function makeTable(headers, rows) {
  const headerRow = new TableRow({
    children: headers.map((header) =>
      new TableCell({
        width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })],
      })
    ),
  });

  const bodyRows = rows.map((row) =>
    new TableRow({
      children: row.map((cell) =>
        new TableCell({
          width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
          children: [new Paragraph(cleanText(cell))],
        })
      ),
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

function keyValueTable(rows) {
  return makeTable(
    ["Particular", "Value"],
    rows.map(([label, value]) => [label, cleanText(value)])
  );
}

async function renderVrChennaiClientReadyDocx(reportData = {}, extractedDataInput = {}) {
  const model = buildVrChennaiClientReadyModel(reportData, extractedDataInput);
  const { context } = model;

  const children = [
    paragraph("SEE-Tech Solutions", { alignment: AlignmentType.CENTER }),
    paragraph(model.title, { alignment: AlignmentType.CENTER, heading: HeadingLevel.TITLE }),
    paragraph(context.projectInfo.facilityName || context.projectInfo.clientName, { alignment: AlignmentType.CENTER }),
    paragraph(context.projectInfo.buildingType || "Commercial Mall / Retail Building", { alignment: AlignmentType.CENTER }),
    paragraph(context.projectInfo.location, { alignment: AlignmentType.CENTER }),
    paragraph(`Audit Period: ${context.projectInfo.auditPeriod}`, { alignment: AlignmentType.CENTER }),
    paragraph(`Prepared By: ${context.projectInfo.preparedBy}`, { alignment: AlignmentType.CENTER }),
    new PageBreak(),

    paragraph("1. Executive Summary", { heading: HeadingLevel.HEADING_1 }),
    keyValueTable(model.executiveSummaryRows),
    new PageBreak(),

    paragraph("2. Facility and Billing Profile", { heading: HeadingLevel.HEADING_1 }),
    keyValueTable(model.facilityProfileRows),
    paragraph("Monthly Billing Summary", { heading: HeadingLevel.HEADING_2 }),
    makeTable(
      ["Month", "kWh", "kVAh", "Maximum Demand kVA", "PF", "Bill Amount Rs", "Average Tariff Rs/kWh"],
      model.monthlyBillRows.map((row) => [row.month, row.kwh, row.kvah, row.md, row.pf, row.billAmount, row.averageTariff])
    ),
    new PageBreak(),

    paragraph("3. Major Energy Consuming Systems", { heading: HeadingLevel.HEADING_1 }),
    makeTable(
      ["System", "Quantity", "Connected Load kW", "Annual Consumption kWh/year", "Share %", "Remarks"],
      model.connectedLoadRows.map((row) => [row.system, row.quantity, row.connectedLoad, row.annualConsumption, row.share, row.remarks])
    ),
    new PageBreak(),

    paragraph("4. ECM Summary", { heading: HeadingLevel.HEADING_1 }),
    makeTable(
      ["ECM No.", "Project Title", "System", "Energy Saving kWh/year", "Annual Saving Rs/year", "Investment Rs", "Payback, months"],
      model.ecmSummaryRows.map((row) => [row.ecmNo, row.projectTitle, row.system, row.energySaving, row.annualSaving, row.investment, row.paybackMonths])
    ),
    new PageBreak(),
  ];

  let currentSectionNumber = 5;

  if (model.hasExplicitEcmGrouping && model.groups && model.groups.length > 0) {
    children.push(paragraph(`${currentSectionNumber}. Group-wise ECM Summary`, { heading: HeadingLevel.HEADING_1 }));
    children.push(
      makeTable(
        ["Group", "ECM Count", "Energy Saving kWh/year", "Annual Saving Rs/year", "Investment Rs", "Payback, years"],
        model.groupSummaryRows.map((row) => [row.groupNo + " " + row.groupName, row.ecmCount, row.totalEnergySaving, row.totalAnnualSaving, row.totalInvestment, row.payback])
      )
    );
    children.push(new PageBreak());
    currentSectionNumber++;
  }

  children.push(paragraph(`${currentSectionNumber}. Detailed ECM Sheets`, { heading: HeadingLevel.HEADING_1 }));

  model.ecmDetails.forEach((detail, index) => {
    children.push(paragraph(`${currentSectionNumber}.${index + 1} ${detail.ecmNo}: ${detail.projectTitle}`, { heading: HeadingLevel.HEADING_2 }));
    children.push(
      keyValueTable([
        ["ECM No.", detail.ecmNo],
        ["Project title", detail.projectTitle],
        ["System", detail.system],
        ["Equipment covered", detail.equipmentCovered],
        ["Baseline kWh/year", detail.baselineKwhFormatted],
        ["Saving %", detail.savingPercentFormatted],
        ["Energy saving kWh/year", detail.energySavingFormatted],
        ["Annual saving Rs/year", detail.annualSavingFormatted],
        ["Investment Rs", detail.investmentFormatted],
        ["Payback, months", detail.paybackMonthsFormatted],
        ["Payback, years", detail.paybackYearsFormatted],
      ])
    );
    children.push(paragraph("Existing Condition", { heading: HeadingLevel.HEADING_3 }));
    children.push(paragraph(detail.existingCondition));
    children.push(paragraph("Problem / Gap", { heading: HeadingLevel.HEADING_3 }));
    children.push(paragraph(detail.problemGap));
    children.push(paragraph("Proposed Project", { heading: HeadingLevel.HEADING_3 }));
    children.push(paragraph(detail.proposedProject));
    children.push(paragraph("Project Activities", { heading: HeadingLevel.HEADING_3 }));
    detail.projectActivities.forEach((item) => children.push(bulletParagraph(item)));
    children.push(paragraph("Energy Saving Calculation", { heading: HeadingLevel.HEADING_3 }));
    children.push(keyValueTable(detail.energySavingCalculationRows));
    if (detail.costingBackup && detail.costingBackup.length) {
      children.push(paragraph("Costing Backup", { heading: HeadingLevel.HEADING_3 }));
      children.push(
        makeTable(
          ["Item", "Total Cost"],
          detail.costingBackup.map((item) => [item.item || item.section || item.implementationScope || "Costing item", formatInr(item.totalCost || item.purchasePrice || item.totalSellingCost || item.amount)])
        )
      );
    }
    children.push(paragraph("M&V Plan", { heading: HeadingLevel.HEADING_3 }));
    detail.mvPlan.forEach((item) => children.push(bulletParagraph(item)));
    children.push(paragraph("Benefits", { heading: HeadingLevel.HEADING_3 }));
    detail.benefits.forEach((item) => children.push(bulletParagraph(item)));
    children.push(paragraph("Conclusion", { heading: HeadingLevel.HEADING_3 }));
    detail.conclusion.forEach((item) => children.push(bulletParagraph(item)));
    if (index < model.ecmDetails.length - 1) children.push(new PageBreak());
  });

  currentSectionNumber++;
  children.push(new PageBreak());
  children.push(paragraph(`${currentSectionNumber}. Measurement & Verification Plan`, { heading: HeadingLevel.HEADING_1 }));
  children.push(
    makeTable(
      ["ECM No.", "Project Title", "M&V Plan"],
      model.consolidatedMvRows.map((row) => [row.ecmNo, row.projectTitle, row.mvPlan])
    )
  );

  currentSectionNumber++;
  children.push(new PageBreak());
  children.push(paragraph(`${currentSectionNumber}. Annexure A: Extracted Data Summary`, { heading: HeadingLevel.HEADING_1 }));
  children.push(keyValueTable(model.extractedDataSummaryRows));
  children.push(paragraph("PDF Parse Status", { heading: HeadingLevel.HEADING_2 }));
  children.push(keyValueTable(model.pdfStatusRows));

  currentSectionNumber++;
  children.push(new PageBreak());
  children.push(paragraph(`${currentSectionNumber}. Annexure B: Missing Inputs Required`, { heading: HeadingLevel.HEADING_1 }));
  children.push(
    makeTable(
      ["Section", "Missing Input", "Why Required", "Suggested Source", "Criticality"],
      model.missingInputsRows.map((row) => [row.section, row.missingInput, row.whyRequired, row.suggestedSource, row.criticality])
    )
  );

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

module.exports = {
  buildVrChennaiClientReadyModel,
  isVrChennaiReport,
  renderVrChennaiClientReadyDocx,
};
