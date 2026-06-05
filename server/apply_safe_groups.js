const fs = require('fs');
const path = require('path');

const helperCode = `
function normalizeReportGroups(reportData) {
  if (!reportData || typeof reportData !== "object") {
    return {
      templateId: "commercial-building-energy-audit",
      extractionFormat: "safe_empty_report",
      groups: [],
      projects: [],
      summary: {},
      executiveSummary: {},
      validationWarnings: ["Report data was empty or null before group normalization."]
    };
  }

  const normalized = { ...reportData };

  if (!Array.isArray(normalized.groups)) {
    if (Array.isArray(normalized.projects) && normalized.projects.length > 0) {
      normalized.groups = [
        {
          groupNo: "GR-1",
          groupName: "Energy Conservation Measures",
          projects: normalized.projects
        }
      ];
    } else {
      normalized.groups = [];
    }
  }

  normalized.groups = normalized.groups.map((group, index) => ({
    groupNo: group.groupNo || \`GR-\${index + 1}\`,
    groupName: group.groupName || group.name || "Energy Conservation Measures",
    projects: Array.isArray(group.projects) ? group.projects : []
  }));

  return normalized;
}

module.exports = {
  normalizeReportGroups
};
`;

fs.writeFileSync('server/utils/groupHelper.js', helperCode);

// Helper to patch a file
function patchFile(filePath, replacer) {
  if (fs.existsSync(filePath)) {
    let code = fs.readFileSync(filePath, 'utf8');
    const newCode = replacer(code);
    if (code !== newCode) {
      fs.writeFileSync(filePath, newCode);
      console.log('Patched ' + filePath);
    }
  }
}

// 1. Patch server/endpoints/reports.js
patchFile('server/endpoints/reports.js', (code) => {
  // Inject import
  if (!code.includes('normalizeReportGroups')) {
    code = code.replace(
      'const { getVectorDbClass } = require("../utils/helpers");',
      'const { getVectorDbClass } = require("../utils/helpers");\nconst { normalizeReportGroups } = require("../utils/groupHelper");'
    );
  }

  // Inject NULL check
  const target1 = `        let reportData = buildLightweightReportData(
          extractedProjects,
          reportDetails
        );`;
        
  const replace1 = `        let reportData = buildLightweightReportData(
          extractedProjects,
          reportDetails
        );
        
        if (!reportData) {
          console.error("[GENERATE_REPORTDATA_NULL]", {
            uploadedFiles: request.files?.map(f => f.originalname || f.filename),
            message: "Extraction returned null reportData"
          });

          return response.status(400).json({
            success: false,
            error: "Report generation failed because no report data was built from uploaded files.",
            details: "Extractor returned null reportData. Please check file format or extraction logs."
          });
        }`;

  code = code.replace(target1, replace1);

  // Inject Normalizer and Log
  const target2 = `        reportData = filterReportProjects(reportData);
        reportData = enforceReportQuality(reportData);`;

  const replace2 = `        reportData = filterReportProjects(reportData);
        reportData = enforceReportQuality(reportData);
        reportData = normalizeReportGroups(reportData);
        
        console.log("[GENERATE_REPORTDATA_NORMALIZED]", {
          hasReportData: !!reportData,
          groupCount: reportData.groups.length,
          projectCount: reportData.groups.reduce((sum, g) => sum + (g.projects || []).length, 0),
          extractionFormat: reportData.extractionFormat
        });`;

  code = code.replace(target2, replace2);

  // Replace unsafe projectCount
  code = code.replace(
    `const projectCount = (reportData.groups || []).reduce(`,
    `const projectCount = reportData.groups.reduce(`
  );
  code = code.replace(
    `(sum, group) => sum + (Array.isArray(group.projects) ? group.projects.length : 0),`,
    `(sum, group) => sum + group.projects.length,`
  );

  // Add EXTRACTION_OUTPUT_DEBUG before save
  code = code.replace(
    `const dbResponse = await safeCreateGeneratedReport(prisma, {`,
    `console.log("[EXTRACTION_OUTPUT_DEBUG]", {
          hasReportData: !!reportData,
          keys: Object.keys(reportData || {}),
          hasGroups: Array.isArray(reportData?.groups),
          groupCount: reportData?.groups?.length || 0,
          projectCount: projectCount,
          extractionFormat: reportData?.extractionFormat
        });
        
        if (!reportData || !reportData.groups || reportData.groups.length === 0) {
          console.error("[GENERATION_STOPPED_NO_GROUPS]", {
            reason: "Groups array is empty after normalization",
            uploadedFiles: request.files?.map(f => f.originalname || f.filename)
          });
        }

        const dbResponse = await safeCreateGeneratedReport(prisma, {`
  );

  return code;
});

// 2. Patch server/services/reportQualityEnforcer.js
patchFile('server/services/reportQualityEnforcer.js', (code) => {
  if (!code.includes('normalizeReportGroups')) {
    code = 'const { normalizeReportGroups } = require("../utils/groupHelper");\n' + code;
  }
  code = code.replace(/cloned\.groups = safeArray\(cloned\.groups\)/g, 'cloned = normalizeReportGroups(cloned); cloned.groups = cloned.groups');
  code = code.replace(/cloned\.groups\?\./g, 'cloned.groups.');
  return code;
});

// 3. Patch server/services/projectQualityFilter.js
patchFile('server/services/projectQualityFilter.js', (code) => {
  if (!code.includes('normalizeReportGroups')) {
    code = 'const { normalizeReportGroups } = require("../utils/groupHelper");\n' + code;
  }
  code = code.replace(/function normalizeGroups\(reportData = \{\}\) \{[\s\S]*?return \[\];\n\}/, 
    `function normalizeGroups(reportData = {}) {
      return normalizeReportGroups(reportData).groups;
    }`
  );
  return code;
});

// 4. Patch frontend/src/pages/Reports/Public/index.jsx
const frontendPath = 'frontend/src/pages/Reports/Public/index.jsx';
if (fs.existsSync(frontendPath)) {
  let fCode = fs.readFileSync(frontendPath, 'utf8');
  fCode = fCode.replace(
    /generatedReport\.reportData\.groups/g,
    `(Array.isArray(generatedReport?.reportData?.groups) ? generatedReport.reportData.groups : [])`
  );
  fs.writeFileSync(frontendPath, fCode);
  console.log('Patched ' + frontendPath);
}

console.log("All patches applied.");
