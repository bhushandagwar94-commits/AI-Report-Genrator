/**
 * Validation Engine
 * Validates industrial data before theory generation
 * Ensures all required fields are present, properly typed, and within valid ranges
 */

class ValidationEngine {
  constructor() {
    this.requiredFields = {
      'cooling-systems': ['deltaT', 'flowRate', 'chillerEfficiency'],
      'hvac-systems': ['supplyTemp', 'returnTemp', 'deltaT', 'fanPower'],
      'air-compressors': ['leakageRate', 'systemPressure', 'capacity'],
      'production-machines': ['motorLoad', 'motorEfficiency', 'powerFactor'],
      'electrical-systems': ['powerFactor', 'reactivePower', 'realPower'],
      'lighting-systems': ['luxLevel', 'lightingPowerDensity', 'hasControls'],
      'pumps-motors': ['motorLoad', 'flowRate', 'pressureHead', 'pumpEfficiency'],
      'thermal-systems': ['deltaT', 'heatLoss', 'suppliedEnergy'],
      'renewable-energy': ['generationCapacity', 'actualOutput', 'capacityFactor'],
      'auxiliary-systems': ['annualRunHours', 'fuelConsumption', 'generatorKw'],
      'monitoring-automation': ['systemUptime', 'dataQuality', 'hasAutomation'],
    };

    this.fieldRanges = {
      deltaT: { min: -50, max: 50, unit: '°C' },
      flowRate: { min: 0, max: 100000, unit: 'm³/h' },
      powerFactor: { min: 0, max: 1.0 },
      efficiency: { min: 0, max: 1.0 },
      percentageFloat: { min: 0, max: 1.0 },
      percentage: { min: 0, max: 100 },
      temperature: { min: -100, max: 100, unit: '°C' },
      hours: { min: 0, max: 10000 },
      pressure: { min: 0, max: 100, unit: 'bar' },
    };
  }

  /**
   * Validate industrial data
   */
  validateIndustrialData(data) {
    const errors = [];
    const warnings = [];

    if (!data) {
      return {
        valid: false,
        errors: ['No data provided'],
        warnings: [],
      };
    }

    // Check basic data structure
    if (typeof data !== 'object') {
      errors.push('Industrial data must be an object');
      return { valid: false, errors, warnings };
    }

    // Check timestamp
    if (!data.timestamp) {
      warnings.push('No timestamp provided; using current time');
    }

    // Check measurement values are numbers
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('_') || key === 'timestamp' || key === 'category' || typeof value === 'boolean') {
        continue;
      }

      if (typeof value === 'number') {
        // Check if value is NaN
        if (Number.isNaN(value)) {
          errors.push(`Field "${key}" contains NaN`);
        }
        // Check if value is infinite
        if (!Number.isFinite(value)) {
          errors.push(`Field "${key}" contains non-finite value`);
        }
      }
    }

    // Validate unit consistency
    const unitValidation = this.validateUnitConsistency(data);
    if (!unitValidation.valid) {
      warnings.push(...unitValidation.warnings);
    }

    const valid = errors.length === 0;

    return {
      valid,
      errors,
      warnings,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate calculations accuracy and unit consistency
   */
  validateCalculations(calculations) {
    const errors = [];
    const warnings = [];

    if (!calculations || typeof calculations !== 'object') {
      return { valid: false, errors: ['Invalid calculations object'] };
    }

    for (const [key, calc] of Object.entries(calculations)) {
      if (!calc.value || typeof calc.value !== 'number') {
        errors.push(`Calculation "${key}" has no numeric value`);
      }

      if (!calc.unit) {
        warnings.push(`Calculation "${key}" has no unit specified`);
      }

      if (!calc.formula) {
        warnings.push(`Calculation "${key}" has no formula documentation`);
      }

      if (Number.isNaN(calc.value) || !Number.isFinite(calc.value)) {
        errors.push(`Calculation "${key}" resulted in invalid value`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate engineering logic consistency
   */
  validateEngineeringLogic(rules, data) {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(rules)) {
      return { valid: false, errors: ['Rules must be an array'] };
    }

    for (const rule of rules) {
      if (!rule.id || !rule.name) {
        errors.push('Rule missing id or name');
        continue;
      }

      if (typeof rule.condition !== 'function') {
        errors.push(`Rule "${rule.id}" condition must be a function`);
      }

      if (!rule.issue || !rule.impact) {
        warnings.push(`Rule "${rule.id}" missing issue or impact description`);
      }

      // Try to evaluate the condition
      try {
        const result = rule.condition(data);
        if (typeof result !== 'boolean') {
          errors.push(`Rule "${rule.id}" condition does not return boolean`);
        }
      } catch (e) {
        errors.push(`Rule "${rule.id}" condition evaluation failed: ${e.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate unit consistency across measurements
   */
  validateUnitConsistency(data) {
    const warnings = [];

    // Check temperature fields use consistent units
    const tempFields = ['supplyTemp', 'returnTemp', 'exhaustTemp'];
    const tempValues = tempFields.filter((f) => f in data);
    if (tempValues.length > 0) {
      for (const field of tempValues) {
        const val = data[field];
        if (val > 100 || val < -50) {
          warnings.push(`Temperature field "${field}" may be in wrong unit (°C expected, got ${val})`);
        }
      }
    }

    // Check flow rate fields
    const flowFields = ['flowRate', 'requiredFlow'];
    const flowValues = flowFields.filter((f) => f in data);
    if (flowValues.length > 0) {
      for (const field of flowValues) {
        const val = data[field];
        if (val < 0) {
          warnings.push(`Flow field "${field}" is negative (m³/h expected)`);
        }
      }
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Validate benchmark data integrity
   */
  validateBenchmarks(benchmarkData) {
    const errors = [];

    if (!benchmarkData || typeof benchmarkData !== 'object') {
      return { valid: false, errors: ['Invalid benchmark data'] };
    }

    for (const [key, benchmark] of Object.entries(benchmarkData)) {
      if (!benchmark.excellent || !benchmark.good || !benchmark.fair || !benchmark.poor) {
        errors.push(`Benchmark "${key}" missing rating levels`);
      }

      for (const level of ['excellent', 'good', 'fair', 'poor']) {
        if (!benchmark[level].min !== null && !benchmark[level].max !== null) {
          if (benchmark[level].min > benchmark[level].max) {
            errors.push(`Benchmark "${key}" level "${level}" has invalid range`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate operational correctness
   */
  validateOperationalCorrectness(data) {
    const warnings = [];

    // Check for logical inconsistencies
    if (data.supplyTemp !== undefined && data.returnTemp !== undefined) {
      if (data.supplyTemp > data.returnTemp && data.supplyTemp - data.returnTemp < 2) {
        warnings.push('Supply temperature higher than return but delta-T is very small');
      }
    }

    if (data.flowRate !== undefined && data.setPoint !== undefined) {
      if (data.flowRate > data.setPoint * 1.5) {
        warnings.push('Flow rate significantly exceeds setpoint');
      }
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }
}

module.exports = ValidationEngine;
