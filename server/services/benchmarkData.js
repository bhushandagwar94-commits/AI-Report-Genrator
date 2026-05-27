/**
 * Benchmark Data
 * Industry-standard benchmarks for all equipment categories
 */

const INDUSTRY_BENCHMARKS = {
  'cooling-systems': {
    name: 'Cooling Systems',
    benchmarks: {
      'delta-t': {
        metric: 'Temperature Differential (°C)',
        unit: '°C',
        excellent: { min: 5.5, max: 7.0 },
        good: { min: 5.0, max: 5.5 },
        fair: { min: 4.0, max: 5.0 },
        poor: { min: 0, max: 4.0 },
      },
      'chiller-efficiency': {
        metric: 'Chiller Efficiency (kW/ton)',
        unit: 'kW/ton',
        excellent: { min: 0.0, max: 0.42 },
        good: { min: 0.42, max: 0.50 },
        fair: { min: 0.50, max: 0.65 },
        poor: { min: 0.65, max: 100 },
      },
    },
  },

  'hvac-systems': {
    name: 'HVAC Systems',
    benchmarks: {
      'delta-t': {
        metric: 'Supply-Return Temperature Differential (°C)',
        unit: '°C',
        excellent: { min: 4.0, max: 6.0 },
        good: { min: 3.5, max: 4.0 },
        fair: { min: 2.5, max: 3.5 },
        poor: { min: 0, max: 2.5 },
      },
      'supply-temp': {
        metric: 'Supply Air Temperature (°C)',
        unit: '°C',
        excellent: { min: 11, max: 14 },
        good: { min: 14, max: 16 },
        fair: { min: 16, max: 18 },
        poor: { min: 18, max: 30 },
      },
    },
  },

  'air-compressors': {
    name: 'Air Compressors',
    benchmarks: {
      'leakage-rate': {
        metric: 'System Leakage Rate (% of Capacity)',
        unit: '%',
        excellent: { min: 0, max: 0.05 },
        good: { min: 0.05, max: 0.10 },
        fair: { min: 0.10, max: 0.15 },
        poor: { min: 0.15, max: 100 },
      },
      'specific-power': {
        metric: 'Specific Power (kW per m³/min)',
        unit: 'kW/(m³/min)',
        excellent: { min: 0, max: 5.5 },
        good: { min: 5.5, max: 6.5 },
        fair: { min: 6.5, max: 7.5 },
        poor: { min: 7.5, max: 100 },
      },
    },
  },

  'production-machines': {
    name: 'Production Machines',
    benchmarks: {
      'motor-load': {
        metric: 'Motor Load Factor (%)',
        unit: '%',
        excellent: { min: 75, max: 100 },
        good: { min: 60, max: 75 },
        fair: { min: 50, max: 60 },
        poor: { min: 0, max: 50 },
      },
      'power-factor': {
        metric: 'Power Factor',
        unit: 'PF',
        excellent: { min: 0.98, max: 1.0 },
        good: { min: 0.95, max: 0.98 },
        fair: { min: 0.90, max: 0.95 },
        poor: { min: 0, max: 0.90 },
      },
    },
  },

  'electrical-systems': {
    name: 'Electrical Systems',
    benchmarks: {
      'power-factor': {
        metric: 'Power Factor',
        unit: 'PF',
        excellent: { min: 0.98, max: 1.0 },
        good: { min: 0.95, max: 0.98 },
        fair: { min: 0.90, max: 0.95 },
        poor: { min: 0, max: 0.90 },
      },
      'reactive-power': {
        metric: 'Reactive Power Ratio (KVAR/KW)',
        unit: 'ratio',
        excellent: { min: 0, max: 0.20 },
        good: { min: 0.20, max: 0.33 },
        fair: { min: 0.33, max: 0.50 },
        poor: { min: 0.50, max: 10 },
      },
    },
  },

  'lighting-systems': {
    name: 'Lighting Systems',
    benchmarks: {
      'lux-level': {
        metric: 'Illumination Level (Lux)',
        unit: 'Lux',
        excellent: { min: 300, max: 400 },
        good: { min: 400, max: 500 },
        fair: { min: 500, max: 600 },
        poor: { min: 600, max: 2000 },
      },
    },
  },

  'pumps-motors': {
    name: 'Pumps & Motors',
    benchmarks: {
      'motor-load': {
        metric: 'Motor Load Factor (%)',
        unit: '%',
        excellent: { min: 75, max: 100 },
        good: { min: 60, max: 75 },
        fair: { min: 50, max: 60 },
        poor: { min: 0, max: 50 },
      },
      'pump-efficiency': {
        metric: 'Pump Efficiency (%)',
        unit: '%',
        excellent: { min: 85, max: 100 },
        good: { min: 80, max: 85 },
        fair: { min: 75, max: 80 },
        poor: { min: 0, max: 75 },
      },
    },
  },

  'thermal-systems': {
    name: 'Thermal Systems',
    benchmarks: {
      'delta-t': {
        metric: 'Temperature Differential (°C)',
        unit: '°C',
        excellent: { min: 5.0, max: 8.0 },
        good: { min: 4.0, max: 5.0 },
        fair: { min: 3.0, max: 4.0 },
        poor: { min: 0, max: 3.0 },
      },
    },
  },

  'renewable-energy': {
    name: 'Renewable Energy Systems',
    benchmarks: {
      'capacity-factor': {
        metric: 'Capacity Factor (%)',
        unit: '%',
        excellent: { min: 25, max: 100 },
        good: { min: 20, max: 25 },
        fair: { min: 15, max: 20 },
        poor: { min: 0, max: 15 },
      },
    },
  },

  'auxiliary-systems': {
    name: 'Auxiliary Systems',
    benchmarks: {
      'generator-efficiency': {
        metric: 'Generator Efficiency (%)',
        unit: '%',
        excellent: { min: 90, max: 100 },
        good: { min: 88, max: 90 },
        fair: { min: 85, max: 88 },
        poor: { min: 0, max: 85 },
      },
    },
  },

  'monitoring-automation': {
    name: 'Monitoring & Automation Systems',
    benchmarks: {
      'system-uptime': {
        metric: 'System Uptime (%)',
        unit: '%',
        excellent: { min: 99.5, max: 100 },
        good: { min: 99, max: 99.5 },
        fair: { min: 95, max: 99 },
        poor: { min: 0, max: 95 },
      },
      'data-quality': {
        metric: 'Data Quality Score (%)',
        unit: '%',
        excellent: { min: 98, max: 100 },
        good: { min: 95, max: 98 },
        fair: { min: 90, max: 95 },
        poor: { min: 0, max: 90 },
      },
    },
  },
};

/**
 * Get benchmark status
 */
function getBenchmarkStatus(benchmark, value) {
  if (!benchmark) return 'unknown';

  if (value >= benchmark.excellent.min && value <= benchmark.excellent.max) {
    return 'excellent';
  }
  if (value >= benchmark.good.min && value <= benchmark.good.max) {
    return 'good';
  }
  if (value >= benchmark.fair.min && value <= benchmark.fair.max) {
    return 'fair';
  }
  return 'poor';
}

/**
 * Get numeric score
 */
function getBenchmarkScore(status) {
  const scores = { excellent: 4, good: 3, fair: 2, poor: 1, unknown: 0 };
  return scores[status] || 0;
}

module.exports = {
  INDUSTRY_BENCHMARKS,
  getBenchmarkStatus,
  getBenchmarkScore,
};
