const fs = require("fs");

let code = fs.readFileSync("./endpoints/reports.js", "utf8");

if (!code.includes("createPipelineDebugCollector")) {
  code = code.replace(
    'const { normaliseGenerateBody } = require("../utils/normaliseReports");',
    'const { normaliseGenerateBody } = require("../utils/normaliseReports");\nconst { createPipelineDebugCollector } = require("../utils/pipelineDebugCollector");'
  );
}

const generateFunctionStart = "const startTime = Date.now();";
const newGenerateFunctionStart = `const startTime = Date.now();
      const debugCollector = createPipelineDebugCollector({
        reportType: templateId || "unknown",
        generationMode: generationMode || "unknown"
      });
      let pipelineDebug;
      try {
`;
code = code.replace(generateFunctionStart, newGenerateFunctionStart);

const endOfSuccessfulTry = `        console.log("[REPORT] after response return");
        console.timeEnd("[REPORT] response_build");
        console.timeEnd("[REPORT] total");`;

const newEndOfSuccessfulTry = `
        pipelineDebug = debugCollector.finalize({
          status: "completed",
          finalOutputSource: aiEnhanced ? "enhancedReportData" : "deterministic",
          finalEnhancerUsed: debugCollector.data.finalEnhancerUsed || providerUsed || "none",
          fallbackReason: debugCollector.data.fallbackReason || fallbackReason || null
        });

        console.log("[REPORT] after response return");
        console.timeEnd("[REPORT] response_build");
        console.timeEnd("[REPORT] total");`;

code = code.replace(endOfSuccessfulTry, newEndOfSuccessfulTry);

const catchStart = `      } catch (e) {
        console.error(e.message, e);`;
const newCatchStart = `      } catch (e) {
        debugCollector.addError(e?.message || String(e), { stack: e?.stack });
        pipelineDebug = debugCollector.finalize({
          status: "failed",
          fallbackReason: e?.message || String(e)
        });
        console.error(e.message, e);`;
code = code.replace(catchStart, newCatchStart);

code = code.replace(
  /function safeBuildPipelineDebug[\s\S]*?errors: \["Pipeline debug generation crashed"\]\n {8}\}\);\n/,
  ""
);

// Find `const pipelineDebug = safeBuildPipelineDebug(...)` replacement might have missed the variable itself if it wasn't matched perfectly.
// Let's do a more robust regex for safeBuildPipelineDebug logic block.
code = code.replace(
  /\/\/ Build pipelineDebug object[\s\S]*?pipelineDebug generation crashed"\]\n\s*\}\);/g,
  ""
);

// Also, need to replace `response.status(200).json({ ... pipelineDebug` to just use the one from scope
// Wait, it is already in scope because we declared `let pipelineDebug;`

// In `reports.js`, let's search for `providerAttempts = e.providerAttempts || providerAttempts || [];` and replace it
code = code.replace(
  /providerAttempts = e\.providerAttempts \|\| providerAttempts \|\| \[\];/g,
  ""
);

code = code.replace(/let providerAttempts = \[\];/g, "");
code = code.replace(
  /providerAttempts,/g,
  "providerAttempts: debugCollector.data.providerAttempts,"
);

// Replace aiFinalizationTimeoutMs definitions. Since we can't reference it if we remove it, we should replace its usage with debugCollector.data.config.aiFinalizationTimeoutMs
code = code.replace(/const aiFinalizationTimeoutMs = Number\([^;]+;\n/g, "");
code = code.replace(
  /aiFinalizationTimeoutMs,/g,
  "debugCollector.data.config.aiFinalizationTimeoutMs,"
);

fs.writeFileSync("./endpoints/reports.js", code);
console.log("patched reports.js");
