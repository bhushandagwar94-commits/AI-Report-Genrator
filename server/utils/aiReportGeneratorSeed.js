const ALLOWED_FILE_TYPES = [
  "xlsx",
  "xls",
  "pdf",
  "docx",
  "pptx",
  "jpg",
  "jpeg",
  "png",
];
const COMPONENT_PATH =
  "frontend/src/components/templates/commercial-building-energy-audit/CommercialBuildingEnergyAuditTemplate.tsx";
const WORKSPACE_SLUG = "commercial-building-energy-audit";

const DEFAULT_EXTRACTION_PROMPT = `Extract usable energy audit data from uploaded Excel sheets and supporting documents.
Focus on ECM/project rows, project title, system, investment, annual cost saving, energy saving, payback, implementation duration, and CO2/carbon reduction fields.
CRITICAL RULES:
1. Do NOT modify, estimate, infer, extrapolate, calculate, round, or replace any numerical values provided in the input.
2. All numerical values must be reproduced exactly as supplied.
3. Return only structured facts found in the source files. Use "Data required" for missing values.`;

const DEFAULT_JSON_GENERATION_PROMPT = `Generate JSON for the CommercialBuildingEnergyAuditTemplate.tsx React report.
Use the Detailed Energy Audit Report structure and create one project chapter for each ECM/project.
Each project chapter must contain exactly these 16 sections: Existing Condition, System Description, Engineering Assessment, Root Cause Analysis, Recommended Measure, Technical Methodology, Detailed Key Activities, Rationale for Savings, Energy Impact, Financial Impact, Risks & Mitigation, Implementation Considerations, Monitoring & Verification Plan, O&M Requirements, Implementation Timeline, Conclusion.

CRITICAL RULES FOR GENERATION:
1. Consultant-Grade Writing: Generate narrative text using professional consulting language. Read like a professional energy audit report prepared by an experienced energy consultant rather than a machine-generated summary. Add richer chapter introductions and transitions.
2. High Detail: Increase explanation depth by 3-5x compared to standard summaries. Add category-level summaries before ECM details, and management-level interpretation of findings. Report length should increase substantially while remaining factually grounded in uploaded data.
3. Strict Numerical Fidelity: Do NOT modify, estimate, infer, extrapolate, calculate, round, or replace any numerical values provided in the input. All numerical values must be reproduced exactly as supplied. Never fabricate: energy savings, investment, payback, production, baseline consumption, operating hours, tariffs.
4. Missing Data: If a section cannot be populated because data is missing, clearly state the limitation (e.g., "Data required for this assessment") and do not invent information. Use information available in audit data, equipment data, utility data, and recommendation sheets.`;

const DEFAULT_VALIDATION_PROMPT = `Validate that generated report JSON has reportInfo, executiveSummary, buildingProfile, and projects.
Each project must include the 16 mandatory ECM sections to render the TSX template.
Missing optional values must remain renderable as "Data required".`;

function anythingLlmConfigured() {
  return Boolean(
    process.env.LLM_PROVIDER &&
    (process.env.OPEN_AI_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.AZURE_OPENAI_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.OLLAMA_BASE_PATH ||
      process.env.GENERIC_OPEN_AI_BASE_PATH)
  );
}

