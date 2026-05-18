import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DEMO_DIR = join(ROOT, 'demo-images');
const API_URL = process.env.OPENAI_IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';
const SIZE = process.env.OPENAI_IMAGE_SIZE || '1024x1536';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const dryRun = args.has('--dry-run');
const limit = readArgNumber('--limit', Infinity);
const onlyRecord = readArgValue('--record');
const sleepMs = readArgNumber('--sleep-ms', 500);

if (!dryRun && !process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required unless --dry-run is used.');
  process.exit(1);
}

const records = [];
for (const file of await walkJson(DEMO_DIR)) {
  const record = JSON.parse(await readFile(file, 'utf8'));
  if (onlyRecord && record.id !== onlyRecord && basename(file, '.json') !== onlyRecord) continue;
  if (!force && record.generation_status === 'regenerated' && record.quality_status !== 'rejected') continue;
  records.push({ file, record });
  if (records.length >= limit) break;
}

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    model: MODEL,
    size: SIZE,
    quality: QUALITY,
    count: records.length,
    records: records.slice(0, 10).map(({ file, record }) => ({
      id: record.id,
      json: relative(ROOT, file),
      image: relative(ROOT, join(dirname(file), record.image_file)),
      promptPreview: buildImagePrompt(record).slice(0, 500),
    })),
  }, null, 2));
  process.exit(0);
}

let regenerated = 0;
for (const { file, record } of records) {
  const imagePath = join(dirname(file), record.image_file);
  const outputFormat = imageFormat(record.image_file);
  const prompt = buildImagePrompt(record);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size: SIZE,
      quality: QUALITY,
      output_format: outputFormat,
      n: 1,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${record.id}: image API failed ${response.status}: ${JSON.stringify(body)}`);
  }

  const imageBase64 = body.data?.[0]?.b64_json;
  if (!imageBase64) throw new Error(`${record.id}: image API response did not include data[0].b64_json`);

  await writeFile(imagePath, Buffer.from(imageBase64, 'base64'));
  record.generation_status = 'regenerated';
  record.quality_status = 'needs_review';
  record.generated_from = `${MODEL} direct JSON prompt regeneration at ${new Date().toISOString()}`;
  if (record.prompt && typeof record.prompt === 'object') {
    record.prompt.generation_status = record.generation_status;
    record.prompt.quality_status = record.quality_status;
  }
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  regenerated += 1;
  console.log(JSON.stringify({ ok: true, regenerated, id: record.id, image: relative(ROOT, imagePath) }));
  if (sleepMs > 0) await sleep(sleepMs);
}

console.log(JSON.stringify({ ok: true, regenerated }, null, 2));

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

function buildImagePrompt(record) {
  const prompt = record.prompt || {};
  const location = record.location || {};
  return [
    prompt.scene,
    '',
    `Location metadata: ${location.district || ''}, ${location.city || ''}, ${location.region || ''}, Somalia. Coordinates: ${location.lat}, ${location.lon}.`,
    `Timestamp context: ${record.timestamp}. Severity: ${record.severity}. Categories: ${(record.categories || []).join(', ')}.`,
    `Field note: ${record.short_note}.`,
    '',
    'Required visuals:',
    ...(prompt.required_visuals || []).map((item) => `- ${item}`),
    '',
    `Composition: ${prompt.composition}`,
    `Style: ${prompt.style}`,
    '',
    'Avoid:',
    ...(prompt.avoid || []).map((item) => `- ${item}`),
  ].filter(Boolean).join('\n');
}

function imageFormat(file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.png') return 'png';
  if (ext === '.webp') return 'webp';
  return 'jpeg';
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

function readArgNumber(name, fallback) {
  const raw = readArgValue(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
