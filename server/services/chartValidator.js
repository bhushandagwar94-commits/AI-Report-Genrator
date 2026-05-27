/**
 * Chart & Table Validator
 * Validates chart and table data against source measurements
 */

class ChartValidator {
  /**
   * Validate chart data consistency
   */
  validateChartData(chartConfig, sourceData) {
    const errors = [];
    const warnings = [];

    if (!chartConfig || !sourceData) {
      return { valid: false, errors: ['Missing chart or source data'] };
    }

    // Check data series exist
    if (chartConfig.dataSeries && Array.isArray(chartConfig.dataSeries)) {
      for (const series of chartConfig.dataSeries) {
        if (!this.validateDataSeries(series, sourceData)) {
          errors.push(`Data series "${series.name}" does not match source data`);
        }
      }
    }

    // Check axis labels
    if (chartConfig.xAxis && !this.validateAxisLabel(chartConfig.xAxis, sourceData)) {
      warnings.push('X-axis label may not match source data');
    }

    if (chartConfig.yAxis && !this.validateAxisLabel(chartConfig.yAxis, sourceData)) {
      warnings.push('Y-axis label may not match source data');
    }

    // Check data limits
    if (chartConfig.dataMin !== undefined && chartConfig.dataMax !== undefined) {
      const sourceMin = Math.min(...this.extractNumericValues(sourceData));
      const sourceMax = Math.max(...this.extractNumericValues(sourceData));

      if (chartConfig.dataMin < sourceMin || chartConfig.dataMax > sourceMax) {
        warnings.push('Chart axis limits exceed source data range');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate table structure
   */
  validateTableStructure(table, sourceData) {
    const errors = [];
    const warnings = [];

    if (!table || !table.rows) {
      return { valid: false, errors: ['Invalid table structure'] };
    }

    // Check row count
    const expectedRows = Array.isArray(sourceData) ? sourceData.length : Object.keys(sourceData).length;
    if (table.rows.length !== expectedRows) {
      warnings.push(
        `Table rows (${table.rows.length}) do not match source data (${expectedRows} items)`
      );
    }

    // Check column headers
    if (table.headers && Array.isArray(table.headers)) {
      for (const header of table.headers) {
        if (!this.isValidColumnName(header)) {
          warnings.push(`Table header "${header}" is unclear`);
        }
      }
    }

    // Check data types in table
    for (const row of table.rows) {
      if (Array.isArray(row)) {
        for (let i = 0; i < row.length; i++) {
          if (typeof row[i] === 'number' && !Number.isFinite(row[i])) {
            errors.push(`Invalid numeric value in table row at column ${i}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Ensure data consistency between chart and source
   */
  ensureDataConsistency(chart, table, sourceData) {
    const consistency = {
      chartDataCount: chart?.dataSeries?.reduce((sum, s) => sum + (s.data?.length || 0), 0) || 0,
      tableDataCount: table?.rows?.length || 0,
      sourceDataCount: Array.isArray(sourceData) ? sourceData.length : Object.keys(sourceData).length,
    };

    const isConsistent =
      consistency.chartDataCount === consistency.sourceDataCount &&
      consistency.tableDataCount === consistency.sourceDataCount;

    return {
      isConsistent,
      consistency,
      message: isConsistent
        ? 'Data consistent across chart, table, and source'
        : 'Data inconsistency detected - verify source data mapping',
    };
  }

  /**
   * Check chart mapping to source
   */
  checkChartMapping(chart, sourceData) {
    const issues = [];

    if (!chart.mapping) {
      return { valid: false, issues: ['No data mapping defined'] };
    }

    for (const [sourceField, chartField] of Object.entries(chart.mapping)) {
      if (!(sourceField in sourceData)) {
        issues.push(`Source field "${sourceField}" not found in data`);
      }

      if (!chartField) {
        issues.push(`Chart field mapping missing for "${sourceField}"`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // Helper methods

  validateDataSeries(series, sourceData) {
    if (!series || !series.name || !series.data) {
      return false;
    }

    // Check if data values are numeric
    if (Array.isArray(series.data)) {
      return series.data.every((val) => typeof val === 'number' && Number.isFinite(val));
    }

    return true;
  }

  validateAxisLabel(axis, sourceData) {
    if (!axis || !axis.label) return false;

    const label = axis.label.toLowerCase();
    // Check if axis label matches common field names in source data
    const dataKeys = Object.keys(sourceData).map((k) => k.toLowerCase());

    return dataKeys.some((key) => label.includes(key) || key.includes(label));
  }

  isValidColumnName(header) {
    // Check that header is not empty and is readable
    return header && header.length > 0 && header.length < 100 && header !== 'undefined' && header !== 'null';
  }

  extractNumericValues(data) {
    const values = [];

    const traverse = (obj) => {
      if (typeof obj === 'number' && Number.isFinite(obj)) {
        values.push(obj);
      } else if (Array.isArray(obj)) {
        for (const item of obj) {
          traverse(item);
        }
      } else if (typeof obj === 'object' && obj !== null) {
        for (const value of Object.values(obj)) {
          traverse(value);
        }
      }
    };

    traverse(data);
    return values.length > 0 ? values : [0];
  }
}

module.exports = ChartValidator;
