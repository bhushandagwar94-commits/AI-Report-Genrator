const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function trace() {
  try {
    const hotdir = path.join(__dirname, "../../collector/hotdir");
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
      status: "submitted",
      test_mode: true
    };

    console.log("Running trace...");
    const res = await axios.post(
      "http://localhost:3001/api/reports/generate",
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 600000 }
    );

    const json = res.data;
    const pDebug = json.pDebug;
    const finalReport = json.report ? JSON.parse(json.report.outputContent) : (json.reportData || json.previewData);

    const ecm1 = "1";
    
    console.log("=== ECM", ecm1, "===");
    
    const ext = pDebug.extractionDebug.extractedProjectsSample.find(p => p.ecmNo == ecm1) || pDebug.extractionDebug.projects.find(p => p.ecmNo == ecm1);
    console.log("Extracted Property Name and Value:", ext ? { paybackRaw: ext.paybackRaw, payback: ext.payback, paybackMonthsRaw: ext.paybackMonthsRaw } : "Not found");
    
    const afterQF = pDebug.postQualityFilter.find(p => p.ecmNo == ecm1);
    console.log("Value after projectQualityFilter:", afterQF ? { paybackRaw: afterQF.paybackRaw, payback: afterQF.payback, paybackMonthsRaw: afterQF.paybackMonthsRaw, simplePaybackPeriod: afterQF.simplePaybackPeriod } : "Not found");
    
    const afterEnf = pDebug.postQualityEnforcer.groups.flatMap(g => g.projects).find(p => p.ecmNo == ecm1);
    console.log("Value after reportQualityEnforcer:", afterEnf ? { paybackRaw: afterEnf.paybackRaw, payback: afterEnf.payback, paybackMonthsRaw: afterEnf.paybackMonthsRaw, simplePaybackPeriod: afterEnf.simplePaybackPeriod } : "Not found");
    
    const afterPL = finalReport.groups.flatMap(g => g.projects).find(p => p.ecmNo == ecm1) || finalReport.projects.find(p => p.ecmNo == ecm1);
    console.log("Value after reportPipeline:", afterPL ? { paybackRaw: afterPL.paybackRaw, payback: afterPL.payback, paybackMonthsRaw: afterPL.paybackMonthsRaw, simplePaybackPeriod: afterPL.simplePaybackPeriod } : "Not found");

    const ecmDetails = finalReport.ecmDetails?.find(d => d.ecmNo == ecm1);
    console.log("Final value written into DOCX:", ecmDetails ? ecmDetails.paybackMonthsFormatted : "Not found");

    // Also look at vrChennaiAuxData
    console.log("\nFrom vrChennaiAuxData.projects:");
    const auxExt = finalReport.extractedDataContext?.ecmProjects?.find(p => p.ecmNo == ecm1);
    console.log(auxExt ? { paybackMonthsRaw: auxExt.paybackMonthsRaw, paybackYearsRaw: auxExt.paybackYearsRaw } : "Not found");

  } catch (err) {
    console.error(err.message);
  }
}

trace();
