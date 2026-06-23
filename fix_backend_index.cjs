const fs = require('fs');

const indexFile = 'server/index.js';
let code = fs.readFileSync(indexFile, 'utf8');

const oldCode = `app.use(bodyParser.text({ limit: FILE_LIMIT }));
app.use(bodyParser.json({ limit: FILE_LIMIT }));
app.use(
  bodyParser.urlencoded({
    limit: FILE_LIMIT,
    extended: true,
  })
);`;

const newCode = `app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(bodyParser.text({ limit: FILE_LIMIT }));`;

if (code.includes('app.use(bodyParser.json({ limit: FILE_LIMIT }));')) {
    code = code.replace(oldCode, newCode);
    fs.writeFileSync(indexFile, code);
    console.log("Updated index.js");
} else {
    console.log("Could not find body parser code in index.js");
}