function commercialTemplateData() {
  const useAnythingLLM = anythingLlmConfigured();

  return {
    slug: WORKSPACE_SLUG,
    name: "Detailed Energy Audit Report",
    prompt: DEFAULT_JSON_GENERATION_PROMPT,
    model: "gemini-2.0-flash",
    rules: JSON.stringify({
      missingValueRule: "Use Data required for unavailable values.",
      templateRule:
        "Render with the Commercial Building Energy Audit TSX template. Do not use LaTeX.",
      projectChapterSections: [
        "Existing Condition",
        "System Description",
        "Engineering Assessment",
        "Root Cause Analysis",
        "Recommended Measure",
        "Technical Methodology",
        "Detailed Key Activities",
        "Rationale for Savings",
        "Energy Impact",
        "Financial Impact",
        "Risks & Mitigation",
        "Implementation Considerations",
        "Monitoring & Verification Plan",
        "O&M Requirements",
        "Implementation Timeline",
        "Conclusion",
      ],
    }),
    jsonSchema: JSON.stringify({
      type: "object",
      required: [
        "reportInfo",
        "executiveSummary",
        "buildingProfile",
        "projects",
      ],
      properties: {
        reportInfo: { type: "object" },
        executiveSummary: { type: "object" },
        buildingProfile: { type: "object" },
        projects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              projectTitle: { type: ["string", "number", "boolean", "null"] },
              projectNo: { type: ["string", "number", "boolean", "null"] },
              system: { type: ["string", "number", "boolean", "null"] },
              expectedEnergySaving: {
                type: ["string", "number", "boolean", "null"],
              },
              expectedAnnualCostSaving: {
                type: ["string", "number", "boolean", "null"],
              },
              estimatedInvestment: {
                type: ["string", "number", "boolean", "null"],
              },
              simplePaybackPeriod: {
                type: ["string", "number", "boolean", "null"],
              },
              implementationPriority: {
                type: ["string", "number", "boolean", "null"],
              },
              existingCondition: {
                type: ["string", "number", "boolean", "null"],
              },
              systemDescription: {
                type: ["string", "number", "boolean", "null"],
              },
              engineeringAssessment: {
                type: ["string", "number", "boolean", "null"],
              },
              rootCauseAnalysis: {
                type: ["string", "number", "boolean", "null"],
              },
              recommendedMeasure: {
                type: ["string", "number", "boolean", "null"],
              },
              technicalMethodology: {
                type: ["string", "number", "boolean", "null"],
              },
              detailedKeyActivities: {
                type: "array",
                items: { type: "object" },
              },
              rationaleForSavings: {
                type: ["string", "number", "boolean", "null"],
              },
              energyImpact: { type: "array", items: { type: "object" } },
              financialImpact: { type: "array", items: { type: "object" } },
              risksAndMitigation: { type: "array", items: { type: "object" } },
              implementationConsiderations: {
                type: ["string", "number", "boolean", "null"],
              },
              monitoringAndVerificationPlan: {
                type: "array",
                items: { type: "object" },
              },
              oAndMRequirements: {
                type: ["string", "number", "boolean", "null"],
              },
              implementationTimeline: {
                type: "array",
                items: { type: "object" },
              },
              conclusion: { type: ["string", "number", "boolean", "null"] },
              carbonFootprint: {
                type: "object",
                properties: {
                  annualEnergySaving: {
                    type: ["string", "number", "boolean", "null"],
                  },
                  emissionFactor: {
                    type: ["string", "number", "boolean", "null"],
                  },
                  estimatedCO2Reduction: {
                    type: ["string", "number", "boolean", "null"],
                  },
                  calculationBasis: {
                    type: ["string", "number", "boolean", "null"],
                  },
                  remarks: { type: ["string", "number", "boolean", "null"] },
                },
              },
              caseStudies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: ["string", "number", "boolean", "null"] },
                    clientType: {
                      type: ["string", "number", "boolean", "null"],
                    },
                    system: { type: ["string", "number", "boolean", "null"] },
                    implementedMeasure: {
                      type: ["string", "number", "boolean", "null"],
                    },
                    result: { type: ["string", "number", "boolean", "null"] },
                    relevance: {
                      type: ["string", "number", "boolean", "null"],
                    },
                  },
                },
              },
              finalConclusion: {
                type: ["string", "number", "boolean", "null"],
              },
            },
          },
        },
      },
    }),
    reportFormat: `React component path: ${COMPONENT_PATH}

Project chapters use dynamic chapter numbering. Project 1 renders 3.1 to 3.18, Project 2 renders 4.1 to 4.18, and so on.`,
    componentPath: COMPONENT_PATH,
    status: "active",
    showInPublic: true,
    publicBadge: "Available",
    category: "Energy Audit",
    allowedFileTypes: JSON.stringify(ALLOWED_FILE_TYPES),
    outputFormats: JSON.stringify(["preview", "pdf"]),
    inputRules: JSON.stringify({
      requiredMinimum:
        "Excel data is usable when it has a project/ECM/measure/recommendation column plus investment, saving, energy saving, or payback data.",
      allowedFileTypes: ALLOWED_FILE_TYPES,
    }),
    sampleData: JSON.stringify({
      reportInfo: {
        reportTitle: "Detailed Energy Audit Report",
        clientName: "Data required",
        location: "Data required",
        reportDate: "Data required",
        preparedBy: "SEE-Tech Solutions",
      },
      executiveSummary: {
        purposeText: "Data required",
        keyObjectives: "Data required",
        scopeOfAssessment: "Data required",
        expectedOutcomes: "Data required",
        strategicImportance: "Data required",
        keyFindings: ["Data required"],
        financialHighlightsNarrative: "Data required",
        energySavingPotentialNarrative: "Data required",
        recommendedImplementationApproach: ["Data required"],
        totalEnergySavingPotential: "Data required",
        totalAnnualCostSavingPotential: "Data required",
        totalEstimatedInvestment: "Data required",
        simplePaybackPeriod: "Data required",
        co2ReductionPotential: "Data required",
      },
      buildingProfile: {
        facilityName: "Data required",
        typeOfBuilding: "Commercial Building",
        address: "Data required",
      },
      projects: [
        {
          projectTitle: "Data required",
          system: "Data required",
          expectedEnergySaving: "Data required",
          expectedAnnualCostSaving: "Data required",
          estimatedInvestment: "Data required",
          simplePaybackPeriod: "Data required",
          implementationPriority: "Data required",
          existingCondition: "Data required",
          systemDescription: "Data required",
          engineeringAssessment: "Data required",
          rootCauseAnalysis: "Data required",
          recommendedMeasure: "Data required",
          technicalMethodology: "Data required",
          detailedKeyActivities: [],
          rationaleForSavings: "Data required",
          energyImpact: [],
          financialImpact: [],
          risksAndMitigation: [],
          implementationConsiderations: "Data required",
          monitoringAndVerificationPlan: [],
          oAndMRequirements: "Data required",
          implementationTimeline: [],
          conclusion: "Data required",
          carbonFootprint: {
            annualEnergySaving: "Data required",
            emissionFactor: "Data required",
            estimatedCO2Reduction: "Data required",
            calculationBasis: "Annual Energy Saving x Grid Emission Factor",
            remarks: "Data required",
          },
          caseStudies: [
            {
              title: "Data required",
              clientType: "Data required",
              system: "Data required",
              implementedMeasure: "Data required",
              result: "Data required",
              relevance: "Data required",
            },
          ],
          finalConclusion: "Data required",
        },
      ],
    }),
    versionHistory: JSON.stringify([
      {
        version: "1.0.0",
        notes:
          "Reproducible seed for the public Detailed Energy Audit Report template.",
      },
    ]),
    anythingllmWorkspaceSlug: WORKSPACE_SLUG,
    extractionPrompt: DEFAULT_EXTRACTION_PROMPT,
    jsonGenerationPrompt: DEFAULT_JSON_GENERATION_PROMPT,
    validationPrompt: DEFAULT_VALIDATION_PROMPT,
    modelTemperature: 0.2,
    maxTokens: 12000,
    useAnythingLLM,
  };
}

