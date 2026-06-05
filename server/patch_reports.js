const fs = require('fs');
let reportsContent = fs.readFileSync('endpoints/reports.js', 'utf8');

const importsToAdd = `
  const { detectWorkbookType } = require("../services/inputFileRouterService");
  const { extractVrChennaiWorkbook } = require("../services/vrChennaiWorkbookExtractor");
  const xlsx = require("xlsx");
`;

reportsContent = reportsContent.replace(
  `  const {
    extractLightweightExcelData,
  } = require("../services/lightweightExcelExtractor");`,
  `  const {
    extractLightweightExcelData,
  } = require("../services/lightweightExcelExtractor");${importsToAdd}`
);

const newRoutingLogic = `
        // 3. Fast deterministic multi-file extraction
        if (excelFiles.length > 0) {
          const baseStorageDir = path.resolve(__dirname, "../../storage");
          let isVrChennai = false;
          let vrChennaiResult = null;
          
          try {
            // Check first file
            const primaryFile = excelFiles[0];
            const filePath = path.join(baseStorageDir, primaryFile.filename || primaryFile.originalName || primaryFile.name);
            if (fs.existsSync(filePath)) {
               const workbook = xlsx.readFile(filePath, { bookSheets: true });
               const detection = detectWorkbookType(workbook, primaryFile.originalName);
               if (detection.type === "vr_chennai_ecm_workbook_v1") {
                  isVrChennai = true;
                  const fullWorkbook = xlsx.readFile(filePath);
                  vrChennaiResult = extractVrChennaiWorkbook(fullWorkbook, primaryFile.originalName);
                  
                  if (vrChennaiResult.validationErrors.length > 0) {
                     return response.status(422).json({
                        success: false,
                        error: "VR Chennai extraction failed quality gate: " + vrChennaiResult.validationErrors.join(", "),
                        extractionSummary: vrChennaiResult.extractionDebug
                     });
                  }
                  
                  extractedProjects = vrChennaiResult.projects;
                  extractionDebug = vrChennaiResult.extractionDebug;
                  extractionDebug.vrChennaiSpecificData = {
                     energyProfile: vrChennaiResult.energyProfile,
                     connectedLoad: vrChennaiResult.connectedLoad,
                     costingData: vrChennaiResult.costingData
                  };
               }
            }
          } catch(e) {
            console.error("Workbook detection error", e);
          }
          
          if (!isVrChennai) {
            try {
              // Give 15 seconds for multi-file extraction
              const extraction = await withTimeout(
`;

reportsContent = reportsContent.replace(
  `        // 3. Fast deterministic multi-file extraction
        if (excelFiles.length > 0) {
          const baseStorageDir = path.resolve(__dirname, "../../storage");
          try {
            // Give 15 seconds for multi-file extraction
            const extraction = await withTimeout(`,
  newRoutingLogic
);

reportsContent = reportsContent.replace(
  `            if (extraction.success && extraction.projects && extraction.projects.length > 0) {
              extractedProjects = extraction.projects;
              extractionDebug = extraction.extractionDebug;
            }
          } catch (e) {`,
  `            if (extraction.success && extraction.projects && extraction.projects.length > 0) {
              extractedProjects = extraction.projects;
              extractionDebug = extraction.extractionDebug;
            }
          } catch (e) {`
);

// We need to close the !isVrChennai block.
reportsContent = reportsContent.replace(
  `          } catch (e) {
            extractionAttempts.push({
              filename: "multi-file",
              status: "timeout or error",
              error: e.message,
            });
          }
        }`,
  `          } catch (e) {
            extractionAttempts.push({
              filename: "multi-file",
              status: "timeout or error",
              error: e.message,
            });
          }
         } // end !isVrChennai
        }`
);


// Now insert the vrChennai mapping in `reportData = filterReportProjects(reportData);`
const mappingLogic = `
        let reportData = buildLightweightReportData(
          extractedProjects,
          reportDetails
        );
        reportData = filterReportProjects(reportData);
        reportData = enforceReportQuality(reportData);

        if (extractionDebug?.vrChennaiSpecificData) {
            reportData.energyProfile = extractionDebug.vrChennaiSpecificData.energyProfile;
            reportData.connectedLoad = extractionDebug.vrChennaiSpecificData.connectedLoad;
            reportData.costingData = extractionDebug.vrChennaiSpecificData.costingData;
            
            if (reportData.energyProfile) {
                reportData.executiveSummary.totalEnergySavingPotential = extractionDebug.totalEnergySaving || reportData.executiveSummary.totalEnergySavingPotential;
                reportData.executiveSummary.totalAnnualCostSavingPotential = extractionDebug.totalAnnualSaving || reportData.executiveSummary.totalAnnualCostSavingPotential;
            }
        }
`;

reportsContent = reportsContent.replace(
  `        let reportData = buildLightweightReportData(
          extractedProjects,
          reportDetails
        );
        reportData = filterReportProjects(reportData);
        reportData = enforceReportQuality(reportData);`,
  mappingLogic
);

fs.writeFileSync('endpoints/reports.js', reportsContent);
console.log("Applied changes to reports.js");
