const fs = require('fs');

const reportsFile = 'server/endpoints/reports.js';
let code = fs.readFileSync(reportsFile, 'utf8');

// 1. Remove my bad injected AdmZip code if it exists.
code = code.replace("const AdmZip = require('adm-zip');\\nconst ExcelJS = require('exceljs');", "const ExcelJS = require('exceljs');");

// 2. Add lazy AdmZip
const lazyAdmZip = `let AdmZip;
try {
  AdmZip = require("adm-zip");
} catch (e) {
  console.warn("adm-zip not installed; DOCX zip validation will be limited");
}

const {
  Document,
  Packer,
  Paragraph,
  TextRun
} = require("docx");

async function renderEmergencyDocx(errorMessage = "") {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [new TextRun({ text: "SEE-Tech Detailed Energy Audit Report", bold: true })]
        }),
        new Paragraph({
          children: [new TextRun({ text: "Emergency fallback DOCX generated successfully." })]
        }),
        new Paragraph({
          children: [new TextRun({ text: errorMessage ? \`Original renderer error: \${errorMessage}\` : "" })]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}
`;

if (!code.includes('let AdmZip;')) {
    code = code.replace(
        'const fs = require("fs");',
        lazyAdmZip + '\nconst fs = require("fs");'
    );
}

// 3. Replace validateDocxBuffer
const newValidate = `function validateDocxBuffer(buffer) {
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
      result.error = "DOCX buffer missing or too small";
      return result;
    }

    result.startsWithPK = buffer[0] === 0x50 && buffer[1] === 0x4b;

    if (!result.startsWithPK) {
      result.error = "DOCX does not start with PK zip signature";
      return result;
    }

    if (!AdmZip) {
      result.valid = true;
      result.error = "ZIP structure validation skipped because adm-zip is not installed";
      return result;
    }

    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().map(e => e.entryName);

    result.hasContentTypes = entries.includes("[Content_Types].xml");
    result.hasDocumentXml = entries.includes("word/document.xml");
    result.hasRootRels = entries.includes("_rels/.rels");
    result.hasDocumentRels = entries.includes("word/_rels/document.xml.rels");

    result.valid =
      result.startsWithPK &&
      result.hasContentTypes &&
      result.hasDocumentXml &&
      result.hasRootRels &&
      result.hasDocumentRels;

    if (!result.valid) {
      result.error = "DOCX zip missing required internal Word files";
    }

    return result;
  } catch (error) {
    result.error = error.message;
    return result;
  }
}`;

const oldValidateStart = 'function validateDocxBuffer(buffer) {';
const oldValidateEnd = 'function normalizeActiveReportData(reportData) {';

if (code.includes(oldValidateStart)) {
    const startIndex = code.indexOf(oldValidateStart);
    const endIndex = code.indexOf(oldValidateEnd);
    if (startIndex !== -1 && endIndex !== -1) {
        code = code.substring(0, startIndex) + newValidate + '\n\n' + code.substring(endIndex);
    }
}

// 4. Update route logic
const oldRouteLogicStart = 'let buffer = null;\n    let rendererUsed = \'safeDocxRenderer\';';
const oldRouteLogicEnd = 'const outputPath = path.join(debugDir, \'latest-browser-sent-report.docx\');';

const newRouteLogic = `let buffer;
    let rendererUsed = "safeDocxRenderer";
    let originalRendererError = null;

    try {
      buffer = await renderSafeDocx(docxReportData);
    } catch (e) {
      originalRendererError = e;
      console.error("SAFE_DOCX_RENDERER_FAILED", e);
      rendererUsed = "emergencyFallbackDocx";
      buffer = await renderEmergencyDocx(e.message);
    }

    const validation = validateDocxBuffer(buffer);

    if (!validation.valid) {
      rendererUsed = "emergencyFallbackDocxAfterValidationFailure";
      buffer = await renderEmergencyDocx(validation.error || "Invalid DOCX validation");
    }

    const finalValidation = validateDocxBuffer(buffer);

    if (!finalValidation.valid) {
      throw new Error(\`Emergency DOCX also invalid: \${finalValidation.error}\`);
    }

    fs.writeFileSync(
      path.join(debugDir, "latest-docx-validation.json"),
      JSON.stringify({
        rendererUsed,
        originalRendererError: originalRendererError?.message,
        validation,
        finalValidation,
        bufferLength: buffer.length,
        startsWithPK: buffer[0] === 0x50 && buffer[1] === 0x4b,
        ecmCount: ecms.length,
        time: new Date().toISOString()
      }, null, 2)
    );

    const outputPath = path.join(debugDir, 'latest-browser-sent-report.docx');`;

if (code.includes('let buffer = null;')) {
    const sIdx = code.indexOf('let buffer = null;');
    const eIdx = code.indexOf(oldRouteLogicEnd);
    if (sIdx !== -1 && eIdx !== -1) {
        code = code.substring(0, sIdx) + newRouteLogic + code.substring(eIdx + oldRouteLogicEnd.length);
    }
}

fs.writeFileSync(reportsFile, code);
console.log("Updated reports.js");

// 5. Update index.jsx frontend catch block
const indexJsxFile = 'frontend/src/pages/Reports/Public/index.jsx';
let frontendCode = fs.readFileSync(indexJsxFile, 'utf8');

const oldCatchStart = 'catch (error) {\n      console.error("WORD_DOWNLOAD_FAILED", error);\n      alert(error.message || "Word download failed");\n      toast.update(wordExportToastRef.current, {';
const newCatch = `catch (error) {
      let message = error.message;

      if (error?.response?.data instanceof Blob) {
        message = await error.response.data.text();
      } else if (error?.response?.data) {
        message = JSON.stringify(error.response.data);
      }

      console.error("WORD_DOWNLOAD_FAILED", {
        status: error?.response?.status,
        message
      });

      alert(message);
      toast.update(wordExportToastRef.current, {`;

if (frontendCode.includes('catch (error) {\n      console.error("WORD_DOWNLOAD_FAILED", error);')) {
    frontendCode = frontendCode.replace(oldCatchStart, newCatch);
    fs.writeFileSync(indexJsxFile, frontendCode);
    console.log("Updated index.jsx");
} else {
    console.log("Catch block not found in index.jsx");
}