const COMING_SOON_TEMPLATES = [
  {
    slug: "boiler-audit",
    name: "Boiler Audit Report",
    category: "Energy Audit",
  },
  {
    slug: "motor-retrofit",
    name: "Motor Retrofit Report",
    category: "Energy Audit",
  },
  { slug: "apfc-report", name: "APFC Report", category: "Power Quality" },
  { slug: "solar-report", name: "Solar Report", category: "Renewable Energy" },
  { slug: "hvac-report", name: "HVAC Report", category: "Energy Audit" },
];

async function upsertSystemSetting(prisma, label, value) {
  const existing = await prisma.system_settings.findUnique({
    where: { label },
  });
  if (existing) {
    return prisma.system_settings.update({
      where: { label },
      data: { value: String(value) },
    });
  }

  return prisma.system_settings.create({
    data: { label, value: String(value) },
  });
}

async function upsertTemplateBySlug(prisma, templateData) {
  const existing = await prisma.report_templates.findFirst({
    where: { slug: templateData.slug },
  });

  if (existing) {
    return prisma.report_templates.update({
      where: { id: existing.id },
      data: {
        ...templateData,
        updatedAt: new Date(),
      },
    });
  }

  return prisma.report_templates.create({ data: templateData });
}

async function ensureActiveTemplateVersion(prisma, template) {
  const activeVersion = await prisma.report_template_versions.findFirst({
    where: {
      templateId: template.id,
      versionNumber: 1,
    },
  });

  const data = {
    templateId: template.id,
    versionNumber: 1,
    status: "active",
    templateName: template.name,
    componentPath: template.componentPath,
    dataSchemaSnapshot: template.jsonSchema,
    promptsSnapshot: JSON.stringify({
      extractionPrompt: template.extractionPrompt,
      jsonGenerationPrompt: template.jsonGenerationPrompt,
      validationPrompt: template.validationPrompt,
    }),
    extractionMappingSnapshot: JSON.stringify({
      projectTitle: [
        "project",
        "project name",
        "ecm",
        "measure",
        "recommendation",
      ],
      system: ["system", "area", "utility", "category"],
      investment: ["investment", "capex", "cost", "project cost", "inr"],
      annualSaving: ["annual saving", "cost saving", "yearly saving"],
      energySaving: ["energy saving", "kwh saving", "kwh/year"],
      payback: ["payback", "simple payback", "roi"],
      co2Reduction: ["co2", "carbon", "emission", "tco2", "tco2/year"],
    }),
    anythingllmSettingsSnapshot: JSON.stringify({
      workspaceSlug: WORKSPACE_SLUG,
      model: template.model,
      modelTemperature: template.modelTemperature,
      maxTokens: template.maxTokens,
      useAnythingLLM: template.useAnythingLLM,
    }),
    sampleDataSnapshot: template.sampleData,
    changeNote:
      "Initial active Commercial Building Energy Audit template version",
    publishedAt: new Date(),
  };

  if (activeVersion) {
    return prisma.report_template_versions.update({
      where: { id: activeVersion.id },
      data,
    });
  }

  return prisma.report_template_versions.create({ data });
}

