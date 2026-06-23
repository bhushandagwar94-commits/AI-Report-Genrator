const fs = require('fs');

const reportsFile = 'server/endpoints/reports.js';
let code = fs.readFileSync(reportsFile, 'utf8');

if (!code.includes('const htmlToDocx = require("html-to-docx");')) {
    code = code.replace('let AdmZip;', 'const htmlToDocx = require("html-to-docx");\nlet AdmZip;');
}

const guardStr = `if (typeof htmlToDocx !== "function") {
      throw new Error("html-to-docx import failed: htmlToDocx is not a function");
    }`;

if (!code.includes(guardStr)) {
    code = code.replace('buffer = await htmlToDocx(fullHtml, null, {', guardStr + '\n      buffer = await htmlToDocx(fullHtml, null, {');
}

fs.writeFileSync(reportsFile, code);
console.log("Fixed htmlToDocx import in reports.js");
