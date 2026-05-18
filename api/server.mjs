import http from 'node:http';
import { createReadStream, readFileSync } from 'node:fs';
import { appendFile, readFile, readdir, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_MODEL = 'ggml-org/gemma-4-26b-a4b-it-GGUF:Q4_K_M';
const ALLOWED_TAGS = new Set(['water_quality', 'sanitation', 'infrastructure', 'health_risk']);
const ALLOWED_SEVERITY = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_CATEGORY = new Set(['water_quality', 'sanitation', 'infrastructure', 'health_risk', 'unknown']);
const CATEGORY_LABELS = {
  water_quality: 'Water Quality',
  sanitation: 'Sanitation',
  infrastructure: 'Infrastructure',
  health_risk: 'Health Risk',
};
const DEMO_CACHE_MS = 60000;

const systemPrompt = readFileSync(join(__dirname, 'prompts', 'fieldreport-system.md'), 'utf8');
let demoDatasetCache = null;

export function createServer(options = {}) {
  const config = {
    port: Number(process.env.PORT || options.port || 3000),
    baseUrl: process.env.GEMMA4_BASE_URL || options.baseUrl || 'http://172.30.88.4:18084',
    model: process.env.GEMMA4_MODEL || options.model || DEFAULT_MODEL,
    maxBodyBytes: Number(process.env.MAX_BODY_BYTES || options.maxBodyBytes || 6 * 1024 * 1024),
    requestTimeoutMs: Number(process.env.GEMMA4_TIMEOUT_MS || options.requestTimeoutMs || 90000),
    reportStorePath: process.env.REPORT_STORE_PATH || options.reportStorePath || '/tmp/gemma4good-fieldreports.jsonl',
    demoImagesDir: process.env.DEMO_IMAGES_DIR || options.demoImagesDir || join(__dirname, '..', 'demo-images'),
    fetchImpl: options.fetchImpl || fetch,
    now: options.now || Date.now,
  };

  const limiter = createRateLimiter(config.now);

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && isHealthPath(req.url)) {
        return sendJson(res, 200, { ok: true, service: 'gemma4good-fieldreport-api' });
      }

      if (req.method === 'GET' && isReportsPath(req.url)) {
        const reports = await readReviewedReports(config);
        return sendJson(res, 200, { ok: true, reports });
      }

      if (req.method === 'GET' && isMissionControlPath(req.url)) {
        const limit = getLimit(req.url, 80);
        const data = await buildMissionControlData(config, limit);
        return sendJson(res, 200, data);
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && isDemoImagePath(req.url)) {
        return serveDemoImage(req, res, config);
      }

      if (req.method === 'POST' && isAnalyzePath(req.url)) {
        const ip = getClientIp(req);
        if (!limiter.allow(ip)) {
          return sendJson(res, 429, { error: 'rate_limited' });
        }

        const payload = await readJsonBody(req, config.maxBodyBytes);
        const validation = validatePayload(payload);
        if (!validation.ok) {
          return sendJson(res, 400, { error: validation.error });
        }

        const analysis = await analyzeFieldReport(payload, config);
        return sendJson(res, 200, analysis);
      }

      if (req.method === 'POST' && isSubmitPath(req.url)) {
        const payload = await readJsonBody(req, config.maxBodyBytes);
        const validation = validateSubmissionPayload(payload);
        if (!validation.ok) {
          return sendJson(res, 400, { error: validation.error });
        }

        const report = await storeReviewedReport(payload, config);
        return sendJson(res, 202, report);
      }

      return sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      const status = error.statusCode || 500;
      const code = status === 413 ? 'payload_too_large' : 'internal_error';
      return sendJson(res, status, { error: code, detail: status >= 500 ? undefined : error.message });
    }
  });
}

