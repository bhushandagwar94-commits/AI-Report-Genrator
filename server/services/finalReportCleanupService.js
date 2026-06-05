function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function getEcmNo(project = {}) {
  const raw = String(project.ecmNo || project.ecmNumber || project.title || project.ecmName || "");
  const match = raw.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function classifySystemSafely(project = {}) {
  const no = getEcmNo(project);
  const title = String(project.title || project.ecmName || "").toLowerCase();

  const byNumber = {
    1: "Chiller Plant / Cooling Tower",
    2: "Chilled Water Secondary Pump",
    3: "Compressed Air Cooling System",
    4: "Chiller Primary Pump / Chiller Plant",
    5: "Chiller Plant / Free Cooling",
    6: "Cooling Tower Fan",
    7: "Clean Room / AHU",
    8: "CHW Secondary Pump Motor",
    9: "CT Water Secondary Pump Motor",
    10: "Cutting Grinder Motor Drive",
    11: "PD Blower Drive",
    12: "APFC / Electrical Power Quality",
    13: "Regeneration Heater Exhaust Heat Recovery",
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

  if (/chiller|cooling tower|chw|ct water|ahu|free cooling/.test(title)) return "Cooling / HVAC Utility";
  if (/compressor|compressed air/.test(title)) return "Compressed Air System";
  if (/servo|asb|ebm|dryer|heater|barrel/.test(title)) return "Production Machine";
  if (/apfc|kvar|power factor/.test(title)) return "Electrical Power Quality";
  if (/blower|grinder|motor|pump/.test(title)) return "Motor Driven System";

  return project.system || "Energy Conservation Measure";
}

const INTERNAL_PHRASES = [
  /deterministic project data/gi,
  /deterministic project list/gi,
  /source of truth/gi,
  /must remain unchanged/gi,
  /narrative enhancement/gi,
  /report should preserve/gi,
  /must be evaluated with reference to actual site operating conditions/gi,
  /project team should document baseline condition/gi,
  /engineering review should confirm site constraints/gi,
  /the purpose of this section is to explain/gi,
  /values for energy saving, annual saving, investment and payback should not be altered/gi
];

function sanitizeText(value) {
  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      return !INTERNAL_PHRASES.some((pattern) => pattern.test(line));
    });

  return lines.join("\n");
}

function cleanBulletLines(value) {
  return sanitizeText(value)
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^\s*\d+\.\s*/g, "")
        .replace(/^\s*[-–—]\s*/g, "")
        .replace(/^\s*•\s*/g, "")
        .replace(/^\s*-\s*•\s*/g, "")
        .trim()
    )
    .filter(Boolean);
}

function textFromBullets(lines) {
  return cleanBulletLines(lines.join("\n")).join("\n");
}

