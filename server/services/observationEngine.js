/**
 * Observation & Insight Engine
 * Extracts actionable observations and insights from validated data and calculations
 */

class ObservationEngine {
  /**
   * Generate observations from data, rules, calculations, and benchmarks
   */
  generateObservations(industrialData, ruleResults, calculations, benchmarkResults) {
    const observations = {
      timestamp: Date.now(),
      systemIssues: [],
      efficiencyObservations: [],
      operationalOpportunities: [],
      quickWins: [],
      highROIProjects: [],
      criticalFindings: [],
    };

    // Extract observations from rules
    if (ruleResults && ruleResults.issues) {
      for (const issue of ruleResults.issues) {
        observations.systemIssues.push({
          source: 'engineering-rule',
          ruleId: issue.ruleId,
          severity: issue.severity,
          description: issue.description,
          impact: issue.operationalImpact,
          category: issue.category,
        });

        if (issue.severity === 'high') {
          observations.criticalFindings.push(issue);
        }
      }
    }

    // Extract efficiency observations from calculations
    if (calculations) {
      observations.efficiencyObservations = this.extractEfficiencyObservations(
        calculations,
        industrialData
      );
    }

    // Extract operational opportunities
    if (benchmarkResults && benchmarkResults.comparisons) {
      observations.operationalOpportunities = this.extractOperationalOpportunities(
        benchmarkResults
      );
    }

    // Identify quick wins
    observations.quickWins = this.identifyQuickWins(observations.systemIssues, calculations);

    // Identify high ROI projects
    observations.highROIProjects = this.identifyHighROIProjects(observations.systemIssues, calculations);

    return observations;
  }

  /**
   * Extract efficiency observations from calculations
   */
  extractEfficiencyObservations(calculations, data) {
    const observations = [];

    for (const [calcName, calcResult] of Object.entries(calculations)) {
      if (!calcResult || !calcResult.value) continue;

      // Create observation based on calculation
      if (calcResult.value !== 0 && calcResult.value !== null) {
        observations.push({
          metricId: calcName,
          metricName: this.humanize(calcName),
          value: calcResult.value,
          unit: calcResult.unit,
          formula: calcResult.formula,
          observation: this.generateCalculationObservation(calcName, calcResult.value, data),
        });
      }
    }

    return observations;
  }

  /**
   * Generate human-readable observation from calculation
   */
  generateCalculationObservation(metricId, value, data) {
    const observations = {
      'leakageEnergyCost': `Annual cost from compressed air leakage: $${Math.round(value)}. Sealing leaks could recover this value.`,
      'fanPowerSavings': `Potential fan power savings: ${Math.round(value)} kW through flow optimization.`,
      'pumpEfficiency': `Current pump efficiency is ${Math.round(value)}%. Operating at suboptimal point.`,
      'ledRetrofitSavings': `LED retrofit could save ${Math.round(value)} kW in lighting power.`,
      'thermalLosses': `Thermal losses: ${Math.round(value)} W. Insulation improvement recommended.`,
      'heatRecoverySavings': `Potential waste heat recovery value: $${Math.round(value)}/year.`,
      'reactivePowerCost': `Annual reactive power penalty cost: $${Math.round(value)}.`,
      'demandChargeAnalysis': `Excess demand charges: $${Math.round(value)}/month from peak demand.`,
    };

    return observations[metricId] || `Calculated value: ${value} ${data?.unit || ''}`;
  }

  /**
   * Extract operational opportunities from benchmark results
   */
  extractOperationalOpportunities(benchmarkResults) {
    const opportunities = [];

    for (const comparison of benchmarkResults.comparisons) {
      if (comparison.status !== 'excellent' && comparison.status !== 'good') {
        opportunities.push({
          metricId: comparison.metricId,
          metricName: comparison.metricName,
          currentValue: comparison.systemValue,
          targetValue:
            comparison.status === 'fair'
              ? comparison.benchmarkRanges.good.max
              : comparison.benchmarkRanges.excellent.max,
          benchmarkRange: comparison.benchmarkRanges.excellent,
          status: comparison.status,
          improvementPotential: Math.abs(
            comparison.systemValue - comparison.benchmarkRanges.excellent.max
          ),
          recommendation: comparison.recommendation,
        });
      }
    }

    return opportunities.sort((a, b) => b.improvementPotential - a.improvementPotential);
  }

  /**
   * Identify quick-win projects (low investment, immediate payback)
   */
  identifyQuickWins(systemIssues, calculations) {
    const quickWins = [];

    // Filter for quick-win characteristics
    for (const issue of systemIssues) {
      // Leak detection and sealing = quick win
      if (issue.description && issue.description.includes('leak')) {
        quickWins.push({
          projectType: 'Leak Detection & Sealing',
          issue: issue.description,
          severity: issue.severity,
          estimatedInvestment: 'Low ($1,000-$10,000)',
          paybackPeriod: '< 6 months',
          annualSavings: 'Medium ($5,000-$50,000)',
          confidence: 'High',
        });
      }

      // Filter clogging = quick win
      if (issue.description && issue.description.includes('clogging')) {
        quickWins.push({
          projectType: 'Filter Maintenance',
          issue: issue.description,
          severity: issue.severity,
          estimatedInvestment: 'Very Low (< $1,000)',
          paybackPeriod: '< 3 months',
          annualSavings: 'Low-Medium ($2,000-$20,000)',
          confidence: 'High',
        });
      }

      // Pressure optimization = quick win
      if (issue.description && issue.description.includes('pressure')) {
        quickWins.push({
          projectType: 'Pressure Optimization',
          issue: issue.description,
          severity: issue.severity,
          estimatedInvestment: 'Low ($5,000-$20,000)',
          paybackPeriod: '< 12 months',
          annualSavings: 'Medium ($10,000-$40,000)',
          confidence: 'High',
        });
      }

      // Lighting controls = quick win
      if (issue.description && issue.description.includes('control')) {
        quickWins.push({
          projectType: 'Lighting Controls Installation',
          issue: issue.description,
          severity: issue.severity,
          estimatedInvestment: 'Low ($10,000-$50,000)',
          paybackPeriod: '1-2 years',
          annualSavings: 'High ($30,000-$100,000)',
          confidence: 'High',
        });
      }
    }

    return quickWins.slice(0, 5); // Top 5 quick wins
  }

