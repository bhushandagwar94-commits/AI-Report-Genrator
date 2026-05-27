/**
 * Theory Generation Engine - Orchestrator
 * Main entry point that coordinates all theory generation modules
 */

const ValidationEngine = require('./validationEngine');
const EngineeringRuleEngine = require('./engineeringRuleEngine');
const CalculationEngine = require('./calculationEngine');
const BenchmarkEngine = require('./benchmarkEngine');
const CategoryClassifierEngine = require('./categoryClassifierEngine');
const ObservationEngine = require('./observationEngine');
const TheoryGenerator = require('./theoryGenerator');
const LLMWrapper = require('./llmWrapper');
const ExecutiveSummaryGenerator = require('./executiveSummaryGenerator');
const TheoryValidator = require('./theoryValidator');
const ReportIntegration = require('./reportIntegration');

class TheoryGenerationEngine {
  constructor(llmProvider) {
    this.llmProvider = llmProvider;
    this.validationEngine = new ValidationEngine();
    this.engineeringRuleEngine = new EngineeringRuleEngine();
    this.calculationEngine = new CalculationEngine();
    this.benchmarkEngine = new BenchmarkEngine();
    this.categoryClassifier = new CategoryClassifierEngine();
    this.observationEngine = new ObservationEngine();
    this.theoryGenerator = new TheoryGenerator();
    this.llmWrapper = new LLMWrapper(llmProvider);
    this.executiveSummaryGenerator = new ExecutiveSummaryGenerator();
    this.theoryValidator = new TheoryValidator();
    this.reportIntegration = new ReportIntegration();
  }

  /**
   * Generate complete theory from industrial data
   * Orchestrates full pipeline: Validation → Rules → Calculations → Benchmarks → Observations → Theory
   */
  async generateTheory(industrialData, options = {}) {
    const result = {
      success: false,
      theory: null,
      executiveSummary: null,
      validations: [],
      errors: [],
      warnings: [],
      metadata: {
        startTime: Date.now(),
        stages: {},
      },
    };

    try {
      // Stage 1: Validate Input Data
      result.metadata.stages.validation = 'in_progress';
      const validation = this.validationEngine.validateIndustrialData(industrialData);

      if (!validation.valid) {
        result.errors.push(...validation.errors);
        result.validations.push(validation);
        result.metadata.stages.validation = 'failed';
        return result;
      }
      result.validations.push(validation);
      result.metadata.stages.validation = 'completed';

      // Stage 2: Classify Equipment Category
      result.metadata.stages.classification = 'in_progress';
      const category = this.categoryClassifier.classifyEquipment(industrialData);
      if (!category) {
        result.errors.push('Unable to classify equipment category from provided data');
        result.metadata.stages.classification = 'failed';
        return result;
      }
      result.metadata.stages.classification = 'completed';

      // Stage 3: Apply Engineering Rules
      result.metadata.stages.engineeringRules = 'in_progress';
      const ruleResults = this.engineeringRuleEngine.evaluateRules(category.id, industrialData);
      result.metadata.stages.engineeringRules = 'completed';

      // Stage 4: Perform Calculations
      result.metadata.stages.calculations = 'in_progress';
      const calculations = this.calculationEngine.performCalculations(industrialData, category.id);
      result.metadata.stages.calculations = 'completed';

      // Stage 5: Benchmark Comparison
      result.metadata.stages.benchmarks = 'in_progress';
      const benchmarkResults = this.benchmarkEngine.compareToBenchmarks(industrialData, category.id);
      result.metadata.stages.benchmarks = 'completed';

      // Stage 6: Generate Observations
      result.metadata.stages.observations = 'in_progress';
      const observations = this.observationEngine.generateObservations(
        industrialData,
        ruleResults,
        calculations,
        benchmarkResults
      );
      result.metadata.stages.observations = 'completed';

      // Stage 7: Generate Theory
      result.metadata.stages.theoryGeneration = 'in_progress';
      const theory = this.theoryGenerator.generateTheory(
        industrialData,
        category,
        ruleResults,
        calculations,
        benchmarkResults,
        observations
      );
      result.metadata.stages.theoryGeneration = 'completed';

      // Stage 8: Validate Theory
      result.metadata.stages.theoryValidation = 'in_progress';
      const theoryValidation = this.theoryValidator.validateTheory(theory);
      if (!theoryValidation.valid) {
        result.errors.push(...theoryValidation.errors);
        result.validations.push(theoryValidation);
        result.metadata.stages.theoryValidation = 'failed';
        return result;
      }
      result.validations.push(theoryValidation);
      result.metadata.stages.theoryValidation = 'completed';

      // Stage 9: Convert to Professional Language (LLM)
      result.metadata.stages.llmConversion = 'in_progress';
      const professionalTheory = await this.llmWrapper.structureToLanguage(theory, industrialData);
      result.metadata.stages.llmConversion = 'completed';

      // Stage 10: Generate Executive Summary
      result.metadata.stages.executiveSummary = 'in_progress';
      const executiveSummary = await this.executiveSummaryGenerator.generateExecutiveSummary(
        professionalTheory,
        observations,
        calculations
      );
      result.metadata.stages.executiveSummary = 'completed';

      // Stage 11: Prepare Report Integration
      result.metadata.stages.reportIntegration = 'in_progress';
      const reportData = this.reportIntegration.mapTheoryToReportTemplate(
        professionalTheory,
        executiveSummary,
        category
      );
      result.metadata.stages.reportIntegration = 'completed';

      result.success = true;
      result.theory = professionalTheory;
      result.executiveSummary = executiveSummary;
      result.reportData = reportData;
      result.category = category;
      result.metadata.endTime = Date.now();
      result.metadata.duration = result.metadata.endTime - result.metadata.startTime;

      return result;
    } catch (error) {
      result.errors.push(`Theory generation failed: ${error.message}`);
      result.metadata.error = error.message;
      result.metadata.errorStack = error.stack;
      return result;
    }
  }

  /**
   * Get theory generation pipeline status
   */
  getPipelineStatus() {
    return {
      stages: [
        'validation',
        'classification',
        'engineeringRules',
        'calculations',
        'benchmarks',
        'observations',
        'theoryGeneration',
        'theoryValidation',
        'llmConversion',
        'executiveSummary',
        'reportIntegration',
      ],
      status: 'active',
      version: '1.0.0',
    };
  }
}

module.exports = TheoryGenerationEngine;
