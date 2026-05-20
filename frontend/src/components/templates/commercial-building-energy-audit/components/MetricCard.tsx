import React from "react";
import type { PrimitiveValue } from "../types";
import { safeValue } from "../utils/formatting";

export default function MetricCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: PrimitiveValue;
  unit?: string;
}) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>
        {safeValue(value)}
        {unit && safeValue(value) !== "Data required" ? <small> {unit}</small> : null}
      </strong>
    </div>
  );
}
