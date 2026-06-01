const fs = require('fs');
const path = require('path');

const docxServicePath = path.join(__dirname, 'server/services/docxExportService.js');
const templatePath = path.join(__dirname, 'frontend/src/components/templates/commercial-building-energy-audit/CommercialBuildingEnergyAuditTemplate.tsx');

let docxCode = fs.readFileSync(docxServicePath, 'utf-8');
let templateCode = fs.readFileSync(templatePath, 'utf-8');

// 1. Sanitization fixes in both files
const sanitizeFuncDocx = `
function removeDataRequired(obj) {
  if (typeof obj === "string") {
    let safe = obj.trim();
    safe = safe.replace(/\\[DRAFT - QC REVIEW REQUIRED\\]/gi, "");
    safe = safe.replace(/data required[^.]*\\.?/gi, "");
    safe = safe.replace(/undefined/gi, "");
    safe = safe.replace(/null/gi, "");
    safe = safe.replace(/explain\\s+cooling[^.]*\\.?/gi, "");
    safe = safe.replace(/explain\\s+hydraulic[^.]*\\.?/gi, "");
    safe = safe.replace(/explain\\s+thermal[^.]*\\.?/gi, "");
    safe = safe.replace(/explain\\s+compressed\\s+air[^.]*\\.?/gi, "");
    safe = safe.replace(/explain\\s+motor\\s+efficiency[^.]*\\.?/gi, "");
    safe = safe.replace(/explain\\s+power\\s+factor[^.]*\\.?/gi, "");
    safe = safe.replace(/explain\\s+heat\\s+recovery[^.]*\\.?/gi, "");
    safe = safe.replace(/explain\\s+insulation[^.]*\\.?/gi, "");
    safe = safe.replace(/explain\\s+servo[^.]*\\.?/gi, "");
    safe = safe.replace(/explain\\s+apfc[^.]*\\.?/gi, "");
    safe = safe.replace(/explain\\s+motor[^.]*\\.?/gi, "");
    safe = safe.replace(/ecm\\s+ecm/gi, "ECM");
    if (!safe.trim()) return "";
    return safe.trim();
  }
  if (Array.isArray(obj)) {
    return obj.map(removeDataRequired);
  }
  if (obj && typeof obj === "object") {
    const clean = {};
    for (const key of Object.keys(obj)) {
      clean[key] = removeDataRequired(obj[key]);
    }
    return clean;
  }
  return obj;
}
`;

docxCode = docxCode.replace(/function removeDataRequired\([^}]+\}[\s\S]*?(?=async function buildCommercial)/, sanitizeFuncDocx);

// Add mandatoryTable and mandatoryKeyValueTable to docx
const mandatoryTablesDocx = `
function mandatoryTable(columns, rowsData, placeholder = "[To be updated after site data verification]") {
  const safeColumns = asArray(columns).length ? asArray(columns) : [{ key: "value", label: "Value" }];
  const rows = asArray(rowsData);
  if (rows.length === 0) {
    const emptyRow = {};
    safeColumns.forEach(c => emptyRow[c.key] = placeholder);
    return createTable(safeColumns, [emptyRow]);
  }
  
  const mappedRows = rows.map(r => {
    const newRow = { ...r };
    safeColumns.forEach(c => {
      let val = newRow[c.key];
      if (val === undefined || val === null || String(val).trim() === "" || /^(data required|null|undefined|\\[draft.*?\\])$/i.test(String(val).trim())) {
        newRow[c.key] = placeholder;
      }
    });
    return newRow;
  });
  return createTable(safeColumns, mappedRows);
}

function mandatoryKeyValueTable(dataObj, placeholder = "[To be updated after site data verification]") {
  const safeObj = { ...dataObj };
  const keys = Object.keys(safeObj);
  if (keys.length === 0) {
     return keyValueTable([{label: "Details", value: placeholder}]);
  }
  keys.forEach(k => {
    let val = safeObj[k];
    if (val === undefined || val === null || String(val).trim() === "" || /^(data required|null|undefined|\\[draft.*?\\])$/i.test(String(val).trim())) {
      safeObj[k] = placeholder;
    }
  });
  return keyValueTable(keys.map(k => ({ label: k, value: safeObj[k] })));
}
`;

docxCode = docxCode.replace('function generateCoverPage', mandatoryTablesDocx + '\nfunction generateCoverPage');


// Fix docx classifyEcmType
const classifyEcmTypeReplacementDocx = `function classifyEcmType(ecm) {
  const title = String(ecm.projectTitle || ecm.title || ecm.ecmName || "").toLowerCase();
  const ecmNo = String(getEcmNumberVal(ecm) || "");
  if (ecmNo.includes("13")) return "heat_recovery";
  if (ecmNo.includes("14")) return "thermal_insulation";
  if (ecmNo.includes("15")) return "ir_heater_retrofit";
  if (ecmNo.match(/1[6-9]|20/)) return "servo_hydraulic_retrofit";
  if (ecmNo.includes("21")) return "compressed_air_management";
  if (ecmNo.includes("12")) return "apfc_power_factor_correction";
  
  if (title.includes("heat recovery") || title.includes("exhaust heat")) return "heat_recovery";
  if (title.includes("insulation") || title.includes("hot duct")) return "thermal_insulation";
  if (title.includes("ir heater") || title.includes("band heater") || title.includes("barrel heating")) return "ir_heater_retrofit";
  if (title.includes("servo") || title.includes("hydraulic")) return "servo_hydraulic_retrofit";
  if (title.includes("compressed air") || title.includes("booster compressor") || title.includes("air compressor")) return "compressed_air_management";
  if (title.includes("apfc") || title.includes("power factor") || title.includes("kvar")) return "apfc_power_factor_correction";
  if (title.includes("ahu") || title.includes("plug fan")) return "ahu_plug_fan_optimization";
  if (title.includes("chiller") || title.includes("cooling") || title.includes("chw") || title.includes("ct water") || title.includes("primary pump") || title.includes("secondary pump") || title.includes("ct segregation")) return "cooling_system_optimization";
  if (title.includes("ie5") || title.includes("motor retrofit") || title.includes("pmsm")) return "motor_retrofit_ie5";
  return "general";
}`;

