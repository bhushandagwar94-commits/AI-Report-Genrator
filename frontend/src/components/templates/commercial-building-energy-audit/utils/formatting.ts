import type { PrimitiveValue } from "../types";

export const DATA_REQUIRED = "Data required";

export function safeValue(value: PrimitiveValue): string {
  if (value === null || value === undefined) return DATA_REQUIRED;
  if (typeof value === "number" && Number.isNaN(value)) return DATA_REQUIRED;
  if (typeof value === "string" && value.trim() === "") return DATA_REQUIRED;
  return String(value);
}

function numericValue(value: PrimitiveValue): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatINR(value: PrimitiveValue): string {
  const parsed = numericValue(value);
  if (parsed === null) return safeValue(value);
  return `₹${parsed.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatKWh(value: PrimitiveValue): string {
  const parsed = numericValue(value);
  if (parsed === null) return safeValue(value);
  return `${parsed.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kWh/year`;
}

export function formatPercent(value: PrimitiveValue): string {
  const parsed = numericValue(value);
  if (parsed === null) return safeValue(value);
  return `${parsed.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
}

export function formatPayback(value: PrimitiveValue): string {
  const parsed = numericValue(value);
  if (parsed === null) return safeValue(value);
  return `${parsed.toLocaleString("en-IN", { maximumFractionDigits: 2 })} years`;
}
