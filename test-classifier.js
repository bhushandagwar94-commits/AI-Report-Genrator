// I need to extract the function locally since it might not be exported directly.
// Let me just redefine it here to test it.

function localClassifyEcmType(project) {
  const text = `${project?.projectTitle || ""} ${project?.equipmentCovered || ""} ${project?.projectActivitiesText || ""} ${project?.system || ""}`.toLowerCase();

  // Strict priority based on user requirements
  if (text.includes("exhaust heat recovery") || text.includes("heat recovery") || text.includes("waste heat")) return "heat_recovery";
  if (text.includes("insulation") && (text.includes("hot") || text.includes("duct") || text.includes("pipe") || text.includes("thermal"))) return "thermal_insulation";
  if (text.includes("band heater") || text.includes("ir heater")) return "ir_heater_or_band_heater_replacement";
  if (text.includes("servo") || text.includes("hydraulic")) return "servo_hydraulic_retrofit";
  if (text.includes("apfc") || text.includes("power factor")) return "apfc_power_factor_correction";
  if (text.includes("booster compressor")) return "booster_compressor_automation";
  if (text.includes("compressed air")) return "compressed_air_management";
  if (text.includes("ct fan") || text.includes("cooling tower fan") || (text.includes("ct no.") && text.includes("fan"))) return "cooling_tower_fan_upgrade";
  if (text.includes("ahu") && text.includes("plug fan")) return "ahu_plug_fan_optimization";
  if (text.includes("free cooling") || text.includes("chiller bypass")) return "free_cooling_chiller_bypass";
  if (text.includes("chiller") && text.includes("kw/tr")) return "chiller_kw_tr_optimization";
  if (text.includes("ie5") || text.includes("pmsm") || text.includes("motor retrofit")) return "motor_retrofit_ie5_pmsm";
  if (text.includes("cooling system") || text.includes("cooling tower") || text.includes("chiller") || text.includes("ct segregation")) return "cooling_system_optimization";
  if (text.includes("pump") || text.includes("vfd") || text.includes("flow optimization")) return "pump_flow_optimization";
  if (text.includes("ahu") || text.includes("fan")) return "ahu_plug_fan_optimization";
  if (text.includes("blower") || text.includes("direct drive")) return "blower_direct_drive_retrofit";
  if (text.includes("grinder")) return "grinder_motor_retrofit";
  if (text.includes("lighting") || text.includes("led")) return "lighting_efficiency";
  if (text.includes("boiler") || text.includes("steam boiler")) return "boiler_thermal_efficiency";
  if (text.includes("condensate") || text.includes("steam trap") || text.includes("steam")) return "steam_condensate_recovery";
  if (text.includes("process heating") || text.includes("heating")) return "process_heating_optimization";

  return "general_ecm";
}

const testCases = [
  { projectTitle: "Exhaust Heat Recovery" },
  { projectTitle: "Insulation hot ducts" },
  { projectTitle: "IR heater replacement" },
  { projectTitle: "Servo Motor Project" },
  { projectTitle: "Compressed Air Measurement & Management" },
  { projectTitle: "Booster Compressor retrofit with IE5 motor & automation" },
  { projectTitle: "APFC relay" }
];

testCases.forEach(tc => {
  console.log(`Title: ${tc.projectTitle}`);
  console.log(`Class: ${localClassifyEcmType(tc)}\n`);
});
