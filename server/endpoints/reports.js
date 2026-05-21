const { reqBody, userFromSession } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { flexUserRoleValid, ROLES } = require("../utils/middleware/multiUserProtected");
const { handleFileUpload } = require("../utils/files/multer");
const { CollectorApi } = require("../utils/collectorApi");
const prisma = require("../utils/prisma");
const { getLLMProvider } = require("../utils/helpers");
const { getModelTag } = require("./utils");
const fs = require("fs");
const path = require("path");
const { directUploadsPath, hotdirPath } = require("../utils/files");
const extractJson = require("extract-json-from-string");
const ExcelJS = require("exceljs");

// ─── Slug → Template name mapping ──────────────────────────────────────────────
// Allows public clients to reference templates by slug (e.g. seetech-ea-001)
// instead of internal numeric DB ids.
const TEMPLATE_SLUG_MAP = {
  "commercial-building-energy-audit": "Commercial Building Energy Audit Report",
  "seetech-ea-001": "Detailed Energy Audit Report",
  "seetech-ba-001": "Boiler Audit Report",
  "seetech-mr-001": "Motor Retrofit Report",
  "seetech-apfc-001": "APFC Report",
  "seetech-solar-001": "Solar Report",
  "seetech-hvac-001": "HVAC Report",
};

/**
 * Resolve a template by either:
 *  - Numeric DB id (string "3" or number 3)
 *  - String slug (e.g. "seetech-ea-001")
 *  - Exact name (e.g. "Detailed Energy Audit Report")
 */
async function resolveTemplate(templateId) {
  if (!templateId) return null;

  // 1. Try as numeric DB id
  const asNum = parseInt(templateId, 10);
  if (!isNaN(asNum)) {
    return await prisma.report_templates.findFirst({ where: { id: asNum } });
  }

  // 2. Try as slug column
  const bySlug = await prisma.report_templates.findFirst({
    where: { slug: String(templateId) },
  });
  if (bySlug) return bySlug;

  // 3. Try slug→name map
  const mappedName = TEMPLATE_SLUG_MAP[String(templateId)];
  if (mappedName) {
    return await prisma.report_templates.findFirst({
      where: { name: mappedName },
    });
  }

  // 4. Try exact name match
  return await prisma.report_templates.findFirst({
    where: { name: String(templateId) },
  });
}

/**
 * Normalise the inbound generate request body.
 *
 * Supports two payload shapes:
 *
 * NEW — structured public payload:
 * {
 *   template_id: "seetech-ea-001",
 *   public_form: { client_name, facility_name, location, audit_period,
 *                  report_date, contact_person, output_format },
 *   uploaded_files: [...],
 *   generation_mode: "public",
 *   status: "submitted"
 * }
 *
 * LEGACY — original camelCase payload:
 * {
 *   templateId: 3,
 *   inputDetails: { ... },
 *   uploadedFiles: [...]
 * }
 */
function normaliseGenerateBody(body) {
  // Detect new structured payload by presence of template_id / public_form
  if (body.template_id !== undefined || body.public_form !== undefined) {
    const pf = body.public_form || {};
    // Merge public_form into inputDetails (camelCase for internal pipeline)
    const inputDetails = {
      clientName:    pf.client_name    || pf.clientName    || "",
      facilityName:  pf.facility_name  || pf.facilityName  || "",
      location:      pf.location       || "",
      auditPeriod:   pf.audit_period   || pf.auditPeriod   || "",
      reportDate:    pf.report_date    || pf.reportDate     || "",
      contactPerson: pf.contact_person || pf.contactPerson  || "",
      outputFormat:  pf.output_format  || pf.outputFormat   || "pdf",
    };
    return {
      templateId:     body.template_id,
      inputDetails,
      uploadedFiles:  body.uploaded_files  || [],
      generationMode: body.generation_mode || "public",
      publicForm:     pf,
      status:         body.status          || "submitted",
    };
  }

  // Legacy payload — pass through unchanged
  return {
    templateId:     body.templateId,
    inputDetails:   body.inputDetails   || {},
    uploadedFiles:  body.uploadedFiles  || [],
    generationMode: body.generationMode || "public",
    publicForm:     null,
    status:         "submitted",
  };
}

