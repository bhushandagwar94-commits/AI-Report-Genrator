CREATE TABLE IF NOT EXISTS "report_templates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT,
    "rules" TEXT,
    "jsonSchema" TEXT,
    "reportFormat" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "report_templates_slug_key" ON "report_templates"("slug");

CREATE TABLE IF NOT EXISTS "generated_reports" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generated_reports_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "report_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "report_templates" ADD COLUMN "componentPath" TEXT;
ALTER TABLE "report_templates" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "report_templates" ADD COLUMN "showInPublic" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "report_templates" ADD COLUMN "publicBadge" TEXT;
ALTER TABLE "report_templates" ADD COLUMN "category" TEXT;
ALTER TABLE "report_templates" ADD COLUMN "allowedFileTypes" TEXT;
ALTER TABLE "report_templates" ADD COLUMN "outputFormats" TEXT;
ALTER TABLE "report_templates" ADD COLUMN "inputRules" TEXT;
ALTER TABLE "report_templates" ADD COLUMN "sampleData" TEXT;
ALTER TABLE "report_templates" ADD COLUMN "versionHistory" TEXT;
