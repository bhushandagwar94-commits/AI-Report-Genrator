/**
 * LLM Wrapper Service
 * Converts structured engineering data to professional language using LLM
 * Enforces strict guardrails to prevent hallucination
 */

class LLMWrapper {
  constructor(llmProvider) {
    this.llmProvider = llmProvider;
    this.maxRetries = 3;
    this.guardrails = {
      disallowedPatterns: [
        /claim(?:s|ed)?\s+(?:that|without evidence|although|despite)/gi,
        /(?:likely|probably|may|might|possibly|supposedly)\s+(?:indicates?|suggests?|shows?)/gi,
      ],
      requireValidation: ['savings', 'roi', 'payback', 'efficiency', 'performance'],
    };
  }

  /**
   * Convert structured engineering data to professional language
   */
  async structureToLanguage(theory, industrialData) {
    if (!this.llmProvider) {
      return this.fallbackConversion(theory);
    }

    try {
      const prompt = this.buildConversionPrompt(theory);
      const response = await this.llmProvider.generate(prompt, {
        maxTokens: 4000,
        temperature: 0.3, // Low temperature for consistent output
        enforceGuardrails: true,
      });

      const professionalTheory = JSON.parse(response.content);

      // Validate LLM output against original structured data
      this.validateLLMOutput(professionalTheory, theory);

      return professionalTheory;
    } catch (error) {
      // Fallback if LLM fails
      return this.fallbackConversion(theory);
    }
  }

  /**
   * Build prompt for LLM conversion
   */
  buildConversionPrompt(theory) {
    return `You are a professional industrial engineering report writer. Your task is to convert the following structured engineering theory into professional, clear language.

CRITICAL CONSTRAINTS:
1. ONLY use information provided in the structured data
2. NEVER add assumptions or unsupported claims
3. NEVER invent calculations, metrics, or observations
4. NEVER modify numerical values
5. Use passive voice and technical language
6. Maintain all citations to data sources
7. Preserve all technical accuracy

STRUCTURED THEORY:
${JSON.stringify(theory, null, 2)}

CONVERSION REQUIREMENTS:
- Convert each section to professional paragraph format
- Maintain all numerical values exactly as provided
- Add context and explain technical terms where appropriate
- Use industry-standard terminology
- Ensure logical flow between sections
- Add transitional phrases for readability
- Do NOT add new information not in the structured data

OUTPUT FORMAT:
Return a JSON object with the same structure as input, but with professionally formatted "content" fields.`;
  }

  /**
   * Validate LLM output against original structured data
   */
  validateLLMOutput(professionalTheory, originalTheory) {
    // Check that all sections exist
    for (const section of Object.keys(originalTheory.sections)) {
      if (!professionalTheory.sections || !professionalTheory.sections[section]) {
        throw new Error(`LLM output missing section: ${section}`);
      }
    }

    // Check for disallowed patterns
    for (const [section, content] of Object.entries(professionalTheory.sections)) {
      if (typeof content.content === 'string') {
        for (const pattern of this.guardrails.disallowedPatterns) {
          if (pattern.test(content.content)) {
            throw new Error(`LLM output contains disallowed pattern in ${section}: ${pattern}`);
          }
        }
      }
    }

    // Verify numerical values were not modified
    this.validateNumericalValues(professionalTheory, originalTheory);

    return true;
  }

  /**
   * Validate that numerical values were not modified
   */
  validateNumericalValues(proTheory, origTheory) {
    const extractNumbers = (obj) => {
      const numbers = {};
      const traverse = (o, prefix = '') => {
        for (const [key, val] of Object.entries(o)) {
          const path = prefix ? `${prefix}.${key}` : key;
          if (typeof val === 'number') {
            numbers[path] = val;
          } else if (typeof val === 'object' && val !== null) {
            traverse(val, path);
          }
        }
      };
      traverse(obj);
      return numbers;
    };

    const origNumbers = extractNumbers(origTheory);
    const proNumbers = extractNumbers(proTheory);

    for (const [path, value] of Object.entries(origNumbers)) {
      if (path in proNumbers && proNumbers[path] !== value) {
        throw new Error(`Numerical value modified at ${path}: ${value} -> ${proNumbers[path]}`);
      }
    }
  }

  /**
   * Fallback conversion if LLM is unavailable
   */
  fallbackConversion(theory) {
    const converted = JSON.parse(JSON.stringify(theory));

    for (const [sectionName, section] of Object.entries(theory.sections)) {
      if (section.content && typeof section.content === 'string') {
        // Just ensure proper formatting
        converted.sections[sectionName].content = this.formatContent(section.content);
      }
    }

    return converted;
  }

  /**
   * Format content for professional presentation
   */
  formatContent(content) {
    // Ensure proper paragraph formatting
    const lines = content.split('\n');
    const formatted = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n\n');

    return formatted;
  }

  /**
   * Generate executive summary from theory
   */
  async generateExecutiveSummary(theory, observations, calculations) {
    const summaryPrompt = `Generate a professional 2-3 paragraph executive summary of the following industrial facility audit.

Key Findings:
- Category: ${theory.categoryName}
- Critical Issues: ${observations.criticalFindings.length}
- Quick Wins: ${observations.quickWins.length}
- Annual Savings Potential: $${Math.round(
      (observations.quickWins || []).reduce((sum, qw) => {
        const match = qw.annualSavings.match(/\\$?([\\d,]+)/);
        return sum + (match ? parseInt(match[1].replace(/,/g, '')) : 0);
      }, 0)
    )}

Theory Summary:
${theory.sections.systemDescription?.content || 'System information provided'}

Required Tone:
- Professional and objective
- Data-driven, not speculative
- Highlight top 3 opportunities
- Include ROI perspective
- Actionable recommendations

Keep summary under 300 words.`;

    if (!this.llmProvider) {
      return this.generateFallbackSummary(theory, observations);
    }

    try {
      const response = await this.llmProvider.generate(summaryPrompt, {
        maxTokens: 1000,
        temperature: 0.3,
      });

      return {
        summary: response.content,
        generatedAt: Date.now(),
        source: 'llm',
      };
    } catch (error) {
      return this.generateFallbackSummary(theory, observations);
    }
  }

  /**
   * Fallback summary generation
   */
  generateFallbackSummary(theory, observations) {
    let summary = `The ${theory.categoryName} facility analysis identified ${observations.criticalFindings.length} critical issues and ${observations.quickWins.length} quick-win opportunities.\n\n`;

    summary += `Top Priority: Address ${observations.criticalFindings[0]?.description || 'identified system issues'} to prevent equipment failure.\n\n`;

    summary += `Recommended Actions: Implement quick-win projects including ${observations.quickWins
      .slice(0, 2)
      .map((qw) => qw.projectType)
      .join(', ')}. These projects offer strong financial returns with payback periods under 12 months.`;

    return {
      summary,
      generatedAt: Date.now(),
      source: 'fallback',
    };
  }

  /**
   * Format recommendation professionally
   */
  async formatRecommendation(recommendation) {
    if (!this.llmProvider) {
      return recommendation;
    }

    const prompt = `Rewrite the following recommendation in professional, clear language suitable for a technical report. Maintain all numerical values and technical specificity.

Original: ${recommendation}

Output a single paragraph.`;

    try {
      const response = await this.llmProvider.generate(prompt, {
        maxTokens: 500,
        temperature: 0.2,
      });

      return response.content;
    } catch (error) {
      return recommendation;
    }
  }
}

module.exports = LLMWrapper;
