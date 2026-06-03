import React, { useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import Reports from "@/models/reports";
import showToast from "@/utils/toast";
import Preloader from "@/components/Preloader";
import {
  Plus,
  Trash,
  PencilSimple,
  Clock,
  FileText,
  CheckCircle,
  XCircle,
  ArrowLeft,
  ArrowSquareOut,
} from "@phosphor-icons/react";

function parseJsonSafe(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default function AdminReports() {
  const [activeTab, setActiveTab] = useState("templates"); // templates | history
  const [templates, setTemplates] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null); // null or template object
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null); // null or report details object

  // Form State
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [rules, setRules] = useState("");
  const [jsonSchema, setJsonSchema] = useState("");
  const [reportFormat, setReportFormat] = useState("");
  const [slug, setSlug] = useState("");
  const [componentPath, setComponentPath] = useState("");
  const [status, setStatus] = useState("active");
  const [showInPublic, setShowInPublic] = useState(true);
  const [publicBadge, setPublicBadge] = useState("");
  const [category, setCategory] = useState("");
  const [allowedFileTypes, setAllowedFileTypes] = useState("");
  const [outputFormats, setOutputFormats] = useState("");
  const [inputRules, setInputRules] = useState("");
  const [sampleData, setSampleData] = useState("");
  const [versionHistory, setVersionHistory] = useState("");
  const [schemaError, setSchemaError] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const { templates: tList } = await Reports.getTemplates();
      setTemplates(tList || []);
      const { reports: rList } = await Reports.getReports();
      setHistory(rList || []);
    } catch (err) {
      console.error(err);
      showToast("Failed to load reporting data.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateForm = () => {
    setEditingTemplate(null);
    setName("");
    setSlug("");
    setPrompt(
      "You are a professional energy auditor. Analyze the uploaded document and write a comprehensive energy audit report."
    );
    setModel("gemini-2.0-flash");
    setRules(
      '1. Use the Indian Rupee symbol (₹) for all currency values.\n2. Always state engineering values with appropriate metric units (e.g. kW, MWh).\n3. Any field specified in the json schema that is missing from the document MUST be written as "Data required" in the final report. Do not invent any values.'
    );
    setJsonSchema(
      JSON.stringify(
        {
          type: "object",
          properties: {
            clientName: { type: "string", title: "Client Name" },
            auditDate: { type: "string", title: "Audit Date" },
            transformerCapacity: {
              type: "string",
              title: "Transformer Capacity",
            },
            annualEnergySavings: {
              type: "string",
              title: "Annual Energy Savings (₹)",
            },
          },
          required: ["clientName", "auditDate", "transformerCapacity"],
        },
        null,
        2
      )
    );
    setReportFormat(
      "# Technical Energy Audit Report\n\n## 1. Executive Summary\n- **Client Name**: {{clientName}}\n- **Audit Date**: {{auditDate}}\n\n## 2. Electrical Substation Audit\n- **Transformer Capacity**: {{transformerCapacity}}\n\n## 3. Financial Analysis\n- **Estimated Annual Energy Savings**: {{annualEnergySavings}}\n"
    );
    setComponentPath("");
    setStatus("active");
    setShowInPublic(true);
    setPublicBadge("Available");
    setCategory("Energy Audit");
    setAllowedFileTypes("xlsx, xls, pdf, docx, pptx, jpg, jpeg, png");
    setOutputFormats("preview, pdf");
    setInputRules("");
    setSampleData("");
    setVersionHistory("");
    setSchemaError("");
    setIsFormOpen(true);
  };

  const openEditForm = (t) => {
    setEditingTemplate(t);
    setName(t.name || "");
    setSlug(t.slug || "");
    setPrompt(t.prompt || "");
    setModel(t.model || "");
    setRules(t.rules || "");
    setJsonSchema(
      t.jsonSchema
        ? JSON.stringify(parseJsonSafe(t.jsonSchema, {}), null, 2)
        : ""
    );
    setReportFormat(t.reportFormat || "");
    setComponentPath(t.componentPath || "");
    setStatus(t.status || "active");
    setShowInPublic(t.showInPublic !== false);
    setPublicBadge(t.publicBadge || "");
    setCategory(t.category || "");
    setAllowedFileTypes(
      t.allowedFileTypes ? parseJsonSafe(t.allowedFileTypes, []).join(", ") : ""
    );
    setOutputFormats(
      t.outputFormats ? parseJsonSafe(t.outputFormats, []).join(", ") : ""
    );
    setInputRules(
      t.inputRules
        ? JSON.stringify(parseJsonSafe(t.inputRules, {}), null, 2)
        : ""
    );
    setSampleData(
      t.sampleData
        ? JSON.stringify(parseJsonSafe(t.sampleData, {}), null, 2)
        : ""
    );
    setVersionHistory(
      t.versionHistory
        ? JSON.stringify(parseJsonSafe(t.versionHistory, []), null, 2)
        : ""
    );
    setSchemaError("");
    setIsFormOpen(true);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setSchemaError("");

    const jsonFields = [
      ["JSON Schema", jsonSchema],
      ["Input Rules", inputRules],
      ["Sample Data", sampleData],
      ["Version History", versionHistory],
    ];

    for (const [label, value] of jsonFields) {
      if (!value.trim()) continue;
      try {
        JSON.parse(value);
      } catch (err) {
        setSchemaError(`Invalid ${label} format: ${err.message}`);
        return;
      }
    }

    const payload = {
      name,
      slug: slug || null,
      prompt,
      model: model || null,
      rules: rules || null,
      jsonSchema: jsonSchema ? JSON.stringify(JSON.parse(jsonSchema)) : null,
      reportFormat: reportFormat || null,
      componentPath: componentPath || null,
      status,
      showInPublic,
      publicBadge: publicBadge || null,
      category: category || null,
      allowedFileTypes: allowedFileTypes
        ? JSON.stringify(
            allowedFileTypes
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          )
        : null,
      outputFormats: outputFormats
        ? JSON.stringify(
            outputFormats
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          )
        : null,
      inputRules: inputRules ? JSON.stringify(JSON.parse(inputRules)) : null,
      sampleData: sampleData ? JSON.stringify(JSON.parse(sampleData)) : null,
      versionHistory: versionHistory
        ? JSON.stringify(JSON.parse(versionHistory))
        : null,
    };

    setLoading(true);
    let result;
    if (editingTemplate) {
      result = await Reports.updateTemplate(editingTemplate.id, payload);
    } else {
      result = await Reports.createTemplate(payload);
    }

    if (result.error) {
      showToast(`Failed to save template: ${result.error}`, "error");
      setLoading(false);
    } else {
      showToast("Template saved successfully.", "success");
      setIsFormOpen(false);
      fetchData();
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this template? All reports generated with it will remain but their parent template reference will be removed."
      )
    )
      return;
    setLoading(true);
    const result = await Reports.deleteTemplate(id);
    if (result.success) {
      showToast("Template deleted successfully.", "success");
      fetchData();
    } else {
      showToast(`Delete failed: ${result.error}`, "error");
      setLoading(false);
    }
  };

  const handleDeleteReport = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this report from history? This cannot be undone."
      )
    )
      return;
    setLoading(true);
    const result = await Reports.deleteReport(id);
    if (result.success) {
      showToast("Report deleted successfully.", "success");
      if (selectedReport?.id === id) setSelectedReport(null);
      fetchData();
    } else {
      showToast(`Delete failed: ${result.error}`, "error");
      setLoading(false);
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-6"
      >
        {isFormOpen ? (
          <div className="max-w-[800px] mx-auto">
            <button
              onClick={() => setIsFormOpen(false)}
              className="flex items-center gap-x-2 text-theme-text-secondary hover:text-white mb-6 transition-all"
            >
              <ArrowLeft size={16} />
              <span>Back to templates</span>
            </button>
            <div className="w-full flex flex-col gap-y-1 pb-6 border-b border-white/10 mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingTemplate
                  ? `Edit Template: ${editingTemplate.name}`
                  : "Create Report Template"}
              </h2>
              <p className="text-xs text-white/60">
                Define the requirements, prompt parameters, rules, and layout
                constraints for AI report generation.
              </p>
            </div>

            <form
              onSubmit={handleSaveTemplate}
              className="flex flex-col gap-y-6"
            >
              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Technical Energy Audit"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg px-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-white mb-2">
                    Template ID / Slug
                  </label>
                  <input
                    type="text"
                    placeholder="commercial-building-energy-audit"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full h-10 bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg px-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-2">
                    Category
                  </label>
                  <input
                    type="text"
                    placeholder="Energy Audit"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-10 bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg px-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  Component Path
                </label>
                <input
                  type="text"
                  placeholder="components/templates/commercial-building-energy-audit/CommercialBuildingEnergyAuditTemplate.tsx"
                  value={componentPath}
                  onChange={(e) => setComponentPath(e.target.value)}
                  className="w-full h-10 bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg px-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder font-mono"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-white mb-2">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full h-10 bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg px-4 text-sm text-theme-text-primary focus:outline-none"
                  >
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="draft">draft</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-2">
                    Public Badge
                  </label>
                  <input
                    type="text"
                    placeholder="Available"
                    value={publicBadge}
                    onChange={(e) => setPublicBadge(e.target.value)}
                    className="w-full h-10 bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg px-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder"
                  />
                </div>

                <label className="flex items-center gap-x-3 mt-7 h-10 px-4 rounded-lg bg-theme-settings-input-bg border border-white/5 text-sm font-semibold text-white">
                  <input
                    type="checkbox"
                    checked={showInPublic}
                    onChange={(e) => setShowInPublic(e.target.checked)}
                    className="accent-primary-button"
                  />
                  Show in public
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-white mb-2">
                    Allowed File Types
                  </label>
                  <input
                    type="text"
                    placeholder="xlsx, xls, pdf, docx, pptx, jpg, jpeg, png"
                    value={allowedFileTypes}
                    onChange={(e) => setAllowedFileTypes(e.target.value)}
                    className="w-full h-10 bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg px-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-2">
                    Output Formats
                  </label>
                  <input
                    type="text"
                    placeholder="preview, pdf"
                    value={outputFormats}
                    onChange={(e) => setOutputFormats(e.target.value)}
                    className="w-full h-10 bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg px-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  Target LLM Model
                </label>
                <input
                  type="text"
                  placeholder="e.g. gemini-2.0-flash (Leave blank to use system default model)"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full h-10 bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg px-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  Core System Instructions / Prompt
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="Specify LLM system behavior..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg p-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  Rules & Format Constraints
                </label>
                <textarea
                  rows={4}
                  placeholder="Enter generation rules (one per line)..."
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  className="w-full bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg p-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  Input Rules JSON
                </label>
                <textarea
                  rows={5}
                  placeholder='{ "required": ["reportInfo", "projects"] }'
                  value={inputRules}
                  onChange={(e) => setInputRules(e.target.value)}
                  className="w-full bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg p-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder font-mono"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-bold text-white">
                    Extraction JSON Schema
                  </label>
                  {schemaError && (
                    <span className="text-xs text-red-400 font-semibold">
                      {schemaError}
                    </span>
                  )}
                </div>
                <textarea
                  rows={8}
                  placeholder='{ "type": "object", "properties": { ... } }'
                  value={jsonSchema}
                  onChange={(e) => setJsonSchema(e.target.value)}
                  className="w-full bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg p-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  Markdown Structure Layout
                </label>
                <textarea
                  rows={10}
                  placeholder="Define target markdown template structure..."
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value)}
                  className="w-full bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg p-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  Sample Data JSON
                </label>
                <textarea
                  rows={8}
                  placeholder='{ "reportInfo": { ... }, "projects": [] }'
                  value={sampleData}
                  onChange={(e) => setSampleData(e.target.value)}
                  className="w-full bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg p-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  Version History JSON
                </label>
                <textarea
                  rows={5}
                  placeholder='[{ "version": "1.0.0", "date": "2026-05-20", "notes": "Initial release" }]'
                  value={versionHistory}
                  onChange={(e) => setVersionHistory(e.target.value)}
                  className="w-full bg-theme-settings-input-bg border-2 border-transparent focus:border-primary-button rounded-lg p-4 text-sm text-theme-text-primary focus:outline-none placeholder:text-theme-settings-input-placeholder font-mono"
                />
              </div>

              <div className="flex gap-x-4 justify-end pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-6 py-2 rounded-lg bg-transparent border border-white/20 text-white hover:bg-white/5 transition-all text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg bg-primary-button hover:bg-secondary-button text-white transition-all text-sm font-semibold"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        ) : selectedReport ? (
          <div>
            <button
              onClick={() => setSelectedReport(null)}
              className="flex items-center gap-x-2 text-theme-text-secondary hover:text-white mb-6 transition-all"
            >
              <ArrowLeft size={16} />
              <span>Back to history</span>
            </button>

            <div className="w-full flex justify-between items-center pb-6 border-b border-white/10 mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Report Detail:{" "}
                  {selectedReport.template?.name || "Deleted Template"}
                </h2>
                <p className="text-xs text-white/60">
                  Generated on{" "}
                  {new Date(selectedReport.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => handleDeleteReport(selectedReport.id)}
                className="flex items-center gap-x-2 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-500/20 text-red-400 text-xs font-semibold transition-all"
              >
                <Trash size={14} />
                <span>Delete Log</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 flex flex-col gap-y-4">
                <div className="bg-theme-bg-sidebar p-4 rounded-xl border border-white/5">
                  <h3 className="text-sm font-bold text-white mb-3">
                    Report Content Preview
                  </h3>
                  <div className="bg-[#0b0c10] p-4 rounded-lg border border-white/5 font-mono text-sm overflow-x-auto whitespace-pre-wrap text-white min-h-[300px]">
                    {selectedReport.outputContent || "No content generated."}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-y-6">
                <div className="bg-theme-bg-sidebar p-4 rounded-xl border border-white/5">
                  <h3 className="text-sm font-bold text-white mb-3 font-semibold">
                    User Input Details
                  </h3>
                  <pre className="bg-[#0b0c10] p-3 rounded-lg border border-white/5 text-xs text-green-400 font-mono overflow-x-auto">
                    {JSON.stringify(
                      JSON.parse(selectedReport.inputDetails || "{}"),
                      null,
                      2
                    )}
                  </pre>
                </div>

                <div className="bg-theme-bg-sidebar p-4 rounded-xl border border-white/5">
                  <h3 className="text-sm font-bold text-white mb-3 font-semibold">
                    Extracted Technical Data
                  </h3>
                  <pre className="bg-[#0b0c10] p-3 rounded-lg border border-white/5 text-xs text-blue-400 font-mono overflow-x-auto">
                    {JSON.stringify(
                      JSON.parse(selectedReport.extractedData || "{}"),
                      null,
                      2
                    )}
                  </pre>
                </div>

                {selectedReport.missingData && (
                  <div className="bg-theme-bg-sidebar p-4 rounded-xl border border-white/5">
                    <h3 className="text-sm font-bold text-white mb-3 font-semibold">
                      Missing Required Fields
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {JSON.parse(selectedReport.missingData).length === 0 ? (
                        <span className="text-xs text-green-400">
                          All required data points satisfied.
                        </span>
                      ) : (
                        JSON.parse(selectedReport.missingData).map((field) => (
                          <span
                            key={field}
                            className="text-xs bg-red-950/60 text-red-400 border border-red-500/20 px-2 py-0.5 rounded"
                          >
                            {field}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Header Area */}
            <div className="w-full flex justify-between items-center pb-6 border-b border-white/10 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  AI Report Settings
                </h1>
                <p className="text-xs text-theme-text-secondary mt-1">
                  Configure custom engineering templates and monitor execution
                  results.
                </p>
              </div>
              <button
                onClick={openCreateForm}
                className="flex items-center gap-x-2 px-4 py-2 bg-primary-button hover:bg-secondary-button text-white rounded-lg text-sm font-semibold transition-all shadow-md shadow-primary-button/10"
              >
                <Plus size={16} />
                <span>New Template</span>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-x-4 border-b border-white/10 mb-6 pb-px">
              <button
                onClick={() => setActiveTab("templates")}
                className={`pb-3 text-sm font-semibold transition-all border-b-2 ${
                  activeTab === "templates"
                    ? "text-primary-button border-primary-button"
                    : "text-theme-text-secondary border-transparent hover:text-white"
                }`}
              >
                Report Templates ({templates.length})
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`pb-3 text-sm font-semibold transition-all border-b-2 ${
                  activeTab === "history"
                    ? "text-primary-button border-primary-button"
                    : "text-theme-text-secondary border-transparent hover:text-white"
                }`}
              >
                Generation Logs ({history.length})
              </button>
            </div>

            {loading ? (
              <div className="h-60 flex justify-center items-center">
                <Preloader />
              </div>
            ) : activeTab === "templates" ? (
              templates.length === 0 ? (
                <div className="h-60 flex flex-col justify-center items-center gap-y-3 bg-theme-bg-sidebar rounded-xl border border-white/5">
                  <FileText size={40} className="text-white/20" />
                  <p className="text-sm text-theme-text-secondary">
                    No report templates defined yet.
                  </p>
                  <button
                    onClick={openCreateForm}
                    className="text-xs text-primary-button hover:underline font-semibold"
                  >
                    Create the first template
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className="bg-theme-bg-sidebar border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="text-base font-bold text-white">
                              {t.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {t.slug && (
                                <span className="text-[10px] bg-theme-settings-input-bg text-theme-text-secondary px-2 py-0.5 rounded font-mono">
                                  {t.slug}
                                </span>
                              )}
                              <span className="text-[10px] bg-theme-settings-input-bg text-theme-text-secondary px-2 py-0.5 rounded">
                                {t.category || "Uncategorized"}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                                  t.status === "active"
                                    ? "bg-green-950/50 text-green-400"
                                    : "bg-yellow-950/50 text-yellow-400"
                                }`}
                              >
                                {t.status || "active"}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                                  t.showInPublic
                                    ? "bg-blue-950/50 text-blue-400"
                                    : "bg-white/5 text-white/35"
                                }`}
                              >
                                {t.showInPublic ? "Public" : "Hidden"}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] bg-theme-settings-input-bg text-theme-text-secondary px-2 py-0.5 rounded font-mono">
                            {t.model || "default"}
                          </span>
                        </div>
                        <p className="text-xs text-theme-text-secondary line-clamp-3 mb-4 font-mono">
                          {t.prompt}
                        </p>
                        {t.componentPath && (
                          <p className="text-[10px] text-white/35 font-mono mb-3 break-all">
                            {t.componentPath}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mb-2">
                          {parseJsonSafe(t.outputFormats, []).map((format) => (
                            <span
                              key={format}
                              className="text-[10px] px-2 py-0.5 rounded bg-primary-button/10 text-primary-button"
                            >
                              {format}
                            </span>
                          ))}
                          {parseJsonSafe(t.allowedFileTypes, [])
                            .slice(0, 6)
                            .map((ext) => (
                              <span
                                key={ext}
                                className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/45"
                              >
                                .{ext}
                              </span>
                            ))}
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t border-white/5 mt-auto">
                        <span className="text-[10px] text-white/40">
                          Updated {new Date(t.updatedAt).toLocaleDateString()}
                        </span>
                        <div className="flex gap-x-3">
                          <button
                            onClick={() => openEditForm(t)}
                            className="p-1 text-theme-text-secondary hover:text-white transition-all"
                            title="Edit Template"
                          >
                            <PencilSimple size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(t.id)}
                            className="p-1 text-red-500/80 hover:text-red-400 transition-all"
                            title="Delete Template"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : history.length === 0 ? (
              <div className="h-60 flex flex-col justify-center items-center gap-y-2 bg-theme-bg-sidebar rounded-xl border border-white/5">
                <Clock size={40} className="text-white/20" />
                <p className="text-sm text-theme-text-secondary">
                  No generation logs found.
                </p>
              </div>
            ) : (
              <div className="bg-theme-bg-sidebar border border-white/5 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-[#000]/10 text-xs text-white/50 uppercase font-semibold">
                      <th className="p-4">Template</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Files</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const files = JSON.parse(h.uploadedFiles || "[]");
                      return (
                        <tr
                          key={h.id}
                          className="border-b border-white/5 text-sm hover:bg-white/5 transition-all"
                        >
                          <td className="p-4 font-semibold text-white">
                            {h.template?.name || "Deleted Template"}
                          </td>
                          <td className="p-4 text-xs text-theme-text-secondary">
                            {new Date(h.createdAt).toLocaleString()}
                          </td>
                          <td className="p-4 text-xs text-theme-text-secondary">
                            {files.length} file(s)
                          </td>
                          <td className="p-4">
                            {h.status === "completed" ? (
                              <span className="flex items-center gap-x-1 text-xs text-green-400 font-semibold">
                                <CheckCircle size={14} /> Completed
                              </span>
                            ) : h.status === "failed" ? (
                              <span
                                className="flex items-center gap-x-1 text-xs text-red-400 font-semibold"
                                title={h.error}
                              >
                                <XCircle size={14} /> Failed
                              </span>
                            ) : (
                              <span className="flex items-center gap-x-2 text-xs text-blue-400 font-semibold">
                                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                {h.status}
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex gap-x-3 justify-end">
                              {h.status === "completed" && (
                                <button
                                  onClick={() => setSelectedReport(h)}
                                  className="text-xs text-primary-button hover:underline font-semibold flex items-center gap-x-1"
                                >
                                  <span>View</span>
                                  <ArrowSquareOut size={12} />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteReport(h.id)}
                                className="text-red-500/80 hover:text-red-400 transition-all"
                                title="Delete Log"
                              >
                                <Trash size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
