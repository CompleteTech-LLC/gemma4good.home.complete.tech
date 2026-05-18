import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEMO_DIR = join(ROOT, 'demo-images');
const REPORT_PATH = join(ROOT, 'docs', 'demo-images-verification-report.json');
const EXPECTED_TOTAL = 300;
const ALLOWED_CATEGORIES = ['water_quality', 'sanitation', 'infrastructure', 'health_risk'];
const ALLOWED_SEVERITY = ['low', 'medium', 'high', 'critical'];
const REQUIRED_PROMPT_FIELDS = [
  'prompt_version',
  'scene',
  'required_visuals',
  'composition',
  'style',
  'avoid',
  'generation_status',
  'quality_status',
];
const QA_STATUSES = ['needs_review', 'approved', 'rejected'];
const GENERATION_STATUSES = ['pending_regeneration', 'generated', 'regenerated', 'approved'];
const strict = process.argv.includes('--strict');

const jsonFiles = await walkFiles(DEMO_DIR, '.json');
const imageFiles = [
  ...await walkFiles(DEMO_DIR, '.jpg'),
  ...await walkFiles(DEMO_DIR, '.jpeg'),
  ...await walkFiles(DEMO_DIR, '.png'),
].sort();

const errors = [];
const warnings = [];
const completionErrors = [];
const promptFingerprints = new Map();
const qualityStatusCounts = {};
const generationStatusCounts = {};
const variationCounts = {};

for (const file of jsonFiles) {
  const rel = relative(DEMO_DIR, file);
  let record;
  try {
    record = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    errors.push(`${rel}: invalid JSON: ${error.message}`);
    continue;
  }

  requireString(record, 'id', rel);
  requireString(record, 'image_file', rel);
  requireString(record, 'variation', rel);
  requireString(record, 'timestamp', rel);
  requireObject(record, 'location', rel);
  requireArray(record, 'categories', rel);
  requireString(record, 'severity', rel);
  requireString(record, 'short_note', rel);

  if (record.id && basename(file, '.json') !== record.id) {
    errors.push(`${rel}: id does not match JSON filename stem`);
  }

  if (record.image_file) {
    const imagePath = join(dirname(file), record.image_file);
    if (!existsSync(imagePath)) {
      errors.push(`${rel}: paired image_file missing: ${record.image_file}`);
    } else if (!statSync(imagePath).isFile()) {
      errors.push(`${rel}: paired image_file is not a file: ${record.image_file}`);
    }
  }

  if (!ALLOWED_SEVERITY.includes(record.severity)) {
    errors.push(`${rel}: invalid severity ${record.severity}`);
  }

  const expectedVariation = Array.isArray(record.categories) ? record.categories.join('+') : '';
  if (record.variation !== expectedVariation) {
    errors.push(`${rel}: variation does not match categories order`);
  }

  for (const category of record.categories || []) {
    if (!ALLOWED_CATEGORIES.includes(category)) errors.push(`${rel}: invalid category ${category}`);
  }

  variationCounts[record.variation] = (variationCounts[record.variation] || 0) + 1;

  if (!record.prompt || typeof record.prompt !== 'object' || Array.isArray(record.prompt)) {
    errors.push(`${rel}: missing prompt object`);
  } else {
    for (const field of REQUIRED_PROMPT_FIELDS) {
      if (!(field in record.prompt)) errors.push(`${rel}: prompt missing ${field}`);
    }
    if (!Array.isArray(record.prompt.required_visuals) || record.prompt.required_visuals.length < 4) {
      errors.push(`${rel}: prompt.required_visuals must include at least 4 items`);
    }
    if (!Array.isArray(record.prompt.avoid) || record.prompt.avoid.length < 4) {
      errors.push(`${rel}: prompt.avoid must include at least 4 items`);
    }
    if (record.prompt.quality_status !== record.quality_status) {
      errors.push(`${rel}: prompt.quality_status must match top-level quality_status`);
    }
    if (record.prompt.generation_status !== record.generation_status) {
      errors.push(`${rel}: prompt.generation_status must match top-level generation_status`);
    }
    const fingerprint = [
      record.prompt.scene,
      record.prompt.required_visuals?.join('|'),
      record.prompt.composition,
    ].join('::');
    if (promptFingerprints.has(fingerprint)) {
      errors.push(`${rel}: prompt duplicates ${promptFingerprints.get(fingerprint)}`);
    } else {
      promptFingerprints.set(fingerprint, rel);
    }
  }

  if (!QA_STATUSES.includes(record.quality_status)) {
    errors.push(`${rel}: invalid quality_status ${record.quality_status}`);
  }
  if (!GENERATION_STATUSES.includes(record.generation_status)) {
    errors.push(`${rel}: invalid generation_status ${record.generation_status}`);
  }

  qualityStatusCounts[record.quality_status] = (qualityStatusCounts[record.quality_status] || 0) + 1;
  generationStatusCounts[record.generation_status] = (generationStatusCounts[record.generation_status] || 0) + 1;
}

