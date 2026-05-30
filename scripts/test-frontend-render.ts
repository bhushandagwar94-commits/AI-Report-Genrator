import React from 'react';
import ReactDOMServer from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Load the template
import CommercialBuildingEnergyAuditTemplate from '../frontend/src/components/templates/commercial-building-energy-audit/CommercialBuildingEnergyAuditTemplate';

const mockData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../tmp-real-backend-data.json'), 'utf-8'));


// Mock process.env for diagnostics
process.env.NODE_ENV = 'development';
// @ts-ignore
global.import = { meta: { env: { DEV: true } } };

try {
  const html = ReactDOMServer.renderToString(
    React.createElement(CommercialBuildingEnergyAuditTemplate, { data: mockData as any })
  );

  fs.writeFileSync('tmp-frontend-render.html', html);
  console.log("RENDER SUCCESS. HTML length:", html.length);
  
  const text = html.replace(/<[^>]+>/g, ' ');

  const check = (term: string) => text.includes(term) ? "PASS" : "FAIL";

  console.log("\\n=== CHAPTER 1 ===");
  console.log("1.1", check("1.1 Purpose of the Energy Audit"));
  console.log("1.2", check("1.2 Overall Energy Saving Potential"));
  console.log("1.3", check("1.3 Summary of Identified Energy Saving Projects"));
  console.log("1.4", check("1.4 Project Grouping"));
  console.log("1.5", check("1.5 Key Observations"));
  console.log("1.6", check("1.6 Recommended Implementation Priority"));
  console.log("1.7", check("1.7 Conclusion and Way Forward"));

  console.log("\\n=== CHAPTER 2 ===");
  console.log("2.1", check("2.1 General Information"));
  console.log("2.12", check("2.12 Summary of Audit Observations"));

  console.log("\\n=== CHAPTER 3 ===");
  console.log("1. Project Overview", check("1. Project Overview"));
  console.log("19. Conclusion", check("19. Conclusion"));

  console.log("\\n=== SANITIZATION ===");
  console.log("Data required:", text.includes("Data required"));
  console.log("[DRAFT:", text.includes("[DRAFT"));
  console.log("undefined:", text.includes("undefined"));
  console.log("null:", text.includes("null"));
  console.log("Explain cooling tower:", text.includes("Explain cooling tower"));

  console.log("\\n=== DEV DIAGNOSTICS ===");
  console.log("Diagnostics shown:", text.includes("DEV DIAGNOSTICS - Normalization Applied"));

} catch (err) {
  console.error("RENDER FAILED:", err);
}
