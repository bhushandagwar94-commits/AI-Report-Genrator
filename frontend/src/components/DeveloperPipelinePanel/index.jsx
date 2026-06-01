import React, { useState } from "react";
import { X, Code, Copy, DownloadSimple } from "@phosphor-icons/react";
import showToast from "@/utils/toast";

export default function DeveloperPipelinePanel({ pipelineDebug, isOpen, setIsOpen }) {
  const [activeTab, setActiveTab] = useState("overview");

  if (!pipelineDebug) return null;

  const isDev = import.meta.env.MODE === "development" || import.meta.env.VITE_SHOW_PIPELINE_DEBUG === "true";
  if (!isDev) return null;

  const debug = pipelineDebug && typeof pipelineDebug === "object" ? pipelineDebug : {};
  const functionBlocks = Array.isArray(debug.functionBlocks) ? debug.functionBlocks : [];
  const providerAttempts = Array.isArray(debug.providerAttempts) ? debug.providerAttempts : Array.isArray(debug.aiModels?.providerAttempts) ? debug.aiModels.providerAttempts : [];
  const aiNodes = Array.isArray(debug.aiNodes) ? debug.aiNodes : Array.isArray(debug.aiModels?.aiNodes) ? debug.aiModels.aiNodes : [];
  const prompts = Array.isArray(debug.prompts) ? debug.prompts : [];
  const calculationTrace = Array.isArray(debug.calculationTrace) ? debug.calculationTrace : [];
  const inputSummary = debug.inputSummary && typeof debug.inputSummary === "object" ? debug.inputSummary : {};
  const validationTrace = debug.validationTrace && typeof debug.validationTrace === "object" ? debug.validationTrace : {};
  
  const warnings = Array.isArray(debug.warnings) ? debug.warnings : [];
  const errors = Array.isArray(debug.errors) ? debug.errors : [];
  const debugBuildFailed = debug.debugBuildFailed;
  const debugBuildError = debug.debugBuildError;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(debug, null, 2));
    showToast("Pipeline debug data copied to clipboard!", "success");
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(debug, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "input", label: "Input" },
    { id: "prompts", label: "Prompts" },
    { id: "aiModels", label: "AI Models" },
    { id: "vectorDb", label: "Vector DB" },
    { id: "calculations", label: "Calculations" },
    { id: "qc", label: "QC" },
    { id: "recommendations", label: "Recs" },
    { id: "raw", label: "Raw JSON" }
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-slate-800 text-white p-2 rounded-l-md border border-r-0 border-white/20 shadow-lg hover:bg-slate-700 z-50 flex flex-col items-center gap-2"
      >
        <Code size={20} />
        <span className="text-[10px] font-bold" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Pipeline Debug</span>
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-screen w-[450px] bg-slate-900 border-l border-white/10 shadow-2xl z-50 flex flex-col transition-transform duration-300 transform translate-x-0">
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-800">
        <div className="flex items-center gap-x-2 text-white font-bold text-lg">
          <Code size={24} className="text-primary-button" />
          Developer Pipeline
        </div>
        <div className="flex items-center gap-x-3">
          <button onClick={handleCopy} className="text-white/60 hover:text-white" title="Copy JSON">
            <Copy size={20} />
          </button>
          <button onClick={handleDownload} className="text-white/60 hover:text-white" title="Download JSON">
            <DownloadSimple size={20} />
          </button>
          <button onClick={() => setIsOpen(false)} className="text-white/60 hover:text-red-400 p-1 rounded-md">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex overflow-x-auto border-b border-white/10 bg-slate-800/50 p-2 gap-2 hide-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-primary-button/20 text-primary-button border border-primary-button/30"
                : "text-white/60 hover:bg-white/5 border border-transparent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm font-mono text-white/80 bg-slate-950">
        {(() => {
          if (activeTab === "raw") {
            return (
              <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                {JSON.stringify(debug, null, 2)}
              </pre>
            );
          }
          
          if (activeTab === "overview") {
            return (
              <div className="flex flex-col gap-2">
                <div className="text-[12px]"><strong>Status:</strong> {debug.status || "unknown"}</div>
                {debug.fallbackReason && <div className="text-[12px] text-red-400"><strong>Fallback Reason:</strong> {debug.fallbackReason}</div>}
                {errors.length > 0 && (
                  <div className="text-[12px] text-red-400">
                    <strong>Errors:</strong>
                    <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(errors, null, 2)}</pre>
                  </div>
                )}
                {warnings.length > 0 && (
                  <div className="text-[12px] text-yellow-400">
                    <strong>Warnings:</strong>
                    <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(warnings, null, 2)}</pre>
                  </div>
                )}
                <div className="text-[12px] mt-2">
                  <pre className="whitespace-pre-wrap break-all">{JSON.stringify({
                    runId: debug.runId,
                    startedAt: debug.startedAt,
                    finishedAt: debug.finishedAt,
                    totalDurationMs: debug.totalDurationMs,
                    reportType: debug.reportType,
                    generationMode: debug.generationMode,
                    finalOutputSource: debug.finalOutputSource,
                    finalEnhancerUsed: debug.finalEnhancerUsed
                  }, null, 2)}</pre>
                </div>
              </div>
            );
          }

          if (activeTab === "aiModels") {
            const aiStatus = debug.aiEnhancementStatus;

            if (!aiStatus) {
              return <div className="text-white/30 italic">AI enhancement status was not returned by backend.</div>;
            }

            return (
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-[13px] text-white">AI Enhancement Status</h3>
                    <div className="mt-1 space-y-1">
                      <div><span className="opacity-70">Status:</span> <span className={aiStatus.status === 'success' ? 'text-green-400' : 'text-yellow-400'}>{aiStatus.status}</span></div>
                      <div><span className="opacity-70">Final Enhancer Used:</span> {aiStatus.finalEnhancerUsed}</div>
                      {aiStatus.failureReason && <div><span className="opacity-70">Failure Reason:</span> <span className="text-red-400">{aiStatus.failureReason}</span></div>}
                      {aiStatus.developerMessage && <div><span className="opacity-70">Developer Message:</span> <span className="text-red-300">{aiStatus.developerMessage}</span></div>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-white/5 p-2 rounded">
                    <div className="text-white/50 text-[10px] uppercase">Fields</div>
                    <div>Requested: {aiStatus.fieldsRequested || 0}</div>
                    <div>Generated: {aiStatus.fieldsGenerated || 0}</div>
                    <div>Accepted: {aiStatus.fieldsAccepted || 0}</div>
                    <div>Dropped: {aiStatus.fieldsDropped || 0}</div>
                  </div>
                  <div className="bg-white/5 p-2 rounded">
                    <div className="text-white/50 text-[10px] uppercase">ECMs</div>
                    <div>Requested: {aiStatus.ecmsRequested || 0}</div>
                    <div>Enhanced: {aiStatus.ecmsEnhanced || 0}</div>
                  </div>
                </div>

                {aiStatus.droppedFields && aiStatus.droppedFields.length > 0 && (
                  <div>
                    <h3 className="font-bold mb-1 opacity-80 text-yellow-400">Dropped Fields</h3>
                    <ul className="list-disc ml-4 text-[10px] opacity-70">
                      {aiStatus.droppedFields.map((df, i) => (
                        <li key={i}>{df.field} ({df.reason})</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiStatus.providerAttempts && aiStatus.providerAttempts.length > 0 ? (
                  <div>
                    <h3 className="font-bold mb-1 opacity-80">Provider Attempts</h3>
                    <div className="bg-black/30 p-2 rounded max-h-64 overflow-y-auto text-[11px] font-mono leading-relaxed">
                      {aiStatus.providerAttempts.map((attempt, i) => (
                        <div key={i} className="mb-1 border-b border-white/10 pb-1">
                          <span className="font-bold uppercase opacity-80">{attempt.provider}</span>: <span className={attempt.status === 'success' ? 'text-green-400' : 'text-red-400 uppercase'}>{attempt.status}</span> {attempt.model}
                          {attempt.error && <div className="text-red-400 mt-1 opacity-80 text-[10px]">Error: {attempt.error}</div>}
                          {attempt.reason && !attempt.error && <div className="text-yellow-400 mt-1 opacity-80 text-[10px]">Reason: {attempt.reason}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-white/30 italic">No provider attempts recorded.</div>
                )}
              </div>
            );
          }
          
          if (activeTab === "prompts") {
            if (prompts.length === 0) {
              return <div className="text-white/30 italic">No prompts recorded for this run.</div>;
            }
            return (
              <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                {JSON.stringify(prompts, null, 2)}
              </pre>
            );
          }
          
          if (debug[activeTab] === undefined || (Array.isArray(debug[activeTab]) && debug[activeTab].length === 0)) {
            return <div className="text-white/30 italic">No data available for {activeTab}</div>;
          }
          
          return (
            <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed">
              {JSON.stringify(debug[activeTab], null, 2)}
            </pre>
          );
        })()}
      </div>
    </div>
  );
}
