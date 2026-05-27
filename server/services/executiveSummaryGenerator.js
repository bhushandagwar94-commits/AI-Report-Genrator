/**
 * Executive Summary Generator
 * Creates category-wide executive summaries and strategic recommendations
 */

class ExecutiveSummaryGenerator {
  /**
   * Generate complete executive summary
   */
  async generateExecutiveSummary(theory, observations, calculations) {
    return {
      timestamp: Date.now(),
      categoryName: theory.categoryName || 'Unknown System',
      sections: {
        overview: this.generateOverview(theory, observations),
        keyFindings: this.generateKeyFindings(observations),
        opportunities: this.generateOpportunitySummary(observations),
        financialSummary: this.generateFinancialSummary(observations),
        recommendations: this.generateStrategicRecommendations(observations),
      },
    };
  }

  /**
   * Generate overview section
   */
  generateOverview(theory, observations) {
    const criticalIssues = observations.criticalFindings?.length || 0;
    const quickWins = observations.quickWins?.length || 0;

    return {
      title: 'Executive Summary',
      content: `A comprehensive analysis of the ${theory.categoryName} system was conducted to identify energy efficiency opportunities and operational improvements. The assessment identified ${criticalIssues} critical issues and ${quickWins} quick-win optimization projects with strong financial returns.`,
      status: criticalIssues > 0 ? 'Action Required' : 'Moderate Attention',
      urgency: criticalIssues > 0 ? 'High' : criticalIssues > 2 ? 'Medium' : 'Low',
    };
  }

  /**
   * Generate key findings
   */
  generateKeyFindings(observations) {
    const findings = [];

    // Critical findings
    for (const finding of (observations.criticalFindings || []).slice(0, 3)) {
      findings.push({
        type: 'critical',
        description: finding.description,
        severity: 'High',
      });
    }

    // Efficiency gaps
    for (const opp of (observations.operationalOpportunities || []).slice(0, 3)) {
      findings.push({
        type: 'opportunity',
        description: `${opp.metricName} operating below industry benchmark`,
        potentialGain: opp.improvementPotential,
      });
    }

    return {
      title: 'Key Findings',
      findings: findings.slice(0, 5),
      summary: `Analysis revealed ${findings.length} significant findings requiring management attention.`,
    };
  }

  /**
   * Generate opportunity summary
   */
  generateOpportunitySummary(observations) {
    const quickWins = observations.quickWins || [];
    const highROI = observations.highROIProjects || [];

    return {
      title: 'Opportunities Summary',
      quickWinsCount: quickWins.length,
      highROICount: highROI.length,
      totalOpportunities: observations.operationalOpportunities?.length || 0,
      topQuickWins: quickWins.slice(0, 3).map((qw) => ({
        name: qw.projectType,
        payback: qw.paybackPeriod,
        savings: qw.annualSavings,
      })),
      topHighROI: highROI.slice(0, 2).map((proj) => ({
        name: proj.projectType,
        roi: proj.roi,
      })),
    };
  }

  /**
   * Generate financial summary
   */
  generateFinancialSummary(observations) {
    let totalInvestment = 0;
    let totalAnnualSavings = 0;

    for (const qw of observations.quickWins || []) {
      const investMatch = qw.estimatedInvestment.match(/\$?([\d,]+)/);
      if (investMatch) {
        totalInvestment += parseInt(investMatch[1].replace(/,/g, ''));
      }

      const savingsMatch = qw.annualSavings.match(/\$?([\d,]+)/);
      if (savingsMatch) {
        totalAnnualSavings += parseInt(savingsMatch[1].replace(/,/g, ''));
      }
    }

    const paybackYears = totalInvestment > 0 ? (totalInvestment / totalAnnualSavings).toFixed(1) : '∞';
    const roi = totalInvestment > 0 ? (((totalAnnualSavings * 5) / totalInvestment) * 100).toFixed(0) : 0;

    return {
      title: 'Financial Summary',
      totalInvestmentRequired: `$${totalInvestment.toLocaleString()}`,
      annualSavings: `$${totalAnnualSavings.toLocaleString()}`,
      paybackPeriod: `${paybackYears} years`,
      fiveYearROI: `${roi}%`,
      fiveYearNetBenefit: `$${(totalAnnualSavings * 5 - totalInvestment).toLocaleString()}`,
    };
  }

  /**
   * Generate strategic recommendations
   */
  generateStrategicRecommendations(observations) {
    const recommendations = {
      title: 'Strategic Recommendations',
      immediate: [],
      shortTerm: [],
      longTerm: [],
    };

    // Immediate: Address critical issues
    for (const finding of observations.criticalFindings?.slice(0, 2) || []) {
      recommendations.immediate.push({
        action: `Address critical issue: ${finding.description.substring(0, 50)}...`,
        rationale: 'Prevents equipment failure and operational disruption',
        timeline: '0-3 months',
        priority: 'Critical',
      });
    }

    // Short-term: Quick wins
    for (const qw of observations.quickWins?.slice(0, 2) || []) {
      recommendations.shortTerm.push({
        action: qw.projectType,
        rationale: `Strong ROI with payback period of ${qw.paybackPeriod}`,
        timeline: '3-12 months',
        priority: 'High',
      });
    }

    // Long-term: High ROI projects
    for (const proj of observations.highROIProjects?.slice(0, 2) || []) {
      recommendations.longTerm.push({
        action: proj.projectType,
        rationale: `High ROI opportunity with ${proj.roi} return`,
        timeline: '1-3 years',
        priority: 'Medium',
      });
    }

    return recommendations;
  }

  /**
   * Prioritize implementation
   */
  prioritizeImplementation(opportunities) {
    const prioritized = [];

    // Categorize by priority
    const critical = opportunities.filter((o) => o.severity === 'critical');
    const highValue = opportunities.filter((o) => o.priority === 'high');
    const standard = opportunities.filter((o) => !o.severity && o.priority !== 'high');

    prioritized.push(...critical);
    prioritized.push(...highValue);
    prioritized.push(...standard);

    return {
      prioritized: prioritized.slice(0, 10),
      implementationPhases: [
        {
          phase: 1,
          timeline: '0-3 months',
          projects: critical.slice(0, 2),
        },
        {
          phase: 2,
          timeline: '3-6 months',
          projects: highValue.slice(0, 2),
        },
        {
          phase: 3,
          timeline: '6-12 months',
          projects: standard.slice(0, 3),
        },
      ],
    };
  }
}

module.exports = ExecutiveSummaryGenerator;
