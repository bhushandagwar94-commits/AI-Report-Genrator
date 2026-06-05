const INTERNAL_FORBIDDEN_PHRASES = [
  "deterministic project data must remain the source of truth",
  "values for energy saving, annual saving, investment and payback should not be altered",
  "report should preserve all extracted values",
  "purpose of this section is to explain the technical logic",
  "before implementation, the site team should confirm equipment nameplate details",
  "narrative enhancement",
];

function removeInternalPhrases(text) {
  let output = String(text || "");

  for (const phrase of INTERNAL_FORBIDDEN_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^.*${escaped}.*$`, "gim");
    output = output.replace(regex, "");
  }

  return output
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function cleanBulletLines(text) {
  return String(text || "")
    .split(/\r?\n|\\n+/)
    .map((line) =>
      line
        .replace(/^\s*\d+\.\s*/g, "")
        .replace(/^\s*[-–—]\s*/g, "")
        .replace(/^\s*[•â€¢]\s*/g, "")
        .replace(/^\s*-\s*[•â€¢]\s*/g, "")
        .trim()
    )
    .filter(Boolean);
}

function sanitizeNarrativeText(text) {
  return removeInternalPhrases(cleanBulletLines(text).join("\n"));
}

function sanitizeReportOutput(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeReportOutput(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeReportOutput(nestedValue),
      ])
    );
  }

  if (typeof value === "string") {
    return sanitizeNarrativeText(value);
  }

  return value;
}

module.exports = {
  INTERNAL_FORBIDDEN_PHRASES,
  removeInternalPhrases,
  cleanBulletLines,
  sanitizeNarrativeText,
  sanitizeReportOutput,
};