function reportEndpoints(app) {
  if (!app) return;

  // ── ADMIN: Get all templates (full details) ──────────────────────────────────
  app.get(
    "/reports/templates",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const templates = await prisma.report_templates.findMany({
          orderBy: { createdAt: "desc" },
        });
        response.status(200).json({ templates });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── ADMIN: Create template ───────────────────────────────────────────────────
  app.post(
    "/reports/templates",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const {
          name,
          slug,
          prompt,
          model,
          rules,
          jsonSchema,
          reportFormat,
          componentPath,
          status,
          showInPublic,
          publicBadge,
          category,
          allowedFileTypes,
          outputFormats,
          inputRules,
          sampleData,
          versionHistory,
        } = reqBody(request);
        if (!name || !prompt) {
          return response.status(400).json({ error: "Name and Prompt are required fields." });
        }

        const template = await prisma.report_templates.create({
          data: {
            name,
            slug:         slug         || null,
            prompt,
            model:        model        || null,
            rules:        rules        || null,
            jsonSchema:   jsonSchema   || null,
            reportFormat: reportFormat || null,
            componentPath: componentPath || null,
            status: status || "active",
            showInPublic: showInPublic !== undefined ? !!showInPublic : true,
            publicBadge: publicBadge || null,
            category: category || null,
            allowedFileTypes: allowedFileTypes || null,
            outputFormats: outputFormats || null,
            inputRules: inputRules || null,
            sampleData: sampleData || null,
            versionHistory: versionHistory || null,
          },
        });
        response.status(201).json({ template });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── ADMIN: Update template ───────────────────────────────────────────────────
  app.put(
    "/reports/templates/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id);
        const {
          name,
          slug,
          prompt,
          model,
          rules,
          jsonSchema,
          reportFormat,
          componentPath,
          status,
          showInPublic,
          publicBadge,
          category,
          allowedFileTypes,
          outputFormats,
          inputRules,
          sampleData,
          versionHistory,
        } = reqBody(request);

        const exists = await prisma.report_templates.findFirst({ where: { id } });
        if (!exists) return response.sendStatus(404).end();

        const template = await prisma.report_templates.update({
          where: { id },
          data: {
            name:         name         !== undefined ? name         : exists.name,
            slug:         slug         !== undefined ? slug         : exists.slug,
            prompt:       prompt       !== undefined ? prompt       : exists.prompt,
            model:        model        !== undefined ? model        : exists.model,
            rules:        rules        !== undefined ? rules        : exists.rules,
            jsonSchema:   jsonSchema   !== undefined ? jsonSchema   : exists.jsonSchema,
            reportFormat: reportFormat !== undefined ? reportFormat : exists.reportFormat,
            componentPath: componentPath !== undefined ? componentPath : exists.componentPath,
            status: status !== undefined ? status : exists.status,
            showInPublic: showInPublic !== undefined ? !!showInPublic : exists.showInPublic,
            publicBadge: publicBadge !== undefined ? publicBadge : exists.publicBadge,
            category: category !== undefined ? category : exists.category,
            allowedFileTypes: allowedFileTypes !== undefined ? allowedFileTypes : exists.allowedFileTypes,
            outputFormats: outputFormats !== undefined ? outputFormats : exists.outputFormats,
            inputRules: inputRules !== undefined ? inputRules : exists.inputRules,
            sampleData: sampleData !== undefined ? sampleData : exists.sampleData,
            versionHistory: versionHistory !== undefined ? versionHistory : exists.versionHistory,
          },
        });
        response.status(200).json({ template });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── ADMIN: Delete template ───────────────────────────────────────────────────
  app.delete(
    "/reports/templates/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id);
        const exists = await prisma.report_templates.findFirst({ where: { id } });
        if (!exists) return response.sendStatus(404).end();

        await prisma.report_templates.delete({ where: { id } });
        response.status(200).json({ success: true });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── PUBLIC: Get public-facing templates (redacted — no prompt/rules/model) ──
  app.get(
    "/reports/public-templates",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const templates = await prisma.report_templates.findMany({
          where: {
            status: "active",
            showInPublic: true,
          },
          orderBy: { createdAt: "desc" },
        });

        const publicTemplates = templates.map((t) => ({
          id:           t.id,
          slug:         t.slug,
          name:         t.name,
          status:       t.status,
          publicBadge:  t.publicBadge,
          category:     t.category,
          allowedFileTypes: t.allowedFileTypes,
          outputFormats: t.outputFormats,
        }));

        response.status(200).json({ templates: publicTemplates });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── PUBLIC: Upload document files for parsing ────────────────────────────────
  app.post(
    "/reports/upload",
    [validatedRequest, flexUserRoleValid([ROLES.all]), handleFileUpload],
    async function (request, response) {
      try {
        const Collector = new CollectorApi();
        const { originalname } = request.file;
        const processingOnline = await Collector.online();

        if (!processingOnline) {
          return response.status(500).json({
            success: false,
            error: "Document processing server is offline. Uploaded file cannot be parsed.",
          });
        }

        const { success, reason, documents } = await Collector.parseDocument(originalname);
        if (!success || !documents?.[0]) {
          return response.status(500).json({
            success: false,
            error: reason || "Document parsing failed on the collector server.",
          });
        }

        const doc = documents[0];
        return response.status(200).json({
          success: true,
          location: doc.location,
          filename: originalname,
          token_count_estimate: doc.token_count_estimate || 0,
        });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── PUBLIC / ADMIN: Generate Report Pipeline ─────────────────────────────────
  //
  // Accepts BOTH payload formats:
  //   NEW  → { template_id, public_form, uploaded_files, generation_mode, status }
  //   OLD  → { templateId, inputDetails, uploadedFiles }
  //
  app.post(
    "/reports/generate",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      const body = reqBody(request);
      const { templateId, inputDetails, uploadedFiles, generationMode, publicForm, status } =
        normaliseGenerateBody(body);

      if (!templateId) {
        return response
          .status(400)
          .json({ error: "template_id (or templateId) is a required field." });
      }

      let reportRecord = null;
      try {
        // ── Resolve template (slug, numeric id, or name) ───────────────────────
        const template = await resolveTemplate(templateId);
        if (!template) {
          return response.status(404).json({
            error: `Template not found for identifier: ${templateId}`,
          });
        }

        const user = await userFromSession(request, response);

        // ── Initialise DB record ───────────────────────────────────────────────
        reportRecord = await prisma.generated_reports.create({
          data: {
            templateId:     template.id,
            generationMode: generationMode || "public",
            publicForm:     publicForm ? JSON.stringify(publicForm) : null,
            inputDetails:   JSON.stringify(inputDetails),
            uploadedFiles:  JSON.stringify(uploadedFiles),
            status:         "parsing",
            userId:         user?.id || null,
          },
        });

        // ── 1. Data Parsing & Consolidation ───────────────────────────────────
        let consolidatedText = "";
        let extractedExcelData = { projects: [] };
        let imageMetadata = [];
        let fileTypesDetected = [];

        for (const file of uploadedFiles) {
          const ext = path.extname(file.filename).toLowerCase();
          if (!fileTypesDetected.includes(ext)) fileTypesDetected.push(ext);

          // PDF/DOCX/PPT text extraction (already handled by CollectorApi -> .json in directUploadsPath)
          const sourceFile = path.join(directUploadsPath, path.basename(file.location));
          if (fs.existsSync(sourceFile)) {
            try {
              const fileContent = fs.readFileSync(sourceFile, "utf-8");
              const parsedJSON = JSON.parse(fileContent);
              if (parsedJSON.pageContent) {
                consolidatedText += `\n--- Document Text (${file.filename}) ---\n${parsedJSON.pageContent}\n`;
              }
            } catch (err) {
              console.error(`Failed to read parsed file from direct uploads: ${file.filename}`, err);
            }
          }

          // Image Metadata Collection
          if (['.png', '.jpg', '.jpeg'].includes(ext)) {
            imageMetadata.push({
              filename: file.filename,
              originalPath: file.location,
              suggestedCaption: "Data required",
            });
          }

          // Stage 1: Excel Extraction
          if (template.slug === "commercial-building-energy-audit" && (ext === ".xlsx" || ext === ".xls")) {
            const originalFilePath = path.join(hotdirPath, file.filename);
            if (fs.existsSync(originalFilePath)) {
              try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(originalFilePath);

                workbook.eachSheet((worksheet) => {
                  let headerMap = {};
                  worksheet.eachRow((row) => {
                    const values = row.values || [];
                    const rowStr = values.map(v => String(v || '').toLowerCase()).join(' ');

                    if (rowStr.includes('annual electricity consumption')) {
                      const val = values.find(v => typeof v === 'number');
                      if (val) extractedExcelData.annualElectricityConsumption = val;
                    }
                    if (rowStr.includes('annual electricity cost')) {
                      const val = values.find(v => typeof v === 'number');
                      if (val) extractedExcelData.annualElectricityCost = val;
                    }
                    if (rowStr.includes('average tariff')) {
                      const val = values.find(v => typeof v === 'number');
                      if (val) extractedExcelData.averageTariff = val;
                    }

                    if (rowStr.includes('project') || rowStr.includes('ecm') || rowStr.includes('investment')) {
                      values.forEach((v, idx) => {
                        const s = String(v || '').toLowerCase();
                        if (s.includes('project') || s.includes('ecm') || s.includes('title')) headerMap[idx] = 'projectTitle';
                        else if (s.includes('system')) headerMap[idx] = 'system';
                        else if (s.includes('investment') || s.includes('cost')) headerMap[idx] = 'investment';
                        else if (s.includes('saving')) headerMap[idx] = 'saving';
                        else if (s.includes('payback')) headerMap[idx] = 'payback';
                        else if (s.includes('priority')) headerMap[idx] = 'priority';
                      });
                    } else if (Object.keys(headerMap).length >= 2) {
                      const project = {};
                      let hasData = false;
                      Object.keys(headerMap).forEach(idx => {
                        const val = values[idx];
                        if (val) {
                          project[headerMap[idx]] = String(val);
                          hasData = true;
                        }
                      });
                      if (hasData && project.projectTitle && !project.projectTitle.toLowerCase().includes('project')) {
                        project.projectNo = `Project ${extractedExcelData.projects.length + 1}`;
                        extractedExcelData.projects.push(project);
                      }
                    }
                  });
                });
              } catch (err) {
                console.error(`Failed to read Excel file: ${file.filename}`, err);
              }
            }
          }
        }


        await prisma.generated_reports.update({
          where: { id: reportRecord.id },
          data: { status: "generating" },
        });

        // ── 2. Data Extraction via LLM ─────────────────────────────────────────
        const providerName = process.env.LLM_PROVIDER || "openai";
        const modelName = template.model || getModelTag();
        const llmProvider = getLLMProvider({ provider: providerName, model: modelName });

        const schemaText = template.jsonSchema || "{}";
        let parsedSchema = {};
        try {
          parsedSchema = JSON.parse(schemaText);
        } catch (_) {}

        const extractionSystemPrompt = `You are a data extraction engine for SEE-Tech Solutions.
Analyse the provided documents and extract technical and financial data points corresponding to this JSON Schema:
${schemaText}

Rules:
1. Extract ONLY values explicitly mentioned in the text.
2. If a value is missing or cannot be found, set its JSON property value to null. Do not guess or invent values.
3. Keep all extracted values professional, accurate, and client-ready.
4. For all currency/financial values, output them using the rupee symbol (₹). Use proper engineering units.
5. Output ONLY the raw JSON object matching the schema. Do not enclose in markdown blocks or add any conversation.`;

        const extractionUserPrompt = `Consolidated Document Text:\n${
          consolidatedText || "[No document files uploaded — use form details only.]"
        }`;

        let extractedData = {};
        try {
          const extractionResult = await llmProvider.getChatCompletion(
            [
              { role: "system", content: extractionSystemPrompt },
              { role: "user", content: extractionUserPrompt },
            ],
            { temperature: 0.1 }
          );
          const text = extractionResult?.textResponse || "{}";
          const jsonMatches = extractJson(text);
          extractedData = jsonMatches?.[0] || {};
        } catch (err) {
          console.error("Extraction stage failed, falling back to empty extraction", err);
        }

        // ── 3. Missing Data Identification ────────────────────────────────────
        const missingFields = [];
        if (parsedSchema?.properties) {
          const requiredFields = parsedSchema.required || [];
          for (const key of Object.keys(parsedSchema.properties)) {
            const isMissing =
              extractedData[key] === undefined ||
              extractedData[key] === null ||
              String(extractedData[key]).trim() === "" ||
              String(extractedData[key]).toLowerCase() === "null";

            if (isMissing) {
              if (requiredFields.includes(key)) {
                missingFields.push(key);
                extractedData[key] = "Data required";
              } else {
                extractedData[key] = "N/A";
              }
            }
          }
        }

        // Overlay public_form values into extractedData so they appear in the report
        if (inputDetails) {
          if (inputDetails.clientName)   extractedData.clientName   = inputDetails.clientName;
          if (inputDetails.facilityName) extractedData.plantName    = inputDetails.facilityName;
          if (inputDetails.location)     extractedData.facilityAddress = inputDetails.location;
          if (inputDetails.auditPeriod)  extractedData.auditPeriod  = inputDetails.auditPeriod;
          if (inputDetails.reportDate)   extractedData.reportDate   = inputDetails.reportDate;
          if (inputDetails.contactPerson) extractedData.contactPerson = inputDetails.contactPerson;
        }

        await prisma.generated_reports.update({
          where: { id: reportRecord.id },
          data: {
            extractedData: JSON.stringify(extractedData),
            missingData:   JSON.stringify(missingFields),
          },
        });

        // ── 4. Report Drafting ─────────────────────────────────────────────────
        let draftSystemPrompt;
        if (template.slug === "commercial-building-energy-audit") {
          draftSystemPrompt = `You are the SEE-Tech Solutions AI Technical Report Generation Engine.
Generate the report purely as a valid JSON object. Do not return Markdown. Do not return explanatory text. Do not wrap JSON in \`\`\`json code fences.

### System Prompt & Prompt Instructions:
${template.prompt}

### Report Formatting & Specific Guidelines:
1. Adhere strictly to the requested JSON structure.
2. Ensure all financial values use the Indian Rupee symbol (₹).
3. Use proper technical/engineering units.
4. If a required value was missing, output "Data required". Do not invent values.
5. Observe the following custom rules:
${template.rules || "None specified."}`;
        } else {
          draftSystemPrompt = `You are the SEE-Tech Solutions AI Technical Report Generation Engine.
Generate a professional technical report in standard Markdown format.

### System Prompt & Prompt Instructions:
${template.prompt}

### Report Formatting & Specific Guidelines:
1. Adhere strictly to the requested markdown layout.
2. Ensure all financial values use the Indian Rupee symbol (₹).
3. Use proper technical/engineering units.
4. Keep the tone strictly formal, technical, and client-ready.
5. Never output conversational elements, greetings, helper text, or AI dialogue. Start immediately with the report markdown.
6. If a required value was missing, output "Data required" inside the report where that field is placed. Do not invent values.
7. Observe the following custom rules:
${template.rules || "None specified."}`;
        }


        const draftUserPrompt = `### Basic Details (User Supplied — Public Form):
Client / Facility Name : ${inputDetails.clientName   || "Data required"}
Facility / Plant Name  : ${inputDetails.facilityName || "Data required"}
Location               : ${inputDetails.location     || "Data required"}
Audit Period           : ${inputDetails.auditPeriod  || "Data required"}
Report Date            : ${inputDetails.reportDate   || "Data required"}
Contact Person         : ${inputDetails.contactPerson || "N/A"}
Output Format          : ${inputDetails.outputFormat  || "PDF"}

### Extracted Technical and Financial Data:
${JSON.stringify(extractedData, null, 2)}

${template.slug === "commercial-building-energy-audit" ? `### Extracted Excel Data (Structured):
${JSON.stringify(extractedExcelData, null, 2)}

### Uploaded Image Metadata:
${JSON.stringify(imageMetadata, null, 2)}` : ""}

### Missing Required Fields:
${missingFields.length > 0 ? missingFields.join(", ") : "None."}

### Target Report Layout Structure:
${template.reportFormat || "No structure defined. Output a standard structured engineering report."}

Please generate the final technical report now:`;

        const draftingResult = await llmProvider.getChatCompletion(
          [
            { role: "system", content: draftSystemPrompt },
            { role: "user", content: draftUserPrompt },
          ],
          { temperature: 0.3 }
        );
        let finalReportContent =
          draftingResult?.textResponse || "Failed to generate report content.";

        // Backend Validation and Mapping for Commercial Building Template
        if (template.slug === "commercial-building-energy-audit") {
          try {
            // Clean markdown fences if LLM ignored instructions
            finalReportContent = finalReportContent.replace(/^```json/m, '').replace(/```$/m, '').trim();
            
            const parsed = JSON.parse(finalReportContent);
            
            // Ensure core objects/arrays exist
            const reqKeysArrays = [
              "buildingOperationDetails", "utilityAndEnergySources", 
              "electricityBillingSummary", "majorEnergyConsumingSystems",
              "hvacSystemDetails", "lightingSystemDetails", "pumpsAndMotors",
              "buildingAutomationControls", "auditObservations", "projects"
            ];
            const reqKeysObj = [
              "reportInfo", "executiveSummary", "buildingProfile", 
              "electricalSupplyDetails", "specificEnergyBenchmark"
            ];
            for (let k of reqKeysArrays) { if (!Array.isArray(parsed[k])) parsed[k] = []; }
            for (let k of reqKeysObj) { if (typeof parsed[k] !== 'object' || parsed[k] === null) parsed[k] = {}; }

            // Validate: projects must be an array
            if (!Array.isArray(parsed.projects)) {
              throw new Error("projects must be an array");
            }
            if (!parsed.reportInfo) {
              throw new Error("reportInfo must exist");
            }

            // Map public basicDetails fields
            parsed.reportInfo.clientName = inputDetails.clientName || "Data required";
            parsed.reportInfo.buildingType = "Commercial Building";
            parsed.reportInfo.location = inputDetails.location || "Data required";
            parsed.reportInfo.auditPeriod = inputDetails.auditPeriod || "Data required";
            parsed.reportInfo.reportDate = inputDetails.reportDate || "Data required";
            
            parsed.buildingProfile.facilityName = inputDetails.facilityName || "Data required";
            parsed.buildingProfile.typeOfBuilding = "Commercial Building";
            parsed.buildingProfile.facilityContactPerson = inputDetails.contactPerson || "Data required";

            // Force-inject Excel projects if LLM missed them
            if (extractedExcelData.projects && extractedExcelData.projects.length > 0) {
              const existingProjectNos = parsed.projects.map(p => p.projectNo);
              for (const p of extractedExcelData.projects) {
                if (!existingProjectNos.includes(p.projectNo)) {
                  parsed.projects.push(p);
                }
              }
            }

            // Add one temporary demo project if no project data is extracted
            if (parsed.projects.length === 0) {
              parsed.projects.push({
                projectNo: "Project 1",
                projectTitle: "Data required",
                system: "Data required",
                implementationPriority: "Data required"
              });
            }

            // Return JSON.stringify
            finalReportContent = JSON.stringify(parsed);
          } catch (e) {
            throw new Error(`outputContent must be parseable JSON: ${e.message}`);
          }
        }

        // Internal server logging for admin/debug only
        console.log(`[GENERATION SUMMARY]
Template: ${template.slug}
Uploaded Files: ${uploadedFiles.length}
File Types: ${fileTypesDetected.join(", ")}
Excel Projects Extracted: ${extractedExcelData.projects ? extractedExcelData.projects.length : 0}
Image Metadata Collected: ${imageMetadata ? imageMetadata.length : 0}
Missing Fields: ${missingFields.length}`);

        // ── 5. Complete DB record ─────────────────────────────────────────────
        const completedRecord = await prisma.generated_reports.update({
          where: { id: reportRecord.id },
          data: {
            outputContent: finalReportContent,
            status:        "completed",
          },
        });

        // Return structured response matching the new public payload contract
        response.status(200).json({
          report: completedRecord,
          template_id:     String(templateId),
          generation_mode: generationMode || "public",
          status:          "completed",
        });
      } catch (e) {
        console.error(e.message, e);
        if (reportRecord) {
          await prisma.generated_reports.update({
            where: { id: reportRecord.id },
            data: { status: "failed", error: e.message },
          });
        }
        response.status(500).json({ error: e.message });
      }
    }
  );

  // ── PUBLIC / ADMIN: List historical reports ──────────────────────────────────
  app.get(
    "/reports/list",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const query =
          user && user.role === "default" ? { userId: user.id } : {};

        const reports = await prisma.generated_reports.findMany({
          where: query,
          include: { template: { select: { name: true, slug: true } } },
          orderBy: { createdAt: "desc" },
        });

        response.status(200).json({ reports });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── PUBLIC / ADMIN: Get report details ───────────────────────────────────────
  app.get(
    "/reports/:id",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id);
        const user = await userFromSession(request, response);

        const report = await prisma.generated_reports.findFirst({
          where: { id },
          include: { template: { select: { name: true, slug: true } } },
        });

        if (!report) return response.sendStatus(404).end();

        if (user && user.role === "default" && report.userId !== user.id) {
          return response.sendStatus(403).end();
        }

        response.status(200).json({ report });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  // ── PUBLIC / ADMIN: Delete report ────────────────────────────────────────────
  app.delete(
    "/reports/:id",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const id = parseInt(request.params.id);
        const user = await userFromSession(request, response);

        const report = await prisma.generated_reports.findFirst({ where: { id } });
        if (!report) return response.sendStatus(404).end();

        if (user && user.role === "default" && report.userId !== user.id) {
          return response.sendStatus(403).end();
        }

        await prisma.generated_reports.delete({ where: { id } });
        response.status(200).json({ success: true });
      } catch (e) {
        console.error(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { reportEndpoints };
