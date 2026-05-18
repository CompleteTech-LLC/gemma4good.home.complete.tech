import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DEMO_DIR = join(ROOT, 'demo-images');
const ALLOWED_STATUS = new Set(['needs_review', 'approved', 'rejected']);

const id = readArgValue('--id');
const status = readArgValue('--status');
const all = process.argv.includes('--all');
const regeneratedOnly = process.argv.includes('--regenerated-only');
const dryRun = process.argv.includes('--dry-run');

if (!ALLOWED_STATUS.has(status)) {
  console.error('Usage: node scripts/update-demo-image-quality.mjs --status approved|rejected|needs_review (--id <record-id> | --all) [--regenerated-only]');
  process.exit(1);
}

if (!id && !all) {
  console.error('Provide --id <record-id> or --all.');
  process.exit(1);
}

let updated = 0;
const changes = [];

for (const file of await walkJson(DEMO_DIR)) {
  const record = JSON.parse(await readFile(file, 'utf8'));
  const recordId = record.id || basename(file, '.json');
  if (id && recordId !== id) continue;
  if (regeneratedOnly && !['regenerated', 'approved'].includes(record.generation_status)) continue;

  record.quality_status = status;
  if (status === 'approved' && record.generation_status === 'regenerated') {
    record.generation_status = 'approved';
  }
  if (record.prompt && typeof record.prompt === 'object') {
    record.prompt.quality_status = record.quality_status;
    record.prompt.generation_status = record.generation_status;
  }

  if (!dryRun) await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  updated += 1;
  changes.push({ id: recordId, json: relative(ROOT, file), quality_status: record.quality_status, generation_status: record.generation_status });
}

if (id && updated === 0) {
  console.error(`No matching record found for ${id}.`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, dryRun, updated, changes: changes.slice(0, 20) }, null, 2));

async function walkJson(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkJson(path));
    if (entry.isFile() && entry.name.endsWith('.json')) files.push(path);
  }
  return files.sort();
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}