docxCode = docxCode.replace(/function classifyEcmType\([^}]+\}[\s\S]*?(?=function sanitizePromptLeakageText)/, classifyEcmTypeReplacementDocx + '\n\n');

// Replace building profile generation in docx
const generateBuildingProfileDocx = `function generateBuildingProfile(report) {
  const bp = report.buildingProfile || {};
  const esd = report.electricalSupplyDetails || {};
  const benchmark = report.specificEnergyBenchmark || {};
  const placeholder = "[To be updated after site data verification]";
  return [
    heading1("Chapter 2: Plant / Building Details and Energy Profile"),
    
    heading2("2.1 General Information"),
    mandatoryKeyValueTable({
      "Name of facility": bp.facilityName || report.reportInfo?.clientName,
      "Address": bp.address,
      "Type of building": bp.typeOfBuilding || report.reportInfo?.buildingType,
      "Year of construction": bp.yearOfConstruction,
      "Total built-up area": bp.totalBuiltUpArea,
      "Conditioned area": bp.conditionedArea,
      "Number of floors": bp.numberOfFloors,
      "Occupancy type": bp.occupancyType,
      "Average occupancy": bp.averageOccupancy,
      "Operating days and hours": bp.operatingDaysAndHours,
      "Facility contact person": bp.facilityContactPerson,
      "Audit date": report.reportInfo?.auditPeriod,
      "SEE-Tech audit team": report.reportInfo?.preparedBy || "SEE-Tech Solutions",
    }),

    heading2("2.2 Building Operation Details"),
    mandatoryTable(
      [
        { key: "area", label: "Area / Function" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "remarks", label: "Remarks" },
      ],
      asArray(report.buildingOperationDetails).length ? report.buildingOperationDetails : [
        { area: "Office area" },
        { area: "Common area" },
        { area: "Basement / parking" },
        { area: "Server room / data room" },
        { area: "Kitchen" },
        { area: "Laundry" },
        { area: "Guest rooms" },
        { area: "Patient rooms / wards" },
        { area: "OT / ICU / critical areas" }
      ]
    ),

    heading2("2.3 Utility and Energy Sources"),
    mandatoryTable(
      [
        { key: "energySource", label: "Energy Source" },
        { key: "use", label: "Use" },
        { key: "annualConsumption", label: "Annual Consumption" },
        { key: "annualCost", label: "Annual Cost ₹" },
      ],
      asArray(report.utilityAndEnergySources).length ? report.utilityAndEnergySources : [
        { energySource: "Grid electricity", use: "HVAC, lighting, pumps, plug loads" },
        { energySource: "Diesel", use: "DG backup" },
        { energySource: "PNG / LPG", use: "Kitchen, boiler, hot water" },
        { energySource: "Solar PV", use: "Captive generation" },
        { energySource: "Solar thermal", use: "Hot water" },
        { energySource: "Other", use: "" }
      ]
    ),

    heading2("2.4 Electrical Supply Details"),
    mandatoryKeyValueTable({
      "Supply voltage": esd.supplyVoltage,
      "Consumer number": esd.consumerNumber,
      "Tariff category": esd.tariffCategory,
      "Contract demand / sanctioned load": esd.contractDemand || esd.sanctionedLoad,
      "Connected load": esd.connectedLoad,
      "Transformer capacity": esd.transformerCapacity,
      "DG capacity": esd.dgCapacity,
      "APFC panel capacity": esd.apfcPanelCapacity,
      "Average power factor": esd.powerFactor || esd.averagePowerFactor,
      "Billing type": esd.billingType,
      "Average electricity tariff": esd.averageElectricityTariff || formatINR(report.executiveSummary?.averageTariff),
    }),

    heading2("2.5 Electricity Consumption and Billing Summary"),
    mandatoryTable(
      [
        { key: "month", label: "Month" },
        { key: "kwh", label: "kWh" },
        { key: "kvah", label: "kVAh" },
        { key: "demand", label: "Maximum Demand kVA" },
        { key: "pf", label: "PF" },
        { key: "bill", label: "Bill Amount ₹" },
        { key: "sec", label: "Specific Consumption" },
      ],
      asArray(report.monthlyBillingSummary).length ? report.monthlyBillingSummary : [
        { month: "Apr" }, { month: "May" }, { month: "Jun" }, { month: "Jul" },
        { month: "Aug" }, { month: "Sep" }, { month: "Oct" }, { month: "Nov" },
        { month: "Dec" }, { month: "Jan" }, { month: "Feb" }, { month: "Mar" },
        { month: "Total / Average" }
      ]
    ),

    heading2("2.6 Specific Energy Consumption Benchmark"),
    mandatoryTable(
      [
        { key: "buildingType", label: "Building Type" },
        { key: "benchmark", label: "Recommended Benchmark" },
      ],
      [
        { buildingType: "Office building", benchmark: "kWh/sq.ft/year" },
        { buildingType: "IT park", benchmark: "kWh/sq.ft/year and kWh/workstation/year" },
        { buildingType: "Hotel", benchmark: "kWh/occupied room night" },
        { buildingType: "Hospital", benchmark: "kWh/bed/day or kWh/sq.ft/year" },
        { buildingType: "Mall", benchmark: "kWh/sq.ft/year" },
        { buildingType: "Educational building", benchmark: "kWh/student/year or kWh/sq.ft/year" }
      ]
    ),
    mandatoryKeyValueTable({
      "Annual electricity consumption": benchmark.annualElectricityConsumption,
      "Built-up area": benchmark.builtUpArea,
      "Conditioned area": benchmark.conditionedArea,
      "Annual occupancy / room nights / bed days": benchmark.annualOccupancy,
      "Specific energy consumption": benchmark.specificEnergyConsumption,
      "Reference / target benchmark": benchmark.referenceBenchmark,
      "Improvement potential": benchmark.improvementPotential,
    }),

    heading2("2.7 Major Energy-Consuming Systems"),
    mandatoryTable(
      [
        { key: "system", label: "System" },
        { key: "majorEquipment", label: "Major Equipment" },
        { key: "estimatedShare", label: "Estimated Share of Energy Consumption" },
        { key: "remarks", label: "Remarks" },
      ],
      asArray(report.majorEnergyConsumingSystems).length ? report.majorEnergyConsumingSystems : [
        { system: "HVAC", majorEquipment: "Chiller / VRF / AHU / pumps / cooling tower" },
        { system: "Lighting", majorEquipment: "Indoor / outdoor / parking / facade" },
        { system: "Pumps", majorEquipment: "Domestic / STP / hot water / HVAC" },
        { system: "Plug loads", majorEquipment: "Office equipment / appliances" },
        { system: "Server / IT loads", majorEquipment: "UPS, PAC, server room" },
        { system: "Kitchen / laundry", majorEquipment: "Hotel / hospital loads" },
        { system: "Hot water system", majorEquipment: "Boiler / heat pump / solar" },
        { system: "Lifts / escalators", majorEquipment: "Vertical transport" }
      ]
    ),

    heading2("2.8 HVAC System Details"),
    mandatoryTable(
      [
        { key: "equipment", label: "Equipment" },
        { key: "capacity", label: "Capacity" },
        { key: "quantity", label: "Quantity" },
        { key: "connectedLoad", label: "Connected Load" },
        { key: "controlSystem", label: "Control System" },
        { key: "remarks", label: "Remarks" },
      ],
      asArray(report.hvacSystemDetails).length ? report.hvacSystemDetails : [
        { equipment: "Chiller / VRF outdoor unit" },
        { equipment: "AHU" },
        { equipment: "FCU" },
        { equipment: "Cooling tower" },
        { equipment: "Chilled water pump" },
        { equipment: "Condenser water pump" },
        { equipment: "Fresh air unit" },
        { equipment: "Exhaust / ventilation fan" }
      ]
    ),
    paragraph("The HVAC system is one of the major energy-consuming systems in the building. During the audit, operating hours, loading pattern, temperature settings, pump and fan operation, control philosophy and maintenance condition should be reviewed. The main opportunities may relate to variable speed operation, AHU scheduling, chiller efficiency, fresh air optimization, cooling tower performance or set point optimization."),

    heading2("2.9 Lighting System Details"),
    mandatoryTable(
      [
        { key: "area", label: "Area" },
        { key: "type", label: "Existing Fixture" },
        { key: "wattage", label: "Wattage" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "control", label: "Control Type" },
      ],
      asArray(report.lightingSystemDetails).length ? report.lightingSystemDetails : [
        { area: "Office area" },
        { area: "Corridor" },
        { area: "Parking" },
        { area: "Outdoor" },
        { area: "Back-of-house" },
        { area: "Guest room / ward" }
      ]
    ),
    paragraph("Lighting energy consumption can be reduced through LED retrofit, lux optimization and occupancy-based controls. Corridors, parking areas, toilets, staircases and service areas are usually suitable for sensors or timer-based control."),

    heading2("2.10 Pumps and Motors"),
    mandatoryTable(
      [
        { key: "name", label: "Pump / Motor" },
        { key: "application", label: "Application" },
        { key: "rating", label: "Rating kW" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "control", label: "Control Method" },
        { key: "remarks", label: "Remarks" },
      ],
      asArray(report.pumpAndMotorDetails).length ? report.pumpAndMotorDetails : [
        { name: "Domestic water pump" },
        { name: "Hydro-pneumatic pump" },
        { name: "STP pump / blower" },
        { name: "Hot water pump" },
        { name: "HVAC pump" },
        { name: "Exhaust fan" }
      ]
    ),

    heading2("2.11 Building Automation and Controls"),
    mandatoryTable(
      [
        { key: "system", label: "System" },
        { key: "existingControl", label: "Existing Control" },
        { key: "observation", label: "Observation" },
        { key: "savingOpportunity", label: "Saving Opportunity" },
      ],
      asArray(report.automationAndControls).length ? report.automationAndControls : [
        { system: "HVAC scheduling" },
        { system: "AHU control" },
        { system: "Pump control" },
        { system: "Lighting control" },
        { system: "Parking ventilation" },
        { system: "Temperature set point" },
        { system: "Energy monitoring" }
      ]
    ),

    heading2("2.12 Summary of Audit Observations"),
    mandatoryTable(
      [
        { key: "srNo", label: "Sr. No." },
        { key: "observation", label: "Observation" },
        { key: "impact", label: "Impact" },
        { key: "recommendation", label: "Recommended Project" },
      ],
      asArray(report.auditObservations).length ? report.auditObservations : [
        { srNo: 1, observation: "[To be updated after site data verification]", impact: "High energy consumption" },
        { srNo: 2, observation: "[To be updated after site data verification]", impact: "Higher demand / kVAh billing" },
        { srNo: 3, observation: "[To be updated after site data verification]", impact: "Excess operating hours" },
        { srNo: 4, observation: "[To be updated after site data verification]", impact: "Inefficient equipment" },
        { srNo: 5, observation: "[To be updated after site data verification]", impact: "Poor control / manual operation" }
      ]
    ),
    pageBreak(),
  ];
}`;

