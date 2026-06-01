const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend/src/pages/Reports/Public/index.jsx');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Update STEPS array
code = code.replace(
/const STEPS = \[\s*\{ id: 1, label: "Select Template" \},\s*\{ id: 2, label: "Basic Details" \},\s*\{ id: 3, label: "Upload Files" \},\s*\{ id: 4, label: "Generate" \},\s*\{ id: 5, label: "Preview & Download" \},\s*\];/,
`const STEPS = [
  { id: 1, label: "Select Template" },
  { id: 2, label: "Upload Files" },
  { id: 3, label: "Generate" },
  { id: 4, label: "Preview & Download" },
];`
);

// 2. Rename functions Step3 -> Step2, Step4 -> Step3, Step5 -> Step4
const step2Start = code.indexOf('function Step2({ details, onChange }) {');
const step3Start = code.indexOf('function Step3({ uploadedFiles, onUpload, onRemove, uploading }) {');
if (step2Start !== -1 && step3Start !== -1) {
    code = code.substring(0, step2Start) + code.substring(step3Start);
}

// Now rename the remaining functions
code = code.replace(/function Step3/g, 'function Step2');
code = code.replace(/function Step4/g, 'function Step3');
code = code.replace(/function Step5/g, 'function Step4');
code = code.replace(/<Step3/g, '<Step2');
code = code.replace(/<Step4/g, '<Step3');
code = code.replace(/<Step5/g, '<Step4');

// 3. Update the conditional renders in the main component
const step2RenderStart = code.indexOf('{step === 2 && (');
const step3RenderStart = code.indexOf('{step === 3 && (');
if (step2RenderStart !== -1 && step3RenderStart !== -1) {
    code = code.substring(0, step2RenderStart) + code.substring(step3RenderStart);
}

// Rename step checks inside JSX
code = code.replace(/\{step === 3 && \(/g, '{step === 2 && (');
code = code.replace(/\{step === 4 && \(/g, '{step === 3 && (');
code = code.replace(/\{step === 5 && \(/g, '{step === 4 && (');

// 4. Update canNext() logic
code = code.replace(/if \(step === 2\) \{\s*\/\/ Required: Client Name[\s\S]*?return !!\([\s\S]*?\);\s*\}/, '');
code = code.replace(/if \(step === 3\) return uploadedFiles\.length > 0;/g, 'if (step === 2) return uploadedFiles.length > 0;');
code = code.replace(/if \(step === 4\)/g, 'if (step === 3)');
code = code.replace(/if \(step === 5\)/g, 'if (step === 4)');

code = code.replace(/const canBack = \(\) => step > 1 && step < 5;/g, 'const canBack = () => step > 1 && step < 4;');

code = code.replace(/setStep\(5\);/g, 'setStep(4);');
code = code.replace(/const \[details, setDetails\] = useState\(null\);/, 'const [details, setDetails] = useState({ outputFormat: "docx" });');
code = code.replace(/setDetails\(\{ outputFormat: "pdf" \}\);/g, 'setDetails({ outputFormat: "docx" });');

fs.writeFileSync(filePath, code);
console.log("Successfully patched frontend steps.");
