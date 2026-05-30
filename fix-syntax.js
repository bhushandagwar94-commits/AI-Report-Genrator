const fs = require('fs');
let c = fs.readFileSync('server/services/reportPipeline.js', 'utf8');
c = c.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('server/services/reportPipeline.js', c);