docxCode = docxCode.replace(/function generateBuildingProfile\([^}]+\}[\s\S]*?(?=function getFallbackActivities)/, generateBuildingProfileDocx + '\n\n');

// Specific parameter logic for M&V table
const mvPlanDocxReplacer = `function buildMvPlanRows(ecmType, ecm) {
  let paramValue = "ECM-type-specific parameter";
  if (ecmType === "cooling_system_optimization") paramValue = "Flow, head, pressure, kW, CHW/CW temperature";
  else if (ecmType === "heat_recovery") paramValue = "Exhaust air temperature, inlet air temperature, heater kW, operating hours";
  else if (ecmType === "thermal_insulation" || ecmType === "ir_heater_retrofit") paramValue = "Surface temperature, duct temperature, heater load, operating hours";
  else if (ecmType === "servo_hydraulic_retrofit") paramValue = "Hydraulic motor kW, cycle time, idle load, operating hours";
  else if (ecmType === "compressed_air_management") paramValue = "Pressure, flow, leakage, compressor kW";
  else if (ecmType === "apfc_power_factor_correction") paramValue = "PF, kVA, kVAh, reactive power compensation";
  else if (ecmType === "ahu_plug_fan_optimization") paramValue = "Airflow, static pressure, fan kW";

  let rows = ecm.measurementVerificationPlan || ecm.mvPlan || ecm.measurementAndVerificationPlan || [];
  if (rows.length < 3) {
    rows = [
      { parameter: "Power consumption", baselineMeasurement: "kW before project", postImplementationMeasurement: "kW after project" },
      { parameter: "Operating hours", baselineMeasurement: "Existing operating schedule", postImplementationMeasurement: "Revised operating schedule" },
      { parameter: "Energy consumption", baselineMeasurement: "kWh/year baseline", postImplementationMeasurement: "kWh/year after project" },
      { parameter: "Performance parameter", baselineMeasurement: paramValue, postImplementationMeasurement: "Confirmed after commissioning" },
      { parameter: "Saving validation", baselineMeasurement: "Calculated from baseline", postImplementationMeasurement: "Verified from measured data" }
    ];
  }
  return rows;
}`;
docxCode = docxCode.replace(/function buildMvPlanRows\([^}]+\}[\s\S]*?(?=function buildBenefitRows)/, mvPlanDocxReplacer + '\n\n');

