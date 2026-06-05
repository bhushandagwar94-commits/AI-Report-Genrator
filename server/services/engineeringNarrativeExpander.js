function countWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function toBulletText(items = []) {
  return items
    .map((item) => String(item || "").replace(/^[*-]\s*/, "").trim())
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value ?? "")
    .replace(/[,₹$]/g, "")
    .replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

const TARGETS = {
  existingSystemDescription: { min: 800, max: 1200 },
  problemGapIdentified: { min: 800, max: 1200 },
  proposedProject: { min: 800, max: 1200 },
  rationaleForEnergySaving: { min: 800, max: 1200 },
  measurementVerificationPlan: { min: 800, max: 1200 },
  benefitsOtherThanEnergySaving: { min: 800, max: 1200 },
  conclusion: { min: 350, max: 650 },
};

function projectFacts(project = {}) {
  return {
    ecmNo: project.ecmNo || project.projectNo || "ECM",
    title:
      project.title || project.projectTitle || project.ecmName || "Energy conservation measure",
    system: project.system || project.category || "identified system",
    equipment:
      project.equipmentCovered || project.equipment || "associated equipment",
    energySaving:
      project.expectedEnergySaving || project.energySaving || project.kwhSaving || "[pending verification]",
    annualSaving:
      project.expectedAnnualCostSaving || project.annualSaving || project.costSaving || "[pending verification]",
    investment:
      project.estimatedInvestment || project.investment || project.capex || "[pending verification]",
    payback:
      project.simplePaybackPeriod || project.payback || project.simplePayback || "[pending verification]",
    department: project.department || project.area || project.location || "the relevant operating area",
    sourceSheet: project.sourceSheet || project.sheetName || "the extracted ECM sheet",
  };
}

function classifyEcm(project = {}) {
  const text = [
    project.ecmNo,
    project.projectNo,
    project.title,
    project.projectTitle,
    project.ecmName,
    project.description,
    project.system,
    project.category,
    project.equipmentCovered,
    project.equipment,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/ct segregation|cooling tower segregation/.test(text)) return "chiller_ct_segregation";
  if (/chw secondary pump|secondary pump/.test(text)) return "chw_secondary_pump_optimization";
  if (/primary pump|chiller pump optimization|primary pump chiller/.test(text)) return "primary_pump_chiller_optimization";
  if (/free cooling|chiller bypass|bypass arrangement/.test(text)) return "free_cooling_chiller_bypass";
  if (/ahu.*plug fan|plug fan.*ahu/.test(text)) return "ahu_plug_fan";
  if (/ie5|ie 5/.test(text)) return "ie5_motor_retrofit";
  if (/compressed air|compressor|air leakage|air receiver|dryer/.test(text)) return "compressed_air";
  if (/ct fan|cooling tower fan|pmsm/.test(text)) return "ct_fan_pmsm";
  if (/grinder motor|grinder/.test(text)) return "grinder_motor_retrofit";
  if (/pd blower|blower/.test(text)) return "pd_blower";
  if (/apfc|power factor|capacitor|kvar/.test(text)) return "apfc";
  if (/pump|pumping/.test(text)) return "pump_optimization";
  if (/hvac|chiller|ahu|cooling tower|chw|condenser/.test(text)) return "hvac_general";
  return "general_energy_project";
}

function sectionIntent(section) {
  const map = {
    existingSystemDescription:
      "describe the existing operating arrangement, load pattern, controls, bottlenecks, and baseline measurements that define the present energy use",
    problemGapIdentified:
      "explain the exact inefficiency, why it wastes energy or money, and how the present arrangement deviates from good engineering practice",
    proposedProject:
      "define the implementation scope, equipment or control changes, interfaces, shutdown needs, commissioning steps, and execution boundary",
    rationaleForEnergySaving:
      "show the engineering cause-and-effect that reduces kW, kWh, losses, or avoidable operating hours without changing the extracted savings numbers",
    measurementVerificationPlan:
      "define baseline data, post-implementation data, instruments, logging period, normalization method, and acceptance criteria",
    benefitsOtherThanEnergySaving:
      "cover reliability, maintainability, process stability, operator visibility, safety, sustainability, and asset life improvements",
    conclusion:
      "summarize technical feasibility, execution readiness, dependencies, and why the project deserves implementation priority",
  };
  return map[section] || "explain the project in practical engineering terms";
}

