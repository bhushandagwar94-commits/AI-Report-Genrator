const REPORT_COMPONENTS = [
  {
    id: "cover_page",
    title: "Cover Page",
    sourcePriority: ["form", "static"],
    allowLLM: false,
  },
  {
    id: "table_of_contents",
    title: "Table of Contents",
    sourcePriority: ["template", "grouping"],
    allowLLM: false,
  },
  {
    id: "executive_summary",
    title: "Chapter 1: Executive Summary",
    sourcePriority: ["excel_calculation", "form"],
    allowLLM: true,
    llmAllowedFields: [
      "purposeText",
      "keyObservations",
      "conclusionAndWayForward",
    ],
    lockedFields: [
      "numberOfProjects",
      "totalEnergySavingPotential",
      "totalAnnualCostSavingPotential",
      "totalEstimatedInvestment",
      "simplePaybackPeriod",
      "co2ReductionPotential",
    ],
  },
  {
    id: "plant_profile",
    title: "Chapter 2: Plant / Building Details and Energy Profile",
    sourcePriority: ["form", "documents", "excel"],
    allowLLM: true,
    llmAllowedFields: [
      "facilityDescription",
      "utilityDescription",
      "operatingPatternNarrative",
      "majorSystemsNarrative",
    ],
    lockedFields: [
      "facilityName",
      "address",
      "typeOfBuilding",
      "facilityContactPerson",
    ],
  },
  {
    id: "project_group",
    title: "Chapter 3: Projects",
    sourcePriority: ["excel", "calculation"],
    allowLLM: true,
    llmAllowedFields: [
      "summaryParagraph",
      "technicalObservation",
      "implementationStrategy",
      "groupConclusion",
    ],
    lockedFields: [
      "groupNo",
      "groupTitle",
      "projectCount",
      "totalInvestment",
      "totalAnnualSaving",
      "totalEnergySaving",
      "weightedPayback",
    ],
  },
  {
    id: "project_detail",
    title: "ECM Project Detail",
    sourcePriority: ["excel", "documents", "images"],
    allowLLM: true,
    llmAllowedFields: [
      "existingSystemDescription",
      "proposedProjectDescription",
      "rationaleForEnergySaving",
      "problemGapIdentified",
      "scopeOfWork",
      "keyActivities",
      "measurementVerificationPlan",
      "benefitsOtherThanEnergySaving",
      "finalConclusion",
    ],
    lockedFields: [
      "projectNo",
      "projectTitle",
      "equipmentCovered",
      "system",
      "groupTitle",
      "baselineConsumption",
      "expectedEnergySaving",
      "expectedAnnualCostSaving",
      "estimatedInvestment",
      "simplePaybackPeriod",
      "implementationDuration",
      "implementationPriority",
    ],
  },
  {
    id: "annexures",
    title: "Chapter 4: Annexures",
    sourcePriority: ["uploads", "images"],
    allowLLM: false,
  },
];

function getReportComponentDefinition(id) {
  return REPORT_COMPONENTS.find((component) => component.id === id) || null;
}

module.exports = {
  REPORT_COMPONENTS,
  getReportComponentDefinition,
};
