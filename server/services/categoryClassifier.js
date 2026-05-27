/**
 * Equipment Categories for Theory Generation
 * Defines the 11 equipment categories supported by the theory engine
 */

const EQUIPMENT_CATEGORIES = {
  COOLING_SYSTEMS: {
    id: 'cooling-systems',
    name: 'Cooling Systems',
    description: 'Chiller optimization, cooling tower efficiency, thermal performance',
    keyMetrics: ['chiller-efficiency', 'cooling-tower-efficiency', 'delta-t', 'flow-rate'],
  },
  HVAC_SYSTEMS: {
    id: 'hvac-systems',
    name: 'HVAC Systems',
    description: 'Air handling, temperature control, ventilation efficiency',
    keyMetrics: ['supply-temp', 'return-temp', 'delta-t', 'ahu-efficiency'],
  },
  AIR_COMPRESSORS: {
    id: 'air-compressors',
    name: 'Air Compressors',
    description: 'Leakage detection, pressure optimization, demand-side management',
    keyMetrics: ['leakage-rate', 'system-pressure', 'specific-power', 'capacity'],
  },
  PRODUCTION_MACHINES: {
    id: 'production-machines',
    name: 'Production Machines',
    description: 'Load profiling, efficiency optimization, motor analysis',
    keyMetrics: ['motor-load', 'efficiency', 'power-factor', 'vibration'],
  },
  ELECTRICAL_SYSTEMS: {
    id: 'electrical-systems',
    name: 'Electrical Systems',
    description: 'Power factor correction, demand-side management, reactive power',
    keyMetrics: ['power-factor', 'reactive-power', 'demand-charge', 'efficiency'],
  },
  LIGHTING_SYSTEMS: {
    id: 'lighting-systems',
    name: 'Lighting Systems',
    description: 'Luminosity analysis, LED retrofit opportunities, controls',
    keyMetrics: ['lux-level', 'power-density', 'control-status', 'age'],
  },
  PUMPS_MOTORS: {
    id: 'pumps-motors',
    name: 'Pumps & Motors',
    description: 'Load profiling, flow optimization, motor efficiency',
    keyMetrics: ['motor-load', 'flow-rate', 'pressure-head', 'efficiency'],
  },
  THERMAL_SYSTEMS: {
    id: 'thermal-systems',
    name: 'Thermal Systems',
    description: 'Heat recovery, insulation losses, thermal efficiency',
    keyMetrics: ['delta-t', 'insulation-level', 'heat-loss', 'recovery-rate'],
  },
  RENEWABLE_ENERGY: {
    id: 'renewable-energy',
    name: 'Renewable Energy Systems',
    description: 'Solar performance, wind performance, integration analysis',
    keyMetrics: ['generation-capacity', 'actual-output', 'efficiency', 'capacity-factor'],
  },
  AUXILIARY_SYSTEMS: {
    id: 'auxiliary-systems',
    name: 'Auxiliary Systems',
    description: 'Backup generators, compressed air systems, waste heat',
    keyMetrics: ['run-hours', 'fuel-consumption', 'efficiency', 'utilization'],
  },
  MONITORING_AUTOMATION: {
    id: 'monitoring-automation',
    name: 'Monitoring & Automation Systems',
    description: 'Control optimization, data quality, automation opportunities',
    keyMetrics: ['uptime', 'data-quality', 'automation-level', 'response-time'],
  },
};

const CATEGORY_IDS = Object.keys(EQUIPMENT_CATEGORIES).reduce((acc, key) => {
  acc[key] = EQUIPMENT_CATEGORIES[key].id;
  return acc;
}, {});

/**
 * Map string category name to category object
 */
function getCategoryByName(name) {
  const normalized = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, category] of Object.entries(EQUIPMENT_CATEGORIES)) {
    const categoryNormalized = category.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (categoryNormalized === normalized) {
      return category;
    }
  }
  return null;
}

/**
 * Map string category ID to category object
 */
function getCategoryById(id) {
  const normalized = String(id).toLowerCase();
  for (const category of Object.values(EQUIPMENT_CATEGORIES)) {
    if (category.id === normalized) {
      return category;
    }
  }
  return null;
}

/**
 * Get all category objects
 */
function getAllCategories() {
  return Object.values(EQUIPMENT_CATEGORIES);
}

module.exports = {
  EQUIPMENT_CATEGORIES,
  CATEGORY_IDS,
  getCategoryByName,
  getCategoryById,
  getAllCategories,
};
