const BLOCKED_PHRASES = [
  "should stay aligned",
  "final report stays",
  "this existingsystemdescription narrative",
  "this problemgapidentified narrative",
  "this rationaleforenergysaving narrative",
  "this measurementverificationplan narrative",
  "this benefitsotherthanenergysaving narrative",
  "this conclusion narrative",
  "stay project-specific",
  "should remain aligned",
  "client-ready and technically defensible",
  "this section should describe",
  "this section should explain",
  "the write-up should",
  "before implementation, the project team should",
  "where measurements are still pending",
  "quality of this ECM depends",
  "avoid generic audit filler",
  "implementation constraints",
  "engineering review",
  "extracted commercial values",
  "source of truth",
  "deterministic",
  "do not change",
  "must preserve",
  "has been considered as an implementable energy conservation measure",
];

function sanitizeString(text, findings, pathLabel) {
  let output = String(text || "");

  for (const phrase of BLOCKED_PHRASES) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (regex.test(output)) {
      findings.push({ path: pathLabel, phrase });
      output = output.replace(regex, "").replace(/\s{2,}/g, " ").trim();
    }
  }

  return output;
}

function traverse(value, findings, pathLabel = "reportData") {
  if (Array.isArray(value)) {
    return value.map((item, index) => traverse(item, findings, `${pathLabel}[${index}]`));
  }

  if (value && typeof value === "object") {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = traverse(nested, findings, `${pathLabel}.${key}`);
    }
    return output;
  }

  if (typeof value === "string") {
    return sanitizeString(value, findings, pathLabel);
  }

  return value;
}

function sanitizeReportData(reportData = {}) {
  const findings = [];
  const sanitizedReportData = traverse(reportData, findings);
  return {
    sanitizedReportData,
    badPhraseCount: findings.length,
    findings,
  };
}

module.exports = {
  BLOCKED_PHRASES,
  sanitizeReportData,
};
