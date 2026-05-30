import React, { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { isMobile } from "react-device-detect";
import Reports from "@/models/reports";
import showToast from "@/utils/toast";
import { useReactToPrint } from "react-to-print";
import { toast } from "react-toastify";
import CommercialBuildingEnergyAuditTemplate, {
  sampleCommercialBuildingEnergyAuditData,
} from "@/components/templates/commercial-building-energy-audit/CommercialBuildingEnergyAuditTemplate";
import {
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  UploadSimple,
  SpinnerGap,
  DownloadSimple,
  Eye,
  Sparkle,
  X,
  FilePdf,
  FileXls,
  FileDoc,
  FileImage,
  FilePpt,
  File,
  Lightning,
  Wind,
  Sun,
  Cpu,
  Drop,
  Gauge,
  Thermometer,
  Calendar,
  User,
  MapPin,
  Buildings,
  ClipboardText,
  FileText,
  Copy,
  WarningCircle,
  CaretDown,
  CaretUp,
  Info,
} from "@phosphor-icons/react";

const USE_AI_DURING_GENERATION =
  import.meta.env.VITE_USE_AI_DURING_GENERATION === "true";

const SKIP_LLM_FOR_DEV =
  import.meta.env.VITE_SKIP_LLM_FOR_DEV === "true";

const AI_PROVIDER = import.meta.env.VITE_AI_PROVIDER || "openrouter";

// ─── Template definitions (shown in UI — no admin data exposed) ─────────────────
// Keys match the server-side TEMPLATE_SLUG_MAP (seetech-xxx-001 format)
const TEMPLATE_CATALOG = [
  {
    key: "commercial-building-energy-audit",
    label: "Detailed Energy Audit Report",
    description: "Comprehensive facility-wide energy audit with ECM analysis, savings, investment, payback and implementation roadmap.",
    icon: Lightning,
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.25)",
    status: "active",
  },
  {
    key: "boiler-audit",
    label: "Boiler Audit Report",
    description: "Thermal efficiency analysis, flue gas measurement and fuel optimization.",
    icon: Drop,
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.25)",
    status: "coming_soon",
  },
  {
    key: "motor-retrofit",
    label: "Motor Retrofit Report",
    description: "Motor load survey, IE2/IE3 retrofit analysis, VFD feasibility and savings.",
    icon: Cpu,
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.12)",
    border: "rgba(139,92,246,0.25)",
    status: "coming_soon",
  },
  {
    key: "apfc-report",
    label: "APFC Report",
    description: "Power factor correction analysis, reactive power compensation and kVAh billing optimization.",
    icon: Gauge,
    color: "#06b6d4",
    bg: "rgba(6,182,212,0.12)",
    border: "rgba(6,182,212,0.25)",
    status: "coming_soon",
  },
  {
    key: "solar-report",
    label: "Solar Report",
    description: "Solar PV feasibility, generation estimate, investment and payback analysis.",
    icon: Sun,
    color: "#eab308",
    bg: "rgba(234,179,8,0.12)",
    border: "rgba(234,179,8,0.25)",
    status: "coming_soon",
  },
  {
    key: "hvac-report",
    label: "HVAC Report",
    description: "Chiller, AHU, pump and cooling tower performance audit with retrofit recommendations.",
    icon: Thermometer,
    color: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.25)",
    status: "coming_soon",
  },
];

