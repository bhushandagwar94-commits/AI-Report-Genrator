const fs = require('fs');

const frontendFile = 'frontend/src/pages/Reports/Public/index.jsx';
let frontendCode = fs.readFileSync(frontendFile, 'utf8');

const helpersStr = `function copyComputedStyles(sourceEl, targetEl) {
  const computed = window.getComputedStyle(sourceEl);

  const styleProps = [
    "color",
    "backgroundColor",
    "fontSize",
    "fontWeight",
    "fontFamily",
    "lineHeight",
    "textAlign",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderTopStyle",
    "borderRightStyle",
    "borderBottomStyle",
    "borderLeftStyle",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "backgroundImage",
    "borderCollapse",
    "width",
    "maxWidth",
    "minWidth"
  ];

  styleProps.forEach((prop) => {
    targetEl.style[prop] = computed[prop];
  });
}

function cloneWithInlineStyles(node) {
  const clone = node.cloneNode(true);

  const walk = (source, target) => {
    if (!source || !target) return;
    if (source.nodeType === 1 && target.nodeType === 1) {
      copyComputedStyles(source, target);
    }

    const sourceChildren = source.childNodes || [];
    const targetChildren = target.childNodes || [];

    for (let i = 0; i < sourceChildren.length; i++) {
      walk(sourceChildren[i], targetChildren[i]);
    }
  };

  walk(node, clone);
  return clone;
}

  const handleDownloadWord`;

if (!frontendCode.includes("function copyComputedStyles(sourceEl, targetEl)")) {
    frontendCode = frontendCode.replace("  const handleDownloadWord", helpersStr);
}

const oldHtmlExt = `const previewHtml = previewElement?.innerHTML;

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

const newHtmlExt = `if (!previewElement) {
        throw new Error("Preview element not found.");
      }

      const styledClone = cloneWithInlineStyles(previewElement);
      styledClone.querySelectorAll("button").forEach(el => el.remove());
      const previewHtml = styledClone.outerHTML;

      if (!previewHtml || previewHtml.trim().length < 1000) {
        throw new Error("Preview HTML not found. Please generate the report before downloading Word.");
      }

      const exportPayload = {
        generationTraceId:
          generatedReport?.generationTraceId ||
          generatedReport?.reportData?.generationTraceId,
        exportSource: "frontend-preview-inline-styled-html",
        html: previewHtml,
        reportData: generatedReport
      };

      console.log("WORD_EXPORT_COLOR_DEBUG", {
        htmlLength: previewHtml.length,
        htmlStart: previewHtml.slice(0, 500),
        exportSource: exportPayload.exportSource
      });`;

if (frontendCode.includes('const previewHtml = previewElement?.innerHTML;')) {
    frontendCode = frontendCode.replace(oldHtmlExt, newHtmlExt);
    fs.writeFileSync(frontendFile, frontendCode);
    console.log("Updated frontend inline styles logic");
} else {
    console.log("Could not find old HTML extraction logic in frontend");
}
