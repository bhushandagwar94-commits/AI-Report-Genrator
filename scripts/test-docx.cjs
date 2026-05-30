const fs = require('fs');

const xml = fs.readFileSync('tmp-docx-extract/word/document.xml', 'utf-8');

// Strip XML tags to get raw text
const text = xml.replace(/<[^>]+>/g, '');

const requiredChapters = [
  "Chapter 1: Executive Summary",
  "1.1 Purpose of the Energy Audit",
  "1.2 Overall Energy Saving Potential",
  "1.3 Summary of Identified Energy Saving Projects",
  "1.4 Project Grouping",
  "1.5 Key Observations",
  "1.6 Recommended Implementation Priority",
  "1.7 Conclusion and Way Forward",
  "Chapter 2: Plant / Building Details and Energy Profile",
  "2.1 General Information",
  "2.2 Building Operation Details",
  "2.3 Utility and Energy Sources",
  "2.4 Electrical Supply Details",
  "2.5 Electricity Consumption and Billing Summary",
  "2.6 Specific Energy Consumption Benchmark",
  "2.7 Major Energy Consuming Systems",
  "2.8 HVAC System Details",
  "2.9 Lighting System Details",
  "2.10 Pumps and Motors",
  "2.11 Building Automation and Controls",
  "2.12 Summary of Audit Observations",
  "1. Project Overview",
  "2. Existing System / Baseline Condition",
  "3. Problem / Gap Identified",
  "4. Proposed Energy Conservation Measure",
  "5. Scope of Work",
  "6. Key Activities",
  "7. Rationale for Energy Saving",
  "8. Energy Saving Calculation",
  "9. Key Metrics",
  "10. Technical Specification",
  "11. Schematic / Conceptual Framework",
  "12. Implementation Duration",
  "13. Measurement and Verification Plan",
  "14. Benefits Other Than Energy Saving",
  "15. Aspects to be Taken Care Of",
  "16. Implementation Risks / Precautions",
  "17. Carbon Footprint Reduction",
  "18. Case Study / Reference Application",
  "19. Conclusion"
];

console.log("=== SECTION PRESENCE CHECKLIST ===");
requiredChapters.forEach(chap => {
  const found = text.includes(chap);
  console.log(`[${found ? 'PASS' : 'FAIL'}] ${chap}`);
});

console.log("\n=== QC SCAN ===");
console.log(`Data required found: ${text.toLowerCase().includes("data required")}`);
console.log(`[DRAFT found: ${text.includes("[DRAFT")}`);
console.log(`prompt leakage (Explain/Discuss) found: ${text.includes("Explain ") || text.includes("Discuss ")}`);
console.log(`uploaded filename (.xlsx/.pdf) found: ${text.includes(".xlsx") || text.includes(".pdf")}`);
console.log(`undefined/null found: ${text.includes("undefined") || text.includes("null")}`);
console.log(`fake INR 0 / ₹ 0 totals found: ${text.includes("₹0") || text.includes("INR 0")}`);

const ecm13 = text.indexOf("Energy Saving through Exhaust Heat Recovery in ASB 70 DPH Dryers");
console.log("\n=== ECM 13 Text Sample ===");
if (ecm13 > -1) {
  console.log(text.substring(ecm13, ecm13 + 500));
}

console.log("\n=== COMPACT FORMATTING ===");
const pageBreaks = (xml.match(/<w:br w:type="page"\/>/g) || []).length + (xml.match(/<w:pageBreakBefore\/>/g) || []).length;
console.log(`Number of forced page breaks in document: ${pageBreaks}`);
console.log(`Old doc page count was around ~90. Forced breaks removed after ECMs.`);
