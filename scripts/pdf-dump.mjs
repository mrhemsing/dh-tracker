import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const pdfPath = process.argv[2] || path.join(repoRoot, 'labs', 'inbox', 'dad-labs-2025-02-02_to_2026-02-01.pdf');
const start = Number(process.argv[3] || 1);
const count = Number(process.argv[4] || 3);

if (!fs.existsSync(pdfPath)) {
  console.error('Missing PDF:', pdfPath);
  process.exit(2);
}

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await pdfjsLib.getDocument({ data }).promise;
const end = Math.min(doc.numPages, start + count - 1);

console.log(`PDF: ${pdfPath}`);
console.log(`Pages: ${doc.numPages}`);
console.log(`Dumping pages ${start}..${end}`);

for (let p = start; p <= end; p++) {
  const page = await doc.getPage(p);
  const textContent = await page.getTextContent();
  const parts = textContent.items
    .map(it => (it.str || '').trim())
    .filter(Boolean);

  console.log('\n' + '='.repeat(80));
  console.log(`PAGE ${p}`);
  console.log('='.repeat(80));
  console.log(parts.join(' '));
}