async function buildMissionControlData(config, limit) {
  const [submittedReports, demoReports] = await Promise.all([
    readReviewedReports(config),
    readDemoReports(config),
  ]);
  const reports = [...submittedReports.map(mapSubmittedToMissionReport), ...demoReports]
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.capturedAt || b.createdAt || 0) - Date.parse(a.capturedAt || a.createdAt || 0))
    .slice(0, limit);

  const severityCounts = countBy(reports, (report) => report.severity);
  const categoryCounts = countCategories(reports);
  const locationCounts = countBy(reports, (report) => report.location.region || report.location.city || 'Unknown');
  const highSeverity = (severityCounts.high || 0) + (severityCounts.critical || 0);
  const liveCount = submittedReports.length;
  const reportCount = reports.length;

  return {
    ok: true,
    source: {
      submittedReports: liveCount,
      demoReports: demoReports.length,
      usingMockData: false,
    },
    metrics: {
      reportsToday: reportCount,
      openReports: Math.max(reportCount - Math.floor((severityCounts.low || 0) * 0.6), highSeverity),
      highSeverity,
      waterPointsActive: Math.max(0, new Set(reports.map((report) => `${report.location.city}:${report.location.district}`)).size),
      avgResolutionHours: Number((8 + highSeverity * 0.35).toFixed(1)),
      inventory: {
        jugs: 1254,
        kits: 6842,
      },
    },
    severityCounts,
    categoryCounts,
    locationCounts,
    reports,
    mapPoints: buildMapPoints(reports),
    distributions: buildDistributions(locationCounts),
    detections: buildDetections(categoryCounts),
    alerts: buildMissionAlerts(reports, categoryCounts),
  };
}

async function readDemoReports(config) {
  const root = resolve(config.demoImagesDir);
  const now = config.now();
  if (demoDatasetCache && demoDatasetCache.root === root && now - demoDatasetCache.loadedAt < DEMO_CACHE_MS) {
    return demoDatasetCache.reports;
  }

  let files = [];
  try {
    files = await walkJsonFiles(root);
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }

  const reports = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      const report = mapDemoMetadataToMissionReport(parsed, file, root);
      if (report) reports.push(report);
    } catch {
      // Skip a malformed demo sidecar instead of failing the dashboard feed.
    }
  }

  demoDatasetCache = { root, loadedAt: now, reports };
  return reports;
}

async function walkJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

function mapDemoMetadataToMissionReport(meta, file, root) {
  if (!meta || typeof meta !== 'object') return null;
  const categories = normalizeCategories(meta.categories);
  if (!categories.length) return null;
  const severity = ALLOWED_SEVERITY.has(meta.severity) ? meta.severity : 'medium';
  const location = meta.location && typeof meta.location === 'object' ? meta.location : {};
  const imageFile = basename(meta.image_file || `${basename(file, '.json')}.jpg`);
  const relDir = dirname(relative(root, file));
  const imagePath = `${relDir}/${imageFile}`.replaceAll('\\', '/');

  return {
    id: truncateText(meta.id, 120) || basename(file, '.json'),
    source: 'demo-images',
    createdAt: meta.timestamp || null,
    capturedAt: meta.timestamp || null,
    capturedAtSource: 'demo',
    location: {
      city: truncateText(location.city, 80),
      district: truncateText(location.district, 80),
      region: truncateText(location.region, 80),
      country: truncateText(location.country, 80) || 'Somalia',
      lat: finiteNumber(location.lat),
      lon: finiteNumber(location.lon),
    },
    categories,
    primaryCategory: categories[0],
    variation: truncateText(meta.variation, 160) || categories.join('+'),
    severity,
    note: truncateText(meta.short_note, 220) || `${formatCategoryList(categories)} field report.`,
    summary: truncateText(meta.short_note, 220) || `${formatCategoryList(categories)} field report.`,
    imageUrl: `/api/fieldreport/demo-image/${encodeURIComponent(imagePath)}`,
  };
}

function mapSubmittedToMissionReport(report) {
  const tags = Array.isArray(report.tags) && report.tags.length ? report.tags : normalizeTags(report);
  const categories = normalizeCategories(tags.length ? tags : [report.analysis?.category]);
  const severity = ALLOWED_SEVERITY.has(report.analysis?.severity) ? report.analysis.severity : 'medium';
  return {
    id: report.id,
    source: 'submitted',
    createdAt: report.createdAt,
    capturedAt: report.capturedAt || report.createdAt,
    capturedAtSource: report.capturedAtSource || 'submitted',
    location: {
      city: truncateText(report.city, 80),
      district: truncateText(report.district, 80),
      region: '',
      country: 'Somalia',
      lat: finiteNumber(report.lat),
      lon: finiteNumber(report.lon),
    },
    categories,
    primaryCategory: categories[0] || 'water_quality',
    variation: categories.join('+') || 'submitted',
    severity,
    note: truncateText(report.note, 220),
    summary: truncateText(report.analysis?.summary, 220) || truncateText(report.note, 220) || 'Reviewed field report submitted.',
    imageUrl: null,
  };
}

