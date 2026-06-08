const {
  buildExtractedDataContext,
  cleanText,
} = require("./extractedDataContextService");
const {
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

const PLACEHOLDER_MARKERS = [
  "",
  "-",
  "na",
  "n/a",
  "null",
  "undefined",
  "client name",
  "to be updated after site data verification",
  "calculation pending",
  "not available",
  "placeholder",
  "tbd",
];

function isBlankOrPlaceholder(value) {
  if (value === null || value === undefined) return true;
  const text = cleanText(value).toLowerCase();
  return !text || PLACEHOLDER_MARKERS.some((marker) => text.includes(marker));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function ensure(target, key, fallback) {
  if (!target[key] || typeof target[key] !== "object") target[key] = fallback;
  return target[key];
}

function addMissingInput(context, section, missingInput, whyRequired, suggestedSource, criticality = "Medium") {
  const exists = context.missingInputs.some(
    (item) => cleanText(item.section) === cleanText(section) && cleanText(item.missingInput) === cleanText(missingInput)
  );
  if (!exists) {
    context.missingInputs.push({ section, missingInput, whyRequired, suggestedSource, criticality });
  }
}

function fill(target, key, value, summary, context, options = {}) {
  summary.fieldsChecked += 1;
  if (!target || typeof target !== "object") return;
  if (!isBlankOrPlaceholder(target[key])) return;

  if (value === null || value === undefined || value === "") {
    summary.fieldsStillMissing += 1;
    if (options.missing) {
      addMissingInput(
        context,
        options.missing.section,
        options.missing.label || key,
        options.missing.whyRequired,
        options.missing.suggestedSource,
        options.missing.criticality
      );
    }
    return;
  }

  target[key] = value;
  summary.fieldsFilled += 1;
}

function bulletize(text) {
  if (isBlankOrPlaceholder(text)) return null;
  const items = cleanText(text)
    .split(/\r?\n|;|\.\s+(?=[A-Z0-9])/)
    .map((item) => cleanText(item.replace(/^[•*\-\d.)\s]+/, "")))
    .filter(Boolean);
  const uniqueItems = [...new Set(items)];
  return uniqueItems.length ? uniqueItems.map((item) => `- ${item}`).join("\n") : null;
}

function mapMonthlyBills(context, reportData, summary) {
  const chapter2 = ensure(reportData, "chapter2", {});
  const billingSummary = ensure(chapter2, "billingSummary", {});
  const electrical = ensure(chapter2, "electricalSupplyDetails", {});
  const general = ensure(chapter2, "generalInformation", {});
  const utility = ensure(chapter2, "utilitySources", {});
  const profile = context.electricalProfile;
  const info = context.projectInfo;

  fill(general, "facilityName", info.facilityName, summary, context, {
    missing: {
      section: "Facility and Billing Profile",
      label: "Facility Name",
      whyRequired: "Required for the client-facing cover and facility profile.",
      suggestedSource: "Electricity bill / client data",
      criticality: "High",
    },
  });
  fill(general, "clientName", info.clientName, summary, context, {
    missing: {
      section: "Facility and Billing Profile",
      label: "Client Name",
      whyRequired: "Required for the client-facing cover and profile.",
      suggestedSource: "Electricity bill / client data",
      criticality: "High",
    },
  });
  fill(general, "address", info.address, summary, context);
  fill(general, "location", info.location, summary, context);
  fill(general, "buildingType", info.buildingType, summary, context);
  fill(general, "auditPeriod", info.auditPeriod, summary, context);

  fill(electrical, "serviceNo", profile.serviceNo, summary, context, {
    missing: {
      section: "Facility and Billing Profile",
      label: "Service No.",
      whyRequired: "Required to validate real billing rows.",
      suggestedSource: "Electricity bill",
      criticality: "High",
    },
  });
  fill(electrical, "consumerNumber", profile.consumerNumber || profile.serviceNo, summary, context);
  fill(electrical, "tariffCategory", profile.tariffCategory, summary, context);
  fill(electrical, "contractDemand", formatKva(profile.contractDemandKva), summary, context);
  fill(electrical, "supplyVoltage", cleanText(profile.supplyVoltage || profile.supplyVoltageKv), summary, context);
  fill(electrical, "transformerCapacity", formatKva(profile.transformerCapacityKva), summary, context);
  fill(electrical, "averageTariff", profile.averageTariff ? `${formatInr(profile.averageTariff)}/kWh` : "", summary, context);

  fill(utility, "annualConsumption", formatKwh(profile.annualKwh, "kWh"), summary, context);
  fill(utility, "annualCost", formatInr(profile.annualBillAmount), summary, context);

  const rows = context.monthlyBills.map((bill) => {
    let kwh = bill.totalKwh;
    let kvah = bill.totalKvah;
    let pf = bill.powerFactor;
    let status = "valid";
    
    if (kwh > 0 && kvah > 0) {
      const calculatedPf = kwh / kvah;
      if (calculatedPf > 1.02 || calculatedPf < 0.7) {
        status = "requires_verification";
        console.log("[MONTHLY_BILL_VALIDATION]", {
          month: bill.monthLabel,
          kwh,
          kvah,
          calculatedPf,
          status
        });
        kvah = "Verify from bill PDF";
        pf = "Verify from bill PDF";
      } else {
        pf = calculatedPf;
      }
    }
    
    return {
      month: bill.monthLabel,
      kwh: formatKwh(kwh, "kWh"),
      kvah: typeof kvah === "string" ? kvah : formatKvah(kvah),
      maximumDemandKva: formatKva(bill.recordedDemandKva),
      pf: typeof pf === "string" ? pf : formatPf(pf),
      billAmount: formatInr(bill.netAmountPayable),
      averageTariff: bill.totalKwh > 0 ? `${formatInr(bill.netAmountPayable / bill.totalKwh)}/kWh` : "",
    };
  });

  if (rows.length) {
    billingSummary.monthlyBills = rows;
    reportData.monthlyBillingSummary = rows;
    summary.fieldsFilled += 1;
  }

  fill(billingSummary, "annualKwh", formatKwh(profile.annualKwh, "kWh"), summary, context);
  fill(billingSummary, "annualKvah", formatKvah(profile.annualKvah), summary, context);
  fill(billingSummary, "annualCost", formatInr(profile.annualBillAmount), summary, context);
  fill(billingSummary, "averageTariff", profile.averageTariff ? `${formatInr(profile.averageTariff)}/kWh` : "", summary, context);
  fill(billingSummary, "maxRecordedDemand", formatKva(profile.maxRecordedDemandKva), summary, context);
  fill(billingSummary, "averageRecordedDemand", formatKva(profile.averageRecordedDemandKva), summary, context);
}

function mapConnectedLoad(context, reportData) {
  reportData.connectedLoad = context.connectedLoad;
  const totalAnnualConsumption = (context.connectedLoad.majorSystems || []).reduce(
    (sum, row) => sum + Number(row.totalAnnualConsumption || 0),
    0
  );

  reportData.majorEnergyConsumingSystems = context.connectedLoad.majorSystems.map((row) => {
    const sharePercentRaw = totalAnnualConsumption > 0
      ? (Number(row.totalAnnualConsumption || 0) / totalAnnualConsumption) * 100
      : null;

    return {
      system: row.assetType,
      quantity: row.quantity,
      connectedLoad: formatKw(row.totalKw),
      annualConsumption: formatKwh(row.totalAnnualConsumption, "kWh"),
      percentageShare: sharePercentRaw !== null ? formatPercent(sharePercentRaw) : "",
      remarks: row.remarks,
    };
  });
  reportData.hvacSystemDetails = context.connectedLoad.summaryByAssetType
    .filter((row) => /chiller|cooling tower|ahu|air washer|heat recovery/i.test(row.assetType))
    .map((row) => ({
      equipment: row.assetType,
      quantity: row.quantity,
      connectedLoad: formatKw(row.totalKw),
      annualConsumption: formatKwh(row.totalAnnualConsumption, "kWh"),
      remarks: row.remarks,
    }));
  reportData.pumpAndMotorDetails = context.connectedLoad.summaryByAssetType
    .filter((row) => /pump|blower|scrubber/i.test(row.assetType))
    .map((row) => ({
      name: row.assetType,
      quantity: row.quantity,
      rating: formatKw(row.totalKw),
      annualConsumption: formatKwh(row.totalAnnualConsumption, "kWh"),
      remarks: row.remarks,
    }));
}

function applyProjectMappings(context, reportData, summary) {
  const projectsByEcm = new Map(context.ecmProjects.map((project) => [project.ecmNo, project]));
  const groups = Array.isArray(reportData.groups) ? reportData.groups : [];

  groups.forEach((group) => {
    const firstProjectTargetNo = String(group.projects?.[0]?.ecmNo || group.projects?.[0]?.projectNo || "").replace(/\D/g, "");
    const firstProjectSource = Array.from(projectsByEcm.values()).find(p => String(p.ecmNo).replace(/\D/g, "") === firstProjectTargetNo) || {};
    group.groupName = group.groupTitle = firstProjectSource.groupName || group.groupName || group.groupTitle;
    group.projects = (group.projects || []).map((project) => {
      const targetNo = String(project.ecmNo || project.projectNo || "").replace(/\D/g, "");
      const source = Array.from(projectsByEcm.values()).find(p => String(p.ecmNo).replace(/\D/g, "") === targetNo) || {};
      const ecmNo = source.ecmNo || project.ecmNo || project.projectNo;
      const costingBackup = context.costing.matchedCostingByEcm?.[ecmNo] || null;

      project.ecmNo = ecmNo;
      project.projectNo = ecmNo;
      project.groupNo = source.groupNo || group.groupNo;
      project.groupName = source.groupName || group.groupName || group.groupTitle;
      project.groupTitle = project.groupName;
      project.projectTitle = source.projectTitle || project.projectTitle || project.title;
      project.title = project.projectTitle;
      project.system = source.system || project.system;
      function getConnectedLoadMatch(ecmNoStr) {
        let pattern = null;
        if (["2", "3"].includes(String(ecmNoStr))) pattern = /cooling tower/i;
        else if (["4", "5", "18"].includes(String(ecmNoStr))) pattern = /chiller/i;
        else if (["6"].includes(String(ecmNoStr))) pattern = /condenser pump/i;
        else if (["7"].includes(String(ecmNoStr))) pattern = /primary chw pump/i;
        else if (["8"].includes(String(ecmNoStr))) pattern = /secondary chw pump/i;
        else if (["9"].includes(String(ecmNoStr))) pattern = /stp blower/i;
        else if (["10"].includes(String(ecmNoStr))) pattern = /ahu/i;
        else if (["11"].includes(String(ecmNoStr))) pattern = /air washer/i;
        else if (["12"].includes(String(ecmNoStr))) pattern = /heat recovery/i;
        else if (["13"].includes(String(ecmNoStr))) pattern = /scrubber/i;

        if (!pattern) return null;
        const matchedRows = (context.connectedLoad?.majorSystems || []).filter(r => pattern.test(r.assetType));
        if (!matchedRows.length) return null;
        const totalKw = matchedRows.reduce((sum, r) => sum + Number(r.totalKw || 0), 0);
        const annualConsumption = matchedRows.reduce((sum, r) => sum + Number(r.totalAnnualConsumption || 0), 0);
        const quantity = matchedRows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
        
        return { quantity, totalKw, annualConsumption, matchedAssetType: matchedRows[0].assetType };
      }

      const match = getConnectedLoadMatch(ecmNo);
      let connectedLoadText = "";
      if (match) {
        project.connectedLoadMatch = match;
        connectedLoadText = `The connected-load summary identifies ${match.quantity} ${match.matchedAssetType} equipment rows with total connected load of ${formatKw(match.totalKw)} and annual consumption of ${formatKwh(match.annualConsumption, "kWh/year")}.`;
      }

      project.equipmentCovered = source.equipmentName || project.equipmentCovered;
      
      let existingCondition = source.baselineNotes;
      if (!existingCondition && connectedLoadText) {
         existingCondition = `${source.equipmentName ? source.equipmentName + " is installed. " : ""}${connectedLoadText}`;
      }
      if (!existingCondition) existingCondition = "Detailed existing condition is listed in Annexure B.";
      
      project.existingSystemDescription = cleanText(existingCondition);
      
      project.problemGapIdentified = cleanText(source.rationaleForEnergySaving || source.savingPotentialRange || project.problemGapIdentified);
      project.proposedProject = cleanText([source.projectTitle, source.briefInformationAdvantages].filter(Boolean).join(". "));
      project.proposedProjectDescription = project.proposedProject;
      project.rationaleForEnergySaving = cleanText([source.rationaleForEnergySaving, source.savingPotentialRange].filter(Boolean).join(". "));
      project.keyActivities = bulletize(source.projectActivities);
      if (!project.keyActivities || project.keyActivities.length === 0) {
        project.keyActivities = ["Detailed implementation steps are not available in uploaded data and are listed in Annexure B for site verification."];
      }
      project.measurementVerificationPlan = bulletize(`Measure baseline and post-implementation performance for ${source.system || "the system"}; verify kW, operating hours, and key operating parameters; reconcile savings with real operating conditions.`);
      project.benefits = bulletize(`Improved operating efficiency; reduced electricity cost; better system control for ${source.system || "the targeted system"}.`);
      project.conclusion = bulletize(`Technically aligned with the extracted ECM source; economics based on extracted saving and investment values; proceed after final field verification if remaining inputs are listed in Annexure B.`);

      project.baselineTable = project.baselineTable || {};
      project.baselineTable.baselineAnnualConsumption = formatKwh(source.baselineKwhPerYearRaw, "kWh/year") || "Verify from ECM sheet";
      project.baselineTable.expectedEnergySaving = formatKwh(source.energySavingRaw, "kWh/year");
      project.baselineTable.expectedAnnualCostSaving = formatInr(source.annualSavingRaw);
      project.baselineTable.estimatedInvestment = formatInr(source.investmentRaw);
      project.baselineTable.percentageSaving = formatPercent(source.savingPercentRaw) || "Verify from ECM sheet";
      project.baselineTable.simplePaybackPeriodMonths = formatMonths(source.paybackMonthsRaw);
      project.baselineTable.simplePaybackPeriodYears = formatYears(source.paybackYearsRaw);

      project.energySaving = formatKwh(source.energySavingRaw, "kWh/year");
      project.annualSaving = formatInr(source.annualSavingRaw);
      project.investment = formatInr(source.investmentRaw);
      project.payback = formatMonths(source.paybackMonthsRaw);
      project.expectedEnergySaving = project.energySaving;
      project.expectedAnnualCostSaving = project.annualSaving;
      project.estimatedInvestment = project.investment;
      project.simplePaybackPeriod = formatYears(source.paybackYearsRaw);

      if (costingBackup?.length) {
        project.boqItems = costingBackup;
        project.costingBackup = costingBackup;
        project.vendorScope = costingBackup.map((item) => item.scope).filter(Boolean);
        project.estimatedImplementationScope = costingBackup.map((item) => item.item).filter(Boolean);
      } else if (/ECM (6|7|8|9|10|11|12|13)/.test(ecmNo || "")) {
        addMissingInput(
          context,
          "ECM Costing",
          `Costing backup not found for ${ecmNo}.`,
          "Required to support cost justification and BOQ backup.",
          "Costing / Blower Costing sheet",
          "High"
        );
      }

      if (!source.projectActivities) {
        addMissingInput(context, "Detailed ECM Sheets", `${ecmNo} project activities`, "Required to create the implementation activity list.", "ECM sheet", "Medium");
      }
      if (!source.baselineKwhPerYearRaw) {
        addMissingInput(context, "Detailed ECM Sheets", `${ecmNo} baseline kWh/year`, "Required to present the baseline in the ECM summary.", "ECM sheet", "High");
      }

      summary.fieldsFilled += 1;
      return project;
    });
  });

  const regrouped = [];
  const exactGroups = [
    ["GR-1", "Electrical Billing and Demand Optimization"],
    ["GR-2", "Chiller Plant and Cooling Tower Optimization"],
    ["GR-3", "Pumping System Optimization"],
    ["GR-4", "Air Handling, Ventilation and Blower Optimization"],
  ];

  exactGroups.forEach(([groupNo, groupName]) => {
    const projects = groups.flatMap((group) => group.projects || []).filter((project) => project.groupNo === groupNo);
    if (projects.length) regrouped.push({ groupNo, groupName, groupTitle: groupName, projects });
  });

  if (regrouped.length) {
    reportData.groups = regrouped;
    reportData.groupedProjects = regrouped;
  }
}

function buildAnnexures(context, reportData) {
  reportData.annexures = reportData.annexures || {};
  reportData.annexures.extractedDataSummary = {
    projectInfo: context.projectInfo,
    electricalProfile: {
      ...context.electricalProfile,
      contractDemandKva: formatKva(context.electricalProfile.contractDemandKva),
      permittedMdKva: formatKva(context.electricalProfile.permittedMdKva),
      transformerCapacityKva: formatKva(context.electricalProfile.transformerCapacityKva),
      averagePowerFactor: formatPf(context.electricalProfile.averagePowerFactor),
      annualKwh: formatKwh(context.electricalProfile.annualKwh, "kWh"),
      annualKvah: formatKvah(context.electricalProfile.annualKvah),
      annualBillAmount: formatInr(context.electricalProfile.annualBillAmount),
      averageTariff: context.electricalProfile.averageTariff ? `${formatInr(context.electricalProfile.averageTariff)}/kWh` : "",
      maxRecordedDemandKva: formatKva(context.electricalProfile.maxRecordedDemandKva),
      averageRecordedDemandKva: formatKva(context.electricalProfile.averageRecordedDemandKva),
    },
    monthlyBillCount: context.monthlyBills.length,
    ecmCount: context.ecmProjects.length,
    connectedLoadSystems: context.connectedLoad.summaryByAssetType.length,
  };
  reportData.annexures.missingInputsRequired = context.missingInputs;
}

function autoFillMissingReportFields(reportData = {}, extractedData = {}) {
  const cloned = clone(reportData);
  const context = extractedData.projectInfo && extractedData.electricalProfile
    ? clone(extractedData)
    : buildExtractedDataContext(extractedData.uploadedFiles || [], extractedData);

  const summary = {
    fieldsChecked: 0,
    fieldsFilled: 0,
    fieldsStillMissing: 0,
  };

  mapMonthlyBills(context, cloned, summary);
  mapConnectedLoad(context, cloned);
  applyProjectMappings(context, cloned, summary);
  buildAnnexures(context, cloned);

  cloned.autoFillApplied = true;
  cloned.autoFillSummary = summary;
  cloned.extractedDataContext = context;

  return {
    reportData: cloned,
    autoFillSummary: {
      ...summary,
      missingInputsCount: context.missingInputs.length,
    },
    extractedDataContext: context,
  };
}

module.exports = {
  autoFillMissingReportFields,
  buildExtractedDataContext,
  isBlankOrPlaceholder,
};