function ecmSpecificBullets(project = {}, section = "existingSystemDescription") {
  const facts = projectFacts(project);
  const type = classifyEcm(project);

  const common = [
    `${facts.ecmNo} - ${facts.title} should stay aligned with the extracted project data from ${facts.sourceSheet}, including energy saving ${facts.energySaving}, annual saving ${facts.annualSaving}, estimated investment ${facts.investment}, and simple payback ${facts.payback}.`,
    `This section should ${sectionIntent(section)} for the ${facts.system} application serving ${facts.equipment} in ${facts.department}.`,
    `The write-up should stay project-specific, refer to the actual equipment and operating context, and avoid generic audit filler that could apply to any unrelated ECM.`,
    `Before implementation, the project team should confirm connected load, operating hours, seasonal behavior, control philosophy, loading variation, maintenance constraints, shutdown opportunities, and process dependencies that can influence the realized saving.`,
    `Where measurements are still pending, the report must state the required measurement openly instead of inventing hidden assumptions. The quality of this ECM depends on baseline confirmation, engineering review, execution planning, and post-implementation validation.`,
  ];

  const libraries = {
    chiller_ct_segregation: [
      `This ECM concerns segregation of cooling tower operation so that the chiller plant rejects heat with fewer tower cells or better matched condenser-water flow during part-load hours instead of operating every cooling-tower component as a fixed block.`,
      `The existing plant should be reviewed for condenser-water routing, cooling tower cell logic, isolation valves, common headers, bypass condition, tower fan control, and how many chillers and cooling-tower cells operate together under partial load conditions.`,
      `Energy waste typically appears when the same number of cooling tower cells, pumps, or fans remain online even when the active chiller load is substantially below design. This increases fan power, pumping power, and can also disturb condenser-water temperature control.`,
      `The proposed segregation measure should define which tower cells are dedicated or staged against each chiller or load band, how flow balancing will be maintained, and which interlocks are required to avoid thermal short-circuiting or inadequate condenser-water flow.`,
      `The engineering rationale is that reducing unnecessary cooling tower cell operation lowers fan energy and can improve overall plant coordination, while still maintaining adequate approach temperature and condensing performance when sequencing is handled correctly.`,
      `Measurement and verification should include condenser-water supply and return temperatures, cooling tower fan kW, pump kW where affected, chiller loading, active cell count, wet-bulb reference, and comparison of plant kW per TR before and after segregation logic is enabled.`,
    ],
    chw_secondary_pump_optimization: [
      `This ECM targets chilled-water secondary pumping so that the delivered flow matches actual building load instead of operating at conservative flow or pressure levels that create avoidable pumping energy and low delta-T behavior.`,
      `The existing secondary-pumping arrangement should be documented in terms of installed pump rating, VFD presence, differential-pressure control point, bypass behavior, chilled-water supply and return temperatures, and whether current control keeps excess head available in the loop.`,
      `Typical inefficiency arises when the pump set maintains a higher-than-required differential pressure, excessive flow, or permanent bypass circulation, which increases pumping kW and can also degrade chilled-water delta-T and overall chiller-plant efficiency.`,
      `The optimization scope should define pressure-reset logic, sensor location review, minimum-speed limits, staging rules, bypass management, balancing requirements, and any BMS modifications needed to stabilize distribution while reducing pumping energy.`,
      `The energy-saving rationale is that pump power varies strongly with speed and flow. By removing avoidable head and excess circulation, the system can maintain comfort or process cooling with materially lower electrical input and better hydraulic matching.`,
      `Measurement and verification should compare pump kW, differential pressure, flow if available, chilled-water delta-T, number of pumps running, and occupant or process cooling performance for representative load bands before and after optimization.`,
    ],
    primary_pump_chiller_optimization: [
      `This ECM relates to primary-side chilled-water pumping or chiller-primary flow coordination where the present operating strategy may run more pumps than necessary or maintain fixed-flow behavior regardless of actual chiller loading.`,
      `The baseline should capture the number of primary pumps, pump rating, control philosophy, minimum chiller flow requirement, flow-proving arrangement, evaporator delta-T, and whether pump operation is locked to equipment status without load-sensitive trimming.`,
      `The problem generally appears when the plant preserves a conservative primary-pumping regime, keeps standby pumps unnecessarily on, or uses throttling and bypass practices that satisfy minimum flow while wasting pumping energy.`,
      `The project scope should define revised sequencing, minimum safe flow logic, pump staging, VFD use if applicable, interlocks with chiller loading, and commissioning tests that confirm stable evaporator performance while reducing pumping kW.`,
      `Savings occur when unnecessary pump operation and excess head are removed. Better coordination between chiller loading and primary-water movement reduces auxiliary energy and can improve temperature differential discipline across the chilled-water plant.`,
      `Verification should include pump kW, number of pumps operating, evaporator temperatures, chiller load, start-stop pattern, differential pressure where available, and confirmation that minimum flow protection remains intact after the optimized sequence is commissioned.`,
    ],
    free_cooling_chiller_bypass: [
      `This ECM concerns free-cooling or chiller-bypass operation where ambient conditions permit useful cooling without relying fully on mechanical refrigeration for all hours.`,
      `The current arrangement should be described in terms of heat-exchanger availability, bypass valves, control dampers or valves, condenser-water and chilled-water temperature conditions, and how often the site currently misses low-ambient opportunity for free cooling.`,
      `The energy gap appears when the system continues using compressor power even when weather or process conditions would allow partial or full heat exchange through a bypass or free-cooling mode.`,
      `The proposed measure should clarify the valve arrangement, control logic, enabling temperatures, safety interlocks, freeze protection where relevant, and transition sequence between mechanical cooling and free-cooling operation.`,
      `Energy reduction is achieved by replacing some compressor runtime with heat-exchange-based cooling or reduced lift operation. The magnitude of benefit depends on annual hours of suitable ambient condition and stable control transition.`,
      `Verification should compare compressor kW, hours in free-cooling mode, chilled-water temperatures, ambient condition, process or comfort performance, and any auxiliary pump or fan changes to determine net project benefit.`,
    ],
    ahu_plug_fan: [
      `This ECM addresses retrofit of conventional AHU fan assemblies to plug-fan configuration or similar air-side efficiency improvement where the existing fan-motor-drive system has avoidable transmission and static-loss penalties.`,
      `The baseline should document present AHU duty, airflow requirement, static pressure, fan type, motor efficiency, belt and pulley condition if applicable, control range, occupancy pattern, and the constraints imposed by existing casing geometry.`,
      `The current inefficiency can come from lower fan-system efficiency, transmission losses, degraded balancing, and limited controllability at part load. Older assemblies may also suffer from maintenance burden and unstable airflow under throttled operation.`,
      `The proposed retrofit should define fan selection, motor rating, airflow and pressure guarantee point, control integration, acoustic treatment, access changes, balancing requirement, and commissioning checks for stable air distribution after replacement.`,
      `The saving rationale is that a high-efficiency direct-drive plug-fan system can reduce electrical loss, improve part-load turndown, eliminate belt losses, and improve control response while maintaining required ventilation or conditioned-air delivery.`,
      `Measurement and verification should include fan kW, airflow or proxy airflow measurement, static pressure, VFD frequency, operating hours, and indoor comfort or ventilation compliance before and after retrofit.`,
    ],
    ie5_motor_retrofit: [
      `This ECM involves replacement of an existing motor with a premium-efficiency IE5 motor in a duty where the present motor operates enough hours and load factor to justify the efficiency upgrade.`,
      `The baseline should confirm rated kW, measured current, operating factor, rewinding history, maintenance issues, ambient condition, coupling arrangement, and whether the driven equipment imposes any starting or torque constraints on the new motor selection.`,
      `Energy waste in the current arrangement arises from conversion loss in the older motor, especially when it runs for long annual hours on a stable duty cycle where incremental efficiency improvement translates directly into reduced kWh consumption.`,
      `The proposed project should define motor frame compatibility, insulation and protection class, alignment work, base-plate or coupling modifications, starter or VFD compatibility, and commissioning checks for current, temperature, and vibration.`,
      `The engineering rationale is straightforward: an IE5 motor reduces internal electrical and magnetic losses while delivering the same shaft output, which lowers input kW for the same mechanical duty when correctly sized and loaded.`,
      `Verification should compare measured kW, current, and operating hours under comparable duty; it should also confirm shaft load, production condition, and that the replaced motor was not materially underloaded or oversized in a way that distorts the saving estimate.`,
    ],
    compressed_air: [
      `This ECM belongs to compressed-air generation or distribution, where the real opportunity may include leakage reduction, pressure optimization, sequencing improvement, monitoring, or better compressor loading discipline.`,
      `The existing system should be described through compressor type and rating, loading-unloading profile, discharge pressure, receiver arrangement, dryer pressure drop, end-use demand profile, leakage symptoms, and whether control currently forces artificial demand at elevated pressure.`,
      `Compressed air is intrinsically expensive because only a fraction of input electrical energy becomes useful pneumatic work. Any avoidable leakage, unloaded running, excessive pressure setting, or poor sequencing therefore creates disproportionate operating cost.`,
      `The project scope should define exactly whether this ECM is pressure management, leakage management, compressor control optimization, measurement management, motor upgrade, or a combination of these actions. The execution plan should include survey, correction, controls review, and operator training.`,
      `Savings arise when compressor power and running hours are reduced by cutting leak flow, avoiding artificial demand, improving sequencing, or lowering specific power. These improvements must be tied to measured baseline data rather than broad assumptions.`,
      `Verification should include compressor kW, line pressure trend, loading-unloading behavior, flow if available, leak-load profile during no-production hours, and annualized operating-hour normalization after implementation.`,
    ],
    ct_fan_pmsm: [
      `This ECM addresses replacement or retrofit of cooling-tower fan drive equipment with a PMSM or similarly efficient drive arrangement intended to reduce fan-system energy while preserving heat rejection capability.`,
      `The baseline should capture existing fan motor rating, fan blade condition, gearbox or transmission losses where applicable, fan-control method, condenser-water temperature profile, seasonal ambient impact, and interaction with chiller sequencing.`,
      `The energy gap often appears where legacy induction-motor and transmission arrangements operate for long hours with modest load variation, making them suitable for efficiency improvement through direct-drive or higher-efficiency motor technology.`,
      `The project scope should define mechanical compatibility, motor selection, control integration, weather protection, maintenance access, and commissioning tests for rotation, vibration, and condenser-water temperature control after retrofit.`,
      `The energy-saving rationale is that a PMSM-based arrangement reduces motor loss and, where direct-drive architecture is used, can also remove transmission losses while preserving or improving controllability of cooling-tower airflow.`,
      `Verification should compare fan kW, condenser-water temperature performance, fan operating hours, ambient wet-bulb condition, and the number of active tower cells before and after retrofit to establish net benefit.`,
    ],
    grinder_motor_retrofit: [
      `This ECM applies to grinder-duty motor replacement or improvement, where an aging or inefficient motor consumes excess electrical power for a repetitive mechanical process duty that is stable enough to evaluate reliably.`,
      `The existing condition should document motor rating, process cycle, torque demand, loading variation, start-stop frequency, rewinding history, and any productivity or overheating issues associated with the current motor.`,
      `The technical gap may include lower motor efficiency, poor loading, repeated rewinding, higher slip, and excess temperature rise that increases energy use and reduces motor life on a continuous or heavily repeated process duty.`,
      `The retrofit scope should define replacement motor efficiency class, shaft and mounting compatibility, starter or VFD settings, thermal protection, and trial observations to confirm that process throughput and product quality remain unaffected.`,
      `Savings are expected because a higher-efficiency motor requires lower electrical input for the same shaft output. The justification improves when annual operating hours are high and the driven machine duty is consistent enough for measured comparison.`,
      `Verification should compare input kW, cycle profile, output rate if relevant, and annual operating hours under comparable production conditions before and after motor retrofit.`,
    ],
    pd_blower: [
      `This ECM addresses positive-displacement blower energy performance, where current operation may rely on fixed-speed running, throttling, or an over-conservative pressure regime that causes avoidable power draw.`,
      `The present system should be documented for blower type, pressure set point, flow requirement, relief or bypass behavior, control philosophy, process demand variation, and whether excess pressure is being created and then dissipated downstream.`,
      `The problem usually appears as constant-speed operation against variable demand, recirculation or throttling losses, elevated discharge pressure, and lack of feedback-driven control tuned to the real process requirement.`,
      `The proposed project should define whether the action is VFD control, pressure optimization, blower replacement, piping correction, or another specific intervention. It should also define control safeguards so the process remains stable after energy optimization.`,
      `Savings arise when discharge pressure and flow are better matched to demand, thereby reducing blower power while still maintaining required process air delivery and avoiding artificial pressure margins.`,
      `Verification should compare blower kW, discharge pressure, flow where measurable, process stability indicators, and operating hours before and after implementation.`,
    ],
    apfc: [
      `This ECM concerns APFC or power-factor correction, where the current electrical system may be drawing avoidable reactive power or suffering poor step control, degraded capacitors, or harmonic-related underperformance.`,
      `The baseline should include average power factor, kVA demand, utility billing basis, kvar requirement, panel condition, capacitor health, detuning status where relevant, relay behavior, and load variation across operating shifts.`,
      `The energy and financial gap appears when the plant pays a billing penalty, experiences elevated kVA demand, or operates with unstable power-factor correction due to failed steps, incorrect set points, or unsuitable capacitor-bank configuration.`,
      `The project scope should define panel refurbishment or replacement, relay logic correction, step sizing, protection arrangement, ventilation, harmonic suitability, and commissioning tests required for reliable APFC operation.`,
      `The rationale is that appropriate reactive-power compensation reduces apparent demand and improves the electrical operating condition of the site. The commercial benefit must be linked to actual billing structure and observed power-factor trend rather than assumed alone.`,
      `Verification should compare average and minimum power factor, kvar step response, kVA demand, utility-bill impact, and panel stability before and after corrective action.`,
    ],
    pump_optimization: [
      `This ECM is a pump-optimization measure outside the more specific chilled-water scenarios, and it should explain how the present pumping duty mismatches actual process requirement.`,
      `The current system should be described in terms of pump duty point, throttling practice, parallel operation, head requirement, process-demand variation, control method, and whether the present arrangement is oversized or permanently conservative.`,
      `Energy waste generally occurs when pumps operate at fixed speed against variable demand, sustain excess differential pressure, or run more units than the process actually requires.`,
      `The project scope should define the optimization approach such as VFD control, sequencing revision, impeller trim, piping correction, or operating-set-point review along with the commissioning checks needed to maintain process reliability.`,
      `The energy-saving rationale is that pump power reduces materially when flow and head are brought closer to actual demand, particularly where throttling or bypass losses are removed and parallel operation is rationalized.`,
      `Verification should compare pump kW, flow or proxy flow, pressure or head, operating hours, and process-service quality before and after optimization.`,
    ],
    hvac_general: [
      `This ECM belongs to HVAC utility optimization and should connect cooling production, water movement, air movement, controls, and part-load operation rather than treating the measure as a generic building note.`,
      `The existing system description should include installed equipment, control philosophy, temperature set points, loading variation, occupancy or process demand profile, and where the current operating strategy fails to adapt to part-load conditions.`,
      `Energy waste in HVAC systems is commonly driven by excess flow, conservative temperature margins, simultaneous operation of unnecessary equipment, fixed-speed auxiliaries, poor sequencing, or weak feedback control.`,
      `The proposed intervention should define exactly what control, equipment, or sequencing changes will be implemented and how comfort or process conditions will be protected during and after the change.`,
      `Savings result when refrigeration, pumping, and fan energy are better aligned with the real thermal load and when avoidable parasitic operation is removed without compromising cooling reliability.`,
      `Verification should compare utility kW, temperature profile, operating hours, sequencing state, and user or process-service outcomes before and after the measure.`,
    ],
    general_energy_project: [
      `This ECM should be narrated as a specific implementation-ready energy project using the extracted title, equipment, and quantified savings rather than broad audit language.`,
      `The existing arrangement should clarify how the current equipment operates, what the dominant energy driver is, and which measurements or observations justify the project recommendation.`,
      `The problem statement should identify the real loss mechanism, whether it is conversion inefficiency, excess operating hours, throttling, leakage, thermal loss, poor control logic, or weak equipment condition.`,
      `The proposed scope should be written so that engineering, procurement, plant operations, and vendors can understand exactly what will change and what will need to be commissioned afterward.`,
      `The rationale should tie the recommended intervention directly to reduced electrical or thermal input while preserving the extracted financial and technical values already assigned to the ECM.`,
      `Verification should compare baseline and post-implementation performance under similar conditions so the savings remain defendable and client-ready.`,
    ],
  };

  const sectionAdditions = {
    existingSystemDescription: [
      `The current baseline description should name the operating mode, shift pattern, control limitations, equipment condition, and the measurements that define the present energy-use profile.`,
      `Any missing operating fact should be marked for field verification instead of being guessed, because the client-facing report must remain technically credible.`,
    ],
    problemGapIdentified: [
      `The gap analysis should clearly separate observed condition, engineering consequence, and cost consequence so the reader understands not just that inefficiency exists, but why it persists in the current arrangement.`,
      `Where the present system is conservative by design, the narrative should explain which safety or process requirement is valid and which excess margin has become avoidable energy loss.`,
    ],
    proposedProject: [
      `The implementation narrative should spell out the intervention boundary, controls integration, fabrication or procurement needs, shutdown planning, commissioning sequence, and the handover expectation for the site team.`,
      `Any dependency on BMS logic, instrumentation, valve changes, duct or pipe changes, or OEM input should be stated explicitly to prevent the ECM from sounding vague or generic.`,
    ],
    rationaleForEnergySaving: [
      `The rationale should explain the physics or control logic behind the reduction in electrical or thermal demand and should also state any assumptions that must be validated through field measurement.`,
      `This section must preserve extracted numbers and use narrative only to explain how the saving mechanism works in practice.`,
    ],
    measurementVerificationPlan: [
      `The M and V plan should make it possible for a project manager to know what data to log, how long to log it, how to normalize weather or production variation, and what threshold would count as successful implementation.`,
      `The verification plan should also mention exceptions, such as shutdowns, seasonal variation, production changes, or maintenance events that can distort the comparison if not tracked.`,
    ],
    benefitsOtherThanEnergySaving: [
      `Non-energy benefits should be realistic and linked to the equipment, such as reduced maintenance stress, better control stability, lower noise, improved operator confidence, or stronger process repeatability.`,
      `These benefits strengthen implementation priority, but they should remain supportive to the validated saving claim rather than replacing it.`,
    ],
    conclusion: [
      `The conclusion should leave the client with a clear recommendation, the key dependency to close before execution, and the reason this ECM remains technically justified after verification.`,
      `It should sound implementation-ready and not like a generic placeholder summary.`,
    ],
  };

  return [...common, ...(libraries[type] || libraries.general_energy_project), ...(sectionAdditions[section] || [])];
}

