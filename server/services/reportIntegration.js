/**
 * Report Integration Service
 * Integrates theory generator output with existing report template system
 */

class ReportIntegration {
  /**
   * Map theory output to report template structure
   */
  mapTheoryToReportTemplate(theory, executiveSummary, category) {
    return {
      reportType: 'Industrial Theory Generation Report',
      timestamp: Date.now(),
      category: {
        id: theory.categoryId,
        name: theory.categoryName,
      },
      sections: {
        executiveSummary: this.mapExecutiveSummary(executiveSummary),
        systemAnalysis: this.mapSystemAnalysis(theory),
        findings: this.mapFindings(theory),
        recommendations: this.mapRecommendations(theory),
        financialAnalysis: this.mapFinancialAnalysis(theory, executiveSummary),
      },
      metadata: {
        theorySections: Object.keys(theory.sections || {}),
        validations: theory.metadata?.validations || [],
        dataSources: theory.metadata?.dataSources || [],
      },
    };
  }

  /**
   * Map executive summary
   */
  mapExecutiveSummary(execSummary) {
    return {
      overview: execSummary.sections?.overview || {},
      keyFindings: execSummary.sections?.keyFindings || {},
      opportunities: execSummary.sections?.opportunities || {},
      financialSummary: execSummary.sections?.financialSummary || {},
    };
  }

  /**
   * Map system analysis sections
   */
  mapSystemAnalysis(theory) {
    return {
      systemDescription: theory.sections?.systemDescription || {},
      engineeringObservation: theory.sections?.engineeringObservation || {},
      benchmarkComparison: theory.sections?.benchmarkComparison || {},
      operationalImpact: theory.sections?.operationalImpact || {},
    };
  }

  /**
   * Map findings sections
   */
  mapFindings(theory) {
    return {
      rootCauseAnalysis: theory.sections?.rootCauseAnalysis || {},
      energyImpact: theory.sections?.energyImpact || {},
      sustainabilityImpact: theory.sections?.sustainabilityImpact || {},
    };
  }

  /**
   * Map recommendations sections
   */
  mapRecommendations(theory) {
    return {
      optimizationOpportunity: theory.sections?.optimizationOpportunity || {},
      technicalRecommendation: theory.sections?.technicalRecommendation || {},
    };
  }

  /**
   * Map financial analysis
   */
  mapFinancialAnalysis(theory, execSummary) {
    return {
      savingBenefit: theory.sections?.savingBenefit || {},
      financialSummary: execSummary.sections?.financialSummary || {},
    };
  }

  /**
   * Convert to DOCX format structure
   */
  convertToDocxStructure(reportData, templateConfig) {
    const docxStructure = {
      title: reportData.reportType,
      subtitle: reportData.category.name,
      generated: new Date(reportData.timestamp).toISOString(),
      sections: [],
    };

    // Executive Summary
    if (reportData.sections.executiveSummary) {
      docxStructure.sections.push({
        heading: 'Executive Summary',
        level: 1,
        content: this.formatSection(reportData.sections.executiveSummary),
      });
    }

    // System Analysis
    if (reportData.sections.systemAnalysis) {
      docxStructure.sections.push({
        heading: 'System Analysis',
        level: 1,
        subsections: [
          {
            heading: 'System Description',
            content: reportData.sections.systemAnalysis.systemDescription.content,
          },
          {
            heading: 'Engineering Observations',
            content: reportData.sections.systemAnalysis.engineeringObservation.content,
          },
          {
            heading: 'Benchmark Comparison',
            content: reportData.sections.systemAnalysis.benchmarkComparison.content,
          },
        ],
      });
    }

    // Findings
    if (reportData.sections.findings) {
      docxStructure.sections.push({
        heading: 'Detailed Findings',
        level: 1,
        subsections: [
          {
            heading: 'Root Cause Analysis',
            content: reportData.sections.findings.rootCauseAnalysis.content,
          },
          {
            heading: 'Energy & Operational Impact',
            content: reportData.sections.findings.energyImpact.content,
          },
        ],
      });
    }

    // Recommendations
    if (reportData.sections.recommendations) {
      docxStructure.sections.push({
        heading: 'Recommendations',
        level: 1,
        subsections: [
          {
            heading: 'Optimization Opportunities',
            content: reportData.sections.recommendations.optimizationOpportunity.content,
          },
          {
            heading: 'Technical Recommendations',
            content: reportData.sections.recommendations.technicalRecommendation.content,
          },
        ],
      });
    }

    // Financial Analysis
    if (reportData.sections.financialAnalysis) {
      docxStructure.sections.push({
        heading: 'Financial Analysis',
        level: 1,
        content: reportData.sections.financialAnalysis.savingBenefit.content,
      });
    }

    // Sustainability
    if (reportData.sections.findings?.sustainabilityImpact) {
      docxStructure.sections.push({
        heading: 'Sustainability Impact',
        level: 1,
        content: reportData.sections.findings.sustainabilityImpact.content,
      });
    }

    return docxStructure;
  }

  /**
   * Format section for output
   */
  formatSection(sectionData) {
    if (typeof sectionData === 'object' && 'content' in sectionData) {
      return sectionData.content;
    }
    if (typeof sectionData === 'string') {
      return sectionData;
    }
    return '';
  }
}

module.exports = ReportIntegration;