function buildSpecificNarrative(project = {}, section = "existingSystemDescription") {
  const no = getEcmNo(project);
  const title = project.title || project.ecmName || "Energy conservation measure";
  const map = {
    1: {
      existingSystemDescription: [
        `The project "${title}" relates to cooling tower performance improvement and condenser water management.`,
        "The existing cooling tower and chiller plant arrangement should be reviewed for cell staging, fan control, condenser water supply temperature and chiller part-load behavior.",
        "The main baseline parameters are cooling tower fan kW, condenser water supply temperature, chiller kW and ambient wet-bulb condition."
      ],
      problemGapIdentified: [
        "The likely gap is inefficient cooling tower operation, such as running too many fans or poor cell segregation during low load.",
        "If condenser water temperature is not optimized against ambient conditions, the chiller consumes higher compressor power.",
        "Without proper staging, cooling tower fans consume unnecessary energy."
      ],
      proposedProject: [
        "The proposed project is to optimize cooling tower operation and condenser water management.",
        "Implementation may include CT cell segregation, fan VFD logic, temperature reset based on wet-bulb, and improved chiller-CT interlock.",
        "The system should balance cooling tower fan energy against chiller compressor energy to minimize total plant kW/TR."
      ],
      rationaleForEnergySaving: [
        "Reducing condenser water temperature within allowable limits reduces chiller compressor lift and improves chiller efficiency.",
        "Optimizing fan staging avoids unnecessary fan kW while protecting chiller performance.",
        "The saving is a combination of reduced chiller compressor kW and optimized cooling tower fan kW."
      ],
      measurementVerificationPlan: [
        "Measure baseline chiller kW, CT fan kW, condenser water supply/return temperatures, and ambient wet-bulb temperature.",
        "After implementation, repeat measurements under comparable cooling load and ambient conditions.",
        "Savings should be verified from the reduction in combined plant kW/TR."
      ],
      benefitsOtherThanEnergySaving: [
        "Improves overall chiller plant stability and part-load efficiency.",
        "Reduces unnecessary wear and tear on cooling tower fans and gearboxes.",
        "Maintains better condenser approach temperatures."
      ],
      conclusion: [
        "This ECM is technically viable because cooling tower optimization directly improves chiller efficiency.",
        "Implementation should proceed after confirming baseline chiller performance curves and CT mechanical condition."
      ]
    },
    2: {
      existingSystemDescription: [
        `The project "${title}" relates to chilled water secondary pumping for variable cooling load conditions.`,
        "The existing secondary chilled water distribution system should be reviewed for pump operating frequency, differential pressure set point, valve throttling, bypass flow and chilled water supply-return temperature difference.",
        "The main baseline parameters are pump kW, flow, head, differential pressure, VFD frequency and chilled water delta-T."
      ],
      problemGapIdentified: [
        "The likely gap is over-pumping during part-load operation.",
        "When secondary pump flow is higher than actual AHU or process cooling demand, excess pump head is lost across control valves or bypasses.",
        "This causes avoidable pump kWh and can also reduce chilled water delta-T."
      ],
      proposedProject: [
        "The proposed project is to optimize secondary chilled water pump flow using actual demand-based control.",
        "The implementation should include DP reset, VFD logic review, balancing valve correction, bypass minimization and commissioning under different load conditions.",
        "Pump control should maintain cooling performance while reducing unnecessary circulation."
      ],
      rationaleForEnergySaving: [
        "The saving is based on pump affinity law, where reduction in flow and speed can reduce pump power significantly.",
        "Better flow control reduces throttling loss and improves matching between cooling demand and pump output.",
        "The extracted annual saving and kWh saving should be retained from the ECM sheet."
      ],
      measurementVerificationPlan: [
        "Measure baseline pump kW, pump flow, pump head, differential pressure, VFD frequency, chilled water supply temperature and return temperature.",
        "After implementation, repeat measurements under comparable cooling load conditions.",
        "Savings should be verified from measured kW reduction and annual operating hours."
      ],
      benefitsOtherThanEnergySaving: [
        "The project can improve chilled water balancing and reduce pump stress.",
        "It can reduce valve throttling, noise and unnecessary hydraulic losses.",
        "It can improve control stability across the chilled water distribution network."
      ],
      conclusion: [
        "This ECM is technically practical because variable flow optimization can reduce secondary pumping energy without disturbing required cooling performance.",
        "Implementation should proceed after confirming baseline DP, flow and VFD control behavior."
      ]
    },
    3: {
      existingSystemDescription: [
        `The project "${title}" involves compressor cooling and associated cooling tower management.`,
        "The existing system should be reviewed to check how compressor cooling water is supplied, the required supply temperature, and current CT fan operation.",
        "The baseline focuses on compressor cooling water temperature limits and CT fan energy consumption."
      ],
      problemGapIdentified: [
        "The likely gap is over-cooling or unnecessary fan operation for the compressor cooling circuit.",
        "Running cooling tower fans at full speed when the ambient conditions or compressor load are low wastes fan energy.",
        "Poor water management can also lead to scaling or higher compressor discharge temperatures."
      ],
      proposedProject: [
        "The proposed project is to optimize the cooling tower serving the air compressors.",
        "This may include VFD installation on CT fans, temperature-based staging, or flow optimization to match actual compressor heat rejection needs.",
        "Controls should maintain safe compressor oil and air discharge temperatures."
      ],
      rationaleForEnergySaving: [
        "Fan power reduces significantly when speed is controlled based on actual water temperature requirements.",
        "Optimizing flow and fan staging removes artificial load from the auxiliary system."
      ],
      measurementVerificationPlan: [
        "Measure baseline CT fan kW, water supply/return temperatures, and compressor operating status.",
        "After implementation, monitor fan kW and compressor temperatures under similar ambient conditions.",
        "Savings are verified from avoided CT fan runtime and reduced average kW."
      ],
      benefitsOtherThanEnergySaving: [
        "Reduces fan noise and mechanical wear.",
        "Provides more stable cooling water temperature to compressors.",
        "Can reduce water drift and evaporation losses slightly."
      ],
      conclusion: [
        "This ECM offers a good balance of low investment and reliable savings.",
        "Implementation should proceed after confirming the maximum allowable cooling water temperature for the compressors."
      ]
    },
    4: {
      existingSystemDescription: [
        `The project "${title}" focuses on chiller primary pump optimization and overall chiller plant kW/TR improvement.`,
        "The existing primary pumping system should be checked for flow matching, bypass logic, and chilled water delta-T.",
        "The baseline includes primary pump kW, chiller kW, total cooling load (TR), and specific energy consumption (kW/TR)."
      ],
      problemGapIdentified: [
        "The gap is usually fixed-speed primary pumping that provides excess flow during part-load chiller operation, or low delta-T syndrome.",
        "Excess flow causes the primary pumps to consume more energy than necessary and degrades overall plant kW/TR.",
        "Continuous bypass flow also dilutes return water temperature, forcing chillers to operate at lower efficiency."
      ],
      proposedProject: [
        "The proposed project is to optimize the primary chilled water flow, potentially implementing variable primary flow (VPF) or better pump staging.",
        "Implementation requires reviewing chiller minimum flow limits, bypass valve control, and VFD integration.",
        "The goal is to match primary flow precisely to the active chiller load."
      ],
      rationaleForEnergySaving: [
        "Reducing primary pump flow during part-load conditions directly saves pump kW due to the affinity laws.",
        "Improving delta-T and reducing bypass flow also improves the chiller's operating efficiency (kW/TR)."
      ],
      measurementVerificationPlan: [
        "Measure baseline primary pump kW, chiller kW, chilled water flow, and delta-T across the chillers.",
        "Calculate baseline plant kW/TR.",
        "After implementation, verify reduced pump kW and improved kW/TR under similar cooling loads."
      ],
      benefitsOtherThanEnergySaving: [
        "Improves chiller loading and staging efficiency.",
        "Reduces erosion and wear in primary chilled water piping.",
        "Enhances overall plant temperature control."
      ],
      conclusion: [
        "This ECM is highly recommended for optimizing large chiller plants.",
        "Implementation requires careful control integration to protect chiller evaporators from low-flow conditions."
      ]
    },
    5: {
      existingSystemDescription: [
        `The project "${title}" relates to use of cooling tower water for winter or low ambient free-cooling operation.`,
        "The existing system should be reviewed to identify whether the chiller continues operating even when ambient wet-bulb or dry-bulb conditions can support cooling through cooling tower water.",
        "The audit should check cooling tower water temperature, process cooling demand, chilled water temperature requirement and seasonal operating window."
      ],
      problemGapIdentified: [
        "The likely gap is avoidable chiller compressor operation during periods when cooling tower water can meet the required temperature range.",
        "Without a chiller bypass or suitable free-cooling control logic, the plant may continue consuming compressor energy unnecessarily.",
        "Missing interlocks, bypass valves or temperature-based controls can prevent use of available low ambient conditions."
      ],
      proposedProject: [
        "The proposed project should create a controlled chiller bypass or free-cooling arrangement for suitable winter operating periods.",
        "The system should include temperature monitoring, bypass valve logic, interlocks and safeguards to maintain process temperature stability.",
        "The chiller should operate only when cooling tower water temperature is not sufficient to meet the required load."
      ],
      rationaleForEnergySaving: [
        "Energy saving is achieved by reducing chiller compressor runtime.",
        "Cooling tower fans and pumps consume much less power than chiller compressors for equivalent cooling during favorable ambient conditions.",
        "The saving depends on number of suitable free-cooling hours, process cooling demand and stable CT water temperature."
      ],
      measurementVerificationPlan: [
        "Baseline should include chiller kWh, cooling tower water temperature, ambient wet-bulb/dry-bulb temperature and process supply temperature.",
        "Post-implementation monitoring should record free-cooling operating hours, chiller bypass hours, CT fan/pump operation and process temperature stability.",
        "Savings should be calculated from avoided chiller runtime and verified auxiliary energy use."
      ],
      benefitsOtherThanEnergySaving: [
        "The project can reduce chiller wear, compressor starts and maintenance stress during winter operation.",
        "It also improves operational flexibility by allowing the plant to use favorable ambient conditions."
      ],
      conclusion: [
        "This ECM is technically attractive where winter or low ambient conditions are available for meaningful hours.",
        "Final feasibility should be confirmed through seasonal temperature data and cooling load validation."
      ]
    },
    7: {
      existingSystemDescription: [
        `The project "${title}" involves the retrofit of clean room AHU fans to high-efficiency plug fans.`,
        "The existing AHUs typically use belt-driven centrifugal fans that supply air to clean room spaces.",
        "Baseline parameters include fan motor kW, static pressure, airflow (CFM), belt transmission losses, and VFD frequency."
      ],
      problemGapIdentified: [
        "Belt-driven fans have inherent transmission losses and require frequent maintenance.",
        "Older centrifugal fans may operate at lower aerodynamic efficiency compared to modern direct-drive plug fans.",
        "Excessive static pressure drops across belts and pulleys increase the motor power required to deliver the design airflow."
      ],
      proposedProject: [
        "The proposed project is to replace the existing belt-driven centrifugal fans with direct-drive EC or AC plug fans.",
        "Implementation includes removing old fan scrolls, blanking off the bulkhead, installing the plug fan array, and integrating speed control.",
        "The new fans will provide the same airflow at lower motor kW."
      ],
      rationaleForEnergySaving: [
        "Plug fans eliminate belt transmission losses (typically 3-5%).",
        "Direct-drive systems and advanced airfoil impellers offer higher overall static efficiency.",
        "Better speed control allows for precise airflow matching, reducing over-pressurization."
      ],
      measurementVerificationPlan: [
        "Measure baseline fan motor kW, VFD frequency, static pressure, and clean room air changes or pressure differentials.",
        "After retrofit, repeat kW and pressure measurements to ensure clean room conditions are maintained.",
        "Savings are calculated from the direct reduction in fan kW multiplied by annual operating hours."
      ],
      benefitsOtherThanEnergySaving: [
        "Eliminates belt dust generation, which is critical for clean room environments.",
        "Reduces maintenance requirements (no belt tensioning or replacement).",
        "Lowers vibration and noise levels."
      ],
      conclusion: [
        "This ECM provides reliable savings and improves clean room hygiene.",
        "Implementation should proceed during planned AHU shutdowns."
      ]
    },
    12: {
      existingSystemDescription: [
        `The project "${title}" relates to the APFC relay and 600 kVAr capacitor panel.`,
        "The existing electrical system should be reviewed for power factor trend, kVAh billing impact, capacitor step operation, relay response and harmonic condition.",
        "The audit should check whether the APFC relay is switching capacitor steps correctly as per reactive power demand."
      ],
      problemGapIdentified: [
        "The likely gap is poor reactive power control due to relay setting, capacitor health, incorrect step operation or delayed switching.",
        "If the APFC panel does not respond correctly, the plant may draw unnecessary reactive power and face kVAh or demand-related billing impact.",
        "Overcompensation, undercompensation or capacitor hunting can also affect power quality."
      ],
      proposedProject: [
        "The proposed project should review, tune or replace the APFC relay as required.",
        "Capacitor step sizing, contactor condition, detuned reactor requirement, protection and ventilation should be checked before implementation.",
        "The relay should be commissioned using actual load variation and reactive power profile."
      ],
      rationaleForEnergySaving: [
        "The benefit arises from maintaining improved power factor and reducing reactive power burden.",
        "Improved PF can reduce kVAh billing impact, improve transformer loading margin and support better voltage profile.",
        "The project should be validated using billing data and electrical measurements."
      ],
      measurementVerificationPlan: [
        "Baseline should include PF trend, kVA, kVAh, kVAr demand, capacitor step operation and harmonic level.",
        "Post-implementation monitoring should verify relay response, capacitor switching, PF stability and billing improvement.",
        "Savings should be confirmed from utility bill comparison and logged electrical parameters."
      ],
      benefitsOtherThanEnergySaving: [
        "The project can improve electrical system discipline, reduce reactive loading and improve voltage stability.",
        "It can also help maintenance teams identify weak capacitor steps or abnormal switching behavior."
      ],
      conclusion: [
        "This ECM is suitable for quick verification because APFC relay correction is low investment and directly linked to billing performance.",
        "Final action should include relay testing, capacitor health check and harmonic suitability review."
      ]
    },
    16: {
      existingSystemDescription: [
        `The project "${title}" focuses on servo motor retrofit for hydraulic machines (e.g., ASB 70 DPH).`,
        "The existing machine uses a standard induction motor driving a fixed or variable displacement hydraulic pump.",
        "Baseline parameters include average motor kW, cycle time, idle/unloading time, and hydraulic pressure profile."
      ],
      problemGapIdentified: [
        "Standard induction motors run continuously at full speed, even during the idle or holding phases of the machine cycle.",
        "This continuous operation results in high unloading losses and unnecessary circulation of hydraulic oil.",
        "A significant portion of energy is wasted bypassing oil and overcoming friction when no mechanical movement is required."
      ],
      proposedProject: [
        "The proposed project is to replace the main hydraulic induction motor with a highly responsive servo motor and dedicated drive.",
        "The servo drive will receive pressure and flow feedback to adjust motor speed dynamically, slowing down or stopping during idle phases.",
        "Implementation requires retrofitting the motor, drive, and interfacing with the machine's PLC."
      ],
      rationaleForEnergySaving: [
        "Servo motors eliminate continuous running losses by reducing speed to near zero during cooling or holding phases.",
        "They offer higher intrinsic motor efficiency (often IE4/IE5 equivalent).",
        "Energy savings are directly proportional to the idle time in the machine cycle."
      ],
      measurementVerificationPlan: [
        "Measure baseline motor kW and energy consumption (kWh) over a specific production batch or time period.",
        "After retrofit, measure kWh for the same production output and cycle time.",
        "Savings are verified by comparing specific energy consumption (kWh per unit produced)."
      ],
      benefitsOtherThanEnergySaving: [
        "Reduces hydraulic oil heating, lowering the load on the cooling system.",
        "Improves pressure control accuracy and machine response time.",
        "Lowers overall machine noise."
      ],
      conclusion: [
        "This ECM yields substantial savings for machines with variable duty cycles and significant hold times.",
        "Implementation should be planned with OEM or specialized integrators to ensure cycle time is not negatively affected."
      ]
    },
    17: { "$ref": 16 },
    18: { "$ref": 16 },
    19: { "$ref": 16 },
    20: { "$ref": 16 },
    21: {
      existingSystemDescription: [
        `The project "${title}" involves implementing compressed air monitoring and leakage management.`,
        "The existing compressed air network should be reviewed for leak rates, pressure drops, and lack of sub-metering.",
        "The baseline focuses on total compressor kW, specific power (kW/CFM), and estimated leakage volume during non-production hours."
      ],
      problemGapIdentified: [
        "Without continuous monitoring, compressed air leaks go unnoticed, forcing compressors to run unloaded or at higher capacities.",
        "Artificial demand is created when system pressure is maintained higher than necessary to compensate for leaks or pressure drops.",
        "This results in substantial wasted compressor energy."
      ],
      proposedProject: [
        "The proposed project is to install compressed air flow meters, power meters on compressors, and a centralized monitoring system.",
        "Simultaneously, a structured leak detection and repair (LDAR) program using ultrasonic detectors should be implemented.",
        "The system will provide real-time alerts for abnormal air consumption."
      ],
      rationaleForEnergySaving: [
        "Repairing leaks directly reduces the base load on the air compressors.",
        "Monitoring allows for sustained leak management and optimization of compressor sequencing.",
        "Lower air demand reduces compressor runtime and energy consumption."
      ],
      measurementVerificationPlan: [
        "Measure baseline compressor energy (kWh) and estimate leak percentage through a pump-up test or weekend monitoring.",
        "After implementation, track the reduction in baseline airflow and compressor kW.",
        "Savings are verified by the sustained reduction in compressed air generation for the same production level."
      ],
      benefitsOtherThanEnergySaving: [
        "Increases effective capacity of existing compressors, potentially avoiding capital expenditure for new units.",
        "Provides data-driven insights for preventative maintenance.",
        "Stabilizes system pressure for end-use equipment."
      ],
      conclusion: [
        "This ECM is a fundamental best practice for compressed air systems.",
        "Implementation establishes a baseline for all future compressed air optimizations."
      ]
    },
    22: {
      existingSystemDescription: [
        `The project "${title}" addresses booster compressor automation, IE5 motor upgrade, and pressure transmitter integration.`,
        "The existing booster compressor likely operates with a standard induction motor and conventional load/unload or bypass control.",
        "Baseline parameters include motor kW, discharge pressure stability, and operating hours."
      ],
      problemGapIdentified: [
        "Load/unload control on booster compressors often results in poor efficiency, especially if the demand fluctuates.",
        "Standard motors have lower efficiency compared to modern IE5 options.",
        "Lack of precise pressure feedback can cause the compressor to over-pressurize the system, wasting energy."
      ],
      proposedProject: [
        "The proposed project is to upgrade the booster compressor motor to an IE5 rating and install a VFD.",
        "A pressure transmitter will provide closed-loop feedback to the VFD, modulating the compressor speed to maintain exact required pressure.",
        "Implementation involves mechanical motor fitting and control panel upgrades."
      ],
      rationaleForEnergySaving: [
        "The IE5 motor provides an immediate efficiency gain across all load points.",
        "VFD control eliminates load/unload cycling losses and reduces average operating pressure.",
        "Speed modulation matches air delivery exactly to demand."
      ],
      measurementVerificationPlan: [
        "Measure baseline compressor kW, pressure profile, and specific power if possible.",
        "After implementation, monitor the new kW and confirm stable discharge pressure.",
        "Savings are calculated from the reduction in average kW and improved specific power."
      ],
      benefitsOtherThanEnergySaving: [
        "Significantly improves discharge pressure stability.",
        "Reduces mechanical stress and wear associated with frequent loading/unloading.",
        "Extends motor and compressor lifespan."
      ],
      conclusion: [
        "This ECM combines motor efficiency and advanced control for comprehensive optimization.",
        "Implementation should ensure the booster compressor airend is suitable for variable speed operation."
      ]
    }
  };

  const resolvedMap = map[no]?.["$ref"] ? map[map[no]["$ref"]] : map[no];
  const sectionMap = resolvedMap;
  const defaultByType = [
    `The project "${title}" should be reviewed as a specific energy conservation measure with its own baseline, implementation scope and verification method.`,
    "The existing system should be checked for operating hours, loading pattern, measured kW, control method and actual process dependency.",
    "The proposed action should be finalized after site verification and implemented with suitable commissioning and performance monitoring.",
    "Savings should be validated using before-and-after measurements under comparable operating conditions."
  ];
  if (sectionMap && sectionMap[section]) {
    return sectionMap[section].join("\n");
  }

  return defaultByType.join("\n");
}

