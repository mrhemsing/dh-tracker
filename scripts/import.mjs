import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v0 importer: placeholder.
// For v1 we will add parsing for the specific export format you have (PDF/CSV/HTML).

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const inbox = path.join(repoRoot, 'labs', 'inbox');
const outDir = path.join(repoRoot, 'data');
const outPath = path.join(outDir, 'biomarkers.json');

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

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  points: [],
  events: []
}, null, 2));

console.log(`Found ${files.length} files, but parsing is not implemented yet.`);
console.log(`Wrote placeholder: ${outPath}`);