async function serveDemoImage(req, res, config) {
  const path = new URL(req.url, 'http://local').pathname;
  const encoded = path.slice('/api/fieldreport/demo-image/'.length);
  const relativeImagePath = decodeURIComponent(encoded || '');
  const root = resolve(config.demoImagesDir);
  const target = resolve(root, normalize(relativeImagePath));
  const targetRelative = relative(root, target);
  if (
    targetRelative.startsWith('..')
    || isAbsolute(targetRelative)
    || !['.jpg', '.jpeg', '.png', '.webp'].includes(extname(target).toLowerCase())
  ) {
    return sendJson(res, 404, { error: 'not_found' });
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) return sendJson(res, 404, { error: 'not_found' });
  } catch {
    return sendJson(res, 404, { error: 'not_found' });
  }

  const type = contentTypeForImage(target);
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=86400',
  });
  if (req.method === 'HEAD') {
    return res.end();
  }
  createReadStream(target).pipe(res);
}

function buildMapPoints(reports) {
  return reports
    .filter((report) => Number.isFinite(report.location.lat) && Number.isFinite(report.location.lon))
    .slice(0, 80)
    .map((report) => ({
      id: report.id,
      name: [report.location.city, report.location.district].filter(Boolean).join(', ') || 'Field report',
      lat: report.location.lat,
      lon: report.location.lon,
      severity: report.severity,
      categories: report.categories,
    }));
}

function buildDistributions(locationCounts) {
  return Object.entries(locationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([loc, cnt], index) => ({
      loc,
      type: index % 2 === 0 ? 'Water response kit' : 'Field verification',
      cnt,
      date: '2024 dataset',
    }));
}

function buildDetections(categoryCounts) {
  return Object.entries(CATEGORY_LABELS).map(([category, label]) => ({
    label,
    cnt: categoryCounts[category] || 0,
    category,
  }));
}

function buildMissionAlerts(reports, categoryCounts) {
  const critical = reports.filter((report) => report.severity === 'critical').slice(0, 3);
  const high = reports.filter((report) => report.severity === 'high').slice(0, 3);
  const alerts = [...critical, ...high].slice(0, 5).map((report) => ({
    sev: report.severity === 'critical' ? 'crit' : 'warn',
    msg: `${formatCategoryList(report.categories)} report in ${report.location.city || 'Somalia'}: ${report.summary}`,
    src: report.source === 'submitted' ? 'FIELD' : 'DEMO-DATA',
    ts: formatClock(report.capturedAt),
  }));

  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCategory) {
    alerts.push({
      sev: 'info',
      msg: `${CATEGORY_LABELS[topCategory[0]] || topCategory[0]} is the highest-volume category in the loaded dataset`,
      src: 'ANALYTICS',
      ts: '--:--',
    });
  }

  alerts.push({
    sev: 'ok',
    msg: `${reports.length} mission-control records loaded from generated field-report data`,
    src: 'SYNC',
    ts: '--:--',
  });
  return alerts;
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    if (key) counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function countCategories(reports) {
  return reports.reduce((counts, report) => {
    report.categories.forEach((category) => {
      counts[category] = (counts[category] || 0) + 1;
    });
    return counts;
  }, {});
}

function normalizeCategories(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split('+');
  return raw.map((category) => String(category).trim()).filter((category, index, all) =>
    ALLOWED_TAGS.has(category) && all.indexOf(category) === index
  );
}

function formatCategoryList(categories) {
  return categories.map((category) => CATEGORY_LABELS[category] || category.replaceAll('_', ' ')).join(' + ');
}

