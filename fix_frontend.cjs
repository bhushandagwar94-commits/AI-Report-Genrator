const fs = require('fs');

const frontendFile = 'frontend/src/pages/Reports/Public/index.jsx';
let code = fs.readFileSync(frontendFile, 'utf8');

const startMarker = 'const handleDownloadWord = async (allowDraft = false) => {';
const endMarker = 'const handleDownloadPdf = async () => {';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const newFunction = `const handleDownloadWord = async (allowDraft = false) => {
    if (!report?.id) {
      showToast("Please generate the report before downloading Word.", "info");
      return;
    }
    
    const exportReportData = activeReportData || reportData || null;
    const projectCount = getProjectCount(exportReportData);

    console.log("[DOCX_EXPORT_DATA_DEBUG]", getReportSummary(exportReportData));
    
    if (!exportReportData || projectCount <= 0) {
      showToast("Cannot export: Report contains no project data. Please verify your ECM Excel sheet.", "error");
      return;
    }

    if (isWordExporting) return;

    setIsWordExporting(true);
    setWordExportMode(allowDraft ? "draft" : "final");
    wordExportToastRef.current = toast.loading(
      allowDraft
        ? "Generating Draft Word document..."
        : "Generating Word document..."
    );

    try {
      const { API_BASE } = await import("@/utils/constants");
      let axios;
      try {
        axios = (await import("axios")).default;
      } catch (e) {
        console.warn("axios not found");
      }
      
      const exportUrl = \`\${API_BASE}/export-docx\`;
      const exportPayload = exportReportData ? { reportData: exportReportData, previewData: exportReportData } : {};

      const response = await axios.post(exportUrl, exportPayload, {
        responseType: "blob",
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 180000
      });

      const contentType = response.headers["content-type"] || "";

      if (!contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
        const text = await response.data.text();
        throw new Error(\`Backend returned non-DOCX response: \${text}\`);
      }

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });

      if (blob.size < 1000) {
        throw new Error(\`Downloaded file too small: \${blob.size}\`);
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "SEE-Tech_Detailed_Energy_Audit_Report.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setQcResult(null);
      toast.update(wordExportToastRef.current, {
        render: "Word document downloaded.",
        type: "success",
        isLoading: false,
        autoClose: 5000,
        closeButton: true,
      });
    } catch (error) {
      console.error("WORD_DOWNLOAD_FAILED", error);
      alert(error.message || "Word download failed");
      toast.update(wordExportToastRef.current, {
        render: error.message || "Failed to generate Word document.",
        type: "error",
        isLoading: false,
        autoClose: 5000,
        closeButton: true,
      });
    } finally {
      setIsWordExporting(false);
      setWordExportMode(null);
    }
  };

  `;
    code = code.substring(0, startIndex) + newFunction + code.substring(endIndex);
    fs.writeFileSync(frontendFile, code);
    console.log("Successfully replaced handleDownloadWord in frontend");
} else {
    console.log("Could not find start or end markers for handleDownloadWord.");
}
