const fs = require('fs');

const indexJsxFile = 'frontend/src/pages/Reports/Public/index.jsx';
let code = fs.readFileSync(indexJsxFile, 'utf8');

// 1. Add reportPreviewRef
const refLine = '  const reportRef = useRef(null);';
const newRefLine = '  const reportRef = useRef(null);\n  const reportPreviewRef = useRef(null);';

if (code.includes(refLine) && !code.includes('const reportPreviewRef = useRef(null);')) {
    code = code.replace(refLine, newRefLine);
}

// 2. Add wrapper div
const oldTemplateStr = `<div ref={reportRef} className="report-print-area">
                <CommercialBuildingEnergyAuditTemplate
                  key={previewRenderKey}
                  data={reportData}
                />
              </div>`;
const newTemplateStr = `<div ref={reportRef} className="report-print-area">
                <div id="report-preview-content" ref={reportPreviewRef}>
                  <CommercialBuildingEnergyAuditTemplate
                    key={previewRenderKey}
                    data={reportData}
                  />
                </div>
              </div>`;

if (code.includes(oldTemplateStr)) {
    code = code.replace(oldTemplateStr, newTemplateStr);
}

// 3. Update handleDownloadWord logic
const oldExportPayloadLine = `const previewHtml =
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

const newExportPayload = `const previewElement =
        reportPreviewRef.current ||
        document.getElementById("report-preview-content");

      const previewHtml = previewElement?.innerHTML;

      if (!previewHtml || previewHtml.trim().length < 1000) {
        throw new Error("Preview HTML not found. Please generate the report before downloading Word.");
      }

      const exportPayload = {
        generationTraceId:
          generatedReport?.generationTraceId ||
          generatedReport?.reportData?.generationTraceId,
        exportSource: "frontend-preview-dom-html",
        html: previewHtml,
        reportData: generatedReport
      };

      console.log("WORD_EXPORT_HTML_DEBUG", {
        hasPreviewElement: !!previewElement,
        htmlLength: previewHtml.length,
        htmlStart: previewHtml.slice(0, 300)
      });`;

if (code.includes('const previewHtml =\n        generatedReport?.html ||')) {
    const startIdx = code.indexOf('const previewHtml =\n        generatedReport?.html ||');
    const endIdxStr = 'generationTraceId: exportPayload.generationTraceId\n      });';
    const endIdx = code.indexOf(endIdxStr);

    if (startIdx !== -1 && endIdx !== -1) {
        code = code.substring(0, startIdx) + newExportPayload + code.substring(endIdx + endIdxStr.length);
    }
} else {
    console.log("Could not find the old previewHtml export payload logic!");
}

fs.writeFileSync(indexJsxFile, code);
console.log("Applied frontend reportHtml fixes.");
