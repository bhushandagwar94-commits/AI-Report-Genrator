export function isInvalidMetadataValue(value, label) {
  if (value === null || value === undefined) return true;

  const cleaned = String(value).trim();

  if (!cleaned) return true;

  const invalidValues = [
    "not available in uploaded data",
    "not provided in source document",
    "not available",
    "na",
    "n/a",
    "-",
    "null",
    "undefined",
    "location",
    "audit period",
    "building type",
    "document version",
    "prepared for"
  ];

  if (invalidValues.includes(cleaned.toLowerCase())) return true;

  if (label && cleaned.toLowerCase() === String(label).trim().toLowerCase()) {
    return true;
  }

  return false;
}

export function formatReportDate(value) {
  if (!value) return "To be confirmed";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "To be confirmed";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

export function cleanMetadataValue(label, value) {
  if (label === "Report Date" || label === "Report date") {
    return formatReportDate(value);
  }

  if (label === "Document Version") {
    return isInvalidMetadataValue(value, label) ? "Rev. 0" : value;
  }

  if (label === "CO2 Reduction" || label === "CO₂ Reduction") {
    return isInvalidMetadataValue(value, label)
      ? "To be calculated after emission factor confirmation"
      : value;
  }

  return isInvalidMetadataValue(value, label) ? "To be confirmed" : value;
}
