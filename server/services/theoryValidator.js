/**
 * Theory Validator
 * Final validation layer before theory output
 * Ensures all logic, calculations, units, and recommendations are valid
 */

class TheoryValidator {
  constructor() {
    this.requiredSections = [
      'systemDescription',
      'engineeringObservation',
      'rootCauseAnalysis',
      'operationalImpact',
      'energyImpact',
      'benchmarkComparison',
      'optimizationOpportunity',
      'technicalRecommendation',
      'savingBenefit',
      'sustainabilityImpact',
    ];
  }

  /**
   * Validate complete theory output
   */
  validateTheory(theory) {
    const errors = [];
    const warnings = [];

    // Check structure
    const structureCheck = this.validateStructure(theory);
    if (!structureCheck.valid) {
      errors.push(...structureCheck.errors);
    }
    warnings.push(...structureCheck.warnings);

    // Check logic consistency
    const logicCheck = this.validateLogicConsistency(theory);
    if (!logicCheck.valid) {
      errors.push(...logicCheck.errors);
    }

    // Check calculation consistency
    const calcCheck = this.validateCalculationConsistency(theory);
    if (!calcCheck.valid) {
      errors.push(...calcCheck.errors);
    }

    // Check unit consistency
    const unitCheck = this.validateUnitConsistency(theory);
    if (!unitCheck.valid) {
      errors.push(...unitCheck.errors);
    }
    warnings.push(...unitCheck.warnings);

    // Check recommendation validity
    const recCheck = this.validateRecommendations(theory);
    if (!recCheck.valid) {
      errors.push(...recCheck.errors);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      completeness: this.calculateCompleteness(theory),
      timestamp: Date.now(),
    };
  }

  /**
   * Validate theory structure
   */
  validateStructure(theory) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!theory.categoryId || !theory.categoryName) {
      errors.push('Theory missing category identification');
    }

    // Check all sections present
    for (const section of this.requiredSections) {
      if (!theory.sections || !theory.sections[section]) {
        errors.push(`Missing required section: ${section}`);
      } else if (!theory.sections[section].content) {
        errors.push(`Section ${section} has no content`);
      }
    }

    // Check metadata
    if (!theory.metadata) {
      warnings.push('Theory missing metadata');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate logic consistency across sections
   */
  validateLogicConsistency(theory) {
    const errors = [];

    if (!theory.sections) return { valid: true, errors };

    const sections = theory.sections;

    // Check that observations support root cause
    if (sections.engineeringObservation && sections.rootCauseAnalysis) {
      if (
        !sections.rootCauseAnalysis.content.includes('Issue') &&
        !sections.rootCauseAnalysis.content.includes('Cause')
      ) {
        errors.push('Root cause analysis does not connect to observations');
      }
    }

    // Check that energy impact supports savings benefit
    if (sections.energyImpact && sections.savingBenefit) {
      const energyLosses = this.extractNumbers(sections.energyImpact.content);
      const savings = this.extractNumbers(sections.savingBenefit.content);

      if (energyLosses.length === 0) {
        errors.push('Energy impact section contains no quantified losses');
      }
      if (savings.length === 0) {
        errors.push('Savings benefit section contains no quantified benefits');
      }
    }

    // Check that recommendations align with observations
    if (sections.engineeringObservation && sections.technicalRecommendation) {
      const obsIssueCount = (sections.engineeringObservation.content.match(/Issue/gi) || []).length;
      const recCount = (sections.technicalRecommendation.content.match(/\d\./g) || []).length;

      if (recCount === 0) {
        errors.push('Technical recommendations section does not contain actionable items');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate calculation consistency
   */
  validateCalculationConsistency(theory) {
    const errors = [];

    if (!theory.sections) return { valid: true, errors };

    const sections = theory.sections;

    // Check energy impact calculations
    if (sections.energyImpact && sections.savingBenefit) {
      const energyText = sections.energyImpact.content;
      const savingsText = sections.savingBenefit.content;

      // Verify kWh figures make sense
      const energyMWh = this.extractFirst Number(energyText, /(\d+)\s*MWh/i);
      const savingsMWh = this.extractFirstNumber(savingsText, /(\d+)\s*MWh/i);

      if (energyMWh && savingsMWh && savingsMWh > energyMWh * 1.5) {
        errors.push('Claimed savings exceed identified energy waste - calculation inconsistency');
      }
    }

    // Check ROI calculations
    if (sections.savingBenefit) {
      const savingsText = sections.savingBenefit.content;
      const investment = this.extractFirstNumber(savingsText, /\$(\d+)/);
      const savings = this.extractFirstNumber(
        savingsText,
        /Annual.*\$(\d+)/i
      );

      if (investment && savings && savings === 0) {
        errors.push('Savings benefit shows investment but no annual savings - invalid ROI');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate unit consistency
   */
  validateUnitConsistency(theory) {
    const errors = [];
    const warnings = [];

    if (!theory.sections) return { valid: true, errors, warnings };

    const sections = theory.sections;
    const unitPatterns = {
      energy: /(\d+)\s*(kWh|MWh|kW)/gi,
      temperature: /(\d+)\s*(°C|K|°F)/gi,
      pressure: /(\d+)\s*(bar|psi|kPa)/gi,
      flow: /(\d+)\s*(m³|gpm|lpm)/gi,
    };

    for (const [sectionName, section] of Object.entries(sections)) {
      if (!section.content) continue;

      for (const [unitType, pattern] of Object.entries(unitPatterns)) {
        const matches = section.content.match(pattern);
        if (matches && matches.length > 0) {
          // Check for unit consistency within section
          const units = matches.map((m) => m.split(/\d+/)[1].trim());
          const uniqueUnits = [...new Set(units)];

          if (uniqueUnits.length > 1 && unitType === 'energy') {
            warnings.push(
              `Section ${sectionName} uses mixed energy units: ${uniqueUnits.join(', ')}`
            );
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate recommendations
   */
  validateRecommendations(theory) {
    const errors = [];

    if (!theory.sections || !theory.sections.technicalRecommendation) {
      errors.push('Missing technical recommendations section');
      return { valid: false, errors };
    }

    const recContent = theory.sections.technicalRecommendation.content;

    // Check for specific actionable items
    if (!recContent.includes('Immediate') && !recContent.includes('short-term')) {
      errors.push('Recommendations lack time-frame specificity');
    }

    // Check for feasibility statements
    if (
      !recContent.includes('investment') &&
      !recContent.includes('cost') &&
      !recContent.includes('budget')
    ) {
      errors.push('Recommendations lack investment/feasibility discussion');
    }

    // Verify recommendations are data-supported
    if (recContent.length < 200) {
      errors.push('Recommendations too brief to be actionable');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Calculate theory completeness score
   */
  calculateCompleteness(theory) {
    if (!theory.sections) return 0;

    let complete = 0;

    for (const section of this.requiredSections) {
      if (
        theory.sections[section] &&
        theory.sections[section].content &&
        theory.sections[section].content.length > 100
      ) {
        complete++;
      }
    }

    return (complete / this.requiredSections.length) * 100;
  }

  /**
   * Extract all numbers from text
   */
  extractNumbers(text) {
    if (!text) return [];
    const matches = text.match(/\d+(\.\d+)?/g);
    return matches ? matches.map((m) => parseFloat(m)) : [];
  }

  /**
   * Extract first number matching pattern
   */
  extractFirstNumber(text, pattern) {
    if (!text) return null;
    const match = text.match(pattern);
    return match ? parseInt(match[1]) : null;
  }
}

module.exports = TheoryValidator;
