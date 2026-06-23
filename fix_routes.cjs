const fs = require('fs');
let code = fs.readFileSync('server/endpoints/reports.js', 'utf8');

if (!code.includes('const AdmZip = require(\'adm-zip\')')) {
  code = code.replace(
    'const ExcelJS = require(\'exceljs\');',
    'const AdmZip = require(\'adm-zip\');\nconst ExcelJS = require(\'exceljs\');'
  );
}

if (!code.includes('function validateDocxBuffer(buffer) {')) {
  code = code.replace(
    'function normalizeActiveReportData(reportData) {',
    `function validateDocxBuffer(buffer) {
  const result = {
    valid: false,
    bufferLength: buffer?.length || 0,
    startsWithPK: false,
    hasContentTypes: false,
    hasDocumentXml: false,
    hasRootRels: false,
    hasDocumentRels: false,
    error: null
  };

  try {
    if (!buffer || buffer.length < 1000) {
      result.error = 'DOCX buffer missing or too small';
      return result;
    }

    result.startsWithPK = buffer[0] === 0x50 && buffer[1] === 0x4b;

    if (!result.startsWithPK) {
      result.error = 'DOCX does not start with PK zip signature';
      return result;
    }

    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().map(e => e.entryName);

    result.hasContentTypes = entries.includes('[Content_Types].xml');
    result.hasDocumentXml = entries.includes('word/document.xml');
    result.hasRootRels = entries.includes('_rels/.rels');
    result.hasDocumentRels = entries.includes('word/_rels/document.xml.rels');

    result.valid =
      result.startsWithPK &&
      result.hasContentTypes &&
      result.hasDocumentXml &&
      result.hasRootRels &&
      result.hasDocumentRels;

    if (!result.valid) {
      result.error = 'DOCX zip missing required internal Word files';
    }

    return result;
  } catch (error) {
    result.error = error.message;
    return result;
  }
}

function normalizeActiveReportData(reportData) {`
  );
}

const newRoute = `
  app.post('/export-docx', async (req, res) => {
  const debugDir = path.join(__dirname, '../debug-extraction');
  fs.mkdirSync(debugDir, { recursive: true });

  try {
    const incomingReportData =
      req.body?.reportData ||
      req.body?.data ||
      req.body ||
      {};

    const ecms =
      incomingReportData.ecms ||
      incomingReportData.detailedEcMs ||
      incomingReportData.detailedEcms ||
      [];

    const docxReportData = {
      ...incomingReportData,
      ecms,
      detailedEcMs: ecms,
      detailedEcms: ecms
    };

    let buffer = null;
    let rendererUsed = 'safeDocxRenderer';

    try {
      buffer = await renderSafeDocx(docxReportData);
    } catch (rendererError) {
      console.error('SAFE_DOCX_RENDERER_FAILED', rendererError);
      throw rendererError;
    }

    let validation = validateDocxBuffer(buffer);

    fs.writeFileSync(
      path.join(debugDir, 'latest-docx-validation.json'),
      JSON.stringify({
        rendererUsed,
        validation,
        ecmCount: ecms.length,
        time: new Date().toISOString()
      }, null, 2)
    );

    if (!validation.valid) {
      throw new Error(\`Invalid DOCX generated: \${validation.error}\`);
    }

    const outputPath = path.join(debugDir, 'latest-browser-sent-report.docx');
    fs.writeFileSync(outputPath, buffer);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="SEE-Tech_Detailed_Energy_Audit_Report.docx"'
    );
    res.setHeader('Content-Length', buffer.length);

    return res.end(buffer);
  } catch (error) {
    console.error('DOCX_EXPORT_FAILED', error);

    fs.writeFileSync(
      path.join(debugDir, 'latest-docx-export-error.json'),
      JSON.stringify({
        message: error.message,
        stack: error.stack,
        time: new Date().toISOString()
      }, null, 2)
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
`;

// Let's replace the whole app.post('/reports/:id/export/docx') block
// From line 3237 to 3546
const startMarker = 'app.post(';
const routeName = '"/reports/:id/export/docx",';
const endMarker = 'app.post(';
const endRouteName = '"/reports/:id/training-data/corrected-docx",';

const startIndex = code.indexOf(routeName);
if (startIndex !== -1) {
    const actualStart = code.lastIndexOf(startMarker, startIndex);
    const endIndex = code.indexOf(endRouteName);
    const actualEnd = code.lastIndexOf(endMarker, endIndex);
    
    if (actualStart !== -1 && actualEnd !== -1) {
        code = code.substring(0, actualStart) + newRoute + code.substring(actualEnd);
        fs.writeFileSync('server/endpoints/reports.js', code);
        console.log('Successfully replaced export route.');
    } else {
        console.log('Could not find actualStart or actualEnd for old route.');
    }
} else {
    console.log('Old route not found.');
}
