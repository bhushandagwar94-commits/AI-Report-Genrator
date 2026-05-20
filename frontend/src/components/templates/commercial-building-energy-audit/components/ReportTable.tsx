import React from "react";
import type { ReportTableColumn, ReportTableRow } from "../types";
import { safeValue } from "../utils/formatting";

export default function ReportTable({
  columns,
  rows,
  caption,
}: {
  columns: ReportTableColumn[];
  rows?: ReportTableRow[];
  caption?: string;
}) {
  const tableRows = Array.isArray(rows) && rows.length > 0 ? rows : [{}];

  return (
    <div className="report-table-wrap">
      {caption ? <p className="table-caption">{caption}</p> : null}
      <table className="report-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align ? `align-${column.align}` : ""}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column.key} className={column.align ? `align-${column.align}` : ""}>
                  {safeValue(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
