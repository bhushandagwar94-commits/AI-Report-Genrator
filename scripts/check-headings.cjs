const fs = require('fs');
const AdmZip = require('adm-zip');

try {
  const zip = new AdmZip('tmp-ai-report.docx');
  const zipEntries = zip.getEntries();
  const docEntry = zipEntries.find(entry => entry.entryName === 'word/document.xml');
  if (docEntry) {
    const xml = docEntry.getData().toString('utf8');
    // Extract paragraphs
    const paragraphs = xml.match(/<w:p\b[^>]*>.*?<\/w:p>/g) || [];
    
    console.log("=== HEADINGS EXTRACTED FROM DOCX ===");
    for (const p of paragraphs) {
      // get text from paragraph
      const texts = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
      if (texts) {
        const fullText = texts.map(t => t.replace(/<[^>]+>/g, '')).join('');
        if (fullText.match(/^3\.\d+\.\d+ /) || fullText.match(/^3\.\d+ GR-/)) {
          console.log(fullText);
        }
      }
    }
  } else {
    console.log('word/document.xml not found in docx');
  }
} catch (err) {
  console.error('Error reading docx:', err);
}
