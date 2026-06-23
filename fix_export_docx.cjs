const fs = require('fs');
const path = require('path');

// 1. Update frontend index.jsx
const indexJsxFile = 'frontend/src/pages/Reports/Public/index.jsx';
let frontendCode = fs.readFileSync(indexJsxFile, 'utf8');

const oldExportPayloadLine = 'const exportPayload = exportReportData ? { reportData: exportReportData, previewData: exportReportData } : {};';
const newExportPayload = `const previewHtml =
        generatedReport?.html ||
        generatedReport?.reportHtml ||
        generatedReport?.previewHtml ||
        reportHtml ||
        document.querySelector("#report-preview-content")?.innerHTML;

      const exportPayload = {
        generationTraceId: generatedReport?.generationTraceId,
        exportSource: "frontend-preview-html",
        html: previewHtml,
        reportData: generatedReport || exportReportData
      };

      console.log("WORD_EXPORT_PREVIEW_MATCH_DEBUG", {
        hasHtml: !!previewHtml,
        htmlLength: previewHtml?.length,
        htmlStart: previewHtml?.slice(0, 300),
        generationTraceId: exportPayload.generationTraceId
      });`;

if (frontendCode.includes(oldExportPayloadLine)) {
    frontendCode = frontendCode.replace(oldExportPayloadLine, newExportPayload);
    fs.writeFileSync(indexJsxFile, frontendCode);
    console.log("Updated frontend exportPayload");
} else {
    console.log("oldExportPayloadLine not found in frontend");
}

// 2. Update backend reports.js
const reportsFile = 'server/endpoints/reports.js';
let reportsCode = fs.readFileSync(reportsFile, 'utf8');

// Add html-to-docx import
if (!reportsCode.includes('const htmlToDocx = require("html-to-docx");')) {
    reportsCode = reportsCode.replace('const AdmZip = require("adm-zip");', 'const htmlToDocx = require("html-to-docx");\nconst AdmZip = require("adm-zip");');
    // Also if it's the lazy one:
    reportsCode = reportsCode.replace('let AdmZip;', 'const htmlToDocx = require("html-to-docx");\nlet AdmZip;');
}

const oldRouteStart = "app.post('/export-docx', async (req, res) => {";
const oldRouteEnd = "  app.post(\n    \"/reports/:id/training-data/corrected-docx\"";

const newRouteStr = `app.post('/export-docx', async (req, res) => {
  const debugDir = path.join(__dirname, '../debug-extraction');
  fs.mkdirSync(debugDir, { recursive: true });

  try {
    const html = req.body?.html;

    if (!html || html.length < 1000) {
      return res.status(400).json({
        success: false,
        error: "Missing preview HTML for Word export. DOCX export must use frontend preview HTML."
      });
    }

    fs.writeFileSync(
      path.join(debugDir, "latest-word-export-preview.html"),
      html,
      "utf8"
    );

    const fullHtml = \`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Arial, Calibri, sans-serif;
            color: #003b5c;
            font-size: 11pt;
            line-height: 1.45;
          }
          h1, h2, h3 {
            color: #003f5f;
            font-weight: 700;
          }
          h1 {
            font-size: 22pt;
            border-bottom: 2px solid #0b4f71;
            padding-bottom: 6px;
          }
          h2 {
            font-size: 16pt;
            border-bottom: 1px solid #0b4f71;
            padding-bottom: 4px;
          }
          h3 {
            font-size: 13pt;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0 16px 0;
          }
          th {
            background: #e7f2f6;
            color: #003b5c;
            font-weight: 700;
          }
          th, td {
            border: 1px solid #c9d8df;
            padding: 6px 8px;
            vertical-align: top;
          }
          .section-title {
            color: #003f5f;
            font-weight: bold;
          }
          ul {
            margin-top: 4px;
          }
          li {
            margin-bottom: 4px;
          }
        </style>
      </head>
      <body>
        \${html}
      </body>
      </html>
    \`;

    let buffer = null;
    try {
      buffer = await htmlToDocx(fullHtml, null, {
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: true,
        margins: {
          top: 720,
          right: 720,
          bottom: 720,
          left: 720
        }
      });
    } catch (e) {
      console.error("HTML_TO_DOCX_FAILED", e);
      buffer = await renderEmergencyDocx("HTML to DOCX failed: " + e.message);
    }

    if (!buffer || buffer.length < 1000 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      buffer = await renderEmergencyDocx("HTML-to-DOCX generated invalid DOCX buffer");
    }

    fs.writeFileSync(
      path.join(debugDir, "latest-browser-sent-report.docx"),
      buffer
    );

    fs.writeFileSync(
      path.join(debugDir, "latest-docx-export-mode.json"),
      JSON.stringify({
        mode: "preview-html-to-docx",
        htmlLength: html.length,
        bufferLength: buffer.length,
        startsWithPK: buffer[0] === 0x50 && buffer[1] === 0x4b,
        time: new Date().toISOString()
      }, null, 2)
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="SEE-Tech_Detailed_Energy_Audit_Report.docx"'
    );
    res.setHeader("Content-Length", buffer.length);

    return res.end(buffer);

  } catch (error) {
    console.error("DOCX_EXPORT_FAILED", error);

    fs.writeFileSync(
      path.join(debugDir, "latest-docx-export-error.json"),
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

const sIdx = reportsCode.indexOf(oldRouteStart);
const eIdx = reportsCode.indexOf(oldRouteEnd);

if (sIdx !== -1 && eIdx !== -1) {
    reportsCode = reportsCode.substring(0, sIdx) + newRouteStr + reportsCode.substring(eIdx);
    fs.writeFileSync(reportsFile, reportsCode);
    console.log("Updated backend export route");
} else {
    console.log("Could not find start or end for backend export route replacement");
}
