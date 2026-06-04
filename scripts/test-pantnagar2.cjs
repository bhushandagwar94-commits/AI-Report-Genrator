process.env.NODE_ENV = "development";

const path = require("path");
const ExcelJS = require(path.join(__dirname, "..", "server", "node_modules", "exceljs"));
const { extractAuthoritativeExcelProjects } = require(path.join(__dirname, "..", "server", "endpoints", "reports"));
const {
  buildCommercialBuildingEnergyAuditBaseData,
  validateCommercialBuildingEnergyAuditSchema,
  runReportQC,
  calculateReportAccuracyScore,
} = require(path.join(__dirname, "..", "server", "services", "llmProviderService"));
const { buildCommercialBuildingEnergyAuditDocx } = require(path.join(__dirname, "..", "server", "services", "docxExportService"));

const workbookPath = path.join(__dirname, "..", "collector", "hotdir", "Pantnagar Unit 1 HUSKY 1.xlsx");

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  const extraction = extractAuthoritativeExcelProjects(workbook);
  const reportData = buildCommercialBuildingEnergyAuditBaseData({
    inputDetails: {
      clientName: "MTL Baddi",
      facilityName: "MTL Baddi",
      location: "Baddi",
      reportDate: new Date().toISOString().split("T")[0],
    },
    extractedExcelData: extraction,
    uploadedFiles: [{ filename: path.basename(workbookPath) }],
  });

  const schemaValidation = validateCommercialBuildingEnergyAuditSchema(reportData);
  const qcResult = runReportQC(reportData);
  const accuracyResult = calculateReportAccuracyScore(reportData);
  const docxBuffer = await buildCommercialBuildingEnergyAuditDocx(reportData);
  const groupWiseCount = Object.fromEntries(
    (reportData.groupedProjects || []).map((group) => [group.groupTitle, group.projects.length])
  );

  const expectedCounts = {
    "Cooling System Performance Improvement": 7,
    "Production Machines": 8,
    "Air Compressors": 2,
    "Auxiliary Systems & Machine Improvement": 5,
  };

  const pass =
    extraction.rawRowCount === 25 &&
    reportData.projects.length === 22 &&
    Object.keys(expectedCounts).every((key) => groupWiseCount[key] === expectedCounts[key]) &&
    schemaValidation.success &&
    qcResult.qcPassed &&
    accuracyResult.score >= 90;

  const payload = {
    workbook: workbookPath,
    rawRowCount: extraction.rawRowCount,
    columnMappingConfidence: extraction.mappingConfidence,
    extractedEcmCount: extraction.projects.length,
    finalEcmCount: reportData.projects.length,
    groupWiseCount,
    firstFiveRowMappingAudit: extraction.auditRows.slice(0, 5),
    removedRows: extraction.removedRows,
    finalEcmTitles: reportData.projects.map((project) => project.projectTitle),
    schemaValidation,
    qcResult: {
      qcPassed: qcResult.qcPassed,
      summary: qcResult.summary,
      qcErrors: qcResult.qcErrors,
      qcWarnings: qcResult.qcWarnings,
    },
    accuracyResult,
    docxBytes: docxBuffer.length,
    pass,
  };

  console.log(JSON.stringify(payload, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
