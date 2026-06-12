const fs = require("fs");
const path = require("path");

const TRAINING_DATA_ROOT = path.resolve(__dirname, "../../training-data");
const MANIFEST_FILE = "file-manifest.json";
const TRAINING_EXAMPLE_FILE = path.join("metadata", "trainingExample.json");
const PROJECT_METADATA_FILE = path.join("metadata", "projectMetadata.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function safeClone(value, fallback = null) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function safeParseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sanitizeSegment(value, fallback = "unknown") {
  const normalized = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function buildTimestampSegment(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function writeText(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(data ?? ""), "utf8");
}

function fileExists(filePath) {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function repoRelative(filePath) {
  if (!filePath) return null;
  return path.relative(path.resolve(__dirname, "../.."), filePath).replace(/\\/g, "/");
}

function buildProjectSlug({ reportDetails = {}, projectMetadata = {} } = {}) {
  return sanitizeSegment(
    reportDetails.facilityName ||
      reportDetails.clientName ||
      projectMetadata.facilityName ||
      projectMetadata.clientName ||
      projectMetadata.projectName ||
      "project"
  );
}

function resolveCandidatePaths(uploadedFile = {}) {
  const repoRoot = path.resolve(__dirname, "../..");
  const fileName =
    uploadedFile.originalname ||
    uploadedFile.originalName ||
    uploadedFile.filename ||
    uploadedFile.name ||
    null;

  const rawCandidates = [
    uploadedFile.location,
    uploadedFile.path,
    fileName ? path.resolve(repoRoot, "storage", fileName) : null,
    fileName ? path.resolve(repoRoot, "collector/hotdir", fileName) : null,
  ];

  return rawCandidates
    .filter(Boolean)
    .map((candidate) =>
      path.isAbsolute(candidate) ? candidate : path.resolve(repoRoot, candidate)
    );
}

function copyUploadedInputs(uploadedFiles = [], inputsDir) {
  const copiedFiles = [];
  const fileManifest = [];

  uploadedFiles.forEach((uploadedFile, index) => {
    const sourcePath = resolveCandidatePaths(uploadedFile).find(fileExists);
    const originalName =
      uploadedFile.originalname ||
      uploadedFile.originalName ||
      uploadedFile.filename ||
      uploadedFile.name ||
      `uploaded-file-${index + 1}`;
    const sanitizedName = sanitizeSegment(path.parse(originalName).name, "file");
    const extension = path.extname(originalName) || path.extname(uploadedFile.filename || "");
    const copiedName = `${String(index + 1).padStart(2, "0")}-${sanitizedName}${extension}`;
    const destinationPath = path.join(inputsDir, copiedName);

    if (sourcePath) {
      ensureDir(path.dirname(destinationPath));
      fs.copyFileSync(sourcePath, destinationPath);
      copiedFiles.push(destinationPath);
    }

    fileManifest.push({
      index,
      originalName,
      storedName: uploadedFile.filename || uploadedFile.name || originalName,
      mimeType: uploadedFile.mimetype || uploadedFile.mimeType || uploadedFile.type || null,
      sizeBytes: uploadedFile.size || uploadedFile.sizeBytes || null,
      sourcePath: sourcePath || uploadedFile.location || uploadedFile.path || null,
      copiedPath: sourcePath ? repoRelative(destinationPath) : null,
      copied: Boolean(sourcePath),
    });
  });

  return { copiedFiles, fileManifest };
}

function calculateCompletenessScore({
  completenessScore,
  accuracySummary,
  extractedDataContext,
  missingFields = [],
}) {
  if (Number.isFinite(completenessScore)) {
    return Math.max(0, Math.min(100, Math.round(completenessScore)));
  }

  const finalReadiness = accuracySummary?.extractionAccuracy?.finalReportReadiness;
  if (Number.isFinite(finalReadiness)) {
    return Math.max(0, Math.min(100, Math.round(finalReadiness)));
  }

  const extractedCount =
    extractedDataContext?.extractionAudit?.fieldsExtracted?.length || 0;
  const missingCount =
    extractedDataContext?.extractionAudit?.fieldsMissing?.length ||
    missingFields.length ||
    0;
  const total = extractedCount + missingCount;
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((extractedCount / total) * 100)));
}

function uniqueWarnings(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()))];
}

function buildPackageMetadata({
  reportId,
  templateSlug,
  reportDetails,
  generationMode,
  projectSlug,
  packageDir,
  packageTimestamp,
  projectMetadata = {},
}) {
  return {
    reportId,
    templateSlug,
    generationMode,
    projectSlug,
    packageTimestamp,
    createdAt: new Date().toISOString(),
    packageDir,
    packageDirRelative: repoRelative(packageDir),
    reportDetails: safeClone(reportDetails, {}),
    projectMetadata: safeClone(projectMetadata, {}),
  };
}

function readManifest(packageDir) {
  const manifestPath = path.join(packageDir, MANIFEST_FILE);
  return safeParseJson(fs.readFileSync(manifestPath, "utf8"), {});
}

