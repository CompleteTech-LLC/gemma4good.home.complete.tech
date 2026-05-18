import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DEMO_DIR = join(ROOT, 'demo-images');
const COMFY_URL = (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
const CHECKPOINT = process.env.COMFYUI_CHECKPOINT || 'v1-5-pruned-emaonly.ckpt';
const WIDTH = Number(process.env.COMFYUI_WIDTH || 768);
const HEIGHT = Number(process.env.COMFYUI_HEIGHT || 1024);
const STEPS = Number(process.env.COMFYUI_STEPS || 28);
const CFG = Number(process.env.COMFYUI_CFG || 7);
const SAMPLER = process.env.COMFYUI_SAMPLER || 'euler';
const SCHEDULER = process.env.COMFYUI_SCHEDULER || 'normal';
const CATEGORY_PROMPTS = {
  water_quality: 'close-up brown turbid water, cloudy dirty water in yellow jerrycan or plastic bucket, visible sediment, unsafe drinking water source',
  sanitation: 'stagnant wastewater, muddy drainage ditch, scattered plastic litter, dirty runoff beside a public water point',
  infrastructure: 'close-up broken public water tap, leaking blue PVC pipe, cracked valve, damaged hand pump, wet ground from water-system failure',
  health_risk: 'unsafe muddy collection path, open water containers near puddles, constrained water access point, distant non-identifiable adults only',
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const check = args.has('--check');
const force = args.has('--force');
const limit = readArgNumber('--limit', Infinity);
const onlyRecord = readArgValue('--record');

if (check) {
  const stats = await comfyJson('/system_stats');
  console.log(JSON.stringify({ ok: true, comfyUrl: COMFY_URL, stats }, null, 2));
  process.exit(0);
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
    comfyUrl: COMFY_URL,
    checkpoint: CHECKPOINT,
    size: `${WIDTH}x${HEIGHT}`,
    count: records.length,
    records: records.slice(0, 10).map(({ file, record }) => ({
      id: record.id,
      json: relative(ROOT, file),
      image: relative(ROOT, join(dirname(file), record.image_file)),
      promptPreview: buildPrompt(record).slice(0, 500),
    })),
  }, null, 2));
  process.exit(0);
}

let regenerated = 0;
for (const { file, record } of records) {
  const promptId = await queuePrompt(record);
  const output = await waitForImage(promptId);
  const image = await comfyImage(output);
  const imagePath = join(dirname(file), record.image_file);
  await writeFile(imagePath, Buffer.from(await image.arrayBuffer()));

  record.generation_status = 'regenerated';
  record.quality_status = 'needs_review';
  record.generated_from = `ComfyUI ${CHECKPOINT} direct JSON prompt regeneration at ${new Date().toISOString()}`;
  if (record.prompt && typeof record.prompt === 'object') {
    record.prompt.generation_status = record.generation_status;
    record.prompt.quality_status = record.quality_status;
  }
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  regenerated += 1;
  console.log(JSON.stringify({ ok: true, regenerated, id: record.id, image: relative(ROOT, imagePath) }));
}

console.log(JSON.stringify({ ok: true, regenerated }, null, 2));

async function queuePrompt(record) {
  const body = await comfyJson('/prompt', {
    method: 'POST',
    body: JSON.stringify({ prompt: workflow(record) }),
  });
  if (!body.prompt_id) throw new Error(`${record.id}: ComfyUI did not return prompt_id`);
  return body.prompt_id;
}

async function waitForImage(promptId) {
  const deadline = Date.now() + Number(process.env.COMFYUI_TIMEOUT_MS || 15 * 60 * 1000);
  while (Date.now() < deadline) {
    const history = await comfyJson(`/history/${encodeURIComponent(promptId)}`);
    const entry = history[promptId];
    const images = entry?.outputs?.['9']?.images;
    if (Array.isArray(images) && images[0]) return images[0];
    await sleep(1000);
  }
  throw new Error(`${promptId}: timed out waiting for ComfyUI output`);
}

async function comfyImage(output) {
  const params = new URLSearchParams({
    filename: output.filename,
    subfolder: output.subfolder || '',
    type: output.type || 'output',
  });
  const response = await fetch(`${COMFY_URL}/view?${params}`);
  if (!response.ok) throw new Error(`ComfyUI image fetch failed ${response.status}`);
  return response;
}

async function comfyJson(path, options = {}) {
  const response = await fetch(`${COMFY_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`ComfyUI ${path} failed ${response.status}`);
  return response.json();
}

function workflow(record) {
  const seed = hashSeed(record.id || basename(record.image_file || 'gemma4good'));
  return {
    3: {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: STEPS,
        cfg: CFG,
        sampler_name: SAMPLER,
        scheduler: SCHEDULER,
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CHECKPOINT } },
    5: { class_type: 'EmptyLatentImage', inputs: { width: WIDTH, height: HEIGHT, batch_size: 1 } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: buildPrompt(record), clip: ['4', 1] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: buildNegativePrompt(record), clip: ['4', 1] } },
    8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    9: { class_type: 'SaveImage', inputs: { filename_prefix: `gemma4good/${record.id || 'demo'}`, images: ['8', 0] } },
  };
}

function buildPrompt(record) {
  const prompt = record.prompt || {};
  const location = record.location || {};
  const required = Array.isArray(prompt.required_visuals) ? prompt.required_visuals : [];
  const categoryTerms = (record.categories || []).map((category) => category.replaceAll('_', ' ')).join(', ');
  const categoryPrompts = (record.categories || []).map((category) => CATEGORY_PROMPTS[category]).filter(Boolean).join(', ');
  return [
    categoryPrompts,
    `photorealistic smartphone field report photo of ${categoryTerms}`,
    `visible evidence: ${required.slice(0, 5).join(', ')}`,
    `specific field note: ${record.short_note}`,
    `location context: ${location.district || location.city || 'Somalia'}, ${location.region || 'Somalia'}`,
    'Somalia humanitarian water and sanitation report, natural daylight, handheld mobile photo, imperfect framing, realistic shadows, documentary realism',
    'water point, roadside settlement, dry soil, practical public infrastructure, no text',
  ].filter(Boolean).join(', ');
}

function buildNegativePrompt(record) {
  const prompt = record.prompt || {};
  return [
    'text, caption, label, UI, logo, watermark, cartoon, illustration, CGI, cinematic grading, staged disaster',
    'gore, injury, illness, identifiable face, identifiable child, military, politics, weapon, flag',
    ...(prompt.avoid || []),
  ].filter(Boolean).join(', ');
}

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

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
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
