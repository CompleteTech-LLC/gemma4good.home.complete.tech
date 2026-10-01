import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DEMO_DIR = join(ROOT, 'demo-images');
const PROMPT_VERSION = 'v2-direct-photo';
const GENERATION_STATUS = 'pending_regeneration';
const QUALITY_STATUS = 'needs_review';

const CATEGORY_VISUALS = {
  water_quality: [
    'turbid brown water visible in a jerrycan, bucket, shallow basin, well opening, or public tap flow',
    'sediment, cloudiness, oily sheen, or suspended particles visible without adding labels or text',
    'water source framed as the main evidence in a practical field-report photo',
  ],
  sanitation: [
    'standing wastewater, poor drainage, scattered litter, muddy runoff, or blocked channel near the water point',
    'non-graphic environmental sanitation issue visible in the surrounding ground and access path',
    'wet mud, plastic debris, and drainage flow shown as context rather than as a staged disaster scene',
  ],
  infrastructure: [
    'leaking pipe, broken tap, damaged valve, cracked storage tank, or broken hand pump',
    'wet ground or pooling water caused by a water-system failure',
    'damaged hardware shown clearly enough for a field coordinator to understand the repair need',
  ],
  health_risk: [
    'unsafe collection area, muddy standing water, crowding pressure, or open containers near poor drainage',
    'any people are distant, non-identifiable adults only, with faces turned away or too small to identify',
    'risk is environmental and access-related, with no visible illness, injury, or medical symptoms',
  ],
};

const CATEGORY_ANCHORS = {
  water_quality: [
    'a scratched yellow jerrycan half-filled with opaque brown water',
    'a shallow metal basin holding cloudy water with visible sediment',
    'a public tap dripping discolored water into a plastic container',
    'a hand-dug well opening with cloudy water visible below the rim',
  ],
  sanitation: [
    'a blocked drainage rut with stagnant grey water beside the access path',
    'muddy runoff crossing a footpath near a public water point',
    'scattered plastic waste caught along a shallow drainage channel',
    'standing wastewater collecting beside a roadside water stand',
  ],
  infrastructure: [
    'a cracked blue PVC pipe spraying water onto compacted soil',
    'a broken tap head with water leaking around the joint',
    'a damaged hand pump base surrounded by wet ground',
    'a patched storage tank valve dripping into a shallow puddle',
  ],
  health_risk: [
    'a slippery muddy approach path beside water containers',
    'several distant adults waiting near a constrained collection point',
    'open household containers placed close to stagnant runoff',
    'a narrow unsafe collection area with puddles around the footpath',
  ],
};

const SEVERITY_TONE = {
  low: 'minor but visible issue, routine follow-up level',
  medium: 'clear field concern needing coordinator review',
  high: 'serious visible concern that should be prioritized',
  critical: 'urgent visible concern, but still realistic and not exaggerated',
};

const REGION_CONTEXT = {
  Banaadir: 'dense urban roadside surroundings with concrete edges and compacted sandy soil',
  Nugaal: 'dry inland town surroundings with pale dust, stone edges, and sparse shade',
  Awdal: 'semi-arid town edge with rocky ground and simple masonry walls',
  Hiraan: 'riverine town setting with damp soil patches and simple public infrastructure',
  'Lower Shabelle': 'lowland settlement edge with sandy mud, drainage paths, and small roadside structures',
  Gedo: 'dry rural settlement or roadside setting with scrub, dust, and simple water infrastructure',
  Bay: 'inland settlement setting with red-brown earth, simple walls, and dry-season light',
  Togdheer: 'arid northern town setting with dusty ground and simple concrete water points',
  'Lower Juba': 'southern roadside settlement setting with humid light, mud patches, and drainage channels',
  Sanaag: 'rocky northern settlement edge with dry light and rugged ground texture',
  Mudug: 'dry central town setting with compacted earth, stone, and roadside utility hardware',
  Bari: 'northeastern town setting with bright dry daylight, stone, and pale concrete',
  Galguduud: 'central Somalia settlement edge with dry soil, sparse vegetation, and practical water access',
  'Maroodi Jeex': 'northern urban edge with dusty ground, simple walls, and public water hardware',
};

const AVOID = [
  'text inside the image, labels, captions, UI, logos, watermarks, branded products',
  'cartoon style, illustration, CGI, cinematic color grading, dramatic disaster staging',
  'gore, injury, visible disease symptoms, medical treatment scenes',
  'identifiable faces, identifiable children, posed portraits',
  'political, military, weapons, uniforms, flags, or conflict imagery',
  'extra issue categories that are not listed in the JSON categories',
];

const files = await walkJson(DEMO_DIR);
let updated = 0;

for (const file of files) {
  const record = JSON.parse(await readFile(file, 'utf8'));
  const prompt = buildPrompt(record, file);
  record.prompt = prompt;
  record.prompt_version = PROMPT_VERSION;
  record.generation_status = GENERATION_STATUS;
  record.quality_status = QUALITY_STATUS;
  record.generated_from = 'JSON prompt spec pending direct per-record regeneration';
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  updated += 1;
}

console.log(JSON.stringify({ ok: true, updated, promptVersion: PROMPT_VERSION }, null, 2));

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

function buildPrompt(record, file) {
  const categories = Array.isArray(record.categories) ? record.categories : [];
  const location = record.location || {};
  const regionContext = REGION_CONTEXT[location.region] || 'Somalia settlement surroundings with practical public water infrastructure';
  const index = Number((basename(file).match(/_(\d{2})\.json$/) || [])[1] || 1);
  const anchor = categories.map((category, offset) => pick(CATEGORY_ANCHORS[category], index + offset)).filter(Boolean);
  const requiredVisuals = [
    ...categories.flatMap((category) => CATEGORY_VISUALS[category] || []),
    ...anchor.map((item) => `specific visible anchor: ${item}`),
    `severity reads as ${record.severity}: ${SEVERITY_TONE[record.severity] || 'visible field concern'}`,
    `location context: ${location.district || location.city}, ${location.region || 'Somalia'} with ${regionContext}`,
    `field note to visualize: ${record.short_note}`,
  ];

  return {
    prompt_version: PROMPT_VERSION,
    scene: `A direct photorealistic smartphone field-report photo from ${location.district || location.city}, ${location.city || ''}, ${location.region || ''}, Somalia, captured in natural daylight during a 2024 humanitarian water and sanitation report. The image should look like one practical mobile upload from a field user, not a collage or presentation graphic.`,
    required_visuals: unique(requiredVisuals),
    composition: buildComposition(record, categories, index),
    style: 'Photorealistic-natural documentary mobile photo, natural daylight, imperfect handheld framing, realistic scale and materials, believable shadows, normal phone-camera sharpness, no artificial polish.',
    avoid: AVOID,
    generation_status: GENERATION_STATUS,
    quality_status: QUALITY_STATUS,
  };
}

function buildComposition(record, categories, index) {
  const angles = [
    'eye-level phone photo with the main evidence in the lower half and surrounding context visible',
    'slightly downward phone angle from a standing field user, close enough to inspect the issue',
    'off-center mobile framing with foreground evidence and background water-point context',
    'vertical smartphone-style framing cropped tightly around the water access problem',
  ];
  const categoryPhrase = categories.map((category) => category.replaceAll('_', ' ')).join(', ');
  return `${pick(angles, index)}. One single realistic photo containing only these issue categories: ${categoryPhrase}. Do not use a contact sheet or separate panels.`;
}

function pick(list = [], seed) {
  return list.length ? list[(seed - 1) % list.length] : '';
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