function writeManifest(packageDir, manifest) {
  const manifestPath = path.join(packageDir, MANIFEST_FILE);
  const nextManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
  };
  writeJson(manifestPath, nextManifest);
  return nextManifest;
}

function writeTrainingExampleSummary(packageDir, manifest, summary = {}) {
  const payload = {
    reportId: manifest.reportId,
    projectSlug: manifest.projectSlug,
    templateSlug: manifest.templateSlug,
    packageTimestamp: manifest.packageTimestamp,
    completenessScore: summary.completenessScore ?? manifest.completenessScore ?? null,
    missingFields: safeClone(summary.missingFields ?? manifest.missingFields, []),
    qualityGateResult: safeClone(
      summary.qualityGateResult ?? manifest.qualityGateResult,
      {}
    ),
    extractionWarnings: safeClone(
      summary.extractionWarnings ?? manifest.extractionWarnings,
      []
    ),
    generatedDocxPath:
      summary.generatedDocxPath ?? manifest.paths?.generatedDocxPath ?? null,
    correctedDocxPath:
      summary.correctedDocxPath ?? manifest.paths?.correctedDocxPath ?? null,
    correctionNotesPath:
      summary.correctionNotesPath ?? manifest.paths?.correctionNotesPath ?? null,
    enhancementApplied:
      summary.enhancementApplied ??
      manifest.enhancement?.applied ??
      false,
  };

  writeJson(path.join(packageDir, TRAINING_EXAMPLE_FILE), payload);
}

function createTrainingExamplePackage({
  reportId,
  templateSlug = "unknown-template",
  reportDetails = {},
  generationMode = "public",
  uploadedFiles = [],
  extractedReportData = {},
  extractedDataContext = {},
  extractionTrace = {},
  missingFields = [],
  qualityGateResult = {},
  extractionWarnings = [],
  completenessScore = null,
  projectMetadata = {},
}) {
  ensureDir(TRAINING_DATA_ROOT);

  const projectSlug = buildProjectSlug({ reportDetails, projectMetadata });
  const packageTimestamp = buildTimestampSegment();
  const packageDir = path.join(TRAINING_DATA_ROOT, projectSlug, packageTimestamp);

  ensureDir(packageDir);
  ensureDir(path.join(packageDir, "inputs"));
  ensureDir(path.join(packageDir, "extracted"));
  ensureDir(path.join(packageDir, "enhancement"));
  ensureDir(path.join(packageDir, "output"));
  ensureDir(path.join(packageDir, "corrections"));
  ensureDir(path.join(packageDir, "metadata"));

  const { fileManifest } = copyUploadedInputs(uploadedFiles, path.join(packageDir, "inputs"));
  const normalizedWarnings = uniqueWarnings([
    ...(Array.isArray(extractionWarnings) ? extractionWarnings : [extractionWarnings]),
    ...(extractedReportData?.extractionSummary?.validationWarnings || []),
    extractedReportData?.extractionSummary?.warning,
  ]);
  const normalizedCompleteness = calculateCompletenessScore({
    completenessScore,
    accuracySummary:
      extractedReportData?.accuracySummary || qualityGateResult?.accuracySummary,
    extractedDataContext,
    missingFields,
  });
  const metadata = buildPackageMetadata({
    reportId,
    templateSlug,
    reportDetails,
    generationMode,
    projectSlug,
    packageDir,
    packageTimestamp,
    projectMetadata,
  });

  writeJson(path.join(packageDir, "inputs", "file-manifest.json"), fileManifest);
  writeJson(path.join(packageDir, "extracted", "reportData.json"), extractedReportData);
  writeJson(path.join(packageDir, "extracted", "extractionTrace.json"), {
    extractionTrace: safeClone(extractionTrace, {}),
    extractedDataContext: safeClone(extractedDataContext, {}),
  });
  writeJson(path.join(packageDir, "extracted", "missingFields.json"), missingFields);
  writeJson(path.join(packageDir, PROJECT_METADATA_FILE), metadata);

  const manifest = writeManifest(packageDir, {
    packageVersion: 1,
    reportId,
    templateSlug,
    generationMode,
    projectSlug,
    packageTimestamp,
    completenessScore: normalizedCompleteness,
    missingFields: safeClone(missingFields, []),
    qualityGateResult: safeClone(qualityGateResult, {}),
    extractionWarnings: normalizedWarnings,
    enhancement: {
      applied: false,
      updatedAt: null,
    },
    paths: {
      fileManifestPath: "inputs/file-manifest.json",
      extractedReportDataPath: "extracted/reportData.json",
      extractionTracePath: "extracted/extractionTrace.json",
      missingFieldsPath: "extracted/missingFields.json",
      projectMetadataPath: repoRelative(path.join(packageDir, PROJECT_METADATA_FILE)),
      trainingExamplePath: repoRelative(path.join(packageDir, TRAINING_EXAMPLE_FILE)),
      generatedDocxPath: null,
      correctedDocxPath: null,
      correctionNotesPath: null,
    },
  });

  writeTrainingExampleSummary(packageDir, manifest, {
    completenessScore: normalizedCompleteness,
    missingFields,
    qualityGateResult,
    extractionWarnings: normalizedWarnings,
    enhancementApplied: false,
  });

  return {
    packageDir,
    projectSlug,
    packageTimestamp,
    manifestPath: path.join(packageDir, MANIFEST_FILE),
    manifestPathRelative: repoRelative(path.join(packageDir, MANIFEST_FILE)),
    packageDirRelative: repoRelative(packageDir),
    completenessScore: normalizedCompleteness,
  };
}

