/**
 * Benchmark Engine
 * Loads industry benchmarks and performs benchmark comparisons
 */

const { INDUSTRY_BENCHMARKS, getBenchmarkStatus, getBenchmarkScore } = require('./benchmarkData');

class BenchmarkEngine {
  constructor() {
    this.benchmarks = INDUSTRY_BENCHMARKS;
  }

  /**
   * Compare system metrics to industry benchmarks
   */
  compareToBenchmarks(data, categoryId) {
    const categoryBenchmarks = this.benchmarks[categoryId];
    if (!categoryBenchmarks) {
      return {
        categoryId,
        benchmarks: [],
        comparisons: [],
        overallRating: 'unknown',
      };
    }

    const comparisons = [];

    for (const [metricId, benchmark] of Object.entries(categoryBenchmarks.benchmarks)) {
      // Find corresponding value in data
      const value = this.findMetricValue(data, metricId, categoryId);

      if (value !== null && value !== undefined) {
        const status = getBenchmarkStatus(benchmark, value);
        const score = getBenchmarkScore(status);

        comparisons.push({
          metricId,
          metricName: benchmark.metric,
          systemValue: value,
          unit: benchmark.unit,
          benchmarkRanges: {
            excellent: benchmark.excellent,
            good: benchmark.good,
            fair: benchmark.fair,
            poor: benchmark.poor,
          },
          status,
          score,
          recommendation: this.getRecommendation(status, benchmark, value),
        });
      }
    }

    const overallScore = comparisons.length > 0
      ? comparisons.reduce((sum, c) => sum + c.score, 0) / comparisons.length
      : 0;
    const overallRating = this.getOverallRating(overallScore);

    return {
      categoryId,
      categoryName: categoryBenchmarks.name,
      comparisons,
      overallScore: Math.round(overallScore * 10) / 10,
      overallRating,
      evaluatedAt: Date.now(),
    };
  }

  /**
   * Find metric value from data using common naming patterns
   */
  findMetricValue(data, metricId, categoryId) {
    // Direct match
    if (metricId in data) {
      return data[metricId];
    }

    // Common alias patterns
    const aliases = {
      'delta-t': ['deltaT', 'deltaTValue', 'tempDifferential'],
      'chiller-efficiency': ['chillerEfficiency', 'kWPerTon'],
      'flow-rate': ['flowRate', 'actualFlow'],
      'leakage-rate': ['leakageRate', 'leakagePercent'],
      'system-pressure': ['systemPressure', 'pressureSetting'],
      'power-factor': ['powerFactor', 'pf'],
      'reactive-power': ['reactivePower', 'kVAR'],
      'lux-level': ['luxLevel', 'illumination'],
      'motor-load': ['motorLoad', 'loadFactor'],
      'pump-efficiency': ['pumpEfficiency', 'hydraulicEfficiency'],
      'capacity-factor': ['capacityFactor', 'cfValue'],
      'generator-efficiency': ['generatorEfficiency', 'genEfficiency'],
      'system-uptime': ['systemUptime', 'uptimePercent'],
      'data-quality': ['dataQuality', 'qualityScore'],
    };

    if (metricId in aliases) {
      for (const alias of aliases[metricId]) {
        if (alias in data) {
          return data[alias];
        }
      }
    }

    return null;
  }

  /**
   * Get recommendation based on benchmark status
   */
  getRecommendation(status, benchmark, value) {
    if (status === 'excellent') {
      return `System performing at excellent level (${value} ${benchmark.unit}). Maintain current operation.`;
    }
    if (status === 'good') {
      return `System performing at good level. Consider minor optimizations.`;
    }
    if (status === 'fair') {
      return `System performance below industry standard. Optimization recommended.`;
    }
    return `System significantly underperforming. Immediate action required. (${value} vs. target ${benchmark.excellent.max})`;
  }

  /**
   * Get overall rating based on combined score
   */
  getOverallRating(score) {
    if (score >= 3.75) return 'Excellent';
    if (score >= 3.0) return 'Good';
    if (score >= 2.0) return 'Fair';
    return 'Poor';
  }

  /**
   * Identify performance gaps
   */
  identifyGaps(comparisons) {
    const gaps = [];

    for (const comparison of comparisons) {
      if (comparison.status !== 'excellent' && comparison.status !== 'good') {
        const excellence = comparison.benchmarkRanges.excellent;
        let gap;

        if (comparison.systemValue > excellence.max) {
          gap = comparison.systemValue - excellence.max;
          gaps.push({
            metricId: comparison.metricId,
            metricName: comparison.metricName,
            gap: Math.round(gap * 100) / 100,
            direction: 'above',
            improvementTarget: excellence.max,
            currentValue: comparison.systemValue,
            percentageGap: Math.round(((comparison.systemValue - excellence.max) / excellence.max) * 100),
          });
        } else if (comparison.systemValue < excellence.min) {
          gap = excellence.min - comparison.systemValue;
          gaps.push({
            metricId: comparison.metricId,
            metricName: comparison.metricName,
            gap: Math.round(gap * 100) / 100,
            direction: 'below',
            improvementTarget: excellence.min,
            currentValue: comparison.systemValue,
            percentageGap: Math.round(((excellence.min - comparison.systemValue) / excellence.min) * 100),
          });
        }
      }
    }

    return gaps.sort((a, b) => Math.abs(b.percentageGap) - Math.abs(a.percentageGap));
  }

  /**
   * Generate benchmark report
   */
  generateBenchmarkReport(benchmarkResults) {
    const report = {
      timestamp: Date.now(),
      categoryId: benchmarkResults.categoryId,
      categoryName: benchmarkResults.categoryName,
      overallPerformance: {
        rating: benchmarkResults.overallRating,
        score: benchmarkResults.overallScore,
        distribution: this.getDistribution(benchmarkResults.comparisons),
      },
      excellentMetrics: benchmarkResults.comparisons.filter((c) => c.status === 'excellent'),
      underperformingMetrics: benchmarkResults.comparisons.filter((c) => c.status !== 'excellent'),
      gaps: this.identifyGaps(benchmarkResults.comparisons),
    };

    return report;
  }

  /**
   * Get distribution of ratings
   */
  getDistribution(comparisons) {
    const dist = { excellent: 0, good: 0, fair: 0, poor: 0 };
    for (const comp of comparisons) {
      dist[comp.status]++;
    }
    return dist;
  }
}

module.exports = BenchmarkEngine;
