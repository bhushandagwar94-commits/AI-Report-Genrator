const fs = require('fs');
let code = fs.readFileSync('../frontend/src/components/DeveloperPipelinePanel/index.jsx', 'utf8');

// Update tabs array
code = code.replace(
  '    { id: "qc", label: "QC" },\n    { id: "recommendations", label: "Recs" }\n  ];',
  '    { id: "qc", label: "QC" },\n    { id: "recommendations", label: "Recs" },\n    { id: "raw", label: "Raw JSON" }\n  ];'
);

// Remove the old aiModels check block in render
code = code.replace(
  /          if \(activeTab === "aiModels"\) \{[\s\S]*?          if \(pipelineDebug\[activeTab\] === undefined\) \{/g,
  `          const debug = pipelineDebug || {};
          const functionBlocks = Array.isArray(debug.functionBlocks) ? debug.functionBlocks : [];
          const prompts = Array.isArray(debug.prompts) ? debug.prompts : [];
          
          if (activeTab === "raw") {
            return (
              <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                {JSON.stringify(pipelineDebug, null, 2)}
              </pre>
            );
          }
          if (activeTab === "aiModels") {
            if (debugBuildFailed) {
              return <div className="text-red-400">Debug build error: {debugBuildError}</div>;
            }
            if (providerAttempts.length === 0) {
              return <div className="text-white/30 italic">No provider attempts recorded for this run.</div>;
            }
          }
          if (activeTab === "prompts" && prompts.length === 0) {
            return <div className="text-white/30 italic">No prompts recorded for this run.</div>;
          }
          
          if (pipelineDebug[activeTab] === undefined) {`
);

fs.writeFileSync('../frontend/src/components/DeveloperPipelinePanel/index.jsx', code);
console.log('patched developer panel');