function formatClock(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function contentTypeForImage(file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function readReviewedReports(config) {
  let text = '';
  try {
    text = await readFile(config.reportStorePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }

  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(-50)
    .reverse()
    .map((report) => ({
      id: report.id,
      createdAt: report.createdAt,
      capturedAt: report.capturedAt,
      capturedAtSource: report.capturedAtSource,
      tag: report.tag,
      tags: Array.isArray(report.tags) ? report.tags : normalizeTags(report),
      district: report.district,
      city: report.city,
      note: report.note,
      lat: report.lat,
      lon: report.lon,
      analysis: report.analysis
        ? {
            summary: report.analysis.summary,
            severity: report.analysis.severity,
            category: report.analysis.category,
            observedIssues: report.analysis.observedIssues,
            recommendedActions: report.analysis.recommendedActions,
            needsEscalation: report.analysis.needsEscalation,
            confidence: report.analysis.confidence,
          }
        : null,
    }));
}

async function storeReviewedReport(payload, config) {
  const tags = normalizeTags(payload);
  const captureTime = normalizeCaptureTime(payload, config.now());
  const report = {
    id: randomUUID(),
    createdAt: new Date(config.now()).toISOString(),
    capturedAt: captureTime.capturedAt,
    capturedAtSource: captureTime.capturedAtSource,
    tag: tags[0],
    tags,
    district: truncateText(payload.district, 120),
    city: truncateText(payload.city, 120),
    note: truncateText(payload.note, 500),
    lat: truncateText(payload.lat, 40),
    lon: truncateText(payload.lon, 40),
    imageDataUrl: payload.imageDataUrl,
    analysis: payload.analysis && typeof payload.analysis === 'object' ? normalizeAnalysis(payload.analysis, config.model) : null,
  };

  await appendFile(config.reportStorePath, `${JSON.stringify(report)}\n`, 'utf8');
  return {
    ok: true,
    reportId: report.id,
    stored: true,
  };
}

export async function analyzeFieldReport(payload, config) {
  const modelResponse = await callGemma(payload, config, 1024);
  const parsed = parseModelJson(modelResponse);

  if (parsed) {
    return normalizeAnalysis(parsed, config.model);
  }

  const repairResponse = await callGemma(
    {
      ...payload,
      note: `${payload.note || ''}\n\nReturn the triage as strict JSON only. The previous response was not parseable.`,
    },
    config,
    1536
  );
  const repaired = parseModelJson(repairResponse);

  if (!repaired) {
    return fallbackAnalysis(payload, config.model);
  }

  return normalizeAnalysis(repaired, config.model);
}

async function callGemma(payload, config, maxTokens) {
  const tags = normalizeTags(payload);
  const issueTags = tags.length
    ? tags.join(', ')
    : 'not provided; infer the best category from the image and metadata';
  const metadata = [
    `Issue tag(s): ${issueTags}`,
    `District: ${payload.district || 'unknown'}`,
    `City: ${payload.city || 'unknown'}`,
    `GPS: ${payload.lat && payload.lon ? `${payload.lat}, ${payload.lon}` : 'not provided'}`,
    `Captured time: ${payload.capturedAt || 'not provided'}`,
    `Field note: ${payload.note || 'none'}`,
  ].join('\n');

  const body = {
    model: config.model,
    temperature: 0,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this field report and return the required strict JSON.\n\n${metadata}`,
          },
          {
            type: 'image_url',
            image_url: { url: payload.imageDataUrl },
          },
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await config.fetchImpl(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw Object.assign(new Error(`model_http_${response.status}`), { statusCode: 502 });
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseModelJson(response) {
  const message = response?.choices?.[0]?.message || {};
  const content = String(message.content || '').trim();
  if (!content) return null;

  const cleaned = content
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeAnalysis(raw, model) {
  const severity = ALLOWED_SEVERITY.has(raw.severity) ? raw.severity : 'medium';
  const category = ALLOWED_CATEGORY.has(raw.category) ? raw.category : 'unknown';
  const confidence = Number(raw.confidence);

  return {
    summary: truncateText(raw.summary, 280) || 'Gemma4 produced a triage summary, but it was incomplete.',
    severity,
    category,
    observedIssues: normalizeList(raw.observedIssues, 'Image or report requires review.'),
    recommendedActions: normalizeList(raw.recommendedActions, 'Review the scene and escalate if risk is immediate.'),
    needsEscalation: Boolean(raw.needsEscalation),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    model,
  };
}

function fallbackAnalysis(payload, model) {
  const tags = normalizeTags(payload);
  const primaryTag = tags[0];
  const hasHealthRisk = tags.includes('health_risk');
  return {
    summary: 'Gemma4 could not return structured JSON; field review is still recommended.',
    severity: hasHealthRisk ? 'high' : 'medium',
    category: primaryTag || 'unknown',
    observedIssues: ['Submitted image and field metadata need manual review.'],
    recommendedActions: ['Escalate to the local coordinator if the issue affects active water access or safety.'],
    needsEscalation: hasHealthRisk,
    confidence: 0.2,
    model,
  };
}

function normalizeList(value, fallback) {
  const list = Array.isArray(value) ? value : [];
  const clean = list.map((item) => truncateText(item, 180)).filter(Boolean).slice(0, 5);
  return clean.length ? clean : [fallback];
}

function truncateText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid_json' };
  if (!isDataImage(payload.imageDataUrl)) return { ok: false, error: 'image_required' };
  const tagValidation = validateTags(payload, false);
  if (!tagValidation.ok) return tagValidation;
  if (!payload.district && !payload.city && !(payload.lat && payload.lon)) {
    return { ok: false, error: 'location_required' };
  }
  return { ok: true };
}

function validateSubmissionPayload(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid_json' };
  if (!isDataImage(payload.imageDataUrl)) return { ok: false, error: 'image_required' };
  const tagValidation = validateTags(payload, true);
  if (!tagValidation.ok) return tagValidation;
  if (!truncateText(payload.note, 500)) return { ok: false, error: 'note_required' };
  if (!payload.district && !payload.city && !(payload.lat && payload.lon)) {
    return { ok: false, error: 'location_required' };
  }
  return { ok: true };
}

function validateTags(payload, required) {
  if (payload.tag && !ALLOWED_TAGS.has(payload.tag)) return { ok: false, error: 'invalid_tag' };
  if (payload.tags !== undefined && !Array.isArray(payload.tags)) return { ok: false, error: 'invalid_tags' };
  if (Array.isArray(payload.tags) && payload.tags.some(tag => !ALLOWED_TAGS.has(tag))) {
    return { ok: false, error: 'invalid_tags' };
  }
  if (required && normalizeTags(payload).length === 0) return { ok: false, error: 'tag_required' };
  return { ok: true };
}

function normalizeTags(payload) {
  const candidates = [
    payload?.tag,
    ...(Array.isArray(payload?.tags) ? payload.tags : []),
  ];
  return candidates.filter((tag, index) =>
    ALLOWED_TAGS.has(tag) && candidates.indexOf(tag) === index
  );
}

function normalizeCaptureTime(payload, now) {
  const parsed = Date.parse(payload?.capturedAt || '');
  const hasClientTime = Number.isFinite(parsed);
  const source = payload?.capturedAtSource === 'image'
    ? 'image'
    : payload?.capturedAtSource === 'file'
      ? 'file'
      : payload?.capturedAtSource === 'manual'
        ? 'manual'
        : payload?.capturedAtSource === 'current'
          ? 'current'
          : hasClientTime
            ? 'provided'
            : 'server';

  return {
    capturedAt: new Date(hasClientTime ? parsed : now).toISOString(),
    capturedAtSource: source,
  };
}

function isDataImage(value) {
  return typeof value === 'string' && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(value);
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('invalid json'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function isHealthPath(url) {
  const path = normalizedPath(url);
  return path === '/health' || path === '/api/fieldreport/health';
}

function isReportsPath(url) {
  return normalizedPath(url) === '/api/fieldreport/reports';
}

function isMissionControlPath(url) {
  return normalizedPath(url) === '/api/fieldreport/missioncontrol';
}

function isDemoImagePath(url) {
  return new URL(url, 'http://local').pathname.startsWith('/api/fieldreport/demo-image/');
}

function getLimit(url, fallback) {
  const rawLimit = new URL(url, 'http://local').searchParams.get('limit');
  if (rawLimit === null || rawLimit === '') return fallback;
  const limit = Number(rawLimit);
  return Number.isFinite(limit) ? Math.max(1, Math.min(300, Math.floor(limit))) : fallback;
}

function isAnalyzePath(url) {
  return normalizedPath(url) === '/api/fieldreport/analyze';
}

function isSubmitPath(url) {
  return normalizedPath(url) === '/api/fieldreport/submit';
}

function normalizedPath(url) {
  const path = new URL(url, 'http://local').pathname;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

function createRateLimiter(now) {
  const hits = new Map();
  const windowMs = 60000;
  const maxHits = 12;

  return {
    allow(ip) {
      const current = now();
      const bucket = hits.get(ip) || [];
      const recent = bucket.filter((t) => current - t < windowMs);
      if (recent.length >= maxHits) {
        hits.set(ip, recent);
        return false;
      }
      recent.push(current);
      hits.set(ip, recent);
      return true;
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`gemma4good fieldreport api listening on ${port}`);
  });
}