  /**
   * Identify high ROI projects
   */
  identifyHighROIProjects(systemIssues, calculations) {
    const projects = [];

    // Check for high-savings opportunities
    for (const issue of systemIssues) {
      if (issue.severity === 'high') {
        // High ROI for critical issues
        projects.push({
          projectType: `Fix: ${issue.category}`,
          issue: issue.description,
          severity: issue.severity,
          estimatedInvestment: 'Medium ($50,000-$200,000)',
          annualSavings: 'High ($50,000-$200,000)',
          roi: '50-300%',
          paybackPeriod: '0.5-2 years',
          confidence: 'Medium',
        });
      }
    }

    return projects.slice(0, 5); // Top 5 high ROI projects
  }

  /**
   * Identify critical systems needing attention
   */
  identifyCriticalSystems(observations) {
    const critical = [];

    for (const issue of observations.systemIssues) {
      if (issue.severity === 'high') {
        critical.push(issue);
      }
    }

    for (const finding of observations.criticalFindings) {
      if (!critical.find((c) => c.ruleId === finding.ruleId)) {
        critical.push({
          source: 'critical-finding',
          ruleId: finding.ruleId,
          severity: 'high',
          description: finding.description,
        });
      }
    }

    return critical;
  }

  /**
   * Identify undersized or oversized equipment
   */
  identifyUndersizingSystems(observations, calculations) {
    const undersized = [];

    for (const opp of observations.operationalOpportunities) {
      if (opp.metricId.includes('load') && opp.currentValue < 50) {
        undersized.push({
          type: 'undersized-motor',
          equipmentType: opp.metricName,
          currentLoad: opp.currentValue,
          recommendation: 'Consider smaller capacity or two-speed motor',
        });
      }
    }

    return undersized;
  }

  /**
   * Identify high energy losses
   */
  identifyHighEnergyLosses(observations) {
    const losses = [];

    for (const eff of observations.efficiencyObservations) {
      if (eff.unit === 'kW' && eff.value > 10) {
        losses.push({
          source: eff.metricId,
          lossValue: eff.value,
          lossUnit: 'kW',
          description: eff.observation,
          savingsPotential: `${Math.round(eff.value * 8760 / 1000)} MWh/year`,
        });
      }
    }

    return losses.sort((a, b) => b.lossValue - a.lossValue);
  }

  /**
   * Rank opportunities by business impact
   */
  rankOpportunitiesByImpact(observations, calculations) {
    const ranked = [];

    // Convert observations to impact scores
    for (const opp of observations.operationalOpportunities) {
      ranked.push({
        id: opp.metricId,
        name: opp.metricName,
        type: 'efficiency-gap',
        currentState: opp.currentValue,
        targetState: opp.targetValue,
        impactScore: Math.abs(opp.currentValue - opp.targetValue) * 10,
        priority: opp.improvementPotential > 50 ? 'high' : 'medium',
      });
    }

    return ranked.sort((a, b) => b.impactScore - a.impactScore);
  }

  /**
   * Calculate business impact of recommendations
   */
  calculateBusinessImpact(observation, calculations = {}) {
    let energySavings = 0;
    let costSavings = 0;
    let paybackMonths = 0;

    // Estimate based on observation type
    if (observation.includes('leak')) {
      energySavings = 50; // kW
      costSavings = 50000; // Annual
      paybackMonths = 3;
    } else if (observation.includes('LED')) {
      energySavings = 30; // kW
      costSavings = 30000; // Annual
      paybackMonths = 12;
    } else if (observation.includes('pressure')) {
      energySavings = 40; // kW
      costSavings = 40000; // Annual
      paybackMonths = 6;
    }

    return {
      energySavingsKW: energySavings,
      energySavingsMWh: Math.round((energySavings * 8760) / 1000),
      annualCostSavings: costSavings,
      estimatedInvestment: costSavings * 0.5,
      paybackPeriodMonths: paybackMonths,
      roi: Math.round(((costSavings - costSavings * 0.5) / (costSavings * 0.5)) * 100),
      carbonReductionTonnes: Math.round((energySavings * 8760) / 1000 * 0.5),
    };
  }

  /**
   * Generate operational impact statement
   */
  generateOperationalImpactStatement(observations) {
    let statement = 'Current system operations present ';

    const criticalCount = observations.criticalFindings.length;
    const issueCount = observations.systemIssues.length;
    const opportunityCount = observations.operationalOpportunities.length;

    if (criticalCount > 0) {
      statement += `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''}, `;
    }

    statement += `${issueCount} operational issue${issueCount > 1 ? 's' : ''}, and `;
    statement += `${opportunityCount} optimization opportunit${opportunityCount > 1 ? 'ies' : 'y'}. `;
    statement += `Top priority should focus on critical findings to avoid equipment failure and operational disruption.`;

    return statement;
  }

  /**
   * Humanize metric names
   */
  humanize(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }
}

module.exports = ObservationEngine;
