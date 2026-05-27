/**
 * Calculation Engine
 * Performs engineering calculations for energy, efficiency, ROI, and impact analysis
 */

class CalculationEngine {
  /**
   * Perform all calculations for given data and category
   */
  performCalculations(data, categoryId) {
    const calculations = {};

    switch (categoryId) {
      case 'cooling-systems':
        calculations.chpa = this.calculateChillerCOP(data);
        calculations.chillerEfficiency = this.calculateChillerEfficiency(data);
        calculations.flowOptimization = this.calculateFlowOptimization(data);
        break;

      case 'hvac-systems':
        calculations.deltaTValue = this.calculateDeltaT(data.supplyTemp, data.returnTemp);
        calculations.airflowOptimization = this.calculateAirflowOptimization(data);
        calculations.fanPowerSavings = this.calculateFanPowerSavings(data);
        break;

      case 'air-compressors':
        calculations.leakageEnergyCost = this.calculateLeakageEnergyCost(data);
        calculations.pressureOptimization = this.calculatePressureOptimization(data);
        calculations.specificPowerAnalysis = this.calculateSpecificPowerAnalysis(data);
        break;

      case 'production-machines':
        calculations.motorEfficiency = this.calculateMotorEfficiency(data);
        calculations.powerFactorCorrection = this.calculatePowerFactorCorrection(data);
        calculations.motorLoadAnalysis = this.calculateMotorLoadAnalysis(data);
        break;

      case 'electrical-systems':
        calculations.apparentPower = this.calculateApparentPower(data);
        calculations.reactivePowerCost = this.calculateReactivePowerCost(data);
        calculations.demandChargeAnalysis = this.calculateDemandChargeAnalysis(data);
        break;

      case 'lighting-systems':
        calculations.ledRetrofitSavings = this.calculateLedRetrofitSavings(data);
        calculations.controlOptimizationSavings = this.calculateControlOptimizationSavings(data);
        calculations.illuminanceAnalysis = this.calculateIlluminanceAnalysis(data);
        break;

      case 'pumps-motors':
        calculations.pumpEfficiency = this.calculatePumpEfficiency(data);
        calculations.flowOptimization = this.calculateFlowOptimization(data);
        calculations.motorLoadOptimization = this.calculateMotorLoadOptimization(data);
        break;

      case 'thermal-systems':
        calculations.heatRecoverySavings = this.calculateHeatRecoverySavings(data);
        calculations.insulationImpact = this.calculateInsulationImpact(data);
        calculations.thermalLosses = this.calculateThermalLosses(data);
        break;

      case 'renewable-energy':
        calculations.capacityFactor = this.calculateCapacityFactor(data);
        calculations.systemEfficiency = this.calculateSystemEfficiency(data);
        calculations.performanceDegradation = this.calculatePerformanceDegradation(data);
        break;

      case 'auxiliary-systems':
        calculations.generatorEfficiency = this.calculateGeneratorEfficiency(data);
        calculations.fuelConsumptionAnalysis = this.calculateFuelConsumptionAnalysis(data);
        calculations.runHourAnalysis = this.calculateRunHourAnalysis(data);
        break;

      case 'monitoring-automation':
        calculations.automationPotential = this.calculateAutomationPotential(data);
        calculations.dataQualityScore = this.calculateDataQualityScore(data);
        calculations.optimalSavings = this.calculateOptimalSavings(data);
        break;
    }

    return calculations;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cooling Systems Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculateChillerCOP(data) {
    // COP = Cooling Capacity / Power Input
    if (!data.coolingCapacity || !data.compressorPower) {
      return { value: null, unit: 'COP', formula: 'coolingCapacity / compressorPower' };
    }
    const cop = data.coolingCapacity / data.compressorPower;
    return { value: cop, unit: 'COP', formula: 'coolingCapacity / compressorPower' };
  }

  calculateChillerEfficiency(data) {
    // kW per ton metric
    if (!data.chillerPower || !data.coolingLoad) {
      return { value: null, unit: 'kW/ton', formula: 'chillerPower / (coolingLoad / 3.517)' };
    }
    const tons = data.coolingLoad / 3.517;
    const kwPerTon = data.chillerPower / tons;
    return { value: kwPerTon, unit: 'kW/ton', formula: 'chillerPower / tons' };
  }

  calculateFlowOptimization(data) {
    if (!data.flowRate || !data.designFlowRate) {
      return { value: null, unit: '%', formula: '(designFlowRate - flowRate) / designFlowRate * 100' };
    }
    const optimization = ((data.designFlowRate - data.flowRate) / data.designFlowRate) * 100;
    return {
      value: Math.max(0, optimization),
      unit: '%',
      formula: 'flow reduction percentage',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HVAC Systems Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculateDeltaT(supplyTemp, returnTemp) {
    if (supplyTemp === undefined || returnTemp === undefined) {
      return { value: null, unit: '°C', formula: 'returnTemp - supplyTemp' };
    }
    const deltaT = returnTemp - supplyTemp;
    return { value: Math.abs(deltaT), unit: '°C', formula: 'returnTemp - supplyTemp' };
  }

  calculateAirflowOptimization(data) {
    if (!data.actualAirflow || !data.designAirflow) {
      return {
        value: null,
        unit: '%',
        formula: '(designAirflow - actualAirflow) / designAirflow * 100',
      };
    }
    const optimization = ((data.designAirflow - data.actualAirflow) / data.designAirflow) * 100;
    return { value: Math.max(0, optimization), unit: '%', formula: 'airflow reduction potential' };
  }

  calculateFanPowerSavings(data) {
    // Assume cubic relationship: Power ∝ Flow³
    if (!data.currentFanPower || !data.optimizationPercentage) {
      return {
        value: null,
        unit: 'kW',
        formula: 'currentFanPower * (1 - (1 - optimizationPercentage/100)³)',
      };
    }
    const ratio = 1 - (data.optimizationPercentage / 100);
    const powerSavings = data.currentFanPower * (1 - ratio ** 3);
    return {
      value: powerSavings,
      unit: 'kW',
      formula: 'fan power savings from flow reduction',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Air Compressors Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculateLeakageEnergyCost(data) {
    if (!data.leakageRate || !data.compressorPower || !data.energyCost) {
      return {
        value: null,
        unit: '$/year',
        formula: 'leakageRate * compressorPower * 8760 * energyCost',
      };
    }
    const annualLeakageCost = data.leakageRate * data.compressorPower * 8760 * (data.energyCost / 1000);
    return {
      value: annualLeakageCost,
      unit: '$/year',
      formula: 'leakage cost from power loss',
    };
  }

  calculatePressureOptimization(data) {
    if (!data.systemPressure || !data.optimalPressure) {
      return {
        value: null,
        unit: 'kW',
        formula: '(systemPressure - optimalPressure) * pressureEnergyFactor',
      };
    }
    const pressureDiff = data.systemPressure - data.optimalPressure;
    const powerSavings = pressureDiff * 0.05; // ~5% power per bar above optimal
    return {
      value: Math.max(0, powerSavings),
      unit: 'kW',
      formula: 'power savings from pressure optimization',
    };
  }

  calculateSpecificPowerAnalysis(data) {
    if (!data.compressorPower || !data.airflow) {
      return { value: null, unit: 'kW/(m³/min)', formula: 'compressorPower / airflow' };
    }
    const specificPower = data.compressorPower / (data.airflow / 60); // convert m³/h to m³/min
    return {
      value: specificPower,
      unit: 'kW/(m³/min)',
      formula: 'power per unit of compressed air',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Production Machines Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculateMotorEfficiency(data) {
    if (!data.motorOutputPower || !data.motorInputPower) {
      return {
        value: null,
        unit: '%',
        formula: '(motorOutputPower / motorInputPower) * 100',
      };
    }
    const efficiency = (data.motorOutputPower / data.motorInputPower) * 100;
    return { value: efficiency, unit: '%', formula: 'output power / input power' };
  }

  calculatePowerFactorCorrection(data) {
    if (!data.powerFactor || !data.realPower) {
      return {
        value: null,
        unit: 'kVAR',
        formula: 'realPower * (sqrt(1/PF² - 1)) - correctedVAR',
      };
    }
    const currentReactivePower = data.realPower * Math.sqrt(1 / (data.powerFactor ** 2) - 1);
    const correctionNeeded = currentReactivePower - (data.realPower * 0.33); // target PF 0.95
    return {
      value: Math.max(0, correctionNeeded),
      unit: 'kVAR',
      formula: 'reactive power correction needed',
    };
  }

  calculateMotorLoadAnalysis(data) {
    if (!data.motorLoad || !data.motorRatedPower) {
      return { value: null, unit: 'kW', formula: 'motorLoad * motorRatedPower' };
    }
    const actualLoad = data.motorLoad * data.motorRatedPower;
    return {
      value: actualLoad,
      unit: 'kW',
      formula: 'actual motor load',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Electrical Systems Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculateApparentPower(data) {
    if (!data.realPower || !data.powerFactor) {
      return { value: null, unit: 'kVA', formula: 'realPower / powerFactor' };
    }
    const apparentPower = data.realPower / data.powerFactor;
    return {
      value: apparentPower,
      unit: 'kVA',
      formula: 'real power / power factor',
    };
  }

  calculateReactivePowerCost(data) {
    if (!data.reactivePower || !data.energyCost || !data.penaltyRate) {
      return {
        value: null,
        unit: '$/year',
        formula: 'reactivePower * 8760 * energyCost * penaltyRate',
      };
    }
    const reactiveCost = (data.reactivePower * 8760 * (data.energyCost / 1000) * data.penaltyRate) / 100;
    return {
      value: reactiveCost,
      unit: '$/year',
      formula: 'reactive power cost with utility penalty',
    };
  }

  calculateDemandChargeAnalysis(data) {
    if (!data.peakDemand || !data.avgDemand || !data.demandChargeRate) {
      return {
        value: null,
        unit: '$/month',
        formula: 'peakDemand * demandChargeRate',
      };
    }
    const excessDemandCost = (data.peakDemand - data.avgDemand) * data.demandChargeRate;
    return {
      value: excessDemandCost,
      unit: '$/month',
      formula: 'excess demand charge cost',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lighting Systems Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculateLedRetrofitSavings(data) {
    if (!data.currentLightingPower || !data.ledLightingPower) {
      return {
        value: null,
        unit: 'kW',
        formula: 'currentLightingPower - ledLightingPower',
      };
    }
    const powerSavings = data.currentLightingPower - data.ledLightingPower;
    return {
      value: powerSavings,
      unit: 'kW',
      formula: 'power savings from LED retrofit',
    };
  }

  calculateControlOptimizationSavings(data) {
    if (!data.currentLightingPower || !data.occupancyFactor) {
      return {
        value: null,
        unit: 'kWh/year',
        formula: 'currentLightingPower * 8760 * (1 - occupancyFactor)',
      };
    }
    const savings = data.currentLightingPower * 8760 * (1 - data.occupancyFactor);
    return {
      value: savings,
      unit: 'kWh/year',
      formula: 'annual savings from lighting controls',
    };
  }

  calculateIlluminanceAnalysis(data) {
    if (!data.luxLevel || !data.targetLux) {
      return { value: null, unit: '%', formula: '(luxLevel - targetLux) / targetLux * 100' };
    }
    const excess = ((data.luxLevel - data.targetLux) / data.targetLux) * 100;
    return {
      value: Math.max(0, excess),
      unit: '%',
      formula: 'over-illumination percentage',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Pumps & Motors Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculatePumpEfficiency(data) {
    if (!data.hydraulicPower || !data.pumpInputPower) {
      return {
        value: null,
        unit: '%',
        formula: '(hydraulicPower / pumpInputPower) * 100',
      };
    }
    const efficiency = (data.hydraulicPower / data.pumpInputPower) * 100;
    return { value: efficiency, unit: '%', formula: 'pump mechanical efficiency' };
  }

  calculateMotorLoadOptimization(data) {
    if (!data.motorLoad || !data.optimalLoad) {
      return {
        value: null,
        unit: '%',
        formula: '(motorLoad - optimalLoad) / optimalLoad * 100',
      };
    }
    const deviation = ((data.motorLoad - data.optimalLoad) / data.optimalLoad) * 100;
    return {
      value: Math.abs(deviation),
      unit: '%',
      formula: 'motor load deviation from optimal',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Thermal Systems Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculateHeatRecoverySavings(data) {
    if (!data.exhaustTemp || !data.flowRate || !data.cp || !data.utilityRate) {
      return {
        value: null,
        unit: '$/year',
        formula: 'flowRate * cp * exhaustTemp * 8760 * utilityRate / 3600',
      };
    }
    const heatAvailable = (data.flowRate * data.cp * data.exhaustTemp * 8760) / 3600;
    const savings = heatAvailable * (data.utilityRate / 1000000); // Convert to currency
    return {
      value: savings,
      unit: '$/year',
      formula: 'waste heat recovery value',
    };
  }

  calculateInsulationImpact(data) {
    if (!data.currentInsulationValue || !data.optimalInsulationValue) {
      return {
        value: null,
        unit: '%',
        formula: '(currentInsulationValue - optimalInsulationValue) / optimalInsulationValue * 100',
      };
    }
    const impact = ((data.currentInsulationValue - data.optimalInsulationValue) /
      data.optimalInsulationValue) * 100;
    return {
      value: Math.max(0, impact),
      unit: '%',
      formula: 'insulation efficiency gap',
    };
  }

  calculateThermalLosses(data) {
    if (!data.surfaceArea || !data.uValue || !data.deltaT) {
      return {
        value: null,
        unit: 'W',
        formula: 'surfaceArea * uValue * deltaT',
      };
    }
    const thermalLosses = data.surfaceArea * data.uValue * Math.abs(data.deltaT);
    return {
      value: thermalLosses,
      unit: 'W',
      formula: 'thermal heat loss rate',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Renewable Energy Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculateCapacityFactor(data) {
    if (!data.actualGeneration || !data.theoreticalMaxGeneration) {
      return {
        value: null,
        unit: '%',
        formula: '(actualGeneration / theoreticalMaxGeneration) * 100',
      };
    }
    const cf = (data.actualGeneration / data.theoreticalMaxGeneration) * 100;
    return { value: cf, unit: '%', formula: 'actual / theoretical generation' };
  }

  calculateSystemEfficiency(data) {
    if (!data.generatorOutput || !data.systemInput) {
      return {
        value: null,
        unit: '%',
        formula: '(generatorOutput / systemInput) * 100',
      };
    }
    const efficiency = (data.generatorOutput / data.systemInput) * 100;
    return { value: efficiency, unit: '%', formula: 'system efficiency rating' };
  }

  calculatePerformanceDegradation(data) {
    if (!data.currentOutput || !data.ratedOutput) {
      return {
        value: null,
        unit: '%',
        formula: '(ratedOutput - currentOutput) / ratedOutput * 100',
      };
    }
    const degradation = ((data.ratedOutput - data.currentOutput) / data.ratedOutput) * 100;
    return {
      value: Math.max(0, degradation),
      unit: '%',
      formula: 'system performance degradation',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Auxiliary Systems Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculateGeneratorEfficiency(data) {
    if (!data.generatorOutput || !data.fuelInput) {
      return {
        value: null,
        unit: '%',
        formula: '(generatorOutput / fuelInput) * 100',
      };
    }
    const efficiency = (data.generatorOutput / data.fuelInput) * 100;
    return { value: efficiency, unit: '%', formula: 'generator efficiency' };
  }

  calculateFuelConsumptionAnalysis(data) {
    if (!data.fuelConsumption || !data.generatorKw) {
      return {
        value: null,
        unit: 'L/kWh',
        formula: 'fuelConsumption / (generatorKw * runHours)',
      };
    }
    const specificFuelConsumption = data.fuelConsumption / data.generatorKw;
    return {
      value: specificFuelConsumption,
      unit: 'L/kWh',
      formula: 'fuel consumption per unit output',
    };
  }

  calculateRunHourAnalysis(data) {
    if (!data.annualRunHours || !data.utilizationFactor) {
      return {
        value: null,
        unit: 'hours',
        formula: 'annualRunHours * utilizationFactor',
      };
    }
    const utilizationHours = data.annualRunHours * data.utilizationFactor;
    return {
      value: utilizationHours,
      unit: 'hours',
      formula: 'effective equipment utilization hours',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Monitoring & Automation Calculations
  // ──────────────────────────────────────────────────────────────────────────

  calculateAutomationPotential(data) {
    if (!data.currentSystemPower || !data.automationEfficiency) {
      return {
        value: null,
        unit: '%',
        formula: 'currentSystemPower * automationEfficiency',
      };
    }
    const potential = (data.currentSystemPower * data.automationEfficiency) / 100;
    return {
      value: potential,
      unit: '%',
      formula: 'achievable savings through automation',
    };
  }

  calculateDataQualityScore(data) {
    if (!data.validDataPoints || !data.totalDataPoints) {
      return {
        value: null,
        unit: '%',
        formula: '(validDataPoints / totalDataPoints) * 100',
      };
    }
    const score = (data.validDataPoints / data.totalDataPoints) * 100;
    return {
      value: score,
      unit: '%',
      formula: 'data quality percentage',
    };
  }

  calculateOptimalSavings(data) {
    if (!data.currentConsumption || !data.optimizationLevel) {
      return {
        value: null,
        unit: 'kWh/year',
        formula: 'currentConsumption * 8760 * optimizationLevel',
      };
    }
    const savings = data.currentConsumption * 8760 * (data.optimizationLevel / 100);
    return {
      value: savings,
      unit: 'kWh/year',
      formula: 'annual savings potential',
    };
  }

  /**
   * Generic energy savings calculation
   */
  calculateEnergySavings(baselineEnergy, optimizedEnergy, energyCost) {
    if (baselineEnergy === undefined || optimizedEnergy === undefined) {
      return { value: null, unit: 'kWh/year', formula: 'baselineEnergy - optimizedEnergy' };
    }
    const savings = baselineEnergy - optimizedEnergy;
    return {
      value: Math.max(0, savings),
      unit: 'kWh/year',
      formula: 'energy savings from optimization',
      annualCost: Math.max(0, savings) * (energyCost || 0.10),
    };
  }

  /**
   * Generic ROI calculation
   */
  calculateROI(investment, annualSavings, paybackYears = 5) {
    if (!investment || !annualSavings) {
      return {
        value: null,
        unit: '%',
        formula: '(annualSavings * paybackYears / investment) * 100',
      };
    }
    const roi = ((annualSavings * paybackYears) / investment) * 100;
    return {
      value: roi,
      unit: '%',
      formula: 'return on investment',
    };
  }
}

module.exports = CalculationEngine;
