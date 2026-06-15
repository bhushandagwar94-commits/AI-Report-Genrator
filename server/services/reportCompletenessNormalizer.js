const { formatInr } = require("./reportFormattingService");

function parseIndianNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const cleaned = String(value)
    .replace(/₹/g, "")
    .replace(/Rs.?/gi, "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (!cleaned) return null;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function calculatePaybackMonths(investmentRs, annualSavingRs) {
  const investment = parseIndianNumber(investmentRs);
  const annualSaving = parseIndianNumber(annualSavingRs);

  if (investment === null || annualSaving === null || annualSaving <= 0) return null;
  if (investment === 0 && annualSaving > 0) return 0;

  return Number(((investment / annualSaving) * 12).toFixed(2));
}

function calculatePaybackYears(investmentRs, annualSavingRs) {
  const months = calculatePaybackMonths(investmentRs, annualSavingRs);
  if (months === null) return null;
  if (months === 0) return 0;
  return Number((months / 12).toFixed(2));
}

function inferEquipmentCovered(ecm) {
  const text = `${ecm.projectTitle || ""} ${ecm.system || ""}`.toLowerCase();

  if (text.includes("contract demand")) return "Electrical billing and demand management";
  if (text.includes("cooling tower")) return "Cooling tower fan / condenser water system";
  if (text.includes("chiller")) return "Chiller plant system";
  if (text.includes("condenser pump")) return "Condenser water pump system";
  if (text.includes("primary pump")) return "Primary chilled water pump system";
  if (text.includes("secondary pump")) return "Secondary chilled water pump system";
  if (text.includes("stp blower")) return "STP blower motor drive system";
  if (text.includes("ahu")) return "AHU fan / plug fan system";
  if (text.includes("air washer")) return "Air washer fan system";
  if (text.includes("heat recovery")) return "Heat recovery wheel / ventilation fan system";
  if (text.includes("scrubber")) return "Scrubber ventilation motor system";

  return "To be updated";
}

function buildExistingCondition(ecm) {
  const title = ecm.projectTitle || `ECM ${ecm.ecmNo || ""}`;
  const system = ecm.system || ecm.equipmentCovered || "identified system";

  if (/contract demand/i.test(title)) {
    return "The facility is supplied under an HT tariff with contract demand billing. Monthly demand and billing records indicate that demand-side optimization is relevant for reducing fixed demand charges while maintaining operational reliability. The existing demand profile should be reviewed against recorded maximum demand and utility billing conditions before implementation.";
  }

  if (/chiller|cooling tower|condenser/i.test(`${title} ${system}`)) {
    return `The ${system} forms part of the central HVAC/chiller plant operation and contributes significantly to the facility energy consumption. Existing performance depends on operating setpoints, heat transfer condition, equipment loading, control logic and maintenance condition. The current operating parameters should be verified through BMS trends, field measurements and equipment inspection before implementation.`;
  }

  if (/pump/i.test(`${title} ${system}`)) {
    return `The ${system} operates as part of the chilled/condenser water circulation network. Existing energy use depends on motor efficiency, flow/head requirement, control method, differential pressure and operating hours. Current pump loading and operating profile should be verified before implementation.`;
  }

  if (/blower|ahu|air washer|plug fan|scrubber|ventilation|fan/i.test(`${title} ${system}`)) {
    return `The ${system} is used for air movement/ventilation duty and operates based on airflow and process or comfort requirements. Existing performance depends on fan type, motor efficiency, drive arrangement, static pressure, operating hours and control method. Field verification of airflow, static pressure and motor loading is required before final implementation.`;
  }

  return `The ${system} has been identified as an energy saving opportunity based on the uploaded audit data and ECM schedule. Existing operation should be verified at site to confirm loading pattern, operating hours, control settings and baseline performance before implementation.`;
}

