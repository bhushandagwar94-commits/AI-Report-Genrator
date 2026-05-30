process.env.NODE_ENV = "development";

const path = require("path");
const fs = require("fs");
const ExcelJS = require(path.join(__dirname, "..", "server", "node_modules", "exceljs"));
const { extractAuthoritativeExcelProjects } = require(path.join(__dirname, "..", "server", "endpoints", "reports"));
const { generateCommercialAuditComponentReport } = require(path.join(__dirname, "..", "server", "services", "reportPipeline"));
const { buildCommercialBuildingEnergyAuditDocx } = require(path.join(__dirname, "..", "server", "services", "docxExportService"));

const workbookPath = path.join(__dirname, "..", "collector", "hotdir", "MTL Baddi 2 ECM new(3).xlsx");

async function runTest(useAi) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const extraction = extractAuthoritativeExcelProjects(workbook);

  const result = await generateCommercialAuditComponentReport({
    formData: {
      clientName: "MTL Baddi",
      facilityName: "MTL Baddi",
      location: "Baddi",
      auditPeriod: "2026-05",
      contactPerson: "Manager",
    },
    extractedExcelData: extraction,
    extractedInfo: {},
    imageMetadata: [],
    uploadedFiles: [{ filename: "MTL Baddi 2 ECM new(3).xlsx", originalname: "MTL Baddi 2 ECM new(3).xlsx" }],
    templateConfig: {},
    useAiOverride: useAi,
  });

  return result;
}

async function main() {
  console.log("=== RUNNING WITH AI DISABLED ===");
  const deterministicResult = await runTest(false);
  const deterministicReport = deterministicResult.report;

  console.log("\\n=== RUNNING WITH AI ENABLED ===");
  const aiResult = await runTest(true);
  const aiReport = aiResult.report;

  console.log("\\n=== A. Classification Correctness ===");
  const targets = [1, 2, 5, 6, 7, 12, 13, 14, 15, 16, 21, 22];
  targets.forEach(num => {
    const p = deterministicReport.projects.find(p => p.projectNo == num);
    if (p) {
        // Need to simulate classifyEcmType since we don't return it directly on the project
        // But we can check the generated deterministic text to infer the classification.
        // Actually, we can just require classifyEcmType... Wait, it's not exported.
        // I will just print the project title and the baseline to show it's using the right template.
        console.log(`ECM ${num}: ${p.projectTitle}`);
        console.log(`  Type inferred from text: ${p.existingSystemDescription.includes('exhausts thermal energy') ? 'heat_recovery' : p.existingSystemDescription.includes('exposed or inadequately') ? 'thermal_insulation' : p.existingSystemDescription.includes('IR') || p.existingSystemDescription.includes('band') ? 'ir_heater_or_band_heater_replacement' : p.existingSystemDescription.includes('servo') || p.existingSystemDescription.includes('fixed displacement hydraulic') ? 'servo_hydraulic_retrofit' : p.existingSystemDescription.includes('compressed air network') ? 'compressed_air_management' : p.existingSystemDescription.includes('IE5-class') || p.existingSystemDescription.includes('older, lower-efficiency induction motor') ? 'motor_retrofit_ie5_pmsm' : p.existingSystemDescription.includes('sub-optimal power factor') ? 'apfc_power_factor_correction' : p.existingSystemDescription.includes('cooling system') ? 'cooling_system_optimization' : p.existingSystemDescription.includes('Variable Frequency Drives') || p.existingSystemDescription.includes('fluid/air handling') ? 'pump_flow_optimization' : 'general'}`);
    } else {
        console.log(`ECM ${num} not found`);
    }
  });

  console.log("\\n=== B. Before/After Quality Evidence ===");
  const testEcms = [13, 14, 15, 16, 21, 12];
  testEcms.forEach(num => {
    const pd = deterministicReport.projects.find(p => p.projectNo == num);
    const pa = aiReport.projects.find(p => p.projectNo == num);
    if (pd && pa) {
        console.log(`\\n--- ECM ${num}: ${pd.projectTitle} ---`);
        console.log(`[Deterministic] Existing: ${pd.existingSystemDescription}`);
        console.log(`[AI] Existing: ${pa.existingSystemDescription}`);
        console.log(`[Deterministic] Problem: ${pd.problemGapIdentified}`);
        console.log(`[AI] Problem: ${pa.problemGapIdentified}`);
        console.log(`[Deterministic] Proposed: ${pd.proposedProjectDescription || pd.projectActivitiesText}`);
        console.log(`[AI] Proposed: ${pa.proposedProjectDescription || pa.projectActivitiesText}`);
    }
  });

  console.log("\\n=== C. QC Scan Result ===");
  console.log(`Warnings found: ${aiResult.warnings ? aiResult.warnings.length : 0}`);
  if (aiResult.warnings) console.log(aiResult.warnings);

  console.log("\\n=== D. Value Preservation ===");
  console.log(`ECM Count: ${aiReport.projects.length}`);
  console.log(`Total Investment: ${aiReport.executiveSummary.totalEstimatedInvestment}`);
  console.log(`Total Annual Saving: ${aiReport.executiveSummary.totalAnnualCostSavingPotential}`);
  console.log(`Total Energy Saving: ${aiReport.executiveSummary.totalEnergySavingPotential}`);
  
  console.log("\\n=== E. AI Behavior ===");
  console.log(`AI Enabled: ${aiResult.aiEnhanced}`);
  console.log(`Status: ${aiResult.aiEnhancementStatus}`);
  
  console.log("\\n=== F. Final Result ===");
  const docxBytes = await buildCommercialBuildingEnergyAuditDocx(aiReport);
  console.log(`DOCX Bytes generated: ${docxBytes.length}`);
  fs.writeFileSync(path.join(__dirname, "..", "tmp-ai-report.docx"), docxBytes);
  fs.writeFileSync(path.join(__dirname, "..", "tmp-real-backend-data.json"), JSON.stringify(aiReport, null, 2));
  console.log("Saved tmp-ai-report.docx");

  process.exit(0);
}

main().catch(console.error);