function hasUsefulLongText(value, minWords) {
  return countWords(value) >= minWords;
}

function clampToMaxWords(text, maxWords) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return String(text || "").trim();
  return words.slice(0, maxWords).join(" ");
}

function expandToTarget(project = {}, section) {
  const target = TARGETS[section] || { min: 500, max: 900 };
  const existing = String(project[section] || "").trim();
  let bullets = [];

  if (existing && !/\[to be updated|\[calculation pending|data required/i.test(existing)) {
    bullets = existing
      .split(/\n+/)
      .map((line) => String(line || "").replace(/^[*-]\s*/, "").trim())
      .filter(Boolean);
  }

  const library = ecmSpecificBullets(project, section);
  let pointer = 0;

  while (countWords(toBulletText(bullets)) < target.min) {
    bullets.push(library[pointer % library.length]);
    bullets.push(
      `For ${projectFacts(project).title}, this ${section} narrative should remain aligned with actual site measurements, implementation constraints, and the extracted commercial values so that the final report stays client-ready and technically defensible.`
    );
    pointer += 1;
    if (pointer > library.length * 6) break;
  }

  return toBulletText(
    clampToMaxWords(toBulletText(bullets), target.max)
      .split(/\n+/)
      .map((line) => line.replace(/^[*-]\s*/, "").trim())
  );
}

function expandProject(project = {}) {
  const next = { ...project };

  Object.keys(TARGETS).forEach((field) => {
    if (!hasUsefulLongText(next[field], TARGETS[field].min)) {
      next[field] = expandToTarget(next, field);
    } else {
      next[field] = toBulletText(String(next[field]).split(/\n+/));
    }
  });

  next.ecmClassification = classifyEcm(next);
  return next;
}

function expandReportEngineeringNarratives(reportData = {}) {
  const cloned = JSON.parse(JSON.stringify(reportData || {}));
  const groups = Array.isArray(cloned.groups) ? cloned.groups : [];

  cloned.groups = groups.map((group) => ({
    ...group,
    projects: Array.isArray(group?.projects) ? group.projects.map(expandProject) : [],
  }));

  const allProjects = cloned.groups.flatMap((group) => group.projects || []);

  cloned.groupedProjects = cloned.groups;
  cloned.projects = allProjects;
  cloned.executiveSummary = {
    ...(cloned.executiveSummary || {}),
    purposeText: hasUsefulLongText(cloned.executiveSummary?.purposeText, 180)
      ? toBulletText(String(cloned.executiveSummary.purposeText).split(/\n+/))
      : toBulletText([
          "This audit report converts extracted ECM data into a client-ready implementation narrative while preserving the deterministic project list, project titles, savings, investment, and payback values already derived from the uploaded source files.",
          "The purpose of the report is to explain how each ECM affects system performance, what engineering checks are required before execution, and how the site team can move from extracted spreadsheet data to a defendable implementation plan.",
          "The report therefore combines stable project identity, technical explanation, execution scope, and measurement-verification intent so management, engineering, maintenance, and vendors can work from one consistent project definition.",
        ]),
    conclusionAndWayForward: hasUsefulLongText(
      cloned.executiveSummary?.conclusionAndWayForward,
      180
    )
      ? toBulletText(String(cloned.executiveSummary.conclusionAndWayForward).split(/\n+/))
      : toBulletText([
          "The ECMs should now be reviewed in retained filtered order, validated with site measurements, and prioritized according to technical readiness, implementation complexity, savings confidence, and shutdown dependencies.",
          "Projects with quick implementation path and strong payback should move first, while control-heavy or integration-heavy measures should proceed through a defined engineering approval and commissioning plan.",
          "Every implemented ECM should be verified against the baseline and post-implementation data described in the report so the realized benefit remains traceable, measurable, and client-defensible.",
        ]),
    summaryOfIdentifiedProjects: allProjects,
  };
  cloned.enhancementMeta = {
    ...(cloned.enhancementMeta || {}),
    engineeringExpansionApplied: true,
    expandedAt: new Date().toISOString(),
  };

  return cloned;
}

module.exports = {
  TARGETS,
  classifyEcm,
  countWords,
  expandReportEngineeringNarratives,
};