const COMMERCIAL_BUILDING_ENERGY_AUDIT_SLUG = "commercial-building-energy-audit";
const OPENROUTER_TIMEOUT_MS = Number(import.meta.env.VITE_OPENROUTER_TIMEOUT_MS || 45000);
const OPENROUTER_MODELS = (
  import.meta.env.VITE_OPENROUTER_MODELS ||
  "openai/gpt-oss-120b:free,openrouter/free"
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function createAiProgressState() {
  return {
    active: false,
    modelIndex: 0,
    modelName: OPENROUTER_MODELS[0] || "",
    totalModels: OPENROUTER_MODELS.length,
    remainingMs: OPENROUTER_TIMEOUT_MS,
    elapsedMs: 0,
    timeoutMs: OPENROUTER_TIMEOUT_MS,
    message: OPENROUTER_MODELS.length ? `Trying AI model 1/${OPENROUTER_MODELS.length}` : "",
  };
}

function cleanAiFailureMessage(reason) {
  if (!reason) return "AI enhancement failed";
  return reason
    .replace(/AI enhancement failed:?/gi, "")
    .replace(/Gemini \d+:/gi, "")
    .replace(/Deterministic report used\.?/gi, "")
    .replace(/Your report is still ready\.?/gi, "")
    .trim();
}

function formatGeminiQuotaMessage(seconds) {
  return `Gemini free quota is temporarily exhausted. Retry in ${seconds} seconds. Your report is still ready.`;
}

function formatProviderAttemptLabel(attempt, index) {
  if (attempt.provider === "gemini" && attempt.keyIndex) {
    return `Gemini Key ${attempt.keyIndex}`;
  }
  if (attempt.provider === "openrouter") {
    return `OpenRouter Model ${attempt.order || index + 1}`;
  }
  return `Model ${attempt.order || index + 1}`;
}

const getAiModels = () =>
  (import.meta.env.VITE_OPENROUTER_MODELS ||
    "openai/gpt-oss-120b:free,openrouter/free")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

const getAiTimeoutMs = () =>
  Number(import.meta.env.VITE_OPENROUTER_TIMEOUT_MS || 45000);

function isCommercialBuildingEnergyAuditTemplate(template) {
  return [
    template?.catalogKey,
    template?.key,
    template?.slug,
    template?.templateId,
  ].includes(COMMERCIAL_BUILDING_ENERGY_AUDIT_SLUG);
}

// ─── Step metadata ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Select Template" },
  { id: 2, label: "Basic Details" },
  { id: 3, label: "Upload Files" },
  { id: 4, label: "Generate" },
  { id: 5, label: "Preview & Download" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fileExt(name) {
  return name?.split(".").pop()?.toLowerCase() || "";
}

function FileTypeIcon({ name, size = 20 }) {
  const ext = fileExt(name);
  if (ext === "pdf") return <FilePdf size={size} className="text-red-400" />;
  if (["xls", "xlsx", "csv"].includes(ext)) return <FileXls size={size} className="text-green-400" />;
  if (["doc", "docx"].includes(ext)) return <FileDoc size={size} className="text-blue-400" />;
  if (["ppt", "pptx"].includes(ext)) return <FilePpt size={size} className="text-orange-400" />;
  if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "tiff"].includes(ext))
    return <FileImage size={size} className="text-purple-400" />;
  return <File size={size} className="text-white/40" />;
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getProjectsForQC(reportData) {
  if (Array.isArray(reportData?.groupedProjects) && reportData.groupedProjects.length) {
    return reportData.groupedProjects.flatMap((group, groupIndex) =>
      Array.isArray(group?.projects)
        ? group.projects.map((project, projectIndex) => ({
            ...project,
            __groupIndex: groupIndex,
            __projectIndex: projectIndex,
          }))
        : []
    );
  }

  if (Array.isArray(reportData?.projects)) {
    const hasGroupObjects = reportData.projects.some(
      (item) => item && Array.isArray(item.projects)
    );

    if (hasGroupObjects) {
      return reportData.projects.flatMap((group, groupIndex) =>
        Array.isArray(group?.projects)
          ? group.projects.map((project, projectIndex) => ({
              ...project,
              __groupIndex: groupIndex,
              __projectIndex: projectIndex,
            }))
          : []
      );
    }

    return reportData.projects;
  }

  return [];
}

// ─── Step Indicator ────────────────────────────────────────────────────────────
function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-start justify-center mb-8 w-full">
      {STEPS.map((step, idx) => {
        const isCompleted = currentStep > step.id;
        const isActive = currentStep === step.id;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center w-[72px] sm:w-20 shrink-0">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300 ${
                  isCompleted
                    ? "bg-primary-button border-primary-button text-white"
                    : isActive
                    ? "bg-transparent border-primary-button text-primary-button ring-4 ring-primary-button/15"
                    : "bg-transparent border-white/15 text-white/25"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle size={18} weight="fill" />
                ) : (
                  <span className="text-xs">{step.id}</span>
                )}
              </div>
              <span
                className={`mt-1.5 text-[10px] font-semibold text-center leading-tight transition-colors duration-300 ${
                  isActive
                    ? "text-primary-button"
                    : isCompleted
                    ? "text-white/55"
                    : "text-white/20"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mt-4 mx-1 transition-all duration-500 ${
                  currentStep > step.id ? "bg-primary-button" : "bg-white/10"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── STEP 1 ── Select Template ─────────────────────────────────────────────────
function Step1({ templates, selected, onSelect, loading }) {
  // Match DB templates to catalog:
  // 1. By slug column (seetech-ea-001)  — primary
  // 2. By name fallback
  const resolveDbTemplate = (catalogKey) => {
    const cat = TEMPLATE_CATALOG.find((c) => c.key === catalogKey);
    if (!cat) return null;
    // Prefer slug match
    const bySlug = templates.find((t) => t.slug === cat.key);
    if (bySlug) return bySlug;
    // Fallback to name match
    return (
      templates.find(
        (t) =>
          t.name.toLowerCase() === cat.label.toLowerCase() ||
          t.name.toLowerCase().includes(cat.label.split(" ")[0].toLowerCase())
      ) || null
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">Select Report Type</h2>
        <p className="text-sm text-white/45 mt-1">
          Currently available: Detailed Energy Audit Report. More report formats will be available soon.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-white/5 animate-pulse border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATE_CATALOG.map((cat) => {
            const dbTemplate = resolveDbTemplate(cat.key);
            const isAvailable = cat.status === "active" && !!dbTemplate;
            const isSelected = selected?.catalogKey === cat.key;
            const Icon = cat.icon;

            return (
              <button
                key={cat.key}
                onClick={() =>
                  isAvailable &&
                  onSelect({
                    ...dbTemplate,
                    // Always expose the slug as templateId (seetech-ea-001)
                    templateId: dbTemplate.slug || cat.key,
                    catalogKey: cat.key,
                    meta: cat,
                  })
                }
                disabled={!isAvailable}
                className={`group relative text-left p-4 rounded-2xl border-2 transition-all duration-200 ${
                  isSelected
                    ? "shadow-lg scale-[1.02]"
                    : isAvailable
                    ? "hover:scale-[1.015] hover:shadow-md cursor-pointer opacity-100"
                    : "opacity-40 cursor-not-allowed grayscale"
                }`}
                style={{
                  borderColor: isSelected ? cat.color : isAvailable ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                  background: isSelected ? cat.bg : isAvailable ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                  boxShadow: isSelected ? `0 0 20px 0 ${cat.color}22` : undefined,
                }}
              >
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110"
                  style={{ background: cat.bg }}
                >
                  <Icon size={20} style={{ color: cat.color }} weight="fill" />
                </div>

                <h3
                  className="text-sm font-bold leading-snug mb-1"
                  style={{ color: isSelected || isAvailable ? cat.color : "#ffffff" }}
                >
                  {cat.label}
                </h3>
                <p className="text-[11px] text-white/40 leading-relaxed line-clamp-2">
                  {cat.description}
                </p>

                {cat.status === "coming_soon" && (
                  <span className="absolute top-3 right-3 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/10 text-white/50 tracking-wider">
                    Coming Soon
                  </span>
                )}

                {cat.status === "active" && isAvailable && !isSelected && (
                  <span className="absolute top-3 right-3 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 tracking-wider">
                    Available
                  </span>
                )}

                {isSelected && (
                  <span
                    className="absolute top-3 right-3 flex items-center gap-x-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: cat.bg, color: cat.color }}
                  >
                    <CheckCircle size={10} weight="fill" /> Selected
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── STEP 2 ── Basic Details ───────────────────────────────────────────────────
const OUTPUT_FORMAT_OPTIONS = [
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "DOCX" },
  { value: "both", label: "Both" },
];

function Step2({ details, onChange }) {
  const fields = [
    {
      key: "clientName",
      label: "Client / Facility Name",
      placeholder: "e.g. Acme Manufacturing Pvt. Ltd.",
      required: true,
      icon: Buildings,
      col: 2,
    },
    {
      key: "facilityName",
      label: "Facility / Plant Name",
      placeholder: "e.g. Unit-II, MIDC Plant",
      required: false,
      icon: Buildings,
      col: 2,
    },
    {
      key: "location",
      label: "Location",
      placeholder: "e.g. Plot No. 5, Taloja Industrial Area, Navi Mumbai",
      required: true,
      icon: MapPin,
      col: 2,
    },
    {
      key: "auditPeriod",
      label: "Audit Period",
      placeholder: "e.g. 10 Apr 2026 – 14 Apr 2026",
      required: true,
      icon: Calendar,
      col: 1,
    },
    {
      key: "reportDate",
      label: "Report Date",
      placeholder: "e.g. 20 May 2026",
      required: true,
      icon: ClipboardText,
      col: 1,
    },
    {
      key: "contactPerson",
      label: "Contact Person",
      placeholder: "e.g. Mr. Rajesh Kumar, Sr. Manager – Engineering",
      icon: User,
      col: 2,
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">Enter Basic Details</h2>
        <p className="text-sm text-white/45 mt-1">
          This information will appear on the report cover page and header.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {fields.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.key} className={f.col === 2 ? "col-span-2" : "col-span-2 sm:col-span-1"}>
              <label className="block text-xs font-semibold text-white/60 mb-1.5">
                {f.label}
                {f.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <div className="relative">
                <Icon
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none"
                />
                <input
                  type="text"
                  placeholder={f.placeholder}
                  value={details[f.key] || ""}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className="w-full h-10 pl-8 pr-3 bg-[rgba(255,255,255,0.04)] border border-white/10 focus:border-primary-button rounded-xl text-sm text-white focus:outline-none placeholder:text-white/20 transition-all"
                />
              </div>
            </div>
          );
        })}

        {/* Output Format */}
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-white/60 mb-2">
            Output Format
          </label>
          <div className="flex gap-x-3">
            {OUTPUT_FORMAT_OPTIONS.map((opt) => {
              const isActive = details.outputFormat === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange("outputFormat", opt.value)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all duration-150 ${
                    isActive
                      ? "border-primary-button bg-primary-button/15 text-primary-button"
                      : "border-white/10 bg-white/3 text-white/40 hover:border-white/25 hover:text-white/70"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-white/25">
            Note: Multi-format output (DOCX / PDF conversion) requires a document converter service.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 3 ── Upload Files ────────────────────────────────────────────────────
const ACCEPTED_TYPES = {
  "Excel": { exts: ".xls,.xlsx", label: "XLS / XLSX", color: "#22c55e" },
  "PDF": { exts: ".pdf", label: "PDF", color: "#ef4444" },
  "Word": { exts: ".docx", label: "DOCX", color: "#3b82f6" },
  "PowerPoint": { exts: ".pptx", label: "PPTX", color: "#f97316" },
  "Images": { exts: ".jpg,.jpeg,.png", label: "JPG / JPEG / PNG", color: "#a855f7" },
};

const ALL_ACCEPT = Object.values(ACCEPTED_TYPES).map((t) => t.exts).join(",");

const isExcelFileName = (filename = "") => /\.(xlsx|xls)$/i.test(filename);

function validationTone(status) {
  if (status === "valid") return "border-green-500/25 bg-green-500/10 text-green-300";
  if (status === "warning") return "border-yellow-500/25 bg-yellow-500/10 text-yellow-300";
  if (status === "error") return "border-red-500/25 bg-red-500/10 text-red-300";
  return "border-white/10 bg-white/5 text-white/45";
}

function ExcelValidationCard({ validation }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!validation) {
    return (
      <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${validationTone()}`}>
        Validation pending.
      </div>
    );
  }

  const { status, readinessScore, professionalSummary, criticalIssues, highPriorityRecommendations, mediumPriorityRecommendations, optionalRecommendations, technicalDetails, mappedColumns, role } = validation;

  const roleLabel = role === "ecm_project_sheet" ? "ECM Project Sheet" : 
                    role === "equipment_master" ? "Equipment Master" :
                    role === "energy_consumption_data" ? "Energy Consumption Data" :
                    role === "specification_data" ? "Specification Data" :
                    role === "image_evidence" ? "Image Evidence" :
                    "Supporting Document";

  return (
    <div className={`mt-3 rounded-xl border p-4 text-sm ${validationTone(status)}`}>
      <div className="flex flex-col gap-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-x-2 border-b border-current pb-2 border-opacity-10">
          <div className="flex items-center gap-x-2">
            {status === "error" ? (
              <X size={20} className="shrink-0" />
            ) : status === "warning" ? (
              <WarningCircle size={20} className="shrink-0" />
            ) : (
              <CheckCircle size={20} weight="fill" className="shrink-0" />
            )}
            <span className="font-bold text-base">
              {status === "valid" || status === "accepted_project_file" ? "Accepted: Project File" : 
               status === "accepted_supporting_file" ? `Accepted: ${roleLabel}` : 
               status === "warning" ? "Validation: Warning" : "Validation: Error"}
            </span>
          </div>
          {readinessScore !== undefined && readinessScore > 0 && role === "ecm_project_sheet" && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">Data Readiness</span>
              <span className="text-lg font-black">{readinessScore}%</span>
            </div>
          )}
        </div>

        {/* Summary */}
        <p className="opacity-90 leading-relaxed font-medium">
          {professionalSummary || "Validation completed."}
        </p>

        {/* Critical Issues */}
        {criticalIssues?.length > 0 && (
          <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <p className="font-bold text-red-400 mb-1 flex items-center gap-x-1.5"><X size={16}/> Critical Blockers</p>
            <ul className="list-disc list-inside text-red-300/80 text-xs space-y-1">
              {criticalIssues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          </div>
        )}

        {/* High Priority Recommendations */}
        {highPriorityRecommendations?.length > 0 && role === "ecm_project_sheet" && (
          <div className="mt-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
            <p className="font-bold text-yellow-400 mb-2 flex items-center gap-x-1.5"><WarningCircle size={16}/> High-Priority Improvements</p>
            <div className="grid gap-2 text-xs text-yellow-300/80">
              {highPriorityRecommendations.map((rec, i) => (
                <div key={i} className="flex flex-col bg-black/10 p-2 rounded">
                  <span className="font-semibold text-yellow-300">Missing: {rec.field}</span>
                  <span className="opacity-80 mt-0.5">{rec.whyItMatters}</span>
                  <span className="opacity-60 text-[10px] mt-1">Suggested column: {rec.suggestedColumnNames.join(", ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Technical Details Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDetailsOpen(!detailsOpen);
          }}
          className="mt-2 flex items-center gap-x-1 text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity self-start focus:outline-none"
        >
          {detailsOpen ? <CaretUp size={14} /> : <CaretDown size={14} />}
          {detailsOpen ? "Hide Technical Details" : "Show Technical Details"}
        </button>

        {/* Technical Details Collapsible */}
        {detailsOpen && (
          <div className="mt-2 grid gap-y-3 text-xs opacity-70 bg-black/10 rounded-lg p-3">
            {/* Medium & Optional */}
            {(mediumPriorityRecommendations?.length > 0 || optionalRecommendations?.length > 0) && role === "ecm_project_sheet" && (
              <div>
                <p className="font-bold mb-1 opacity-90 border-b border-current border-opacity-10 pb-1">Additional Recommendations</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  {mediumPriorityRecommendations?.map((rec, i) => (
                    <li key={i}>Add <strong>{rec.field}</strong>: {rec.whyItMatters}</li>
                  ))}
                  {optionalRecommendations?.map((rec, i) => (
                    <li key={i}>{rec.whyItMatters}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Mapped Columns */}
            {role === "ecm_project_sheet" && (
              <div>
                 <p className="font-bold mb-1 opacity-90 border-b border-current border-opacity-10 pb-1">Detected Mapping</p>
                 <div className="grid grid-cols-2 gap-1 mt-1">
                   {Object.entries(mappedColumns || {}).filter(([, val]) => val).map(([key, val], i) => (
                     <span key={i} className="truncate" title={`${key} → ${val}`}>
                       <span className="opacity-60">{key}:</span> {val}
                     </span>
                   ))}
                 </div>
              </div>
            )}

            {/* Raw Details */}
            <div>
               <p className="font-bold mb-1 opacity-90 border-b border-current border-opacity-10 pb-1">Scan Details</p>
               <p>Sheets: {(technicalDetails?.sheetsScanned || []).join(", ")}</p>
               <p>Header row: {technicalDetails?.headerRow}</p>
               <p>Rows detected: {technicalDetails?.rowsDetected}</p>
               <p>Columns detected: {(technicalDetails?.rawColumns || []).join(", ")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step3({ uploadedFiles, onUpload, onRemove, uploading }) {
  const dropRef = useRef(null);
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const processFiles = async (files) => {
    for (const f of Array.from(files)) {
      await onUpload(f);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">Upload Source Documents</h2>
        <p className="text-sm text-white/45 mt-1">
          The AI will extract data from your uploaded files to populate the report.
        </p>
      </div>

      {/* Accepted types legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(ACCEPTED_TYPES).map(([name, meta]) => (
          <span
            key={name}
            className="flex items-center gap-x-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border"
            style={{
              borderColor: meta.color + "40",
              background: meta.color + "12",
              color: meta.color,
            }}
          >
            {name}
            <span className="opacity-60 font-normal">· {meta.label}</span>
          </span>
        ))}
      </div>

      {/* Drop zone */}
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files); }}
        className={`relative flex flex-col items-center justify-center gap-y-3 border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all duration-200 ${
          dragging
            ? "border-primary-button bg-primary-button/8 scale-[1.01]"
            : "border-white/12 hover:border-white/28 hover:bg-white/2"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALL_ACCEPT}
          className="hidden"
          onChange={(e) => {
            processFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
            dragging ? "bg-primary-button/20 scale-110" : "bg-white/6"
          }`}
        >
          <UploadSimple
            size={26}
            className={dragging ? "text-primary-button" : "text-white/30"}
          />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">
            {dragging ? "Release to upload" : "Drag & drop files or click to browse"}
          </p>
          <p className="text-xs text-white/30 mt-0.5">
            Excel · PDF · Word · PowerPoint · Images — multiple files supported
          </p>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-1 inline-flex items-center gap-x-2 rounded-xl bg-primary-button px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
        >
          <UploadSimple size={16} />
          Upload Files
        </button>

        {uploading && (
          <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-y-2">
              <SpinnerGap size={30} className="text-primary-button animate-spin" />
              <p className="text-xs text-white/60">Processing file…</p>
            </div>
          </div>
        )}
      </div>

      {/* File list */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 flex flex-col gap-y-2">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
            {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""} ready
          </p>
          {uploadedFiles.map((f, idx) => (
            <div
              key={idx}
              className="flex flex-wrap items-center gap-x-3 px-3 py-2.5 bg-white/4 border border-white/8 rounded-xl group"
            >
              <FileTypeIcon name={f.filename} size={18} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate leading-tight">{f.filename}</p>
                <p className="text-[11px] text-white/30 leading-none mt-0.5">
                  {(fileExt(f.filename) || "file").toUpperCase()} - {formatBytes(f.size) || "Size unavailable"} -{" "}
                  {isExcelFileName(f.filename)
                    ? `Validation: ${f.validation?.status || "pending"}`
                    : f.parsingStatus === "uploaded_unparsed"
                      ? "Uploaded; parsing unavailable"
                      : "Uploaded"}
                  {f.token_count_estimate > 0 ? ` - ~${f.token_count_estimate.toLocaleString()} tokens` : ""}
                </p>
              </div>
              {f.validation?.status === "error" ? (
                <X size={14} className="text-red-400 shrink-0" />
              ) : f.validation?.status === "warning" ? (
                <WarningCircle size={14} className="text-yellow-400 shrink-0" />
              ) : (
                <CheckCircle size={14} weight="fill" className="text-green-400 shrink-0" />
              )}
              <button
                onClick={() => onRemove(idx)}
                className="p-1 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove"
              >
                <X size={14} />
              </button>
              {f.validation && (
                <div className="basis-full">
                  <ExcelValidationCard validation={f.validation} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {uploadedFiles.length === 0 && !uploading && (
        <p className="mt-4 text-center text-xs text-white/25 italic">
          Files are optional — you can generate from form details alone.
        </p>
      )}
    </div>
  );
}

// ─── STEP 4 ── Generate ────────────────────────────────────────────────────────
function Step4({
  selectedTemplate,
  details,
  uploadedFiles,
  onGenerate,
  onPreviewSample,
  generating,
  showSlowWarning,
  hasInvalidExcel,
  aiProgress,
  hasProjectFile,
  allowGenerateWithSupportingFilesOnly,
  setAllowGenerateWithSupportingFilesOnly,
}) {
  const filledDetails = Object.entries(details).filter(([k, v]) => k !== "outputFormat" && v?.trim?.());
  const labelMap = {
    clientName: "Client / Facility",
    location: "Location",
    auditPeriod: "Audit Period",
    reportDate: "Report Date",
    contactPerson: "Contact Person",
  };

  return (
    <div className="animate-fade-in flex flex-col gap-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Ready to Generate</h2>
        <p className="text-sm text-white/45 mt-1">
          Review your selections, then click <strong className="text-white">Generate Report</strong>.
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Template",
            value: selectedTemplate?.meta?.label || selectedTemplate?.name,
            accent: selectedTemplate?.meta?.color || "#46c8ff",
            bg: selectedTemplate?.meta?.bg || "rgba(70,200,255,0.1)",
            IconComp: selectedTemplate?.meta?.icon || FileText,
          },
          {
            label: "Details",
            value: `${filledDetails.length} fields`,
            accent: "#22c55e",
            bg: "rgba(34,197,94,0.1)",
            IconComp: ClipboardText,
          },
          {
            label: "Files",
            value: `${uploadedFiles.length} uploaded`,
            accent: "#a855f7",
            bg: "rgba(168,85,247,0.1)",
            IconComp: UploadSimple,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="flex flex-col gap-y-2 p-4 rounded-2xl border"
            style={{ background: card.bg, borderColor: card.accent + "30" }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: card.accent + "20" }}>
              <card.IconComp size={16} style={{ color: card.accent }} weight="fill" />
            </div>
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">{card.label}</p>
              <p className="text-sm font-bold text-white leading-snug mt-0.5 line-clamp-2">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Details preview */}
      {filledDetails.length > 0 && (
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-3">
            Report Details
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {filledDetails.map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] text-white/30">{labelMap[k] || k}</p>
                <p className="text-sm text-white/80 font-medium truncate">{v}</p>
              </div>
            ))}
            {details.outputFormat && (
              <div>
                <p className="text-[10px] text-white/30">Output Format</p>
                <p className="text-sm text-white/80 font-medium uppercase">{details.outputFormat}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Files preview */}
      {uploadedFiles.length > 0 && (
        <div className="bg-white/3 border border-white/8 rounded-xl p-4">
          <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-2">
            Source Files
          </p>
          <div className="flex flex-wrap gap-2">
            {uploadedFiles.map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-x-1.5 px-2.5 py-1 bg-white/6 rounded-lg text-xs text-white/60 border border-white/8"
              >
                <FileTypeIcon name={f.filename} size={12} />
                {f.filename}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Generate button */}
      {hasInvalidExcel && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          Please fix or remove the invalid file before generating the report.
        </div>
      )}
      
      {!hasProjectFile && uploadedFiles.length > 0 && !hasInvalidExcel && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
          <label className="flex items-start gap-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowGenerateWithSupportingFilesOnly}
              onChange={(e) => setAllowGenerateWithSupportingFilesOnly(e.target.checked)}
              className="mt-1 flex-shrink-0"
            />
            <div className="text-sm text-amber-200">
              <span className="font-bold block mb-0.5">Generate preliminary audit profile</span>
              <span className="opacity-80">No ECM project sheet was found. Check this box to generate a draft report using only the supporting data.</span>
            </div>
          </label>
        </div>
      )}
      
      <button
        onClick={onGenerate}
        disabled={generating || hasInvalidExcel || (!hasProjectFile && uploadedFiles.length > 0 && !allowGenerateWithSupportingFilesOnly)}
        className="flex items-center justify-center gap-x-3 w-full py-4 rounded-2xl font-bold text-base text-white transition-all shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-55 disabled:cursor-not-allowed disabled:scale-100"
        style={{
          background: generating
            ? "rgba(70,200,255,0.3)"
            : hasInvalidExcel || (!hasProjectFile && uploadedFiles.length > 0 && !allowGenerateWithSupportingFilesOnly)
              ? "rgba(239,68,68,0.25)"
            : "linear-gradient(135deg, #46c8ff 0%, #3b82f6 100%)",
          boxShadow: generating || hasInvalidExcel || (!hasProjectFile && uploadedFiles.length > 0 && !allowGenerateWithSupportingFilesOnly) ? "none" : "0 8px 32px rgba(70,200,255,0.25)",
        }}
      >
        {generating ? (
          <>
            <SpinnerGap size={22} className="animate-spin" />
            {USE_AI_DURING_GENERATION && !SKIP_LLM_FOR_DEV
              ? "AI is enhancing your report..."
              : "Building report from data..."}
          </>
        ) : (
          <>
            <Sparkle size={22} weight="fill" />
            Generate Report
          </>
        )}
      </button>

      {isCommercialBuildingEnergyAuditTemplate(selectedTemplate) && (
        <button
          type="button"
          onClick={onPreviewSample}
          disabled={generating}
          className="flex items-center justify-center gap-x-2 w-full py-3 rounded-xl border border-amber-400/25 bg-amber-400/10 hover:bg-amber-400/15 text-amber-200 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Eye size={16} />
          Preview Sample Template
        </button>
      )}

      {/* Progress bar */}
      {generating && (
        <div className="flex flex-col items-center gap-y-2 -mt-2">
          {generating &&
            USE_AI_DURING_GENERATION &&
            !SKIP_LLM_FOR_DEV &&
            aiProgress.active && (
            <div className="ai-generation-progress-card w-full animate-fade-in">
              <div className="ai-progress-title">AI is enhancing your report...</div>
              <div className="ai-progress-row">
                <span>Status</span>
                <strong>{aiProgress.message}</strong>
              </div>
              <div className="ai-progress-row">
                <span>Current model</span>
                <strong>
                  {Math.min(aiProgress.modelIndex + 1, aiProgress.totalModels)}/{aiProgress.totalModels}:{" "}
                  {aiProgress.modelName || "Waiting..."}
                </strong>
              </div>
              <div className="ai-progress-row">
                <span>Time remaining for this model</span>
                <strong>{formatDuration(aiProgress.remainingMs)}</strong>
              </div>
              <div className="ai-progress-row">
                <span>Total elapsed time</span>
                <strong>{formatDuration(aiProgress.elapsedMs)}</strong>
              </div>
              <div className="ai-progress-bar">
                <div
                  className="ai-progress-bar-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      ((aiProgress.timeoutMs - aiProgress.remainingMs) / aiProgress.timeoutMs) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
          {showSlowWarning && (
            <div className="flex items-center gap-x-2 text-amber-400 text-sm mb-1 px-3 py-1.5 bg-amber-400/10 border border-amber-400/20 rounded-lg animate-fade-in">
              <Info size={16} />
              <span>
                {USE_AI_DURING_GENERATION && !SKIP_LLM_FOR_DEV
                  ? "AI enhancement is taking longer than expected."
                  : "Deterministic report generation is taking longer than expected."}
              </span>
            </div>
          )}
          <div className="w-full h-1.5 bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #46c8ff, #3b82f6, #46c8ff)",
                backgroundSize: "200% 100%",
                animation: "shimmerBar 1.8s linear infinite",
                width: "100%",
              }}
            />
          </div>
          <p className="text-xs text-white/35 animate-pulse">
            {USE_AI_DURING_GENERATION && !SKIP_LLM_FOR_DEV
              ? "Extracting data - Running AI enhancement - Applying formatting..."
              : "Extracting data - Building deterministic report - Applying formatting..."}
          </p>
        </div>
      )}
      <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
        AI enhancement is optional. If models are slow, deterministic report will be used automatically.
      </div>
    </div>
  );
}

// ─── STEP 5 ── Preview & Download ─────────────────────────────────────────────
function Step5({
  report,
  selectedTemplate,
  onStartOver,
  generatedReportData,
  onReportUpdated,
  onEnhanceWithAi,
  aiEnhancing,
  aiProgress,
  canEnhanceWithAi,
  geminiCooldownSeconds,
}) {
  const [copied, setCopied] = useState(false);
  const [qcResult, setQcResult] = useState(null);
  const [rechecking, setRechecking] = useState(false);
  const [isWordExporting, setIsWordExporting] = useState(false);
  const [wordExportMode, setWordExportMode] = useState(null);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const reportRef = useRef(null);
  const wordExportToastRef = useRef(null);
  const pdfExportToastRef = useRef(null);

  const content = report?.outputContent || "";
  const shouldRenderEnergyAuditTemplate =
    isCommercialBuildingEnergyAuditTemplate(selectedTemplate);
  const providerUsed =
    report?.providerUsed ||
    generatedReportData?.providerUsed ||
    generatedReportData?.metadata?.providerUsed ||
    generatedReportData?.qcSummary?.providerUsed ||
    "";
  const isFallbackMode = providerUsed === "deterministic-fallback" || providerUsed === "deterministic";
  const reportData = generatedReportData || sampleCommercialBuildingEnergyAuditData;
  const showFieldFlags =
    import.meta.env.DEV &&
    import.meta.env.VITE_SHOW_FIELD_FLAGS === "true";
  const fieldFlags = reportData?.fieldFlags || {};
  const missingFieldSummary = reportData?.missingFieldSummary || [];

  const isDev = import.meta.env.MODE === "development" || import.meta.env.VITE_ALLOW_DRAFT_EXPORT === "true";

  const handlePrint = useReactToPrint({
    content: () => reportRef.current,
    documentTitle: "SEE-Tech_Detailed_Energy_Audit_Report",
    onPrintError: () => {
      window.print();
    },
  });

  const runFrontendQC = () => {
    let failed = false;
    let errors = [];
    let hardErrors = 0;
    
    try {
      const rd = JSON.parse(report.outputContent);
      const groups = rd.groupedProjects || [];
      const projectsForQC = getProjectsForQC(rd);
      const validEcms = projectsForQC.filter(p => {
        const title = p?.projectTitle || p?.ecmName || p?.title;
        const normalized = String(title || "").toLowerCase().trim();
        return title && normalized !== "data required" && normalized !== "[object object]" && !normalized.includes("project project");
      }).length;

      if (groups.length === 0) {
        errors.push({ message: "Report has no grouped projects.", path: "groupedProjects" });
        hardErrors++;
      }
      
      if (validEcms === 0 || projectsForQC.length === 0) {
        errors.push({ message: "No valid ECMs found.", path: "projects" });
        hardErrors++;
      }

      const shouldBlockExport = 
        hardErrors > 0 ||
        validEcms === 0 ||
        groups.length === 0 ||
        !rd ||
        !projectsForQC.length;

      failed = shouldBlockExport;

    } catch(e) {
      failed = true;
      errors.push({ message: "Invalid report data", path: "report" });
    }
    
    return { failed, errors };
  };

  const handleDownload = (ext = "md") => {
    const mime = ext === "md" ? "text/markdown" : "text/plain";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Report downloaded!", "success");
  };

  const handleDownloadWord = async (allowDraft = false) => {
    if (!report?.id) {
      showToast("Please generate the report before downloading Word.", "info");
      return;
    }
    if (isWordExporting) return;

    setIsWordExporting(true);
    setWordExportMode(allowDraft ? "draft" : "final");
    wordExportToastRef.current = toast.loading(
      allowDraft ? "Generating Draft Word document..." : "Generating Word document..."
    );

    try {
      const res = await Reports.downloadDocx(report.id, allowDraft);
      if (res.success) {
        setQcResult(null);
        toast.update(wordExportToastRef.current, {
          render: "Word document downloaded.",
          type: "success",
          isLoading: false,
          autoClose: 5000,
          closeButton: true,
        });
      } else {
        if (isDev) {
          console.error("[DOCX EXPORT ERROR]", res);
        }
        if (res.qcFailed) {
          setQcResult(res);
          toast.update(wordExportToastRef.current, {
            render: "Report requires review before final export. Please check QC details.",
            type: "error",
            isLoading: false,
            autoClose: 5000,
            closeButton: true,
          });
        } else if (String(res.error || "").includes(".map is not a function")) {
          toast.update(wordExportToastRef.current, {
            render: "Export failed because report data is not normalized. Please click Re-run Cleanup & QC.",
            type: "error",
            isLoading: false,
            autoClose: 5000,
            closeButton: true,
          });
        } else {
          toast.update(wordExportToastRef.current, {
            render: "Failed to generate Word document. Please check QC details or backend logs.",
            type: "error",
            isLoading: false,
            autoClose: 5000,
            closeButton: true,
          });
        }
      }
    } finally {
      setIsWordExporting(false);
      setWordExportMode(null);
      wordExportToastRef.current = null;
    }
  };

  const handleDownloadPdf = async () => {
    if (isPdfExporting) return;

    if (!reportRef.current) {
      showToast("Please generate the report before downloading PDF.", "info");
      return;
    }

    const qc = runFrontendQC();
    if (qc.failed) {
      setQcResult({ qcFailed: true, qcErrors: qc.errors });
      showToast("Report requires review before final export. Please check QC details.", "error");
      return;
    }

    setIsPdfExporting(true);
    pdfExportToastRef.current = toast.loading("Preparing PDF...");

    try {
      await Promise.resolve(handlePrint?.());
      toast.update(pdfExportToastRef.current, {
        render: "PDF print dialog opened.",
        type: "success",
        isLoading: false,
        autoClose: 3000,
        closeButton: true,
      });
    } catch (error) {
      if (isDev) {
        console.error("[PDF EXPORT ERROR]", error);
      }
      window.print();
      toast.update(pdfExportToastRef.current, {
        render: "Failed to generate PDF, trying browser print...",
        type: "warning",
        isLoading: false,
        autoClose: 5000,
        closeButton: true,
      });
    } finally {
      setIsPdfExporting(false);
      pdfExportToastRef.current = null;
    }
  };

  const handleRecheck = async () => {
    if (!report?.id) return;
    setRechecking(true);
    const res = await Reports.recheckQC(report.id);
    setRechecking(false);
    if (res.success) {
      showToast(res.qcPassed ? "QC Passed! Data cleaned." : "QC still failing. Please review.", res.qcPassed ? "success" : "warning");
      setQcResult(res.qcPassed ? null : res);
      if (onReportUpdated && res.reportData) {
        onReportUpdated({ ...report, outputContent: JSON.stringify(res.reportData) });
      }
    } else {
      showToast(res.error || "Failed to run QC.", "error");
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    showToast("Copied to clipboard!", "success");
  };

  const missing = report?.missingData ? JSON.parse(report.missingData) : [];

  return (
    <div className="animate-fade-in flex flex-col gap-y-5">
      {/* Header row */}
      <div className="report-ready-header">
        <div className="report-ready-status">
          <div className="report-ready-title-row">
            <div className="status-dot w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle size={12} weight="fill" className="text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Report Ready</h2>
            {isFallbackMode && (
              <span className="ml-3 px-2.5 py-1 rounded-full bg-red-900/40 text-red-400 text-xs border border-red-500/30 flex items-center gap-x-1.5 font-semibold shadow-[0_0_15px_rgba(239,68,68,0.15)]">
                Deterministic report
              </span>
            )}
          </div>
          <p className="report-ready-meta text-sm text-white/45">
            {content.split("\n").length} lines generated • {(content.length / 1024).toFixed(1)} KB
          </p>
          {isDev && report?.modelUsed && (
            <p className="text-xs text-white/30 mt-1">
              Model used: {report.modelUsed}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="report-export-actions">
          {!shouldRenderEnergyAuditTemplate && (
            <>
              <button
                onClick={handleCopy}
                title="Copy to clipboard"
                className={`flex items-center gap-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  copied
                    ? "bg-green-600/20 border-green-500/30 text-green-400"
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {copied ? <CheckCircle size={13} weight="fill" /> : <Copy size={13} />}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={() => handleDownload("md")}
                title="Download as Markdown"
                className="flex items-center gap-x-1.5 px-3 py-2 rounded-lg bg-primary-button hover:opacity-90 text-white text-xs font-semibold transition-all"
              >
                <DownloadSimple size={13} />
                Download .md
              </button>
              <button
                onClick={() => handleDownload("txt")}
                title="Download as plain text"
                className="flex items-center gap-x-1.5 px-3 py-2 rounded-lg bg-white/8 hover:bg-white/14 border border-white/10 text-white/70 hover:text-white text-xs font-semibold transition-all"
              >
                <DownloadSimple size={13} />
                .txt
              </button>
            </>
          )}

          {shouldRenderEnergyAuditTemplate && (
            <>
                <button
                  type="button"
                  onClick={onEnhanceWithAi}
                  disabled={!canEnhanceWithAi || aiEnhancing || geminiCooldownSeconds > 0}
                  className="report-export-button flex items-center gap-x-1.5 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkle size={18} weight="fill" />
                  {geminiCooldownSeconds > 0
                    ? `Retry Gemini in ${geminiCooldownSeconds}s`
                    : aiEnhancing
                      ? "Enhancing..."
                      : "Enhance with AI"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadWord(true)}
                  title="Download Word"
                  disabled={isWordExporting}
                  className="report-export-button flex items-center gap-x-1.5 px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold shadow-lg shadow-orange-500/20 transition-all"
                >
                  <FileDoc size={18} weight="fill" />
                  {isWordExporting && wordExportMode === "draft" ? "Generating Word..." : "Download Word"}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  title="Print / Save as PDF"
                  disabled={isPdfExporting}
                  className="report-export-button flex items-center gap-x-1.5 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-lg shadow-red-500/20 transition-all"
                >
                  <FilePdf size={18} weight="fill" />
                  {isPdfExporting ? "Preparing PDF..." : "Print / Save as PDF"}
                </button>
            </>
          )}
        </div>
      </div>

      {shouldRenderEnergyAuditTemplate && (
        <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-4 print:hidden">
          <p className="text-sm text-sky-100">
            AI enhancement is optional. If models are slow, deterministic report will be used automatically.
          </p>
          
          {isDev && (
            <details className="mt-4 rounded-lg bg-black/20 border border-white/10 p-3 animate-fade-in print:hidden">
              <summary className="cursor-pointer text-sm font-bold text-white/80 flex items-center gap-x-2">
                <Info size={16} />
                AI Enhancement Debug (Dev Only)
              </summary>
              <div className="mt-3 text-xs text-white/70 space-y-2 font-mono">
                <div><span className="font-bold opacity-80 text-white">Enhancement Status:</span> {report?.aiEnhancementStatus || 'unknown'}</div>
                <div><span className="font-bold opacity-80 text-white">Provider Attempted:</span> {report?.aiProviderAttempted || report?.providerUsed || 'unknown'}</div>
                <div><span className="font-bold opacity-80 text-white">Model Used:</span> {report?.modelUsed || report?.providerAttempts?.[0]?.model || 'none'}</div>
                
                {report?.debug?.unmatchedEcmCount > 0 && (
                  <div className="text-red-400"><span className="font-bold opacity-80">Unmatched ECMs:</span> {report.debug.unmatchedEcmCount}</div>
                )}
                
                {typeof report?.retryAfterSeconds === "number" && report.retryAfterSeconds > 0 && (
                  <div><span className="font-bold opacity-80 text-white">Retry After:</span> {report.retryAfterSeconds}s</div>
                )}
                
                {report?.aiFailureReason && (
                  <div className="text-red-400"><span className="font-bold opacity-80">Failure Reason:</span> {report.aiFailureReason}</div>
                )}
                
                {report?.aiEnhancedFields && report.aiEnhancedFields.length > 0 && (
                  <div>
                    <span className="font-bold opacity-80 text-green-400">Total Fields Enhanced:</span> <span className="text-green-300">{report.aiEnhancedFields.length}</span>
                    <br />
                    <span className="font-bold opacity-80 text-green-400">AI Enhanced Fields (List):</span>
                    <ul className="list-disc ml-5 mt-1 text-green-300/80 max-h-32 overflow-y-auto">
                      {report.aiEnhancedFields.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}

                {report?.aiDroppedFields && report.aiDroppedFields.length > 0 && (
                  <div>
                    <span className="font-bold opacity-80 text-yellow-400">AI Dropped Fields:</span>
                    <ul className="list-disc ml-5 mt-1 text-yellow-300/80">
                      {report.aiDroppedFields.map((df, i) => (
                        <li key={i}>
                          <div>{df.field} <span className="opacity-75">({df.reason})</span></div>
                          {df.preview && <div className="opacity-60 break-words">{df.preview}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <span className="font-bold opacity-80 text-white">Provider Attempts:</span>
                  <pre className="mt-1 bg-black/50 p-2 rounded max-h-48 overflow-y-auto overflow-x-auto whitespace-pre-wrap text-white/60">
                    {JSON.stringify(report?.providerAttempts || [], null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          )}

          {aiEnhancing && (
            <div className="ai-generation-progress-card w-full animate-fade-in mt-4">
              <div className="ai-progress-title">AI is enhancing your report...</div>
              <div className="ai-progress-row">
                <span>Status</span>
                <strong>{aiProgress.message}</strong>
              </div>
              <div className="ai-progress-row">
                <span>Current model</span>
                <strong>
                  {Math.min(aiProgress.modelIndex + 1, aiProgress.totalModels)}/{aiProgress.totalModels}: {aiProgress.modelName || "Waiting..."}
                </strong>
              </div>
              <div className="ai-progress-row">
                <span>Time remaining for this model</span>
                <strong>{formatDuration(aiProgress.remainingMs)}</strong>
              </div>
              <div className="ai-progress-row">
                <span>Total elapsed time</span>
                <strong>{formatDuration(aiProgress.elapsedMs)}</strong>
              </div>
              <div className="ai-progress-bar">
                <div
                  className="ai-progress-bar-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      ((aiProgress.timeoutMs - aiProgress.remainingMs) / aiProgress.timeoutMs) * 100
                    )}%`,
                  }}
                />
              </div>
              <p className="ai-progress-note">
                Models are limited to 45 seconds each. Total expected wait is about 90 seconds.
              </p>
            </div>
          )}
        </div>
      )}

        {/* QC Failure Panel */}
        {qcResult && qcResult.qcFailed && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-5 mb-2 shadow-lg">
            <h3 className="text-red-400 font-bold text-lg mb-2 flex items-center gap-2">
              <WarningCircle size={20} weight="bold" />
              Report Quality Check Required
            </h3>
            <p className="text-white/80 text-sm mb-4">
              The report was generated, but export is blocked because some quality checks failed.
            </p>
            
            {qcResult.qcErrors && qcResult.qcErrors.length > 0 && (
              <div className="mb-4">
                <h4 className="text-red-300 font-semibold text-sm mb-1">Critical Issues:</h4>
                <ul className="list-disc list-inside text-xs text-white/70 space-y-1 ml-1">
                  {qcResult.qcErrors.map((err, i) => (
                    <li key={i}>
                      <span className="font-medium text-white/90">{err.message}</span> 
                      {err.path && <span className="opacity-50 ml-1">({err.path})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {qcResult.summary && (
              <div className="mb-4 bg-black/20 rounded p-3 text-xs text-white/60">
                <div className="grid grid-cols-2 gap-2">
                  <div>Valid ECMs: {qcResult.summary.validEcmCount ?? qcResult.summary.projectCount}</div>
                  <div>Groups: {qcResult.summary.groupCount}</div>
                  <div>Duplicate Titles: {qcResult.summary.duplicateTitleCount}</div>
                  <div>Invalid Titles: {qcResult.summary.invalidTitleCount}</div>
                  <div>Hard Errors: {qcResult.summary.hardErrorCount ?? qcResult.qcErrors?.length ?? 0}</div>
                  <div>Warnings: {qcResult.summary.warningCount ?? qcResult.qcWarnings?.length ?? 0}</div>
                </div>
              </div>
            )}

            {qcResult.qcWarnings && qcResult.qcWarnings.length > 0 && (
              <div className="mb-4">
                <h4 className="text-yellow-300 font-semibold text-sm mb-1">Warnings:</h4>
                <ul className="list-disc list-inside text-xs text-white/70 space-y-1 ml-1">
                  {qcResult.qcWarnings.map((warn, i) => (
                    <li key={i}>
                      <span className="font-medium text-white/90">{warn.message}</span>
                      {warn.path && <span className="opacity-50 ml-1">({warn.path})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleRecheck}
              disabled={rechecking}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-all"
            >
              {rechecking ? "Rechecking..." : "Re-run Cleanup & QC"}
            </button>
          </div>
        )}

      {/* Missing fields warning */}
      {!shouldRenderEnergyAuditTemplate && missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-yellow-900/15 border border-yellow-500/20 rounded-xl">
          <span className="text-xs font-semibold text-yellow-400 shrink-0">⚠ Missing fields:</span>
          {missing.map((field) => (
            <span
              key={field}
              className="text-[10px] px-2 py-0.5 bg-yellow-900/40 text-yellow-300/80 border border-yellow-500/15 rounded"
            >
              {field}
            </span>
          ))}
        </div>
      )}

      {/* Preview panel */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          shouldRenderEnergyAuditTemplate ? "bg-white border-white shadow-xl" : "bg-[#0b0c10] border-white/8"
        }`}
      >
        {/* Fake terminal bar - hide for public structured report */}
        {!shouldRenderEnergyAuditTemplate && (
          <div className="flex items-center gap-x-2 px-4 py-2.5 bg-white/3 border-b border-white/6">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            <Eye size={12} className="ml-2 text-white/25" />
            <span className="text-[11px] text-white/25 font-mono">
              report-output.md
            </span>
          </div>
        )}

        {/* Report content */}
        {shouldRenderEnergyAuditTemplate ? (
          <div className="report-viewer">
            <div className="report-page-shell">
              <div ref={reportRef} className="report-print-area">
                <CommercialBuildingEnergyAuditTemplate data={reportData} />
              </div>
            </div>
          </div>
        ) : (
          <pre className="p-5 text-[13px] text-white/75 font-mono whitespace-pre-wrap overflow-x-auto max-h-[500px] overflow-y-auto leading-relaxed">
            {content || "No content generated."}
          </pre>
        )}
      </div>

      {showFieldFlags && shouldRenderEnergyAuditTemplate && (
        <>
          <div className="field-flags-debug-panel bg-black/40 border border-white/10 rounded-xl p-4 mt-2">
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
              Field Flags Debug
            </p>
            <div className="max-h-72 overflow-y-auto space-y-1.5 tool-call-scrollbar">
              {Object.entries(fieldFlags).map(([path, meta]) => (
                <div key={path} className="flex items-start justify-between gap-3 text-xs bg-white/5 p-2 rounded">
                  <div className="min-w-0">
                    <div className="text-white/90 font-mono break-all">{path}</div>
                    <div className="text-white/45 mt-1">
                      {meta.label} · {meta.source} · {meta.message}
                    </div>
                  </div>
                  <span className={`field-flag-badge flag-${meta.flag} shrink-0`}>{meta.flag}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="missing-field-debug-panel bg-black/40 border border-white/10 rounded-xl p-4 mt-2">
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
              Missing Field Summary
            </p>
            {missingFieldSummary.length > 0 ? (
              <div className="max-h-60 overflow-y-auto space-y-1.5 tool-call-scrollbar">
                {missingFieldSummary.map((item) => (
                  <div key={item.path} className="text-xs bg-white/5 p-2 rounded">
                    <div className="text-white/90 font-mono break-all">{item.path}</div>
                    <div className="text-white/45 mt-1">
                      {item.label} · {item.sourceExpected} · {item.message}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/55">No missing flagged fields.</p>
            )}
          </div>
        </>
      )}

      {/* Admin/Debug Provider Attempts Panel */}
      {isDev && report?.providerAttempts?.length > 0 && (
        <div className="bg-black/40 border border-white/10 rounded-xl p-4 mt-2">
          <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">
            Provider Attempts Debug
          </p>
          {(() => {
            const nonSkippedAttempts = (report.providerAttempts || []).filter((attempt) => attempt.status !== "skipped");
            const skippedAttempts = (report.providerAttempts || []).filter((attempt) => attempt.status === "skipped");

            return (
              <>
                <ul className="space-y-1.5">
                  {nonSkippedAttempts.map((attempt, idx) => (
                    <li key={`attempt-${idx}`} className="flex flex-col text-xs bg-white/5 p-2 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-white/50 font-medium">
                          {formatProviderAttemptLabel(attempt, idx)}:
                        </span>
                        <span className={attempt.status === "success"
                          ? "text-green-400 font-bold"
                          : attempt.status === "quota_exceeded"
                            ? "text-yellow-300 font-bold"
                            : "text-red-400 font-bold"}>
                          {attempt.status.toUpperCase()}
                        </span>
                        <span className="text-white/80 font-mono">{attempt.model}</span>
                      </div>
                      {typeof attempt.retryAfterSeconds === "number" && attempt.retryAfterSeconds > 0 && (
                        <span className="text-white/50 text-[11px] mt-1">Retry after: {attempt.retryAfterSeconds}s</span>
                      )}
                      {attempt.reason && (
                        <span className="text-white/50 text-[11px] mt-1 break-words">{attempt.reason}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {skippedAttempts.length > 0 && (
                  <details className="mt-3 text-xs text-white/55">
                    <summary className="cursor-pointer select-none">
                      Skipped attempts ({skippedAttempts.length})
                    </summary>
                    <ul className="space-y-1.5 mt-2">
                      {skippedAttempts.map((attempt, idx) => (
                        <li key={`skipped-${idx}`} className="flex flex-col text-xs bg-white/5 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <span className="text-white/50 font-medium">Skipped:</span>
                            <span className="text-yellow-300 font-bold">SKIPPED</span>
                            <span className="text-white/80 font-mono">{attempt.model}</span>
                          </div>
                          {attempt.reason && (
                            <span className="text-white/50 text-[11px] mt-1 break-words">{attempt.reason}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Start over */}
      <button
        onClick={onStartOver}
        className="flex items-center justify-center gap-x-2 py-2.5 rounded-xl border border-white/10 hover:border-white/22 text-white/50 hover:text-white/80 text-sm font-semibold transition-all"
      >
        <Sparkle size={14} />
        Generate Another Report
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function PublicReports() {
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Wizard state
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [details, setDetails] = useState({ outputFormat: "pdf" });
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiEnhancing, setAiEnhancing] = useState(false);
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [generatedReportData, setGeneratedReportData] = useState(null);
  const [aiProgress, setAiProgress] = useState(createAiProgressState());
  const [allowGenerateWithSupportingFilesOnly, setAllowGenerateWithSupportingFilesOnly] = useState(false);
  const [geminiCooldownSeconds, setGeminiCooldownSeconds] = useState(0);

  useEffect(() => {
    if (geminiCooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      setGeminiCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [geminiCooldownSeconds]);

  const aiTimerRef = useRef(null);
  const aiStartedAtRef = useRef(null);
  const aiModelStartedAtRef = useRef(null);
  const aiModelIndexRef = useRef(0);

  function startAiCountdown() {
    const models = getAiModels();
    const timeoutMs = getAiTimeoutMs();
  
    aiStartedAtRef.current = Date.now();
    aiModelStartedAtRef.current = Date.now();
    aiModelIndexRef.current = 0;
  
    setAiProgress({
      active: true,
      modelIndex: 0,
      modelName: models[0],
      totalModels: models.length,
      remainingMs: timeoutMs,
      elapsedMs: 0,
      timeoutMs,
      message: `Trying AI model 1/${models.length}`
    });
  
    if (aiTimerRef.current) clearInterval(aiTimerRef.current);
  
    aiTimerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - aiStartedAtRef.current;
      const currentModelElapsedMs = now - aiModelStartedAtRef.current;
  
      let modelIndex = aiModelIndexRef.current;
      let remainingMs = timeoutMs - currentModelElapsedMs;
  
      if (remainingMs <= 0 && modelIndex < models.length - 1) {
        modelIndex += 1;
        aiModelIndexRef.current = modelIndex;
        aiModelStartedAtRef.current = now;
        remainingMs = timeoutMs;
      }
  
      if (remainingMs < 0) remainingMs = 0;
  
      setAiProgress({
        active: true,
        modelIndex,
        modelName: models[modelIndex],
        totalModels: models.length,
        remainingMs,
        elapsedMs,
        timeoutMs,
        message:
          remainingMs === 0 && modelIndex === models.length - 1
            ? "AI attempts completed. Finalizing report from deterministic data..."
            : `Trying AI model ${modelIndex + 1}/${models.length}`
      });
    }, 1000);
  }

  function stopAiCountdown() {
    if (aiTimerRef.current) {
      clearInterval(aiTimerRef.current);
      aiTimerRef.current = null;
    }
  
    setAiProgress((prev) => ({
      ...prev,
      active: false
    }));
  }

  useEffect(() => {
    return () => {
      if (aiTimerRef.current) clearInterval(aiTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let timer;
    if (generating) {
      setShowSlowWarning(false);
      timer = setTimeout(() => setShowSlowWarning(true), 15000);
    } else {
      setShowSlowWarning(false);
    }
    return () => clearTimeout(timer);
  }, [generating]);

  // Old interval useEffect has been removed to fix frozen countdown

  useEffect(() => {
    Reports.getPublicTemplates()
      .then(({ templates: t }) => setTemplates(t || []))
      .catch(() => showToast("Could not load templates.", "error"))
      .finally(() => setLoadingTemplates(false));
  }, []);

  const handleDetailChange = (key, val) =>
    setDetails((prev) => ({ ...prev, [key]: val }));

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      let validation = null;
      if (isExcelFileName(file.name)) {
        const validationForm = new FormData();
        validationForm.append("files", file);
        const validationResponse = await Reports.validateUpload(validationForm);
        validation = validationResponse.files?.[0] || {
          filename: file.name,
          fileType: "excel",
          status: "error",
          sheets: [],
          headerRow: 0,
          detectedColumns: [],
          mappedColumns: {},
          projectRowsDetected: 0,
          missingRequiredColumns: [],
          missingRecommendedColumns: [],
          warnings: [],
          errors: [validationResponse.error || "Excel validation failed."],
        };
      }

      const fd = new FormData();
      fd.append("file", file);
      const res = await Reports.uploadFile(fd);
      if (res.success) {
        const uploadedFile = {
          filename: res.filename,
          location: res.location,
          size: res.size || file.size,
          mimetype: res.mimetype || file.type,
          parsingStatus: res.parsingStatus || "uploaded",
          token_count_estimate: res.token_count_estimate || 0,
          validation,
        };
        setUploadedFiles((prev) => [...prev, uploadedFile]);
        if (validation?.status === "error") {
          showToast("Excel validation failed. Please fix or remove the file before generating.", "error");
        } else if (validation?.status === "warning") {
          showToast("Excel uploaded with validation warnings.", "warning");
        } else if (validation?.status === "valid") {
          showToast(`Excel validation passed. ${validation.projectRowsDetected || 0} project rows detected.`, "success");
        } else if (res.warning) {
          showToast(res.warning, "warning");
        }
        return uploadedFile;
      } else {
        showToast(`Upload failed: ${res.error}`, "error");
      }
    } catch (err) {
      showToast("Upload error: " + err.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (idx) =>
    setUploadedFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleGenerate = async () => {
    const hasInvalidExcel = uploadedFiles.some(
      (file) => isExcelFileName(file.filename) && file.validation?.status === "error"
    );
    if (hasInvalidExcel) {
      showToast("Please fix or remove the invalid Excel file before generating the report.", "error");
      return;
    }

    setGenerating(true);
    try {
      if (USE_AI_DURING_GENERATION && !SKIP_LLM_FOR_DEV) {
        setAiProgress({
          active: true,
          modelIndex: 0,
          modelName: OPENROUTER_MODELS[0] || "",
          totalModels: OPENROUTER_MODELS.length,
          remainingMs: OPENROUTER_TIMEOUT_MS,
          elapsedMs: 0,
          timeoutMs: OPENROUTER_TIMEOUT_MS,
          message: `Trying AI model 1/${Math.max(OPENROUTER_MODELS.length, 1)}`,
        });
      }

      // Use slug (templateId) from the resolved catalog template.
      // Falls back to numeric DB id if slug not available.
      const res = await Reports.generateReport({
        templateId:   selectedTemplate.templateId || selectedTemplate.slug || selectedTemplate.id,
        publicForm:   details,   // camelCase; model.js converts to snake_case payload
        uploadedFiles,
      });
      if (res.error) {
        showToast(`Generation failed: ${res.error}`, "error");
      } else {
        setGeneratedReport(res.report);
        let parsedData = null;
        try {
          if (res.report?.outputContent) {
            parsedData = JSON.parse(res.report.outputContent);
          }
        } catch (e) {
          console.warn("Could not parse backend report JSON. Using mock mapper.");
        }
        if (!parsedData && isCommercialBuildingEnergyAuditTemplate(selectedTemplate)) {
          parsedData = {
            ...sampleCommercialBuildingEnergyAuditData,
            reportInfo: {
              ...sampleCommercialBuildingEnergyAuditData.reportInfo,
              clientName: details.clientName || "Data required",
              location: details.location || "Data required",
              auditPeriod: details.auditPeriod || "Data required",
              reportDate: details.reportDate || "Data required",
            },
            buildingProfile: {
              ...sampleCommercialBuildingEnergyAuditData.buildingProfile,
              facilityName: details.facilityName || "Data required",
            }
          };
        }
        setGeneratedReportData(parsedData);
        setStep(5);
      }
    } catch (err) {
      showToast("Generation error: " + err.message, "error");
    } finally {
      if (USE_AI_DURING_GENERATION && !SKIP_LLM_FOR_DEV) {
        setAiProgress((prev) => ({ ...prev, active: false }));
      }
      setGenerating(false);
    }
  };

  const handleEnhanceWithAi = async () => {
    if (!generatedReport?.id || aiEnhancing || geminiCooldownSeconds > 0) return;

    setAiEnhancing(true);
    startAiCountdown();

    try {
      const res = await Reports.enhanceReportWithAi(generatedReport.id);
      if (res.error) {
        showToast("AI enhancement failed. Your report is still ready.", "warning");
        return;
      }

      if (res.report) {
        setGeneratedReport(res.report);
        try {
          if (res.report.outputContent) {
            setGeneratedReportData(JSON.parse(res.report.outputContent));
          }
        } catch (e) {
          console.warn("Could not parse enhanced report JSON.");
        }
      }

      if (res.report?.aiEnhancementStatus === "quota_exceeded" || res.report?.retryAfterSeconds) {
        const seconds = res.report?.retryAfterSeconds || 60;
        setGeminiCooldownSeconds(seconds);
        toast.info(formatGeminiQuotaMessage(seconds));
      } else if (res.report?.aiEnhanced) {
        if (res.report?.providerUsed === "openrouter" && (res.report?.providerAttempts || []).some((attempt) => attempt.provider === "gemini")) {
          showToast("AI enhancement completed using fallback provider.", "success");
        } else {
          showToast("AI enhancement applied successfully.", "success");
        }
      } else if (res.report?.aiEnhancementStatus === "ai_unavailable") {
        toast.info("AI enhancement is unavailable right now. Your report is still ready.");
      } else {
        const reason = res.report?.aiFailureReason || res.report?.providerWarning || "AI enhancement failed";
        const cleanReason = cleanAiFailureMessage(reason);
        
        toast.warning(
          cleanReason
            ? `AI enhancement failed: ${cleanReason}. Your report is still ready.`
            : "AI enhancement failed. Your report is still ready."
        );
      }
    } catch (err) {
      if (err?.response?.data?.report?.aiEnhancementStatus === "quota_exceeded" || err?.response?.data?.report?.retryAfterSeconds) {
        const seconds = err?.response?.data?.report?.retryAfterSeconds || 60;
        setGeminiCooldownSeconds(seconds);
        toast.info(formatGeminiQuotaMessage(seconds));
        return;
      }
      if (err?.response?.data?.report?.aiEnhancementStatus === "ai_unavailable") {
        toast.info("AI enhancement is unavailable right now. Your report is still ready.");
        return;
      }
      const cleanReason = cleanAiFailureMessage(err.message);
      toast.warning(
        cleanReason
          ? `AI enhancement failed: ${cleanReason}. Your report is still ready.`
          : "AI enhancement failed. Your report is still ready."
      );
    } finally {
      stopAiCountdown();
      setAiEnhancing(false);
    }
  };

  const handlePreviewSample = () => {
    setGeneratedReport({
      outputContent: "Sample Commercial Building Energy Audit preview",
      missingData: "[]",
    });
    setStep(5);
  };

  const handleStartOver = () => {
    setStep(1);
    setSelectedTemplate(null);
    setDetails({ outputFormat: "pdf" });
    setUploadedFiles([]);
    setGeneratedReport(null);
    setGeneratedReportData(null);
    setAiEnhancing(false);
    setAiProgress(createAiProgressState());
    setAllowGenerateWithSupportingFilesOnly(false);
    setGeminiCooldownSeconds(0);
  };

  // Navigation guards
  const canNext = () => {
    if (step === 1) return !!selectedTemplate && selectedTemplate.meta?.status === "active";
    if (step === 2) {
      // Required: Client Name, Location, Audit Period, Report Date
      return !!(
        details.clientName?.trim() &&
        details.location?.trim() &&
        details.auditPeriod?.trim() &&
        details.reportDate?.trim()
      );
    }
    if (step === 3) return true; // files are optional
    return false;
  };

  const hasInvalidExcel = uploadedFiles.some(
    (file) => isExcelFileName(file.filename) && file.validation?.status === "error"
  );

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />

      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-auto"
      >
        {/* Subtle ambient gradient top */}
        <div
          className="pointer-events-none absolute top-0 left-0 right-0 h-72 opacity-25"
          style={{
            background: "radial-gradient(ellipse at 60% 0%, #46c8ff 0%, transparent 70%)",
          }}
        />

        <div
          className={`relative mx-auto px-4 py-8 md:px-8 md:py-10 ${
            step === 5 ? "report-preview-card" : "max-w-[820px]"
          }`}
        >
          {/* Page header */}
          <div className="mb-8">
            <div className="flex items-center gap-x-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-primary-button/15 flex items-center justify-center">
                <Sparkle size={18} weight="fill" className="text-primary-button" />
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                AI Report Generator
              </h1>
            </div>
            <p className="ml-12 text-sm text-white/40">
              SEE-Tech Solutions · Generate professional engineering reports in minutes.
            </p>
          </div>

          {/* Step indicator */}
          <StepIndicator currentStep={step} />

          {/* Card */}
          <div
            className={`bg-white/3 border border-white/8 rounded-2xl p-5 md:p-7 backdrop-blur-sm ${
              step === 5 ? "report-preview-shell" : ""
            }`}
          >
            {step === 1 && (
              <Step1
                templates={templates}
                selected={selectedTemplate}
                onSelect={setSelectedTemplate}
                loading={loadingTemplates}
              />
            )}
            {step === 2 && (
              <Step2 details={details} onChange={handleDetailChange} />
            )}
            {step === 3 && (
              <Step3
                uploadedFiles={uploadedFiles}
                onUpload={handleUpload}
                onRemove={handleRemove}
                uploading={uploading}
              />
            )}
            {step === 4 && (
              <Step4
                selectedTemplate={selectedTemplate}
                details={details}
                uploadedFiles={uploadedFiles}
                onGenerate={handleGenerate}
                onPreviewSample={handlePreviewSample}
                generating={generating}
                showSlowWarning={showSlowWarning}
                hasInvalidExcel={hasInvalidExcel}
                aiProgress={aiProgress}
                hasProjectFile={uploadedFiles.some(
                  (file) =>
                    isExcelFileName(file.filename) &&
                    (file.validation?.status === "accepted_project_file" ||
                      file.validation?.status === "valid" ||
                      file.validation?.status === "warning")
                )}
                allowGenerateWithSupportingFilesOnly={allowGenerateWithSupportingFilesOnly}
                setAllowGenerateWithSupportingFilesOnly={setAllowGenerateWithSupportingFilesOnly}
              />
            )}
            {step === 5 && (
              <Step5
                report={generatedReport}
                selectedTemplate={selectedTemplate}
                onStartOver={handleStartOver}
                generatedReportData={generatedReportData}
                onReportUpdated={(updated) => {
                  setGeneratedReport(updated);
                  try {
                    if (updated.outputContent) {
                      setGeneratedReportData(JSON.parse(updated.outputContent));
                    }
                  } catch(e) {}
                }}
                onEnhanceWithAi={handleEnhanceWithAi}
                aiEnhancing={aiEnhancing}
                aiProgress={aiProgress}
                canEnhanceWithAi={
                  isCommercialBuildingEnergyAuditTemplate(selectedTemplate) &&
                  OPENROUTER_MODELS.length > 0 &&
                  !!generatedReport?.id
                }
                geminiCooldownSeconds={geminiCooldownSeconds}
              />
            )}
          </div>

          {/* Navigation footer (steps 1–3) */}
          {step >= 1 && step <= 3 && (
            <div className="flex items-center justify-between mt-5 gap-x-3">
              <button
                onClick={() => setStep((s) => s - 1)}
                disabled={step === 1}
                className="flex items-center gap-x-2 px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/22 text-white/50 hover:text-white text-sm font-semibold transition-all disabled:opacity-25 disabled:pointer-events-none"
              >
                <ArrowLeft size={15} />
                Back
              </button>

              {/* Dot indicator */}
              <div className="flex items-center gap-x-1.5">
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    className={`rounded-full transition-all duration-300 ${
                      s === step
                        ? "w-5 h-1.5 bg-primary-button"
                        : step > s
                        ? "w-3 h-1.5 bg-primary-button/40"
                        : "w-3 h-1.5 bg-white/12"
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext()}
                className="flex items-center gap-x-2 px-5 py-2.5 rounded-xl bg-primary-button hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none text-white text-sm font-bold transition-all shadow-md shadow-primary-button/20"
              >
                {step === 3 ? "Review & Generate" : "Continue"}
                <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* Back on step 4 when not generating */}
          {step === 4 && !generating && (
            <div className="mt-5">
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-x-2 px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/22 text-white/50 hover:text-white text-sm font-semibold transition-all"
              >
                <ArrowLeft size={15} />
                Back
              </button>
            </div>
          )}
        </div>
      </div>

      {/* shimmer keyframe (inline style) */}
      <style>{`
        @keyframes shimmerBar {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
    </div>
  );
}
