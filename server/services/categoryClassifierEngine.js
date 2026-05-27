/**
 * Category Classifier Engine
 * Classifies equipment into one of 11 supported categories
 * Uses keyword matching and measurement field detection
 */

const {
  EQUIPMENT_CATEGORIES,
  getCategoryByName,
  getCategoryById,
  getAllCategories,
} = require('./categoryClassifier');

class CategoryClassifierEngine {
  constructor() {
    this.categories = EQUIPMENT_CATEGORIES;
  }

  /**
   * Classify equipment from industrial data
   */
  classifyEquipment(data) {
    // Try explicit category field first
    if (data.category) {
      const byName = getCategoryByName(data.category);
      if (byName) return byName;

      const byId = getCategoryById(data.category);
      if (byId) return byId;
    }

    // Try to infer from equipment name/description
    if (data.equipmentName || data.name || data.description) {
      const nameStr = `${data.equipmentName || ''} ${data.name || ''} ${data.description || ''}`.toLowerCase();
      const inferred = this.inferFromName(nameStr);
      if (inferred) return inferred;
    }

    // Try to infer from measured fields
    const inferred = this.inferFromMeasuredFields(data);
    if (inferred) return inferred;

    return null;
  }

  /**
   * Infer category from equipment name
   */
  inferFromName(nameStr) {
    const namePatterns = {
      'cooling-systems': ['chiller', 'cooling', 'cooling tower', 'condenser', 'cw pump', 'chw pump'],
      'hvac-systems': ['hvac', 'ahu', 'air handler', 'fan coil', 'vav', 'damper'],
      'air-compressors': ['compressor', 'air compressor', 'screw', 'reciprocating'],
      'production-machines': ['motor', 'pump', 'press', 'machine', 'equipment'],
      'electrical-systems': ['electrical', 'power', 'transformer', 'panel', 'switchgear'],
      'lighting-systems': ['lighting', 'light', 'lamp', 'fixture', 'led'],
      'pumps-motors': ['pump', 'motor', 'centrifugal', 'gear pump'],
      'thermal-systems': ['heater', 'boiler', 'furnace', 'thermal', 'heat'],
      'renewable-energy': ['solar', 'wind', 'photovoltaic', 'pv', 'turbine', 'renewable'],
      'auxiliary-systems': ['generator', 'backup', 'diesel', 'fuel'],
      'monitoring-automation': ['monitoring', 'automation', 'controls', 'scada', 'bms'],
    };

    for (const [categoryId, patterns] of Object.entries(namePatterns)) {
      for (const pattern of patterns) {
        if (nameStr.includes(pattern)) {
          return getCategoryById(categoryId);
        }
      }
    }

    return null;
  }

  /**
   * Infer category from measured fields present in data
   */
  inferFromMeasuredFields(data) {
    const fieldPatterns = {
      'cooling-systems': ['deltaT', 'chillerPower', 'coolingCapacity', 'flowRate', 'returnTemp', 'supplyTemp'],
      'hvac-systems': ['supplyTemp', 'returnTemp', 'deltaT', 'fanPower', 'airflow', 'damper'],
      'air-compressors': ['leakageRate', 'systemPressure', 'compressorPower', 'airflow', 'capacity'],
      'production-machines': ['motorLoad', 'motorEfficiency', 'powerFactor', 'motorRatedPower', 'vibration'],
      'electrical-systems': ['powerFactor', 'reactivePower', 'realPower', 'voltage', 'current', 'peakDemand'],
      'lighting-systems': ['luxLevel', 'lightingPowerDensity', 'hasControls', 'lampType', 'fixture'],
      'pumps-motors': ['motorLoad', 'flowRate', 'pressureHead', 'pumpEfficiency', 'cavitation'],
      'thermal-systems': ['deltaT', 'heatLoss', 'suppliedEnergy', 'exhaustTemp', 'insulationLevel'],
      'renewable-energy': ['generationCapacity', 'actualOutput', 'capacityFactor', 'sunlight', 'windSpeed'],
      'auxiliary-systems': ['generatorEfficiency', 'fuelConsumption', 'annualRunHours', 'generatorKw'],
      'monitoring-automation': ['systemUptime', 'dataQuality', 'hasAutomation', 'responseTime'],
    };

    // Score each category by field matches
    const scores = {};
    for (const [categoryId, fields] of Object.entries(fieldPatterns)) {
      const matches = fields.filter((field) => field in data).length;
      if (matches > 0) {
        scores[categoryId] = matches;
      }
    }

    // Return category with highest match score
    if (Object.keys(scores).length > 0) {
      const topCategory = Object.entries(scores).sort(([, a], [, b]) => b - a)[0][0];
      return getCategoryById(topCategory);
    }

    return null;
  }

  /**
   * Get category by exact ID
   */
  getCategory(categoryId) {
    return getCategoryById(categoryId);
  }

  /**
   * Get all available categories
   */
  getAllCategories() {
    return getAllCategories();
  }

  /**
   * Get key metrics for a category
   */
  getKeyMetrics(categoryId) {
    const category = getCategoryById(categoryId);
    return category ? category.keyMetrics : [];
  }

  /**
   * Validate that data has minimum required fields for category
   */
  validateCategoryData(data, categoryId) {
    const category = getCategoryById(categoryId);
    if (!category) {
      return { valid: false, errors: ['Unknown category'] };
    }

    const keyMetrics = category.keyMetrics;
    const missingMetrics = keyMetrics.filter(
      (metric) =>
        !(metric in data) ||
        data[metric] === null ||
        data[metric] === undefined
    );

    if (missingMetrics.length > 0) {
      return {
        valid: false,
        errors: [`Missing required metrics for ${category.name}: ${missingMetrics.join(', ')}`],
        missingMetrics,
      };
    }

    return {
      valid: true,
      category,
      presentMetrics: keyMetrics.filter((m) => m in data),
    };
  }
}

module.exports = CategoryClassifierEngine;
