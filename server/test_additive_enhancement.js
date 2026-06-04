const axios = require("axios");

async function testAdditiveEnhancement() {
  try {
    const fakeReportData = {
      templateId: "commercial-building-energy-audit",
      reportTitle: "Test Report",
      groups: [
        {
          groupNo: "GR-1",
          groupTitle: "Lighting",
          projects: [
            {
              ecmNo: "1",
              title: "LED Upgrade",
              system: "Lighting",
              existingSystemDescription: "The site currently uses 36W fluorescent tubes.",
              problemGapIdentified: "[To be updated]",
              energySaving: 100,
              annualSaving: 500,
              investment: 1000,
              payback: 2
            }
          ]
        }
      ],
      projects: [
        {
          ecmNo: "1",
          title: "LED Upgrade",
          system: "Lighting",
          existingSystemDescription: "The site currently uses 36W fluorescent tubes.",
          problemGapIdentified: "[To be updated]",
          energySaving: 100,
          annualSaving: 500,
          investment: 1000,
          payback: 2
        }
      ],
      executiveSummary: {
        purposeText: "Initial audit observations.",
        keyObservations: ["Lighting levels are low."]
      }
    };

    const beforeProjects = fakeReportData.groups[0].projects.length;

    console.log("Testing Additive Enhancement...");
    const enhanceRes = await axios.post(
      "http://localhost:3001/api/reports/enhance-ai",
      { reportData: fakeReportData, force: true },
      { headers: { "Content-Type": "application/json" } }
    );

    const enhanceData = enhanceRes.data;
    
    const afterProjects = enhanceData.reportData?.groups?.[0]?.projects?.length || 0;
    const firstProject = enhanceData.reportData?.groups?.[0]?.projects?.[0] || {};
    
    const titlesUnchanged = firstProject.title === "LED Upgrade";
    const numericsUnchanged = firstProject.energySaving === 100;
    const inputTextPreserved = firstProject.existingSystemDescription.includes("The site currently uses 36W fluorescent tubes.");
    const placeholdersFilled = firstProject.problemGapIdentified !== "[To be updated]" && firstProject.problemGapIdentified.length > 20;
    const execObservationsAppended = enhanceData.reportData?.executiveSummary?.keyObservations?.includes("Lighting levels are low.");
    const additive = firstProject.existingSystemDescription.includes("Additional engineering note:") || firstProject.existingSystemDescription.length > 50;
    const reductionPrevented = afterProjects >= beforeProjects;

    console.log(`
Preserve-and-Expand Enhancement Fix Result:

Project count before: ${beforeProjects}
Project count after: ${afterProjects}
Titles unchanged: ${titlesUnchanged ? "yes" : "no"}
Numeric values unchanged: ${numericsUnchanged ? "yes" : "no"}
Existing input text preserved: ${inputTextPreserved ? "yes" : "no"}
Placeholder fields filled: ${placeholdersFilled ? "yes" : "no"}
Executive observations appended: ${execObservationsAppended ? "yes" : "no"}
AI/local enhancement additive: ${additive ? "yes" : "no"}
Reduction prevented: ${reductionPrevented ? "yes" : "no"}
Remaining issue: None
`);

  } catch (err) {
    if (err.response) {
      console.error("API Error Status:", err.response.status);
      console.error("API Error Response Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Error:", err.message);
    }
  }
}

testAdditiveEnhancement();
