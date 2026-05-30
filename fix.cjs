const fs = require('fs');
let file = process.argv[2];
let c = fs.readFileSync(file, 'utf8');
c = c.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync(file, c);
