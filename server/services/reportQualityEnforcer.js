const { normalizeReportGroups } = require("../utils/groupHelper");
const MIN_THEORY_WORDS = 800;
const MAX_THEORY_WORDS = 1400;

const THEORY_FIELDS = [
  "existingSystemDescription",
  "problemGapIdentified",
  "proposedProject",
  "rationaleForEnergySaving",
  "measurementVerificationPlan",
  "benefitsOtherThanEnergySaving",
  "conclusion",
  "groupObservation",
  "implementationFocus"
];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function stripBulletPrefix(text) {
  return String(text || "").replace(/^[•\-\*\d.)\s]+/, "").trim();
}

function splitToBullets(text) {
  const raw = String(text || "").trim();

  if (!raw) return [];

  if (raw.includes("•")) {
    return raw
      .split("•")
      .map(stripBulletPrefix)
      .filter(Boolean);
  }

  return raw
    .split(/(?<=[.!?])\s+/)
    .map(stripBulletPrefix)
    .filter(Boolean);
}

function toBulletString(bullets) {
  return safeArray(bullets)
    .map(stripBulletPrefix)
    .filter(Boolean)
    .map((item) => `• ${item}`)
    .join("\n");
}

function trimToMaxWords(bulletText, maxWords = MAX_THEORY_WORDS) {
  const bullets = splitToBullets(bulletText);
  const accepted = [];
  let words = 0;

  for (const bullet of bullets) {
    const wc = countWords(bullet);
    if (words + wc > maxWords) break;
    accepted.push(bullet);
    words += wc;
  }

  return toBulletString(accepted.length ? accepted : bullets.slice(0, 12));
}

function projectSystemType(project = {}) {
  const text = `${project.system || ""} ${project.title || ""} ${project.ecmName || ""}`.toLowerCase();

  if (/chiller|chw|cooling|cooling tower|ct|ahu|hvac|pump/.test(text)) return "hvac";
  if (/compressor|compressed air|air compressor|hp|lp/.test(text)) return "compressed_air";
  if (/motor|vfd|ie5|ie4|servo|blower|fan/.test(text)) return "motor";
  if (/dryer|heat recovery|exhaust|heater|ir heater|thermal/.test(text)) return "heat_recovery";
  if (/lighting|led|lux|sensor/.test(text)) return "lighting";

  return "generic";
}

function baseContext(project = {}) {
  return {
    title: project.title || project.ecmName || "Energy conservation measure",
    ecmNo: project.ecmNo || "ECM",
    system: project.system || "utility/process system",
    energySaving: project.energySaving || project.kwhSaving || "[Calculation pending due to missing input data]",
    annualSaving: project.annualSaving || project.costSaving || "[Calculation pending due to missing input data]",
    investment: project.investment || project.capex || "[Calculation pending due to missing input data]",
    payback: project.payback || project.simplePayback || "[Calculation pending due to missing input data]"
  };
}

