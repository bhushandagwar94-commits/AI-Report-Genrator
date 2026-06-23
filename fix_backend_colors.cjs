const fs = require('fs');

const backendFile = 'server/endpoints/reports.js';
let backendCode = fs.readFileSync(backendFile, 'utf8');

const oldHtml = `const fullHtml = \`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: A4;
    margin: 18mm 16mm 18mm 16mm;
  }

  body {
    font-family: Arial, Calibri, sans-serif;
    color: #003b5c;
    font-size: 11pt;
    line-height: 1.45;
  }

  h1, h2, h3, h4 {
    color: #003f5f;
    font-weight: bold;
  }

  h1 {
    font-size: 22pt;
    border-bottom: 2px solid #0b4f71;
    padding-bottom: 6px;
  }

  h2 {
    font-size: 16pt;
    border-bottom: 1px solid #0b4f71;
    padding-bottom: 4px;
  }

  h3 {
    font-size: 13pt;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 16px 0;
  }

  th {
    background-color: #e7f2f6;
    color: #003b5c;
    font-weight: bold;
  }

  th, td {
    border: 1px solid #c9d8df;
    padding: 6px 8px;
    vertical-align: top;
  }

  ul {
    margin-top: 4px;
  }

  li {
    margin-bottom: 4px;
  }

  .no-export,
  button,
  .download-button,
  .debug-panel {
    display: none !important;
  }
</style>
</head>
<body>
\${html}
</body>
</html>
\`;`;

const newHtml = `const fullHtml = \`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: A4;
    margin: 18mm 16mm 18mm 16mm;
  }

  body {
    font-family: Arial, Calibri, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    background: white;
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th, td {
    vertical-align: top;
  }

  .no-export,
  button,
  .download-button,
  .debug-panel {
    display: none !important;
  }
</style>
</head>
<body>
\${html}
</body>
</html>
\`;`;

if (backendCode.includes(oldHtml)) {
    backendCode = backendCode.replace(oldHtml, newHtml);
    fs.writeFileSync(backendFile, backendCode);
    console.log("Updated backend wrapper HTML");
} else {
    console.log("Could not find old fullHtml block in backend");
}
