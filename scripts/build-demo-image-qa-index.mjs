import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DEMO_DIR = join(ROOT, 'demo-images');
const OUTPUT = join(ROOT, 'docs', 'demo-images-qa-index.html');

const records = [];
for (const file of await walkJson(DEMO_DIR)) {
  const record = JSON.parse(await readFile(file, 'utf8'));
  const imagePath = join(dirname(file), record.image_file);
  records.push({
    id: record.id || basename(file, '.json'),
    image: relative(dirname(OUTPUT), imagePath).replaceAll('\\', '/'),
    json: relative(ROOT, file).replaceAll('\\', '/'),
    variation: record.variation,
    severity: record.severity,
    categories: Array.isArray(record.categories) ? record.categories : [],
    location: record.location || {},
    note: record.short_note || '',
    generationStatus: record.generation_status || 'pending_regeneration',
    qualityStatus: record.quality_status || 'needs_review',
  });
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, render(records), 'utf8');
console.log(JSON.stringify({ ok: true, output: relative(ROOT, OUTPUT), records: records.length }, null, 2));

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

function render(records) {
  const counts = records.reduce((acc, record) => {
    acc[record.qualityStatus] = (acc[record.qualityStatus] || 0) + 1;
    return acc;
  }, {});

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gemma4Good Demo Image QA</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #08111a; color: #e8f2ff; }
    body { margin: 0; padding: 24px; }
    header { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
    .meta { color: #8fb2cf; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    article { border: 1px solid #20364a; border-radius: 8px; background: #0e1a26; overflow: hidden; }
    img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #111; }
    .body { padding: 12px; display: grid; gap: 8px; }
    .id { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; color: #91d8ff; overflow-wrap: anywhere; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge { border: 1px solid #31536f; border-radius: 999px; padding: 3px 7px; font-size: 11px; color: #b8dcf4; }
    .note { margin: 0; color: #dcefff; font-size: 13px; line-height: 1.35; }
    .cmd { margin: 0; padding: 8px; background: #07101a; border-radius: 6px; color: #98e6b7; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Gemma4Good Demo Image QA</h1>
      <div class="meta">${records.length} records · approved ${counts.approved || 0} · rejected ${counts.rejected || 0} · needs review ${counts.needs_review || 0}</div>
    </div>
    <div class="meta">Generated ${escapeHtml(new Date().toISOString())}</div>
  </header>
  <main class="grid">
${records.map(renderCard).join('\n')}
  </main>
</body>
</html>
`;
}

function renderCard(record) {
  const location = [record.location.district, record.location.city, record.location.region].filter(Boolean).join(', ');
  const approveCommand = `node scripts/update-demo-image-quality.mjs --id ${record.id} --status approved`;
  const rejectCommand = `node scripts/update-demo-image-quality.mjs --id ${record.id} --status rejected`;
  return `    <article>
      <img src="${escapeHtml(record.image)}" alt="${escapeHtml(record.id)}">
      <div class="body">
        <div class="id">${escapeHtml(record.id)}</div>
        <div class="badges">
          <span class="badge">${escapeHtml(record.variation)}</span>
          <span class="badge">${escapeHtml(record.severity)}</span>
          <span class="badge">${escapeHtml(record.generationStatus)}</span>
          <span class="badge">${escapeHtml(record.qualityStatus)}</span>
        </div>
        <p class="note">${escapeHtml(location)}</p>
        <p class="note">${escapeHtml(record.note)}</p>
        <p class="cmd">${escapeHtml(approveCommand)}</p>
        <p class="cmd">${escapeHtml(rejectCommand)}</p>
      </div>
    </article>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}