function buildForcedTheoryBullets(project = {}, fieldName = "existingSystemDescription") {
  const ctx = baseContext(project);
  const type = projectSystemType(project);

  const common = [
    `${ctx.ecmNo} – ${ctx.title} has been considered as an implementable energy conservation measure and must be evaluated with reference to actual site operating conditions, equipment loading pattern, baseline energy consumption and practical execution constraints.`,
    `The deterministic project data must remain the source of truth for the report. The values for energy saving, annual saving, investment and payback should not be altered during narrative enhancement and should be verified against the original ECM sheet before client submission.`,
    `The purpose of this section is to explain the technical logic, implementation approach, verification method and operational relevance of the measure in a structured manner so that plant, maintenance, project and management teams can understand the basis of recommendation.`,
    `Before implementation, the site team should confirm equipment nameplate details, connected load, measured load, operating hours, control mode, process dependency, safety interlocks, maintenance condition and any limitations related to shutdown or production continuity.`,
    `The recommendation should be finalized only after validating whether the existing operation is continuous, intermittent, load-dependent, season-dependent or linked with specific production schedules because these factors directly influence achievable savings.`,
    `The proposed project should not be treated only as an equipment replacement activity. It should be treated as a performance-improvement measure that includes baseline assessment, engineering design, implementation, commissioning and post-implementation measurement.`,
    `Where measured values are not available, the report should clearly state the data required for final validation instead of inventing savings. Required values normally include kW, operating hours, flow, pressure, temperature, loading pattern and applicable electricity tariff.`,
    `The implementation team should confirm whether the proposed intervention affects process reliability, comfort condition, product quality, machine availability, safety, maintenance access or operator workflow.`,
    `The project should include a measurement and verification plan so that savings can be proven after implementation using comparable baseline and post-implementation measurements.`,
    `The final project decision should be based on technical feasibility, verified saving potential, investment requirement, payback period, operational risk, ease of execution and long-term maintainability.`
  ];

  const hvac = [
    `For HVAC and cooling-related systems, the major energy performance drivers are load variation, chilled water or condenser water flow, temperature differential, equipment sequencing, pump operation, fan operation, cooling tower performance and control set-points.`,
    `A common operating gap in cooling systems is fixed-speed or manually controlled operation even when thermal load varies during the day, across shifts or across seasons. This leads to avoidable pumping, fan or compressor energy consumption.`,
    `The audit should verify whether pumps, cooling towers, chillers and AHUs are operating in coordination or whether individual equipment is running independently without optimized sequencing.`,
    `The key operating parameters to be measured include chilled water supply and return temperature, condenser water temperature, pump pressure, pump flow, chiller loading, cooling tower fan operation, AHU airflow and actual kW consumption.`,
    `Energy saving may arise from better load matching, reduced throttling loss, improved temperature differential, optimized pump or fan speed, improved equipment sequencing and reduced simultaneous operation of redundant equipment.`,
    `The proposed intervention should include control verification, set-point optimization, operating schedule correction, instrumentation review, VFD/control logic evaluation and commissioning under different load conditions.`,
    `The M&V plan should compare baseline and post-implementation kW, operating hours, temperature differential, flow and load conditions to ensure that the saving is due to the project and not due to unrelated production or weather changes.`
  ];

  const compressedAir = [
    `For compressed air systems, the key performance drivers are generation pressure, compressor loading-unloading pattern, leakage level, pressure drop, artificial demand, end-use pressure requirement and sequencing of compressors.`,
    `Compressed air is normally one of the costliest utilities because useful pneumatic output is much lower than electrical input energy. Even small pressure reduction, leakage reduction or control improvement can create meaningful saving.`,
    `The audit should verify whether compressors are operating near efficient loading range or whether they are frequently unloading, idling or operating at pressure higher than actual end-use requirement.`,
    `The key measurements should include compressor kW, discharge pressure, header pressure, flow, loading pattern, leakage estimate, receiver performance, dryer pressure drop and end-use demand profile.`,
    `Energy saving may arise from pressure optimization, leakage reduction, improved compressor sequencing, isolation of non-essential demand, reduction in pressure drop and elimination of inappropriate compressed air usage.`,
    `The proposed intervention should be validated with actual pressure-flow measurement and should not be implemented only on nameplate values.`,
    `The M&V plan should compare compressor kW, pressure stability, operating hours and production-linked air demand before and after implementation.`
  ];

  const motor = [
    `For motor, pump, fan, blower and servo-related systems, the main energy drivers are motor efficiency, loading percentage, operating hours, transmission efficiency, control method, duty cycle and whether output demand varies with process requirement.`,
    `Energy saving may be achieved by replacing inefficient motors, improving transmission systems, introducing VFD control, removing throttling losses, improving fan or pump selection and matching speed with actual demand.`,
    `The audit should confirm whether the motor is continuously loaded, lightly loaded, intermittently operated or oversized for the connected application.`,
    `The key measurements should include voltage, current, power factor, measured kW, operating frequency, operating hours, load variation and mechanical output requirement.`,
    `For VFD-based measures, care must be taken to verify minimum speed limits, cooling requirements, harmonics, bypass arrangement, control feedback and process compatibility.`,
    `For high-efficiency motor retrofits, the baseline motor efficiency, rewinding history, operating hours and loading percentage should be confirmed before final savings are approved.`,
    `The M&V plan should compare measured kW and operating hours before and after implementation under similar production or utility demand conditions.`
  ];

  const heatRecovery = [
    `For heat recovery and dryer-related measures, the key opportunity is to capture useful thermal energy that is currently rejected through exhaust air, hot surfaces, flue gas or process discharge.`,
    `The technical feasibility depends on exhaust temperature, exhaust airflow, contamination level, humidity, process compatibility, available heat sink and operating hours.`,
    `Energy saving may arise by preheating inlet air, reducing heater load, recovering waste heat for process use or reducing primary electrical or fuel input.`,
    `The audit should measure inlet temperature, outlet temperature, exhaust temperature, airflow, heater kW, operating hours and process constraints before finalizing the heat recovery design.`,
    `The proposed system should be designed to avoid pressure drop, contamination carryover, process instability, maintenance difficulty and safety risk.`,
    `The M&V plan should compare heater energy consumption, operating temperature and production-linked operating hours before and after implementation.`,
    `Where final thermal data is unavailable, the report should clearly mark the calculation as pending and list the measurements required for final validation.`
  ];

  const lighting = [
    `For lighting systems, energy saving depends on existing fixture wattage, operating hours, lux requirement, occupancy pattern, daylight availability and control strategy.`,
    `The audit should verify whether lighting is over-designed, continuously operated, manually controlled or installed in areas suitable for occupancy sensors, daylight control or timer-based operation.`,
    `Energy saving may arise from LED retrofit, lux optimization, zoning, occupancy sensing, timer control and reduction of unnecessary operating hours.`,
    `The key measurements should include fixture wattage, quantity, operating hours, lux level, area usage pattern and existing control arrangement.`,
    `The proposed lighting measure should ensure that required illumination levels, safety, visual comfort and operational requirements are not compromised.`,
    `The M&V plan should compare connected lighting load and operating schedule before and after implementation.`,
    `Additional benefits may include reduced maintenance, improved visibility, better control discipline and reduced heat load in conditioned spaces.`
  ];

  const fieldSpecific = {
    existingSystemDescription: [
      `The existing system description should explain how the present equipment operates, what operating data is available, what information is missing and which performance parameters must be verified before implementation.`,
      `This section should clearly distinguish between confirmed input data and assumptions awaiting site verification. It should not present unverified assumptions as final measured values.`
    ],
    problemGapIdentified: [
      `The problem or gap should identify the technical reason for energy loss, such as mismatch between demand and supply, fixed-speed operation, excessive pressure, poor control, inefficient equipment or lack of monitoring.`,
      `The gap should be written in practical engineering language so that the client can understand why the existing condition leads to avoidable energy consumption.`
    ],
    proposedProject: [
      `The proposed project should define the implementation approach, major scope items, control strategy, equipment modification, commissioning requirement and expected operational change.`,
      `The proposal should remain implementation-oriented and should avoid vague statements that do not guide engineering or execution teams.`
    ],
    rationaleForEnergySaving: [
      `The energy-saving rationale should explain the physical mechanism of saving, such as reduced kW, reduced operating hours, reduced pressure, improved efficiency, recovered heat or optimized speed control.`,
      `The rationale must not invent new numbers. It should explain how the saving will be validated once required measurements are available.`
    ],
    measurementVerificationPlan: [
      `The measurement and verification plan should define baseline parameters, post-implementation parameters, measurement instruments, normalization factors, acceptance criteria and documentation requirements.`,
      `The M&V method should ensure that the saving is traceable to the implemented project and not to unrelated changes in production, weather, occupancy or operating schedule.`
    ],
    benefitsOtherThanEnergySaving: [
      `Non-energy benefits should include improved reliability, lower maintenance stress, better monitoring, improved control discipline, reduced breakdown risk, improved sustainability and easier operational decision-making.`,
      `These benefits should be presented as supporting benefits and should not replace verified energy-saving calculations.`
    ],
    conclusion: [
      `The conclusion should summarize feasibility, implementation priority, expected operational benefit, data verification requirement and next action required for execution.`,
      `The recommendation should be practical and should clearly state whether final engineering, vendor quotation, measurement or client approval is required before implementation.`
    ]
  };

  let bullets = [...common, ...(fieldSpecific[fieldName] || [])];

  if (type === "hvac") bullets = bullets.concat(hvac);
  else if (type === "compressed_air") bullets = bullets.concat(compressedAir);
  else if (type === "motor") bullets = bullets.concat(motor);
  else if (type === "heat_recovery") bullets = bullets.concat(heatRecovery);
  else if (type === "lighting") bullets = bullets.concat(lighting);
  else bullets = bullets.concat([
    `The project should be reviewed with actual operating data because generic assumptions may not represent the real site condition.`,
    `The final recommendation should be supported by verified measurements, practical engineering scope and a clear implementation plan.`
  ]);

  while (countWords(toBulletString(bullets)) < MIN_THEORY_WORDS) {
    bullets.push(
      `For ${ctx.title}, the project team should document baseline condition, operating pattern, measured performance, implementation boundary, expected operational change and post-implementation verification method so that the recommendation becomes traceable and execution-ready.`
    );
    bullets.push(
      `The engineering review should confirm site constraints, shutdown requirements, control integration, safety provisions, maintenance access, instrumentation requirement and operator training needs before the measure is approved for implementation.`
    );
    bullets.push(
      `The report should preserve all extracted values from the input data and should use the narrative section only to explain technical logic, implementation method and verification requirement without modifying financial or energy-saving figures.`
    );
  }

  return trimToMaxWords(toBulletString(bullets), MAX_THEORY_WORDS);
}

