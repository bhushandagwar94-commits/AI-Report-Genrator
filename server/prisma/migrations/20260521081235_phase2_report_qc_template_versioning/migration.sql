-- CreateTable
CREATE TABLE "report_template_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "templateId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "templateName" TEXT,
    "componentPath" TEXT,
    "dataSchemaSnapshot" TEXT,
    "promptsSnapshot" TEXT,
    "extractionMappingSnapshot" TEXT,
    "imageMappingRulesSnapshot" TEXT,
    "anythingllmSettingsSnapshot" TEXT,
    "sampleDataSnapshot" TEXT,
    "changeNote" TEXT,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    CONSTRAINT "report_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "report_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_report_templates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT,
    "rules" TEXT,
    "jsonSchema" TEXT,
    "reportFormat" TEXT,
    "componentPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "showInPublic" BOOLEAN NOT NULL DEFAULT true,
    "publicBadge" TEXT,
    "category" TEXT,
    "allowedFileTypes" TEXT,
    "outputFormats" TEXT,
    "inputRules" TEXT,
    "sampleData" TEXT,
    "versionHistory" TEXT,
    "anythingllmWorkspaceSlug" TEXT,
    "extractionPrompt" TEXT,
    "jsonGenerationPrompt" TEXT,
    "validationPrompt" TEXT,
    "modelTemperature" REAL,
    "maxTokens" INTEGER,
    "useAnythingLLM" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_report_templates" ("allowedFileTypes", "category", "componentPath", "createdAt", "id", "inputRules", "jsonSchema", "model", "name", "outputFormats", "prompt", "publicBadge", "reportFormat", "rules", "sampleData", "showInPublic", "slug", "status", "updatedAt", "versionHistory") SELECT "allowedFileTypes", "category", "componentPath", "createdAt", "id", "inputRules", "jsonSchema", "model", "name", "outputFormats", "prompt", "publicBadge", "reportFormat", "rules", "sampleData", "showInPublic", "slug", "status", "updatedAt", "versionHistory" FROM "report_templates";
DROP TABLE "report_templates";
ALTER TABLE "new_report_templates" RENAME TO "report_templates";
CREATE UNIQUE INDEX "report_templates_slug_key" ON "report_templates"("slug");
CREATE TABLE "new_generated_reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "templateId" INTEGER NOT NULL,
    "generationMode" TEXT DEFAULT 'public',
    "publicForm" TEXT,
    "inputDetails" TEXT,
    "uploadedFiles" TEXT,
    "extractedData" TEXT,
    "missingData" TEXT,
    "outputContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "userId" INTEGER,
    "templateVersionId" INTEGER,
    "qcStatus" TEXT DEFAULT 'not_checked',
    "qcChecks" TEXT,
    "adminNotes" TEXT,
    "mappedImages" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generated_reports_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "report_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "generated_reports_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "report_template_versions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_generated_reports" ("createdAt", "error", "extractedData", "generationMode", "id", "inputDetails", "missingData", "outputContent", "publicForm", "status", "templateId", "updatedAt", "uploadedFiles", "userId") SELECT "createdAt", "error", "extractedData", "generationMode", "id", "inputDetails", "missingData", "outputContent", "publicForm", "status", "templateId", "updatedAt", "uploadedFiles", "userId" FROM "generated_reports";
DROP TABLE "generated_reports";
ALTER TABLE "new_generated_reports" RENAME TO "generated_reports";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
