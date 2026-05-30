const fs = require('fs');
const data = JSON.parse(fs.readFileSync('tmp-real-backend-data.json', 'utf8'));

console.log("=== JSON DUMP CHECK ===");
console.log("Has projects:", !!data.projects);
console.log("ECM Count:", data.projects ? data.projects.length : 0);
console.log("Groups Count:", data.groupedProjects ? data.groupedProjects.length : "None (TSX will fallback to 1 group)");
console.log("Total Investment in ExSum:", data.executiveSummary?.totalEstimatedInvestment);
console.log("Total Annual Saving in ExSum:", data.executiveSummary?.totalAnnualCostSavingPotential);

const ecm13 = data.projects.find(p => p.projectNo == 13 || p.projectNo == "13");
if (ecm13) {
  console.log("ECM 13 Exists");
  console.log("ECM 13 Investment:", ecm13.estimatedInvestment || ecm13.investment);
  console.log("ECM 13 Saving:", ecm13.expectedAnnualCostSaving || ecm13.annualSaving);
}