function buildProblemGap(ecm) {
  const title = ecm.projectTitle || `ECM ${ecm.ecmNo || ""}`;
  const system = ecm.system || ecm.equipmentCovered || "identified system";

  if (/contract demand/i.test(title)) {
    return "The present contract demand may not be fully aligned with the actual recorded demand profile, resulting in avoidable fixed demand charges. Demand optimization can reduce billing cost while ensuring that the revised demand remains adequate for site operation and does not create penalty risk.";
  }

  if (/set point|sequencing|optimization|operation/i.test(title)) {
    return `The main gap is sub-optimal operating strategy or control logic in the ${system}. Improved sequencing, setpoint optimization and demand-based control can reduce avoidable energy consumption without compromising comfort or operational requirements.`;
  }

  if (/retrofit|motor|vfd|pms|ie5|ie4/i.test(title)) {
    return `The existing arrangement may involve lower efficiency motors, fixed-speed operation or less efficient drive/control configuration. Retrofitting with high-efficiency motors and VFD/control automation can reduce electrical consumption while maintaining required process performance.`;
  }

  if (/cooling tower|fins|fan blade|performance/i.test(title)) {
    return "Cooling tower performance deterioration due to fouling, damaged fins, sub-optimal airflow or fan blade settings can increase condenser water temperature and chiller energy consumption. Restoring cooling tower performance improves heat rejection and reduces chiller power.";
  }

  return `The key gap is the difference between current operating practice or equipment performance and the improved condition proposed under this ECM. The measure is expected to reduce avoidable energy consumption after field verification of pending technical inputs.`;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap(v => normalizeList(v))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|;|,(?=\s*[A-Z])/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  return [];
}

function buildProjectActivities(ecm) {
  const system = ecm.system || ecm.equipmentCovered || "identified system";

  return [
    `Verify existing condition and operating parameters of ${system}.`,
    "Confirm implementation scope, baseline values and operating hours.",
    "Finalize equipment selection, control strategy and implementation methodology.",
    "Implement the recommended retrofit, control or optimization measure.",
    "Record post-implementation performance and compare with baseline.",
    "Document savings through the M&V process."
  ];
}

function buildBenefits(ecm) {
  const system = ecm.system || ecm.equipmentCovered || "identified system";
  const annualSaving = ecm.annualSavingRs ? `Supports annual cost saving of ${formatInr(ecm.annualSavingRs)} based on extracted ECM data.` : "Supports electricity cost reduction after implementation.";

  return [
    `Reduces energy consumption in the ${system}.`,
    annualSaving,
    "Improves operating reliability, controllability and performance monitoring.",
    "Supports structured implementation and measurable energy performance improvement."
  ];
}

function buildConclusion(ecm) {
  const title = ecm.projectTitle || `ECM ${ecm.ecmNo || ""}`;
  const payback = ecm.paybackMonths === 0
    ? "The measure has immediate payback as no investment is indicated."
    : ecm.paybackMonths
    ? `The estimated simple payback is ${ecm.paybackMonths} months.`
    : "Final payback should be updated after pending inputs are verified.";

  return `The ECM titled "${title}" is recommended for implementation subject to verification of pending site inputs and finalization of scope. ${payback} The project should be prioritized based on operational feasibility, savings impact and implementation readiness.`;
}

function formatPercentFixed(value) {
  const n = parseIndianNumber(value);
  if (n === null) return "To be updated";

  // If source already has % string, preserve numeric meaning
  if (String(value).includes("%")) return `${Number(n.toFixed(2))}%`;

  // If value is between 0 and 100, treat it as already percent
  if (n >= 0 && n <= 100) return `${Number(n.toFixed(2))}%`;

  return `${Number(n.toFixed(2))}%`;
}

