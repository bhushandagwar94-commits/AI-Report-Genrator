/**
 * Engineering Rules Data
 * Complete rule definitions for all 11 equipment categories
 */

const ENGINEERING_RULES = {
  'cooling-systems': {
    rules: [
      {
        id: 'delta-t-low',
        name: 'Low Temperature Differential',
        condition: (data) => data.deltaT && data.deltaT < 5,
        issue: 'Low temperature differential indicates excessive flow or poor heat transfer',
        severity: 'high',
        impact: 'Reduced cooling efficiency, increased power consumption',
      },
      {
        id: 'chiller-efficiency-low',
        name: 'Low Chiller Efficiency',
        condition: (data) => data.chillerEfficiency && data.chillerEfficiency < 0.85,
        issue: 'Chiller operating below optimal efficiency rating',
        severity: 'high',
        impact: 'Increased energy consumption and operating costs',
      },
      {
        id: 'flow-rate-high',
        name: 'Excessive Flow Rate',
        condition: (data) => data.flowRate && data.setPoint && data.flowRate > data.setPoint * 1.2,
        issue: 'Flow rate exceeds setpoint, indicating control valve issues',
        severity: 'medium',
        impact: 'Increased pump power, reduced equipment life',
      },
    ],
  },

  'hvac-systems': {
    rules: [
      {
        id: 'delta-t-low',
        name: 'Low Supply-Return Temperature Differential',
        condition: (data) => data.deltaT && data.deltaT < 3,
        issue: 'Low delta-T indicates excessive air flow or poor heat transfer',
        severity: 'high',
        impact: 'Reduced HVAC efficiency, increased fan energy',
      },
      {
        id: 'supply-temp-high',
        name: 'Supply Air Temperature Too High',
        condition: (data) => data.supplyTemp && data.supplyTemp > 18,
        issue: 'Supply temperature exceeds design conditions',
        severity: 'medium',
        impact: 'Increased cooling load, occupant comfort concerns',
      },
      {
        id: 'filter-clogging',
        name: 'Potential Filter Clogging',
        condition: (data) => data.fanPower && data.fanDesignPower && data.fanPower > data.fanDesignPower * 1.15,
        issue: 'High fan power indicates clogged filter',
        severity: 'medium',
        impact: 'Increased energy consumption, reduced air quality',
      },
    ],
  },

  'air-compressors': {
    rules: [
      {
        id: 'leakage-high',
        name: 'High Compressed Air Leakage',
        condition: (data) => data.leakageRate && data.leakageRate > 0.10,
        issue: 'Leakage rate exceeds acceptable standard (>10% of capacity)',
        severity: 'high',
        impact: 'Wasted energy, increased operating costs',
      },
      {
        id: 'pressure-high',
        name: 'Excessive System Pressure',
        condition: (data) => data.systemPressure && data.requiredPressure && data.systemPressure > data.requiredPressure + 0.5,
        issue: 'System pressure exceeds requirement',
        severity: 'medium',
        impact: 'Increased energy consumption, compressor wear',
      },
      {
        id: 'specific-power-high',
        name: 'High Specific Power',
        condition: (data) => data.specificPower && data.specificPower > 7.0,
        issue: 'Specific power exceeds industry standard (>7 kW per m³/min)',
        severity: 'high',
        impact: 'Poor compressor efficiency, high operating costs',
      },
    ],
  },

  'production-machines': {
    rules: [
      {
        id: 'motor-load-low',
        name: 'Motor Operating Under Low Load',
        condition: (data) => data.motorLoad && data.motorLoad < 0.50,
        issue: 'Motor operating below 50% rated capacity',
        severity: 'medium',
        impact: 'Poor efficiency, may indicate oversized motor',
      },
      {
        id: 'power-factor-low',
        name: 'Low Power Factor',
        condition: (data) => data.powerFactor && data.powerFactor < 0.95,
        issue: 'Reactive power loss exceeds acceptable level',
        severity: 'medium',
        impact: 'Increased demand charges, utility penalties',
      },
      {
        id: 'motor-efficiency-degraded',
        name: 'Degraded Motor Efficiency',
        condition: (data) => data.motorAge && data.motorAge > 15 && data.motorEfficiency && data.motorEfficiency < 0.88,
        issue: 'Aging motor showing degraded efficiency',
        severity: 'high',
        impact: 'Increased energy consumption, potential failure risk',
      },
    ],
  },

  'electrical-systems': {
    rules: [
      {
        id: 'pf-low',
        name: 'Low Power Factor',
        condition: (data) => data.powerFactor && data.powerFactor < 0.95,
        issue: 'Power factor below 0.95 standard',
        severity: 'high',
        impact: 'Reactive power loss, utility charges, transformer losses',
      },
      {
        id: 'reactive-power-high',
        name: 'High Reactive Power',
        condition: (data) => data.reactivePower && data.realPower && (data.reactivePower / data.realPower) > 0.33,
        issue: 'Reactive power exceeds recommended ratio',
        severity: 'high',
        impact: 'Increased utility costs, equipment stress',
      },
      {
        id: 'demand-charge-high',
        name: 'High Peak Demand',
        condition: (data) => data.peakDemand && data.avgDemand && data.peakDemand > data.avgDemand * 1.5,
        issue: 'Peak demand significantly exceeds average',
        severity: 'medium',
        impact: 'Increased demand charges, poor load profile',
      },
    ],
  },

  'lighting-systems': {
    rules: [
      {
        id: 'over-illuminated',
        name: 'Over-Illumination',
        condition: (data) => data.luxLevel && data.luxLevel > 500,
        issue: 'Illumination level exceeds recommended standard',
        severity: 'medium',
        impact: 'Excess energy consumption, potential glare issues',
      },
      {
        id: 'power-density-high',
        name: 'High Power Density',
        condition: (data) => data.lightingPowerDensity && data.lightingPowerDensity > 12,
        issue: 'Lighting power density exceeds ASHRAE standard',
        severity: 'high',
        impact: 'Unnecessary energy consumption, LED retrofit opportunity',
      },
      {
        id: 'no-controls',
        name: 'No Lighting Controls',
        condition: (data) => data.hasControls === false,
        issue: 'No automatic lighting controls installed',
        severity: 'high',
        impact: 'Wasted energy during non-occupancy periods',
      },
    ],
  },

  'pumps-motors': {
    rules: [
      {
        id: 'motor-load-low',
        name: 'Pump Motor Under-loaded',
        condition: (data) => data.motorLoad && data.motorLoad < 0.40,
        issue: 'Motor operating below 40% rated capacity',
        severity: 'medium',
        impact: 'Poor efficiency, oversized equipment indication',
      },
      {
        id: 'flow-rate-excessive',
        name: 'Excessive Flow Rate',
        condition: (data) => data.flowRate && data.requiredFlow && data.flowRate > data.requiredFlow * 1.25,
        issue: 'Flow rate exceeds requirement by >25%',
        severity: 'high',
        impact: 'Increased pump power and cavitation risk',
      },
      {
        id: 'pump-efficiency-low',
        name: 'Low Pump Efficiency',
        condition: (data) => data.pumpEfficiency && data.pumpEfficiency < 0.80,
        issue: 'Pump operating at low efficiency point',
        severity: 'medium',
        impact: 'Increased operating costs, potential cavitation',
      },
    ],
  },

  'thermal-systems': {
    rules: [
      {
        id: 'delta-t-low',
        name: 'Low Temperature Differential',
        condition: (data) => data.deltaT && data.deltaT < 3,
        issue: 'Low delta-T indicates excessive flow',
        severity: 'medium',
        impact: 'Reduced thermal efficiency',
      },
      {
        id: 'heat-loss-high',
        name: 'High Heat Loss',
        condition: (data) => data.heatLoss && data.suppliedEnergy && (data.heatLoss / data.suppliedEnergy) > 0.15,
        issue: 'Heat loss exceeds 15% of supplied energy',
        severity: 'high',
        impact: 'Wasted energy, poor insulation',
      },
      {
        id: 'recovery-unused',
        name: 'Unutilized Heat Recovery Opportunity',
        condition: (data) => data.recoveryRate === 0 && data.exhaustTemp && data.exhaustTemp > 50,
        issue: 'Heat recovery not implemented for high-temperature exhaust',
        severity: 'high',
        impact: 'Significant energy and cost savings opportunity',
      },
    ],
  },

  'renewable-energy': {
    rules: [
      {
        id: 'capacity-factor-low',
        name: 'Low Capacity Factor',
        condition: (data) => data.capacityFactor && data.capacityFactor < 0.15,
        issue: 'System capacity factor below expected performance',
        severity: 'medium',
        impact: 'Underperforming system, maintenance needed',
      },
      {
        id: 'generation-inconsistent',
        name: 'Inconsistent Generation Pattern',
        condition: (data) => data.generationStdDev && data.generationMean && (data.generationStdDev / data.generationMean) > 0.50,
        issue: 'High variance in generation output',
        severity: 'low',
        impact: 'Affects grid integration and forecasting',
      },
      {
        id: 'no-monitoring',
        name: 'Inadequate Performance Monitoring',
        condition: (data) => !data.hasPowerMonitoring,
        issue: 'System lacks proper performance monitoring',
        severity: 'medium',
        impact: 'Cannot detect degradation or failures',
      },
    ],
  },

  'auxiliary-systems': {
    rules: [
      {
        id: 'generator-low-efficiency',
        name: 'Low Generator Efficiency',
        condition: (data) => data.generatorEfficiency && data.generatorEfficiency < 0.85,
        issue: 'Generator efficiency below acceptable standard',
        severity: 'high',
        impact: 'High fuel consumption, increased costs',
      },
      {
        id: 'high-run-hours',
        name: 'High Generator Run Hours',
        condition: (data) => data.annualRunHours && data.annualRunHours > 500,
        issue: 'Generator runs >500 hours annually',
        severity: 'medium',
        impact: 'May indicate oversized backup capacity',
      },
      {
        id: 'fuel-consumption-high',
        name: 'High Fuel Consumption',
        condition: (data) => data.fuelConsumption && data.generatorKw && (data.fuelConsumption / data.generatorKw) > 0.30,
        issue: 'Fuel consumption exceeds standard rates',
        severity: 'high',
        impact: 'Inefficient operation, maintenance needed',
      },
    ],
  },

  'monitoring-automation': {
    rules: [
      {
        id: 'low-uptime',
        name: 'Low System Uptime',
        condition: (data) => data.systemUptime && data.systemUptime < 0.95,
        issue: 'Monitoring system uptime below 95%',
        severity: 'medium',
        impact: 'Data gaps, inability to track performance',
      },
      {
        id: 'poor-data-quality',
        name: 'Poor Data Quality',
        condition: (data) => data.dataQuality && data.dataQuality < 0.90,
        issue: 'Data quality score below 90%',
        severity: 'high',
        impact: 'Unreliable analysis, missed opportunities',
      },
      {
        id: 'no-automation',
        name: 'No Optimization Controls',
        condition: (data) => !data.hasAutomation,
        issue: 'Manual operation without optimization',
        severity: 'high',
        impact: 'Missed savings opportunities, energy waste',
      },
    ],
  },
};

module.exports = {
  ENGINEERING_RULES,
};