function updateTrainingExamplePackage(packageDir, updates = {}) {
  if (!fileExists(path.join(packageDir, MANIFEST_FILE))) {
    throw new Error(`Training package manifest not found at ${packageDir}`);
  }

  const manifest = readManifest(packageDir);
  const nextManifest = {
    ...manifest,
    ...updates,
    paths: {
      ...(manifest.paths || {}),
      ...(updates.paths || {}),
    },
    enhancement: {
      ...(manifest.enhancement || {}),
      ...(updates.enhancement || {}),
    },
  };

  const writtenManifest = writeManifest(packageDir, nextManifest);
  writeTrainingExampleSummary(packageDir, writtenManifest, {
    completenessScore: writtenManifest.completenessScore,
    missingFields: writtenManifest.missingFields,
    qualityGateResult: writtenManifest.qualityGateResult,
    extractionWarnings: writtenManifest.extractionWarnings,
    generatedDocxPath: writtenManifest.paths?.generatedDocxPath,
    correctedDocxPath: writtenManifest.paths?.correctedDocxPath,
    correctionNotesPath: writtenManifest.paths?.correctionNotesPath,
    enhancementApplied: writtenManifest.enhancement?.applied,
  });

  return writtenManifest;
}

function attachEnhancementArtifacts(
  packageDir,
  {
    aiEnhancementInput,
    aiEnhancementRawOutput,
    aiEnhancementParsedOutput,
    enhancedReportData,
    enhancementStatus = {},
    providerAttempts = [],
  } = {}
) {
  const enhancementDir = path.join(packageDir, "enhancement");
  ensureDir(enhancementDir);

  const inputPath = path.join(enhancementDir, "aiEnhancementInput.json");
  const rawPath = path.join(enhancementDir, "aiEnhancementRawOutput.txt");
  const parsedPath = path.join(enhancementDir, "aiEnhancementParsedOutput.json");
  const enhancedPath = path.join(enhancementDir, "enhancedReportData.json");

  writeJson(inputPath, aiEnhancementInput || {});
  writeText(rawPath, aiEnhancementRawOutput || "");
  writeJson(parsedPath, aiEnhancementParsedOutput || {});
  writeJson(enhancedPath, enhancedReportData || {});

  return updateTrainingExamplePackage(packageDir, {
    enhancement: {
      applied: Boolean(
        enhancedReportData &&
          Object.keys(enhancedReportData || {}).length > 0 &&
          enhancementStatus?.status !== "failed_non_blocking"
      ),
      updatedAt: new Date().toISOString(),
      status: enhancementStatus?.status || null,
      providerAttempts: safeClone(providerAttempts, []),
    },
    paths: {
      aiEnhancementInputPath: repoRelative(inputPath),
      aiEnhancementRawOutputPath: repoRelative(rawPath),
      aiEnhancementParsedOutputPath: repoRelative(parsedPath),
      enhancedReportDataPath: repoRelative(enhancedPath),
    },
  });
}

function attachGeneratedDocx(packageDir, buffer, fileName = "generatedReport.docx") {
  const extension = path.extname(fileName) || ".docx";
  const outputPath = path.join(packageDir, "output", `generatedReport${extension}`);
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, buffer);

  return updateTrainingExamplePackage(packageDir, {
    paths: {
      generatedDocxPath: repoRelative(outputPath),
    },
  });
}

function attachCorrectedDocx(
  packageDir,
  sourcePath,
  { fileName = "userCorrectedReport.docx", correctionNotes = "" } = {}
) {
  if (!fileExists(sourcePath)) {
    throw new Error(`Corrected DOCX source file not found: ${sourcePath}`);
  }

  const extension = path.extname(fileName) || ".docx";
  const correctedPath = path.join(packageDir, "corrections", `userCorrectedReport${extension}`);
  const notesPath = path.join(packageDir, "corrections", "correctionNotes.md");

  ensureDir(path.dirname(correctedPath));
  fs.copyFileSync(sourcePath, correctedPath);
  writeText(notesPath, correctionNotes || "");

  return updateTrainingExamplePackage(packageDir, {
    paths: {
      correctedDocxPath: repoRelative(correctedPath),
      correctionNotesPath: repoRelative(notesPath),
    },
  });
}

module.exports = {
  TRAINING_DATA_ROOT,
  attachCorrectedDocx,
  attachEnhancementArtifacts,
  attachGeneratedDocx,
  createTrainingExamplePackage,
  safeParseJson,
  updateTrainingExamplePackage,
};