const jsonStems = new Set(jsonFiles.map((file) => join(dirname(file), basename(file, '.json'))));
const imageStems = new Set(imageFiles.map((file) => join(dirname(file), basename(file, extname(file)))));

for (const stem of jsonStems) {
  if (!imageStems.has(stem)) errors.push(`${relative(DEMO_DIR, stem)}: JSON has no matching image stem`);
}
for (const stem of imageStems) {
  if (!jsonStems.has(stem)) errors.push(`${relative(DEMO_DIR, stem)}: image has no matching JSON stem`);
}

if (jsonFiles.length !== EXPECTED_TOTAL) errors.push(`expected ${EXPECTED_TOTAL} JSON files, found ${jsonFiles.length}`);
if (imageFiles.length !== EXPECTED_TOTAL) errors.push(`expected ${EXPECTED_TOTAL} image files, found ${imageFiles.length}`);

if ((generationStatusCounts.pending_regeneration || 0) > 0) {
  warnings.push('images are still marked pending_regeneration; direct per-record image regeneration is not complete');
  completionErrors.push('direct per-record image regeneration is incomplete');
}
if ((qualityStatusCounts.approved || 0) === 0) {
  warnings.push('no images are marked approved yet; Mission Control should treat this dataset as pre-QA');
}
if ((qualityStatusCounts.needs_review || 0) > 0) {
  completionErrors.push('QA is incomplete; records still have quality_status needs_review');
}
if (((qualityStatusCounts.approved || 0) + (qualityStatusCounts.rejected || 0)) !== EXPECTED_TOTAL) {
  completionErrors.push('approved/rejected QA decisions do not cover all 300 records');
}

const report = {
  ok: errors.length === 0,
  complete: errors.length === 0 && completionErrors.length === 0,
  counts: {
    json: jsonFiles.length,
    images: imageFiles.length,
    uniquePrompts: promptFingerprints.size,
    variations: variationCounts,
    generationStatus: generationStatusCounts,
    qualityStatus: qualityStatusCounts,
  },
  requiredPromptFields: REQUIRED_PROMPT_FIELDS,
  qaStatuses: QA_STATUSES,
  generationStatuses: GENERATION_STATUSES,
  warnings,
  completionErrors,
  errors,
  generatedAt: new Date().toISOString(),
};

await mkdir(dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
process.exitCode = errors.length || (strict && completionErrors.length) ? 1 : 0;

async function walkFiles(dir, extension) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(path, extension));
    if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) files.push(path);
  }
  return files.sort();
}

function requireString(record, field, rel) {
  if (typeof record[field] !== 'string' || !record[field].trim()) errors.push(`${rel}: missing string field ${field}`);
}

function requireArray(record, field, rel) {
  if (!Array.isArray(record[field]) || record[field].length === 0) errors.push(`${rel}: missing array field ${field}`);
}

function requireObject(record, field, rel) {
  if (!record[field] || typeof record[field] !== 'object' || Array.isArray(record[field])) {
    errors.push(`${rel}: missing object field ${field}`);
  }
}