function isBadNarrative(value) {
  const text = String(value || "").toLowerCase();

  if (!text.trim()) return true;
  if (text.includes("[to be updated")) return true;
  if (text.includes("deterministic project")) return true;
  if (text.includes("source of truth")) return true;
  if (text.includes("must be evaluated with reference")) return true;
  if (text.includes("project team should document baseline")) return true;
  if (text.includes("engineering review should confirm")) return true;
  if (text.includes("this section should explain")) return true;
  if (text.includes("report should preserve")) return true;
  if (text.includes("values for energy saving")) return true;
  if (text.includes("has been considered as an implementable energy conservation measure")) return true;
  if (text.includes("the proposed project should not be treated only")) return true;
  if (text.split(/\s+/).length < 25) return true;

  return false;
}

const NARRATIVE_FIELDS = [
  "existingOperatingCondition",
  "existingSystemDescription",
  "problemGapIdentified",
  "proposedProject",
  "proposedIntervention",
  "rationaleForEnergySaving",
  "measurementVerificationPlan",
  "benefitsOtherThanEnergySaving",
  "conclusion",
  "precautions",
  "caseStudy"
];

function cleanProject(project = {}) {
  const copy = { ...project };

  copy.system = classifySystemSafely(copy);

  for (const field of NARRATIVE_FIELDS) {
    const cleaned = sanitizeText(copy[field]);

    if (isBadNarrative(cleaned)) {
      copy[field] = buildSpecificNarrative(copy, field);
    } else {
      copy[field] = cleaned;
    }
  }

  // Force summary fields also, because DOCX project summary table uses these.
  copy.existingOperatingCondition = buildSpecificNarrative(copy, "existingSystemDescription");
  copy.proposedIntervention = buildSpecificNarrative(copy, "proposedProject");
  copy.precautions = buildSpecificNarrative(copy, "precautions");
  copy.caseStudy = buildSpecificNarrative(copy, "caseStudy");

  return copy;
}

function cleanupFinalReportData(reportData = {}) {
  const cleaned = clone(reportData);

  cleaned.groups = (cleaned.groups || []).map((group) => ({
    ...group,
    groupObservation: sanitizeText(group.groupObservation),
    implementationFocus: sanitizeText(group.implementationFocus),
    projects: (group.projects || []).map(cleanProject)
  }));

  if (cleaned.executiveSummary) {
    cleaned.executiveSummary.purposeText = sanitizeText(cleaned.executiveSummary.purposeText);
    cleaned.executiveSummary.conclusionAndWayForward = sanitizeText(cleaned.executiveSummary.conclusionAndWayForward);
  }

  cleaned.finalCleanupApplied = true;

  return cleaned;
}

module.exports = {
  cleanupFinalReportData,
  cleanBulletLines,
  classifySystemSafely
};
