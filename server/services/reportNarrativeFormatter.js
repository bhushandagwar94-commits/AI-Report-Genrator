function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function toBulletText(items = []) {
  return items
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter(Boolean)
    .map((item) => item.startsWith("•") ? item : `• ${item}`)
    .join("\n");
}

function ensureBulletTheory(text, fallbackBullets = [], options = {}) {
  const minWords = options.minWords || 800;
  const maxWords = options.maxWords || 1400;

  let result = String(text || "").trim();

  if (!result || countWords(result) < minWords) {
    result = toBulletText(fallbackBullets);
  }

  if (!result.includes("•")) {
    const sentences = result
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    result = toBulletText(sentences);
  }

  const words = result.split(/\s+/).filter(Boolean);

  if (words.length > maxWords) {
    result = words.slice(0, maxWords).join(" ");
  }

  return result;
}

module.exports = {
  countWords,
  toBulletText,
  ensureBulletTheory
};