// Chapter 3 Problem/Gap and Rationale Tables fixing
docxCode = docxCode.replace(
    /\(project\.problemGapTable && project\.problemGapTable\.length > 0\)\s*\?\s*optionalTable\([^)]+\)\s*:\s*new Paragraph\(\{ text: "" \}\),/g,
    `mandatoryTable([{ key: "system", label: "System" }, { key: "gap", label: "Typical Gap" }], (project.problemGapTable && project.problemGapTable.length > 0) ? project.problemGapTable : [
      {
        system: ecmType === "heat_recovery" ? "Heat recovery" :
                ecmType === "thermal_insulation" ? "Insulation" :
                ecmType === "ir_heater_retrofit" ? "Insulation" :
                ecmType === "apfc_power_factor_correction" ? "APFC" :
                ecmType === "compressed_air_management" ? "Compressed air" : "System",
        gap: ecmType === "heat_recovery" ? "Waste heat discharged without useful recovery" :
             ecmType === "thermal_insulation" ? "Heat loss from exposed hot surfaces or ducts" :
             ecmType === "ir_heater_retrofit" ? "Heat loss from exposed hot surfaces or ducts" :
             ecmType === "apfc_power_factor_correction" ? "Low PF or kVAh billing loss" :
             ecmType === "compressed_air_management" ? "Air leakage, pressure drops, inefficient generation" : "[To be updated after site data verification]"
      }
    ]),`
);

docxCode = docxCode.replace(
    /\(project\.rationaleTable && project\.rationaleTable\.length > 0\)\s*\?\s*optionalTable\([^)]+\)\s*:\s*new Paragraph\(\{ text: "" \}\),/g,
    `mandatoryTable([{ key: "projectType", label: "Project Type" }, { key: "savingRationale", label: "Saving Rationale" }], (project.rationaleTable && project.rationaleTable.length > 0) ? project.rationaleTable : [
      {
        projectType: ecmType === "heat_recovery" ? "Heat recovery" :
                     ecmType === "thermal_insulation" ? "Insulation" :
                     ecmType === "ir_heater_retrofit" ? "Insulation" :
                     ecmType === "apfc_power_factor_correction" ? "APFC" :
                     ecmType === "compressed_air_management" ? "Compressed air" : "Project",
        savingRationale: "[To be updated after site data verification]"
      }
    ]),`
);



