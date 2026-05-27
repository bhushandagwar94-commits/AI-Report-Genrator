/**
 * Engineering Rule Engine
 * Applies category-specific engineering rules to identify issues and opportunities
 */

const { ENGINEERING_RULES } = require('./engineeringRulesData');

class EngineeringRuleEngine {
  constructor() {
    this.rules = ENGINEERING_RULES;
  }

  /**
   * Evaluate all rules for a category against data
   */
  evaluateRules(categoryId, data) {
    const categoryRules = this.rules[categoryId];
    if (!categoryRules) {
      return {
        categoryId,
        rules: [],
        issues: [],
        evaluatedAt: Date.now(),
      };
    }

    const triggeredRules = [];
    const issues = [];

    for (const rule of categoryRules.rules) {
      try {
        const triggered = rule.condition(data);

        if (triggered) {
          triggeredRules.push({
            id: rule.id,
            name: rule.name,
            severity: rule.severity,
            issue: rule.issue,
            impact: rule.impact,
            triggeredAt: Date.now(),
          });

          issues.push({
            ruleId: rule.id,
            category: rule.name,
            severity: rule.severity,
            description: rule.issue,
            operationalImpact: rule.impact,
          });
        }
      } catch (e) {
        // Rule evaluation failed - log but don't crash
        issues.push({
          ruleId: rule.id,
          category: rule.name,
          severity: 'error',
          description: `Rule evaluation failed: ${e.message}`,
        });
      }
    }

    return {
      categoryId,
      totalRules: categoryRules.rules.length,
      triggeredRules: triggeredRules.length,
      rules: triggeredRules,
      issues,
      evaluatedAt: Date.now(),
    };
  }

  /**
   * Get critical issues (high severity)
   */
  getCriticalIssues(ruleResults) {
    return (ruleResults.issues || []).filter((issue) => issue.severity === 'high');
  }

  /**
   * Get all issues ranked by severity
   */
  getIssuesRankedBySeverity(ruleResults) {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return (ruleResults.issues || []).sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
  }

  /**
   * Check if data meets benchmark rule
   */
  benchmarkRuleCheck(metric, value, benchmarkReference) {
    if (!benchmarkReference) {
      return { passed: null, message: 'No benchmark reference provided' };
    }

    const excellent = benchmarkReference.excellent;
    if (value >= excellent.min && value <= excellent.max) {
      return { passed: true, level: 'excellent' };
    }

    const good = benchmarkReference.good;
    if (value >= good.min && value <= good.max) {
      return { passed: true, level: 'good' };
    }

    const fair = benchmarkReference.fair;
    if (value >= fair.min && value <= fair.max) {
      return { passed: false, level: 'fair' };
    }

    return { passed: false, level: 'poor' };
  }
}

module.exports = EngineeringRuleEngine;