function forceTheoryField(project, fieldName) {
  const existing = String(project[fieldName] || "").trim();
  const existingWords = countWords(existing);

  if (existing.includes("•") && existingWords >= MIN_THEORY_WORDS && existingWords <= MAX_THEORY_WORDS) {
    return existing;
  }

  return buildForcedTheoryBullets(project, fieldName);
}

function numericValue(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[₹,\s]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function isBadProject(project = {}) {
  const title = String(project.title || project.ecmName || "").toLowerCase();
  const system = String(project.system || "").toLowerCase();
  const saving = numericValue(project.annualSavingRaw ?? project.annualSaving ?? project.costSaving);
  const energy = numericValue(project.energySavingRaw ?? project.energySaving ?? project.kwhSaving);
  const payback = numericValue(project.paybackRaw ?? project.payback ?? project.simplePayback);

  if (project.fallbackGenerated === true) return true;
  if (system.includes("fallback")) return true;
  if (title.includes("fallback ecm")) return true;
  if (title.match(/\b0 0 0 0\b/)) return true;
  if (saving !== null && saving < 0) return true;
  if (energy !== null && energy < 0) return true;
  if (payback !== null && payback > 25) return true;

  return false;
}

function projectKey(project = {}) {
  return `${project.ecmNo || ""}|${project.title || project.ecmName || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeProjects(projects = []) {
  const seen = new Set();
  const output = [];

  for (const project of safeArray(projects)) {
    const key = projectKey(project);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(project);
  }

  return output;
}

function classifyProjectSystem(project = {}) {
  const title = String(project.title || project.ecmName || "").toLowerCase();
  const ecmNo = String(project.ecmNo || "").toLowerCase();

  const numberMatch = ecmNo.match(/(\d+)/);
  const no = numberMatch ? Number(numberMatch[1]) : null;

  const byNumber = {
    1: "Chiller Plant / Cooling Tower",
    2: "Chilled Water Secondary Pump",
    3: "Compressed Air System",
    4: "Chiller Primary Pump / Chiller Plant",
    5: "Chiller Plant / Free Cooling",
    6: "Cooling Tower Fan",
    7: "Clean Room / AHU",
    8: "CHW Secondary Pump Motor",
    9: "CT Water Secondary Pump Motor",
    10: "Cutting Grinder Motor Drive",
    11: "PD Blower Drive",
    12: "APFC / Electrical Power Quality",
    13: "ASB Dryer Heat Recovery",
    14: "Hot Flexible Duct Insulation",
    15: "Barrel Heating / IR Heater",
    16: "ASB 70 DPH Servo Motor",
    17: "ASB 50 MB Servo Motor",
    18: "EBM CMP 7.5 kW Servo Motor",
    19: "EBM CMP 5.5 kW Servo Motor",
    20: "EBM CMP 3.7 kW Servo Motor",
    21: "Compressed Air Measurement & Management",
    22: "Booster Compressor Motor & Automation"
  };

  if (byNumber[no]) return byNumber[no];

  if (/chiller|cooling tower|ct|chw|ahu|free cooling/.test(title)) return "Cooling / HVAC Utility";
  if (/compressor|compressed air/.test(title)) return "Compressed Air System";
  if (/servo|asb|ebm|dryer|heater|barrel/.test(title)) return "Production Machine";
  if (/apfc|kvar|power factor/.test(title)) return "Electrical Power Quality";
  if (/blower|grinder|motor|pump/.test(title)) return "Motor Driven System";

  return "Energy Conservation Measure";
}

function forceProjectQuality(project = {}) {
  const copy = { ...project };

  copy.system = classifyProjectSystem(copy);

  for (const field of THEORY_FIELDS) {
    copy[field] = forceTheoryField(copy, field);
  }

  return copy;
}

function enforceReportQuality(reportData = {}) {
  const cloned = JSON.parse(JSON.stringify(reportData || {}));
  const rejectedRows = [];

  cloned = normalizeReportGroups(cloned); cloned.groups = cloned.groups.map((group) => {
    const cleanProjects = [];

    for (const project of safeArray(group.projects)) {
      if (isBadProject(project)) {
        rejectedRows.push({
          ecmNo: project.ecmNo,
          title: project.title || project.ecmName,
          reason: "Rejected fallback/duplicate/invalid numeric project"
        });
        continue;
      }

      cleanProjects.push(forceProjectQuality(project));
    }

    return {
      ...group,
      projects: dedupeProjects(cleanProjects)
    };
  });

  cloned.groups = cloned.groups.filter((group) => safeArray(group.projects).length > 0);

  const allProjects = cloned.groups.flatMap((group) => safeArray(group.projects));

  cloned.extractionSummary = {
    ...(cloned.extractionSummary || {}),
    projectCount: allProjects.length,
    rejectedRows,
    rejectedRowCount: rejectedRows.length,
    qualityEnforced: true,
    theoryFormat: "bullet_points",
    minTheoryWords: MIN_THEORY_WORDS,
    maxTheoryWords: MAX_THEORY_WORDS
  };

  if (cloned.executiveSummary) {
    cloned.executiveSummary.summaryOfIdentifiedProjects = allProjects;
  }

  console.log("[REPORT_QUALITY_ENFORCED]", {
    groups: cloned.groups.length || 0,
    projects: cloned.groups.reduce((s, g) => s + (g.projects?.length || 0), 0),
    rejectedRows: cloned.extractionSummary?.rejectedRowCount || 0,
    theoryFormat: cloned.extractionSummary?.theoryFormat,
    minTheoryWords: cloned.extractionSummary?.minTheoryWords,
    maxTheoryWords: cloned.extractionSummary?.maxTheoryWords
  });

  return cloned;
}

module.exports = {
  enforceReportQuality,
  buildForcedTheoryBullets,
  countWords
};