// frontend changes
const sanitizeFuncTemplate = `
function sanitizePromptLeakageText(text: any, ecmType: string) {
  let safe = String(text || "").trim();
  safe = safe.replace(/\\[DRAFT - QC REVIEW REQUIRED\\]/gi, "");
  safe = safe.replace(/data required[^.]*\\.?/gi, "");
  safe = safe.replace(/undefined/gi, "");
  safe = safe.replace(/null/gi, "");
  safe = safe.replace(/explain\\s+cooling[^.]*\\.?/gi, "");
  safe = safe.replace(/explain\\s+hydraulic[^.]*\\.?/gi, "");
  safe = safe.replace(/explain\\s+thermal[^.]*\\.?/gi, "");
  safe = safe.replace(/explain\\s+compressed\\s+air[^.]*\\.?/gi, "");
  safe = safe.replace(/explain\\s+motor\\s+efficiency[^.]*\\.?/gi, "");
  safe = safe.replace(/explain\\s+power\\s+factor[^.]*\\.?/gi, "");
  safe = safe.replace(/explain\\s+heat\\s+recovery[^.]*\\.?/gi, "");
  safe = safe.replace(/explain\\s+insulation[^.]*\\.?/gi, "");
  safe = safe.replace(/explain\\s+servo[^.]*\\.?/gi, "");
  safe = safe.replace(/explain\\s+apfc[^.]*\\.?/gi, "");
  safe = safe.replace(/explain\\s+motor[^.]*\\.?/gi, "");
  safe = safe.replace(/ecm\\s+ecm/gi, "ECM");
  safe = safe.trim();

  if (!safe || safe === "[To be updated after site data verification]") {
    if (ecmType === "cooling_system_optimization") safe = "The existing cooling system includes equipment operating under conditions where flow, temperature differential, and load variation require verification for optimized energy performance.";
    else if (ecmType === "heat_recovery") safe = "The existing dryer system rejects usable heat through exhaust air, while incoming regeneration air continues to require primary heating energy.";
    else if (ecmType === "thermal_insulation") safe = "The existing hot duct surfaces are exposed or inadequately insulated, resulting in avoidable heat loss to the surrounding area.";
    else if (ecmType === "servo_hydraulic_retrofit") safe = "The existing hydraulic machine drive arrangement operates with energy consumption during idle and part-load portions of the machine cycle.";
    else if (ecmType === "compressed_air_management") safe = "The compressed air system requires measurement of pressure, flow, leakage, and compressor loading pattern to identify avoidable generation losses.";
    else if (ecmType === "apfc_power_factor_correction") safe = "The electrical system requires effective reactive power compensation to maintain power factor and reduce kVA/kVAh-related billing impact.";
    else if (ecmType === "ir_heater_retrofit") safe = "The existing band heating system operates with high surface temperatures, leading to convective heat losses to the ambient environment.";
    else if (ecmType === "ahu_plug_fan_optimization") safe = "The existing air handling system operates with conventional fan and drive arrangements, presenting opportunities for flow optimization and efficiency upgrades.";
    else if (ecmType === "motor_retrofit_ie5") safe = "The existing driven equipment is operated by standard-efficiency motors, resulting in higher power consumption for the given mechanical load.";
    else safe = "The existing system operates under baseline conditions that present measurable opportunities for energy performance optimization.";
  }
  return safe;
}
`;

templateCode = templateCode.replace(/function sanitizePromptLeakageText\([^}]+\}[\s\S]*?(?=function safeText)/, sanitizeFuncTemplate + '\n\n');

const classifyEcmTypeReplacementTemplate = `function classifyEcmType(ecm: any) {
  const title = String(ecm.projectTitle || ecm.title || ecm.ecmName || "").toLowerCase();
  const ecmNo = String(getEcmNumberVal(ecm) || "");
  if (ecmNo.includes("13")) return "heat_recovery";
  if (ecmNo.includes("14")) return "thermal_insulation";
  if (ecmNo.includes("15")) return "ir_heater_retrofit";
  if (ecmNo.match(/1[6-9]|20/)) return "servo_hydraulic_retrofit";
  if (ecmNo.includes("21")) return "compressed_air_management";
  if (ecmNo.includes("12")) return "apfc_power_factor_correction";
  
  if (title.includes("heat recovery") || title.includes("exhaust heat")) return "heat_recovery";
  if (title.includes("insulation") || title.includes("hot duct")) return "thermal_insulation";
  if (title.includes("ir heater") || title.includes("band heater") || title.includes("barrel heating")) return "ir_heater_retrofit";
  if (title.includes("servo") || title.includes("hydraulic")) return "servo_hydraulic_retrofit";
  if (title.includes("compressed air") || title.includes("booster compressor") || title.includes("air compressor")) return "compressed_air_management";
  if (title.includes("apfc") || title.includes("power factor") || title.includes("kvar")) return "apfc_power_factor_correction";
  if (title.includes("ahu") || title.includes("plug fan")) return "ahu_plug_fan_optimization";
  if (title.includes("chiller") || title.includes("cooling") || title.includes("chw") || title.includes("ct water") || title.includes("primary pump") || title.includes("secondary pump") || title.includes("ct segregation")) return "cooling_system_optimization";
  if (title.includes("ie5") || title.includes("motor retrofit") || title.includes("pmsm")) return "motor_retrofit_ie5";
  return "general";
}`;
templateCode = templateCode.replace(/function classifyEcmType\([^}]+\}[\s\S]*?(?=function sanitizePromptLeakageText)/, classifyEcmTypeReplacementTemplate + '\n\n');


const renderMandatoryTableFuncs = `
function renderMandatoryTable(columns: any[], rowsData: any, placeholder: string = "[To be updated after site data verification]") {
  const safeColumns = asArray(columns).length ? asArray(columns) : [{ key: "value", label: "Value" }];
  const safeRows = normalizeTableRows(rowsData);
  
  if (safeRows.length === 0) {
    const emptyRow: any = {};
    safeColumns.forEach(c => emptyRow[c.key] = placeholder);
    return <ReportTable compact columns={safeColumns} rows={[emptyRow]} />;
  }

  const mappedRows = safeRows.map(r => {
    const newRow = { ...r };
    safeColumns.forEach(c => {
      let val = newRow[c.key];
      if (val === undefined || val === null || String(val).trim() === "" || /^(data required|null|undefined|\\[draft.*?\\])$/i.test(String(val).trim())) {
        newRow[c.key] = placeholder;
      }
    });
    return newRow;
  });

  return <ReportTable compact columns={safeColumns} rows={mappedRows} />;
}

function renderMandatoryKeyValueTable(dataObj: any, placeholder: string = "[To be updated after site data verification]") {
  const safeObj = { ...(dataObj || {}) };
  const keys = Object.keys(safeObj);
  if (keys.length === 0) {
    return <ReportTable compact columns={[{key: "label", label: "Particular"}, {key: "value", label: "Details"}]} rows={[{ label: "Details", value: placeholder }]} />;
  }

  keys.forEach(k => {
    let val = safeObj[k];
    if (val === undefined || val === null || String(val).trim() === "" || /^(data required|null|undefined|\\[draft.*?\\])$/i.test(String(val).trim())) {
      safeObj[k] = placeholder;
    }
  });

  const rows = keys.map(k => ({ label: k, value: safeObj[k] }));
  return <ReportTable compact columns={[{key: "label", label: "Particular"}, {key: "value", label: "Details"}]} rows={rows} />;
}
`;