async function ensureAiReportGeneratorSeeded(prisma) {
  await upsertSystemSetting(prisma, "multi_user_mode", "false");
  await upsertSystemSetting(prisma, "onboarding_complete", "true");
  await upsertSystemSetting(prisma, "logo_filename", "anything-llm.png");

  const workspace = await prisma.workspaces.findUnique({
    where: { slug: WORKSPACE_SLUG },
  });

  if (workspace) {
    await prisma.workspaces.update({
      where: { slug: WORKSPACE_SLUG },
      data: {
        name: "Commercial Building Energy Audit",
        openAiPrompt: DEFAULT_JSON_GENERATION_PROMPT,
        chatMode: "chat",
      },
    });
  } else {
    await prisma.workspaces.create({
      data: {
        name: "Commercial Building Energy Audit",
        slug: WORKSPACE_SLUG,
        openAiPrompt: DEFAULT_JSON_GENERATION_PROMPT,
        chatMode: "chat",
      },
    });
  }

  const template = await upsertTemplateBySlug(prisma, commercialTemplateData());
  const version = await ensureActiveTemplateVersion(prisma, template);

  for (const comingSoonTemplate of COMING_SOON_TEMPLATES) {
    await upsertTemplateBySlug(prisma, {
      ...comingSoonTemplate,
      prompt:
        "Coming soon. This template is seeded so the public catalog is reproducible.",
      status: "coming_soon",
      showInPublic: true,
      publicBadge: "Coming Soon",
      allowedFileTypes: JSON.stringify(ALLOWED_FILE_TYPES),
      outputFormats: JSON.stringify(["preview", "pdf"]),
      inputRules: JSON.stringify({ availability: "coming_soon" }),
      componentPath: null,
    });
  }

  return { template, version };
}

module.exports = {
  ALLOWED_FILE_TYPES,
  commercialTemplateData,
  WORKSPACE_SLUG,
  ensureAiReportGeneratorSeeded,
};
