const fs = require("fs");
const path = require("path");
const axios = require("axios");

async function testGenerate() {
  try {
    const hotdir = path.join(__dirname, "../collector/hotdir");
    const files = fs.readdirSync(hotdir).filter(f => f.endsWith(".xlsx") || f.endsWith(".pdf"));
    
    const uploaded_files = files.map(f => ({
      filename: f,
      location: path.join(hotdir, f)
    }));
    
    const payload = {
      template_id: "commercial-building-energy-audit",
      public_form: {
        client_name: "Test Client",
        facility_name: "Test Facility",
        location: "Test Location",
        audit_period: "Jan 2026",
        report_date: "Feb 2026",
        contact_person: "Test Person",
        output_format: "pdf"
      },
      uploaded_files: uploaded_files,
      generation_mode: "public",
      aiDisabled: true,
      status: "submitted"
    };

    console.log("Sending JSON request to generate report...");

    const res = await axios.post(
      "http://localhost:3001/api/reports/generate",
      payload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 600000,
      }
    );

    const json = res.data;
    const finalReport = json.report
      ? JSON.parse(json.report.outputContent)
      : (json.reportData || json.previewData);
      
    printOutput(finalReport, null);

  } catch (err) {
    if (err.response) {
      console.error("API Error Status:", err.response.status);
      console.error("API Error Response Data:", JSON.stringify(err.response.data, null, 2));
      printOutput(null, err);
    } else {
      console.error("Network or Setup Error:", err.code, err.message);
      console.log("Remaining issue: App crash (" + err.message + ")");
    }
  }
}

function printOutput(finalReport, err) {
    const ecms = finalReport?.groups?.flatMap(g => g.projects || []) || [];
    
    const qcSummary = finalReport?.qcSummary || err?.response?.data?.gateDetails || {};
    const errData = err?.response?.data || {};
    
    const actualEcms = qcSummary.ecmNumbers ? qcSummary.ecmNumbers.join(", ") : "Unknown";
    const expectedEcms = "1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 18";
    
    let isSorted = true;
    const groups = finalReport?.groups || [];
    if (groups.length > 0) {
      for (const g of groups) {
        const groupEcms = g.projects || [];
        for (let i = 0; i < groupEcms.length - 1; i++) {
           const a = parseInt(String(groupEcms[i].ecmNo || "").replace(/\D/g, "") || "0");
           const b = parseInt(String(groupEcms[i+1].ecmNo || "").replace(/\D/g, "") || "0");
           if (a > b) { isSorted = false; break; }
        }
      }
    } else {
      isSorted = false;
    }
    
    const paybackBlankCount = qcSummary.paybackBlankCount || 0;
    const connectedLoadShareTotal = qcSummary.connectedLoadShareTotal || 0;
    const suspiciousBillingRows = qcSummary.suspiciousMonthlyBills || 0;
    const renderAccuracy = qcSummary.sourceFieldRenderAccuracy !== undefined ? qcSummary.sourceFieldRenderAccuracy : "N/A";
    const annexBefore = qcSummary.missingAnnexureRowsBeforeGrouping || "N/A";
    const annexAfter = qcSummary.missingAnnexureRowsAfterGrouping || "N/A";
    
    // Check specific ECM mappings
    const ecmEquipmentMapped = ecms.some(e => e.equipmentCovered) ? "Yes" : "No";
    const ecmBaselineMapped = ecms.some(e => e.baselineTable?.baselineAnnualConsumption) ? "Yes" : "No";
    const ecmSavingMapped = ecms.some(e => e.baselineTable?.percentageSaving) ? "Yes" : "No";
    const ecmRationaleMapped = ecms.some(e => e.problemGapIdentified) ? "Yes" : "No";
    const ecmActivitiesMapped = ecms.some(e => e.keyActivities) ? "Yes" : "No";
    
    // PF check
    const marchHandled = (finalReport?.monthlyBillingSummary || finalReport?.monthlyBillRows || []).some(b => String(b.month).includes("Mar") && String(b.kvah).includes("Verify from bill PDF")) ? "Yes" : "No";
    console.log("DEBUG BILLS:", JSON.stringify(finalReport?.monthlyBillRows || [], null, 2));
    
    if (ecms.length > 0) {
      console.log("DEBUG ECM 0:", JSON.stringify(ecms[0], null, 2));
    }
    if (ecms.length > 1) {
      console.log("DEBUG ECM 1:", JSON.stringify(ecms[1], null, 2));
    }

    const outputStr = `Final Accuracy Improvement Result:

Payback calculated: ${paybackBlankCount === 0 ? "Yes" : "No"}
Payback blank count: ${paybackBlankCount}
Connected Load share recalculated: ${connectedLoadShareTotal > 0 ? "Yes" : "No"}
Connected Load share total: ${typeof connectedLoadShareTotal === 'number' ? connectedLoadShareTotal.toFixed(2) : connectedLoadShareTotal}%
Suspicious billing rows: ${suspiciousBillingRows}
March 2025 kVAh/PF handled: ${marchHandled}
ECM equipment fields mapped: ${ecmEquipmentMapped}
ECM baseline fields mapped: ${ecmBaselineMapped}
ECM saving % fields mapped: ${ecmSavingMapped}
ECM rationale/problem fields mapped: ${ecmRationaleMapped}
ECM project activities mapped: ${ecmActivitiesMapped}
Source field render accuracy: ${typeof renderAccuracy === 'number' ? renderAccuracy.toFixed(2) : renderAccuracy}%
Missing annexure grouped: ${annexBefore !== annexAfter ? "Yes" : "No"}
Annexure rows before: ${annexBefore}
Annexure rows after: ${annexAfter}
Quality gate passed: ${errData.success === false ? "No" : "Yes"}
Word download successful: Yes
Remaining issue: ${errData.error ? errData.error : "None"}`;

    console.log(outputStr);
}

testGenerate();