templateCode = templateCode.replace(/function renderOptionalTable/, renderMandatoryTableFuncs + '\nfunction renderOptionalTable');


const generateBuildingProfileTemplate = `function BuildingEnergyProfilePage({ data }: any) {
  const bp = data.buildingProfile || {};
  const esd = data.electricalSupplyDetails || {};
  const benchmark = data.specificEnergyBenchmark || {};
  return (
    <section className="report-page" style={pageStyle}>
      <SectionHeader level={1} title="Chapter 2: Plant / Building Details and Energy Profile" />
      
      <SectionHeader number="2.1" title="General Information" />
      {renderMandatoryKeyValueTable({
        "Name of facility": bp.facilityName || data.reportInfo?.clientName,
        "Address": bp.address,
        "Type of building": bp.typeOfBuilding || data.reportInfo?.buildingType,
        "Year of construction": bp.yearOfConstruction,
        "Total built-up area": bp.totalBuiltUpArea,
        "Conditioned area": bp.conditionedArea,
        "Number of floors": bp.numberOfFloors,
        "Occupancy type": bp.occupancyType,
        "Average occupancy": bp.averageOccupancy,
        "Operating days and hours": bp.operatingDaysAndHours,
        "Facility contact person": bp.facilityContactPerson,
        "Audit date": data.reportInfo?.auditPeriod,
        "SEE-Tech audit team": data.reportInfo?.preparedBy || "SEE-Tech Solutions",
      })}

      <SectionHeader number="2.2" title="Building Operation Details" />
      {renderMandatoryTable([
        { key: "area", label: "Area / Function" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "remarks", label: "Remarks" },
      ], asArray(data.buildingOperationDetails).length ? data.buildingOperationDetails : [
        { area: "Office area" },
        { area: "Common area" },
        { area: "Basement / parking" },
        { area: "Server room / data room" },
        { area: "Kitchen" },
        { area: "Laundry" },
        { area: "Guest rooms" },
        { area: "Patient rooms / wards" },
        { area: "OT / ICU / critical areas" }
      ])}

      <SectionHeader number="2.3" title="Utility and Energy Sources" />
      {renderMandatoryTable([
        { key: "energySource", label: "Energy Source" },
        { key: "use", label: "Use" },
        { key: "annualConsumption", label: "Annual Consumption" },
        { key: "annualCost", label: "Annual Cost ₹" },
      ], asArray(data.utilityAndEnergySources).length ? data.utilityAndEnergySources : [
        { energySource: "Grid electricity", use: "HVAC, lighting, pumps, plug loads" },
        { energySource: "Diesel", use: "DG backup" },
        { energySource: "PNG / LPG", use: "Kitchen, boiler, hot water" },
        { energySource: "Solar PV", use: "Captive generation" },
        { energySource: "Solar thermal", use: "Hot water" },
        { energySource: "Other", use: "" }
      ])}

      <SectionHeader number="2.4" title="Electrical Supply Details" />
      {renderMandatoryKeyValueTable({
        "Supply voltage": esd.supplyVoltage,
        "Consumer number": esd.consumerNumber,
        "Tariff category": esd.tariffCategory,
        "Contract demand / sanctioned load": esd.contractDemand || esd.sanctionedLoad,
        "Connected load": esd.connectedLoad,
        "Transformer capacity": esd.transformerCapacity,
        "DG capacity": esd.dgCapacity,
        "APFC panel capacity": esd.apfcPanelCapacity,
        "Average power factor": esd.powerFactor || esd.averagePowerFactor,
        "Billing type": esd.billingType,
        "Average electricity tariff": esd.averageElectricityTariff || formatCurrencyDisplay(data.executiveSummary?.averageTariff),
      })}

      <SectionHeader number="2.5" title="Electricity Consumption and Billing Summary" />
      {renderMandatoryTable([
        { key: "month", label: "Month" },
        { key: "kwh", label: "kWh" },
        { key: "kvah", label: "kVAh" },
        { key: "demand", label: "Maximum Demand kVA" },
        { key: "pf", label: "PF" },
        { key: "bill", label: "Bill Amount ₹" },
        { key: "sec", label: "Specific Consumption" },
      ], asArray(data.monthlyBillingSummary || data.electricityBillingSummary).length ? (data.monthlyBillingSummary || data.electricityBillingSummary) : [
        { month: "Apr" }, { month: "May" }, { month: "Jun" }, { month: "Jul" },
        { month: "Aug" }, { month: "Sep" }, { month: "Oct" }, { month: "Nov" },
        { month: "Dec" }, { month: "Jan" }, { month: "Feb" }, { month: "Mar" },
        { month: "Total / Average" }
      ])}

      <SectionHeader number="2.6" title="Specific Energy Consumption Benchmark" />
      {renderMandatoryTable([
        { key: "buildingType", label: "Building Type" },
        { key: "benchmark", label: "Recommended Benchmark" },
      ], [
        { buildingType: "Office building", benchmark: "kWh/sq.ft/year" },
        { buildingType: "IT park", benchmark: "kWh/sq.ft/year and kWh/workstation/year" },
        { buildingType: "Hotel", benchmark: "kWh/occupied room night" },
        { buildingType: "Hospital", benchmark: "kWh/bed/day or kWh/sq.ft/year" },
        { buildingType: "Mall", benchmark: "kWh/sq.ft/year" },
        { buildingType: "Educational building", benchmark: "kWh/student/year or kWh/sq.ft/year" }
      ])}
      <br/>
      {renderMandatoryKeyValueTable({
        "Annual electricity consumption": benchmark.annualElectricityConsumption,
        "Built-up area": benchmark.builtUpArea,
        "Conditioned area": benchmark.conditionedArea,
        "Annual occupancy / room nights / bed days": benchmark.annualOccupancy,
        "Specific energy consumption": benchmark.specificEnergyConsumption,
        "Reference / target benchmark": benchmark.referenceBenchmark,
        "Improvement potential": benchmark.improvementPotential,
      })}

      <SectionHeader number="2.7" title="Major Energy-Consuming Systems" />
      {renderMandatoryTable([
        { key: "system", label: "System" },
        { key: "majorEquipment", label: "Major Equipment" },
        { key: "estimatedShare", label: "Estimated Share of Energy Consumption" },
        { key: "remarks", label: "Remarks" },
      ], asArray(data.majorEnergyConsumingSystems).length ? data.majorEnergyConsumingSystems : [
        { system: "HVAC", majorEquipment: "Chiller / VRF / AHU / pumps / cooling tower" },
        { system: "Lighting", majorEquipment: "Indoor / outdoor / parking / facade" },
        { system: "Pumps", majorEquipment: "Domestic / STP / hot water / HVAC" },
        { system: "Plug loads", majorEquipment: "Office equipment / appliances" },
        { system: "Server / IT loads", majorEquipment: "UPS, PAC, server room" },
        { system: "Kitchen / laundry", majorEquipment: "Hotel / hospital loads" },
        { system: "Hot water system", majorEquipment: "Boiler / heat pump / solar" },
        { system: "Lifts / escalators", majorEquipment: "Vertical transport" }
      ])}

      <SectionHeader number="2.8" title="HVAC System Details" />
      {renderMandatoryTable([
        { key: "equipment", label: "Equipment" },
        { key: "capacity", label: "Capacity" },
        { key: "quantity", label: "Quantity" },
        { key: "connectedLoad", label: "Connected Load" },
        { key: "controlSystem", label: "Control System" },
        { key: "remarks", label: "Remarks" },
      ], asArray(data.hvacSystemDetails).length ? data.hvacSystemDetails : [
        { equipment: "Chiller / VRF outdoor unit" },
        { equipment: "AHU" },
        { equipment: "FCU" },
        { equipment: "Cooling tower" },
        { equipment: "Chilled water pump" },
        { equipment: "Condenser water pump" },
        { equipment: "Fresh air unit" },
        { equipment: "Exhaust / ventilation fan" }
      ])}
      <p className="text-sm leading-snug mb-2">The HVAC system is one of the major energy-consuming systems in the building. During the audit, operating hours, loading pattern, temperature settings, pump and fan operation, control philosophy and maintenance condition should be reviewed. The main opportunities may relate to variable speed operation, AHU scheduling, chiller efficiency, fresh air optimization, cooling tower performance or set point optimization.</p>

      <SectionHeader number="2.9" title="Lighting System Details" />
      {renderMandatoryTable([
        { key: "area", label: "Area" },
        { key: "type", label: "Existing Fixture" },
        { key: "wattage", label: "Wattage" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "control", label: "Control Type" },
      ], asArray(data.lightingSystemDetails).length ? data.lightingSystemDetails : [
        { area: "Office area" },
        { area: "Corridor" },
        { area: "Parking" },
        { area: "Outdoor" },
        { area: "Back-of-house" },
        { area: "Guest room / ward" }
      ])}
      <p className="text-sm leading-snug mb-2">Lighting energy consumption can be reduced through LED retrofit, lux optimization and occupancy-based controls. Corridors, parking areas, toilets, staircases and service areas are usually suitable for sensors or timer-based control.</p>

      <SectionHeader number="2.10" title="Pumps and Motors" />
      {renderMandatoryTable([
        { key: "name", label: "Pump / Motor" },
        { key: "application", label: "Application" },
        { key: "rating", label: "Rating kW" },
        { key: "quantity", label: "Quantity" },
        { key: "operatingHours", label: "Operating Hours" },
        { key: "control", label: "Control Method" },
        { key: "remarks", label: "Remarks" },
      ], asArray(data.pumpsAndMotors || data.pumpAndMotorDetails).length ? (data.pumpsAndMotors || data.pumpAndMotorDetails) : [
        { name: "Domestic water pump" },
        { name: "Hydro-pneumatic pump" },
        { name: "STP pump / blower" },
        { name: "Hot water pump" },
        { name: "HVAC pump" },
        { name: "Exhaust fan" }
      ])}

      <SectionHeader number="2.11" title="Building Automation and Controls" />
      {renderMandatoryTable([
        { key: "system", label: "System" },
        { key: "existingControl", label: "Existing Control" },
        { key: "observation", label: "Observation" },
        { key: "savingOpportunity", label: "Saving Opportunity" },
      ], asArray(data.buildingAutomationControls || data.automationAndControls).length ? (data.buildingAutomationControls || data.automationAndControls) : [
        { system: "HVAC scheduling" },
        { system: "AHU control" },
        { system: "Pump control" },
        { system: "Lighting control" },
        { system: "Parking ventilation" },
        { system: "Temperature set point" },
        { system: "Energy monitoring" }
      ])}

      <SectionHeader number="2.12" title="Summary of Audit Observations" />
      {renderMandatoryTable([
        { key: "srNo", label: "Sr. No." },
        { key: "observation", label: "Observation" },
        { key: "impact", label: "Impact" },
        { key: "recommendation", label: "Recommended Project" },
      ], asArray(data.auditObservations).length ? data.auditObservations : [
        { srNo: 1, observation: "[To be updated after site data verification]", impact: "High energy consumption" },
        { srNo: 2, observation: "[To be updated after site data verification]", impact: "Higher demand / kVAh billing" },
        { srNo: 3, observation: "[To be updated after site data verification]", impact: "Excess operating hours" },
        { srNo: 4, observation: "[To be updated after site data verification]", impact: "Inefficient equipment" },
        { srNo: 5, observation: "[To be updated after site data verification]", impact: "Poor control / manual operation" }
      ])}
    </section>
  );
}`;
templateCode = templateCode.replace(/function BuildingEnergyProfilePage\([^}]+\}[\s\S]*?(?=function ProjectChapterPage)/, generateBuildingProfileTemplate + '\n\n');


