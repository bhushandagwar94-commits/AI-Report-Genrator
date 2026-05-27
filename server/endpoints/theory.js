/**
 * Theory Generation API Endpoint
 * POST /api/theory-generate
 * Generates industrial theories from measured data
 */

const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { flexUserRoleValid, ROLES } = require("../utils/middleware/multiUserProtected");

// Import theory generation modules
const TheoryGenerationEngine = require("../services/theoryGenerationEngine");
const ValidationEngine = require("../services/validationEngine");
const EngineeringRuleEngine = require("../services/engineeringRuleEngine");
const CalculationEngine = require("../services/calculationEngine");
const BenchmarkEngine = require("../services/benchmarkEngine");
const CategoryClassifierEngine = require("../services/categoryClassifierEngine");
const ObservationEngine = require("../services/observationEngine");
const TheoryGenerator = require("../services/theoryGenerator");
const LLMWrapper = require("../services/llmWrapper");
const ExecutiveSummaryGenerator = require("../services/executiveSummaryGenerator");
const TheoryValidator = require("../services/theoryValidator");
const ReportIntegration = require("../services/reportIntegration");

function initializeTheoryEndpoints(app, systemSettings) {
  /**
   * POST /api/theory-generate
   * Generate theory from industrial data
   */
  app.post(
    "/api/theory-generate",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.user])],
    async (req, res) => {
      try {
        const { industrialData, options = {} } = req.body;

        // Validate input
        if (!industrialData || typeof industrialData !== "object") {
          return res.status(400).json({
            error: "Invalid input: industrialData must be an object",
            code: "INVALID_INPUT",
          });
        }

        // Initialize theory generation engine
        const llmProvider = systemSettings?.llmProvider || null;
        const theoryEngine = new TheoryGenerationEngine(llmProvider);

        // Generate theory (complete pipeline)
        const result = await theoryEngine.generateTheory(industrialData, options);

        if (!result.success) {
          return res.status(422).json({
            error: "Theory generation failed",
            code: "GENERATION_FAILED",
            details: {
              errors: result.errors,
              warnings: result.warnings,
              validations: result.validations,
            },
          });
        }

        return res.json({
          success: true,
          theory: result.theory,
          executiveSummary: result.executiveSummary,
          reportData: result.reportData,
          category: result.category,
          metadata: result.metadata,
        });
      } catch (error) {
        console.error("Theory generation error:", error);
        return res.status(500).json({
          error: "Internal server error during theory generation",
          message: error.message,
          code: "GENERATION_ERROR",
        });
      }
    }
  );

  /**
   * POST /api/theory-validate
   * Validate industrial data before generation
   */
  app.post(
    "/api/theory-validate",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.user])],
    (req, res) => {
      try {
        const { industrialData, categoryId } = req.body;

        const validationEngine = new ValidationEngine();

        // Basic validation
        const validation = validationEngine.validateIndustrialData(industrialData);

        if (!validation.valid) {
          return res.status(422).json({
            valid: false,
            errors: validation.errors,
            warnings: validation.warnings,
          });
        }

        // Category-specific validation if provided
        if (categoryId) {
          const classifier = new CategoryClassifierEngine();
          const categoryValidation = classifier.validateCategoryData(industrialData, categoryId);

          if (!categoryValidation.valid) {
            return res.status(422).json({
              valid: false,
              errors: categoryValidation.errors,
              missingMetrics: categoryValidation.missingMetrics,
            });
          }
        }

        return res.json({
          valid: true,
          warnings: validation.warnings,
          message: "Data validation passed",
        });
      } catch (error) {
        console.error("Validation error:", error);
        return res.status(500).json({
          error: "Validation error",
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/theory-categories
   * List all available equipment categories
   */
  app.get(
    "/api/theory-categories",
    [validatedRequest],
    (req, res) => {
      try {
        const classifier = new CategoryClassifierEngine();
        const categories = classifier.getAllCategories();

        return res.json({
          success: true,
          count: categories.length,
          categories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            keyMetrics: c.keyMetrics,
          })),
        });
      } catch (error) {
        console.error("Categories error:", error);
        return res.status(500).json({
          error: "Failed to retrieve categories",
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/theory-classify
   * Classify equipment from data
   */
  app.post(
    "/api/theory-classify",
    [validatedRequest],
    (req, res) => {
      try {
        const { industrialData } = req.body;

        if (!industrialData) {
          return res.status(400).json({
            error: "Invalid input: industrialData required",
          });
        }

        const classifier = new CategoryClassifierEngine();
        const category = classifier.classifyEquipment(industrialData);

        if (!category) {
          return res.status(422).json({
            error: "Unable to classify equipment",
            code: "CLASSIFICATION_FAILED",
            message: "Insufficient data to determine equipment category. Provide measurement fields or equipment name.",
          });
        }

        return res.json({
          success: true,
          category: {
            id: category.id,
            name: category.name,
            description: category.description,
            keyMetrics: category.keyMetrics,
            confidence: "medium",
          },
        });
      } catch (error) {
        console.error("Classification error:", error);
        return res.status(500).json({
          error: "Classification error",
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/theory-benchmark
   * Get benchmark comparison for data
   */
  app.post(
    "/api/theory-benchmark",
    [validatedRequest],
    (req, res) => {
      try {
        const { industrialData, categoryId } = req.body;

        if (!industrialData || !categoryId) {
          return res.status(400).json({
            error: "Invalid input: industrialData and categoryId required",
          });
        }

        const benchmarkEngine = new BenchmarkEngine();
        const results = benchmarkEngine.compareToBenchmarks(industrialData, categoryId);

        return res.json({
          success: true,
          benchmarks: results,
        });
      } catch (error) {
        console.error("Benchmark error:", error);
        return res.status(500).json({
          error: "Benchmark comparison error",
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/theory-pipeline-status
   * Get theory generation pipeline status
   */
  app.get(
    "/api/theory-pipeline-status",
    [validatedRequest],
    (req, res) => {
      try {
        const theoryEngine = new TheoryGenerationEngine(null);
        const pipeline = theoryEngine.getPipelineStatus();

        return res.json({
          success: true,
          pipeline,
          version: "1.0.0",
          modules: [
            "validation-engine",
            "engineering-rules",
            "calculation-engine",
            "benchmark-engine",
            "category-classifier",
            "observation-engine",
            "theory-generator",
            "llm-wrapper",
            "executive-summary",
            "theory-validator",
            "report-integration",
          ],
        });
      } catch (error) {
        console.error("Pipeline status error:", error);
        return res.status(500).json({
          error: "Pipeline status error",
          message: error.message,
        });
      }
    }
  );
}

module.exports = { initializeTheoryEndpoints };
