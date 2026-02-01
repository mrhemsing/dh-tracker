# dh-tracker

Local-first blood lab tracker + dashboard (for weekly results).

## Goals
- Import lab reports you already have (PDF/CSV/HTML exports).
- Track key markers over time (CBC, platelets, etc.).
- Visualize trends + compare to key dates (e.g., platelet crash).

## Privacy / safety
This repo is designed to avoid committing sensitive medical data.

- Put reports in `labs/inbox/` (ignored by git)
- Extracted structured data lives in `data/` (ignored by git)

## Planned workflow
1) Drop files into `labs/inbox/`
2) Run importer (creates `data/biomarkers.json`)
3) Start dashboard