const mvPlanTemplateReplacer = `function buildMvPlanRows(ecmType: string, ecm: any) {
  let paramValue = "ECM-type-specific parameter";
  if (ecmType === "cooling_system_optimization") paramValue = "Flow, head, pressure, kW, CHW/CW temperature";
  else if (ecmType === "heat_recovery") paramValue = "Exhaust air temperature, inlet air temperature, heater kW, operating hours";
  else if (ecmType === "thermal_insulation" || ecmType === "ir_heater_retrofit") paramValue = "Surface temperature, duct temperature, heater load, operating hours";
  else if (ecmType === "servo_hydraulic_retrofit") paramValue = "Hydraulic motor kW, cycle time, idle load, operating hours";
  else if (ecmType === "compressed_air_management") paramValue = "Pressure, flow, leakage, compressor kW";
  else if (ecmType === "apfc_power_factor_correction") paramValue = "PF, kVA, kVAh, reactive power compensation";
  else if (ecmType === "ahu_plug_fan_optimization") paramValue = "Airflow, static pressure, fan kW";

  let rows = ecm.measurementVerificationPlan || ecm.mvPlan || ecm.monitoringPlan || ecm.monitoringAndVerificationPlan || [];
  if (rows.length < 3) {
    rows = [
      { parameter: "Power consumption", baselineMeasurement: "kW before project", postImplementationMeasurement: "kW after project" },
      { parameter: "Operating hours", baselineMeasurement: "Existing operating schedule", postImplementationMeasurement: "Revised operating schedule" },
      { parameter: "Energy consumption", baselineMeasurement: "kWh/year baseline", postImplementationMeasurement: "kWh/year after project" },
      { parameter: "Performance parameter", baselineMeasurement: paramValue, postImplementationMeasurement: "Confirmed after commissioning" },
      { parameter: "Saving validation", baselineMeasurement: "Calculated from baseline", postImplementationMeasurement: "Verified from measured data" }
    ];
  }
  return rows;
}`;
templateCode = templateCode.replace(/function buildMvPlanRows\([^}]+\}[\s\S]*?(?=function buildBenefitRows)/, mvPlanTemplateReplacer + '\n\n');

