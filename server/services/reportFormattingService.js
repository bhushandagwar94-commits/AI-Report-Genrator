function asFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[₹,\s]/g, "").replace(/[^0-9.+-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatIndianNumber(value, maximumFractionDigits = 0) {
  if (value === null || value === undefined || value === "") return "";
  const num = asFiniteNumber(value);
  if (num === null) return String(value);
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(num);
}

function formatInr(value, maximumFractionDigits = 0) {
  if (value === null || value === undefined || value === "") return "";
  const strVal = String(value);
  if (strVal.includes("\u20B9") || /\bRs\b/i.test(strVal)) return strVal;
  const num = asFiniteNumber(value);
  if (num === null) return strVal;
  return `\u20B9${formatIndianNumber(num, maximumFractionDigits)}`;
}

function formatKwh(value, suffix = "kWh/year") {
  if (value === null || value === undefined || value === "") return "";
  const strVal = String(value);
  if (strVal.includes("kWh")) return strVal;
  const formatted = formatIndianNumber(value, 0);
  return formatted ? `${formatted} ${suffix}` : "";
}

function formatKvah(value) {
  if (value === null || value === undefined || value === "") return "";
  const strVal = String(value);
  if (/kVAh/i.test(strVal)) return strVal;
  const formatted = formatIndianNumber(value, 0);
  return formatted ? `${formatted} kVAh` : "";
}

function formatKw(value, unit = "kW") {
  if (value === null || value === undefined || value === "") return "";
  const strVal = String(value);
  if (strVal.includes(unit)) return strVal;
  const formatted = formatIndianNumber(value, 2);
  return formatted ? `${formatted} ${unit}` : "";
}

function formatKva(value) {
  return formatKw(value, "kVA");
}

function formatPf(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = asFiniteNumber(value);
  if (num === null) return String(value);
  return formatIndianNumber(num, 3);
}

function formatYears(value) {
  if (value === null || value === undefined || value === "") return "";
  const strVal = String(value);
  if (/\byears?\b/i.test(strVal)) return strVal;
  const formatted = formatIndianNumber(value, 2);
  return formatted ? `${formatted} years` : "";
}

function formatMonths(value) {
  if (value === null || value === undefined || value === "") return "";
  const strVal = String(value);
  if (/\bmonths?\b/i.test(strVal)) return strVal;
  const formatted = formatIndianNumber(value, 2);
  return formatted ? `${formatted} months` : "";
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "";
  const strVal = String(value);
  if (strVal.includes("%")) return strVal;
  const num = asFiniteNumber(value);
  if (num === null) return strVal;
  const percentValue = num <= 1 && num > 0 ? num * 100 : num;
  const formatted = formatIndianNumber(percentValue, 2);
  return formatted ? `${formatted}%` : "";
}

module.exports = {
  asFiniteNumber,
  formatIndianNumber,
  formatInr,
  formatKwh,
  formatKvah,
  formatKw,
  formatKva,
  formatPf,
  formatYears,
  formatMonths,
  formatPercent,
};
