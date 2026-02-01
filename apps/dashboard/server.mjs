import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3334;

app.get('/api/biomarkers', (req, res) => {
  const p = path.join(repoRoot, 'data', 'biomarkers.json');
  if (!fs.existsSync(p)) {
    res.json({ points: [], events: [] });
    return;
  }
  const raw = fs.readFileSync(p, 'utf8');
  res.type('json').send(raw);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

app.use('/static', express.static(path.join(__dirname, 'web', 'static')));

app.listen(port, '127.0.0.1', () => {
  console.log(`dh-tracker dashboard: http://127.0.0.1:${port}/`);
  console.log('Put lab files in: labs/inbox/ (ignored by git)');
  console.log('Then run:  npm run import');
});