function normalizeReportCompleteness(reportData) {
  if (!reportData) return reportData;

  let blankPaybackCount = 0;
  let toBeUpdatedExistingConditionCount = 0;
  let toBeUpdatedProblemGapCount = 0;
  let oneLineProjectActivitiesCount = 0;
  let oldPlaceholderCount = 0;
  let annexureBRowsBefore = 0;
  let annexureBRowsAfter = 0;
  let wrongSharePercentCount = 0;

  // Process groups and projects
  const groups = Array.isArray(reportData.groups) ? reportData.groups : (Array.isArray(reportData.groupedProjects) ? reportData.groupedProjects : []);
  for (const group of groups) {
    const projects = Array.isArray(group.projects) ? group.projects : [];
    for (const ecm of projects) {
      
      // Fix old placeholders
      ["existingCondition", "existingSystemDescription", "problemGapIdentified", "equipmentCovered", "projectActivities", "benefitsOtherThanEnergySaving", "conclusion", "finalConclusion", "scopeOfWork"].forEach(key => {
        if (typeof ecm[key] === "string" && ecm[key].includes("To be updated after site data verification")) {
          ecm[key] = "To be updated";
          oldPlaceholderCount++;
        }
      });

      // Payback Calculation
      const pm = calculatePaybackMonths(ecm.investment || ecm.investmentRs, ecm.annualSaving || ecm.annualSavingRs);
      if (pm !== null) {
        ecm.paybackMonths = pm;
        ecm.paybackYears = calculatePaybackYears(ecm.investment || ecm.investmentRs, ecm.annualSaving || ecm.annualSavingRs);
        if (ecm.payback === null || ecm.payback === undefined || ecm.payback === "" || ecm.payback === "To be updated") {
           ecm.payback = pm === 0 ? "Immediate" : `${pm} months`;
        }
      } else {
        if (!ecm.payback || ecm.payback === "To be updated") {
            blankPaybackCount++;
        }
      }

      // Baseline and Saving Percent
      const baseline = parseIndianNumber(ecm.baselineKwh);
      const saving = parseIndianNumber(ecm.energySavingKwh || ecm.energySaving);
      let savingPercent = parseIndianNumber(ecm.savingPercent);

      if (baseline !== null && saving !== null && savingPercent === null) {
        savingPercent = (saving / baseline) * 100;
        ecm.savingPercent = `${savingPercent.toFixed(2)}%`;
      } else if (savingPercent !== null && saving !== null && baseline === null) {
        if (savingPercent > 0) {
          ecm.baselineKwh = saving / (savingPercent / 100);
        }
      }

      if (!ecm.baselineKwh) ecm.baselineKwh = "To be updated";
      if (!ecm.savingPercent) ecm.savingPercent = "To be updated";

      // Equipment Covered
      if (!ecm.equipmentCovered || ecm.equipmentCovered === "To be updated") {
        ecm.equipmentCovered = inferEquipmentCovered(ecm);
      }

      // Existing Condition
      const existingCondKey = ecm.existingSystemDescription ? 'existingSystemDescription' : 'existingCondition';
      if (!ecm[existingCondKey] || ecm[existingCondKey] === "To be updated" || ecm[existingCondKey].length < 15) {
        ecm[existingCondKey] = buildExistingCondition(ecm);
        toBeUpdatedExistingConditionCount++;
      }

      // Problem Gap
      const problemGapKey = ecm.problemGapIdentified ? 'problemGapIdentified' : 'problemGap';
      if (!ecm[problemGapKey] || ecm[problemGapKey] === "To be updated" || ecm[problemGapKey].length < 15) {
        ecm[problemGapKey] = buildProblemGap(ecm);
        toBeUpdatedProblemGapCount++;
      }

      // Project Activities
      const projActKey = ecm.projectActivities ? 'projectActivities' : 'scopeOfWork';
      let actList = normalizeList(ecm[projActKey]);
      if (actList.length === 0 || (actList.length === 1 && actList[0].includes(','))) {
        actList = buildProjectActivities(ecm);
        oneLineProjectActivitiesCount++;
      }
      ecm[projActKey] = actList;

      // Benefits
      const benefitsKey = ecm.benefitsOtherThanEnergySaving ? 'benefitsOtherThanEnergySaving' : 'benefits';
      if (!ecm[benefitsKey] || ecm[benefitsKey] === "To be updated" || (Array.isArray(ecm[benefitsKey]) && ecm[benefitsKey].length === 0)) {
        ecm[benefitsKey] = buildBenefits(ecm);
      }

      // Conclusion
      const conclusionKey = ecm.conclusion ? 'conclusion' : (ecm.finalConclusion ? 'finalConclusion' : 'conclusion');
      if (!ecm[conclusionKey] || ecm[conclusionKey] === "To be updated" || ecm[conclusionKey].length < 15) {
        ecm[conclusionKey] = buildConclusion(ecm);
      }
    }
  }

  // Chapter 1 Narrative
  if (!reportData.executiveSummaryNarrative) {
      reportData.executiveSummaryNarrative = {};
  }
  
  reportData.executiveSummaryNarrative.purposeOfEnergyAudit = "The purpose of this energy audit is to evaluate the electrical energy consumption pattern of the facility, identify major energy-consuming systems, and develop technically and financially viable energy conservation measures. The audit focuses on reducing energy cost, improving system efficiency, and supporting structured implementation of ECMs.";
  reportData.executiveSummaryNarrative.keyObjectives = [
    "Analyse monthly electricity consumption, demand, power factor and tariff impact.",
    "Identify major energy-consuming systems and quantify their contribution to annual consumption.",
    "Evaluate energy conservation measures with estimated savings, investment and payback.",
    "Provide a prioritized implementation roadmap for operational and capital improvement projects."
  ];
  reportData.executiveSummaryNarrative.conclusionAndWayForward = "The audit has identified a portfolio of energy conservation measures with measurable energy and cost saving potential. The recommended way forward is to validate pending site inputs, prioritize short-payback measures, finalize implementation responsibilities, and monitor savings through a structured M&V plan.";

  // Map to executiveSummary object if exists
  if (reportData.executiveSummary) {
      reportData.executiveSummary.purposeOfEnergyAudit = reportData.executiveSummaryNarrative.purposeOfEnergyAudit;
      reportData.executiveSummary.keyObjectives = reportData.executiveSummaryNarrative.keyObjectives;
      reportData.executiveSummary.conclusionAndWayForward = reportData.executiveSummaryNarrative.conclusionAndWayForward;
      reportData.executiveSummary.keyObservations = reportData.executiveSummaryNarrative.keyObservations || [];
  }
  reportData.purposeOfEnergyAudit = reportData.executiveSummaryNarrative.purposeOfEnergyAudit;
  reportData.keyObjectives = reportData.executiveSummaryNarrative.keyObjectives;
  reportData.conclusionAndWayForward = reportData.executiveSummaryNarrative.conclusionAndWayForward;

  // Fix percentage display
  if (reportData.majorEnergyConsumingSystems) {
      reportData.majorEnergyConsumingSystems.forEach(sys => {
          if (sys.sharePercent !== undefined && sys.sharePercent !== null) {
              const strVal = String(sys.sharePercent);
              const numVal = parseIndianNumber(strVal);
              if (numVal !== null && numVal <= 1 && !strVal.includes("%")) {
                  // This is to detect if it originally had 96% instead of 0.96%
                  wrongSharePercentCount++;
              }
              sys.sharePercent = formatPercentFixed(sys.sharePercent);
          }
      });
  }

  // Annexure B Cleanup
  if (reportData.missingFieldSummary && Array.isArray(reportData.missingFieldSummary.annexureBRows)) {
      annexureBRowsBefore = reportData.missingFieldSummary.annexureBRows.length;
      
      const genuineMissingFields = [
        "built-up area",
        "conditioned area",
        "chiller tr rating",
        "pump head and flow",
        "ahu cfm/static pressure",
        "co2 emission factor",
      ];
      
      reportData.missingFieldSummary.annexureBRows = reportData.missingFieldSummary.annexureBRows.filter(row => {
          const field = String(row.missingField).toLowerCase();
          const ecmTitle = String(row.ecmTitle).toLowerCase();
          
          if (field.includes("existing condition") || field.includes("problem") || field.includes("project activities") || field.includes("payback")) {
              return false; // Deterministically filled
          }
          
          // Check baseline and saving percent
          if (field.includes("baseline") || field.includes("saving %")) {
               // find corresponding ECM
               let foundEcm = null;
               for (const g of groups) {
                   const matched = (g.projects || []).find(p => String(p.projectTitle || p.title || p.ecmName).toLowerCase() === ecmTitle);
                   if (matched) { foundEcm = matched; break; }
               }
               
               if (foundEcm) {
                   if (field.includes("baseline") && foundEcm.baselineKwh !== "To be updated") return false;
                   if (field.includes("saving %") && foundEcm.savingPercent !== "To be updated") return false;
               }
          }
          
          return true;
      });
      
      annexureBRowsAfter = reportData.missingFieldSummary.annexureBRows.length;
  }

  console.log("[COMPLETENESS_FINAL_CHECK]", {
    blankPaybackCount,
    toBeUpdatedExistingConditionCount,
    toBeUpdatedProblemGapCount,
    oneLineProjectActivitiesCount,
    oldPlaceholderCount,
    wrongSharePercentCount,
    annexureBRowsBefore,
    annexureBRowsAfter
  });

  return reportData;
}

module.exports = {
  normalizeReportCompleteness,
  parseIndianNumber,
  calculatePaybackMonths,
  calculatePaybackYears,
  inferEquipmentCovered,
  buildExistingCondition,
  buildProblemGap,
  normalizeList,
  buildProjectActivities,
  buildBenefits,
  buildConclusion,
  formatPercentFixed
};