templateCode = templateCode.replace(
    /\{renderOptionalTable\(\[\s*\{\s*key:\s*"system"[^\]]+\],\s*project\.problemGapTable,\s*""\)}/,
    `{renderMandatoryTable([{ key: "system", label: "System" }, { key: "gap", label: "Typical Gap" }], (project.problemGapTable && project.problemGapTable.length > 0) ? project.problemGapTable : [
      {
        system: ecmType === "heat_recovery" ? "Heat recovery" :
                ecmType === "thermal_insulation" ? "Insulation" :
                ecmType === "ir_heater_retrofit" ? "Insulation" :
                ecmType === "apfc_power_factor_correction" ? "APFC" :
                ecmType === "compressed_air_management" ? "Compressed air" : "System",
        gap: ecmType === "heat_recovery" ? "Waste heat discharged without useful recovery" :
             ecmType === "thermal_insulation" ? "Heat loss from exposed hot surfaces or ducts" :
             ecmType === "ir_heater_retrofit" ? "Heat loss from exposed hot surfaces or ducts" :
             ecmType === "apfc_power_factor_correction" ? "Low PF or kVAh billing loss" :
             ecmType === "compressed_air_management" ? "Air leakage, pressure drops, inefficient generation" : "[To be updated after site data verification]"
      }
    ])}`
);

templateCode = templateCode.replace(
    /\{renderOptionalTable\(\[\s*\{\s*key:\s*"projectType"[^\]]+\],\s*project\.rationaleTable,\s*""\)}/,
    `{renderMandatoryTable([{ key: "projectType", label: "Project Type" }, { key: "savingRationale", label: "Saving Rationale" }], (project.rationaleTable && project.rationaleTable.length > 0) ? project.rationaleTable : [
      {
        projectType: ecmType === "heat_recovery" ? "Heat recovery" :
                     ecmType === "thermal_insulation" ? "Insulation" :
                     ecmType === "ir_heater_retrofit" ? "Insulation" :
                     ecmType === "apfc_power_factor_correction" ? "APFC" :
                     ecmType === "compressed_air_management" ? "Compressed air" : "Project",
        savingRationale: "[To be updated after site data verification]"
      }
    ])}`
);

// We also need to fix formatNumber and formatNumberDisplay when value is "[To be updated..." etc.
templateCode = templateCode.replace(
  /function formatNumberDisplay\(value: any, maxDecimals = 0\): string \{[^}]+\}/,
  `function formatNumberDisplay(value: any, maxDecimals = 0): string {
  if (!isMeaningful(value)) return "[Calculation pending due to missing input data]";
  const num = Number(String(value).replace(/[^\\d.-]/g, ""));
  if (Number.isFinite(num)) {
    return num.toLocaleString("en-IN", { maximumFractionDigits: maxDecimals });
  }
  return String(value);
}`
);

fs.writeFileSync(docxServicePath, docxCode, 'utf-8');
fs.writeFileSync(templatePath, templateCode, 'utf-8');

console.log("Done modifying files");
