import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// v1 importer: supports Alberta MyHealth Records PDF export ("PERSONAL HEALTH REPORT").
// Parses CBC + Differential pages and writes a flat timeseries suitable for the dashboard.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const inbox = path.join(repoRoot, 'labs', 'inbox');
const outDir = path.join(repoRoot, 'data');
const outPath = path.join(outDir, 'biomarkers.json');

const TESTS = [
  // CBC + differential
  { outName: 'Platelets', testName: 'Platelets' },
  { outName: 'WBC', testName: 'Auto WBC' },
  { outName: 'Hemoglobin', testName: 'Hemoglobin' },
  { outName: 'ANC', testName: 'Neutrophil Absolute' },
  { outName: 'RBC', testName: 'RBC' },
  { outName: 'Hematocrit', testName: 'Hematocrit' },
  { outName: 'MCV', testName: 'MCV' },
  { outName: 'RDW', testName: 'RDW' },
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function parseReportDate(text) {
  // Examples:
  //   "Status: Final Lab Results Jan 19, 2026 08:59 AM"
  //   "Status: Final Dec 21, 2025 08:47 AM"
  const m = text.match(/Status:\s*Final(?:\s+Lab Results)?\s+([A-Za-z]{3}\s+\d{1,2},\s+\d{4})\s+\d{1,2}:\d{2}\s+[AP]M/i);
  if (!m) return null;
  const d = new Date(m[1]);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function extractResult(text, testName) {
  // Examples:
  //  "Test Name Platelets Result 340 x10**9/L Reference Range (Units) 140-400 (x10**9/L)"
  //  "Test Name RDW Result 21.9 % Reference Range (Units) <16.0 (%)"
  //  "Test Name Hematocrit Result 0.35 L/L Reference Range (Units) 0.40-0.52 (L/L)"

  const re = new RegExp(
    `Test Name\\s+${escapeRegExp(testName)}\\s+Result\\s+([0-9.]+)\\s+([^\\s]+)` +
    // optional reference range segment (we don't depend on exact units formatting)
    `(?:\\s+Reference Range\\s*\\(Units\\)\\s+([^\\s]+)\\s*\\(([^)]+)\\))?` +
    // optional abnormality segment
    `(?:\\s+Abnormality\\s+(.+?))?` +
    // stop at next test or footer
    `(?=\\s+Test Name\\s+|\\s+MyHealth Records\\s+|\\s+Page:|$)`,
    'i'
  );

  const m = text.match(re);
  if (!m) return null;

  const value = Number(m[1]);
  const units = m[2];

  // Parse reference range token if present.
  // token examples: "4.0-11.0", "<16.0", ">=5" (unlikely), etc.
  let refLow = null;
  let refHigh = null;

  const token = m[3];
  if (token) {
    const t = token.trim();

    let mm = t.match(/^([0-9.]+)\-([0-9.]+)$/);
    if (mm) {
      refLow = Number(mm[1]);
      refHigh = Number(mm[2]);
    } else {
      mm = t.match(/^<([0-9.]+)$/);
      if (mm) {
        refHigh = Number(mm[1]);
      } else {
        mm = t.match(/^<=([0-9.]+)$/);
        if (mm) refHigh = Number(mm[1]);

        mm = t.match(/^>([0-9.]+)$/);
        if (mm) refLow = Number(mm[1]);

        mm = t.match(/^>=([0-9.]+)$/);
        if (mm) refLow = Number(mm[1]);
      }
    }

    if (refLow !== null && !Number.isFinite(refLow)) refLow = null;
    if (refHigh !== null && !Number.isFinite(refHigh)) refHigh = null;
  }

  let abnormality = null;
  if (m[5]) {
    const a = m[5].trim();
    if (a !== '-' && a !== '–') abnormality = a;
  }

  const isCritical = abnormality ? /\bcritical\b/i.test(abnormality) : false;

  return { value, units, refLow, refHigh, abnormality, isCritical };
}

async function extractPdfPagesText(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const textContent = await page.getTextContent();
    const parts = textContent.items
      .map(it => (it.str || '').trim())
      .filter(Boolean);
    pages.push(parts.join(' '));
  }

  return pages;
}

async function parseMyHealthPdf(pdfPath, sourceFile) {
  const pages = await extractPdfPagesText(pdfPath);
  const points = [];

  // Some MyHealth lab sections spill a single lab panel across multiple pages.
  // Only the first page includes the "Status: Final <date>" header; following pages
  // often omit it. We carry the last-seen report date forward.
  let currentDate = null;

  for (const pageText of pages) {
    const headerDate = parseReportDate(pageText);
    if (headerDate) currentDate = headerDate;

    if (!pageText.includes('Test Name')) continue;

    const date = currentDate;
    if (!date) continue;

    for (const t of TESTS) {
      const r = extractResult(pageText, t.testName);
      if (!r) continue;
      if (!Number.isFinite(r.value)) continue;

      points.push({
        name: t.outName,
        date,
        value: r.value,
        units: r.units,
        refLow: r.refLow,
        refHigh: r.refHigh,
        abnormality: r.abnormality,
        isCritical: r.isCritical,
        source: sourceFile,
      });
    }
  }

  return points;
}

if (!fs.existsSync(inbox)) {
  console.error(`Missing inbox folder: ${inbox}`);
  process.exit(2);
}

const files = fs.readdirSync(inbox).filter(f => /\.(pdf|csv|html?)$/i.test(f));
if (files.length === 0) {
  console.log('No lab files found in labs/inbox/.');
  console.log('Drop PDFs/CSVs/HTML exports there, then rerun.');
  process.exit(0);
}

const allPoints = [];

for (const file of files) {
  const fullPath = path.join(inbox, file);
  const ext = path.extname(file).toLowerCase();

  if (ext === '.pdf') {
    const points = await parseMyHealthPdf(fullPath, file);
    console.log(`[pdf] ${file}: ${points.length} points`);
    allPoints.push(...points);
    continue;
  }

  console.log(`[skip] ${file}: unsupported file type (for now)`);
}

// De-dupe by (name,date). Keep the first seen (per-file order).
const seen = new Set();
const deduped = [];
for (const p of allPoints) {
  const k = `${p.name}::${p.date}`;
  if (seen.has(k)) continue;
  seen.add(k);
  deduped.push(p);
}

// Sort for stable charting.
deduped.sort((a, b) => (a.name === b.name ? a.date.localeCompare(b.date) : a.name.localeCompare(b.name)));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  points: deduped,
  events: []
}, null, 2));

console.log(`Wrote: ${outPath}`);
console.log(`Total points: ${deduped.length}`);
