import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_MODEL = 'ggml-org/gemma-4-26b-a4b-it-GGUF:Q4_K_M';
const ALLOWED_TAGS = new Set(['water_quality', 'sanitation', 'infrastructure', 'health_risk']);
const ALLOWED_SEVERITY = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_CATEGORY = new Set(['water_quality', 'sanitation', 'infrastructure', 'health_risk', 'unknown']);

const systemPrompt = readFileSync(join(__dirname, 'prompts', 'fieldreport-system.md'), 'utf8');

export function createServer(options = {}) {
  const config = {
    port: Number(process.env.PORT || options.port || 3000),
    baseUrl: process.env.GEMMA4_BASE_URL || options.baseUrl || 'http://172.30.88.4:18084',
    model: process.env.GEMMA4_MODEL || options.model || DEFAULT_MODEL,
    maxBodyBytes: Number(process.env.MAX_BODY_BYTES || options.maxBodyBytes || 6 * 1024 * 1024),
    requestTimeoutMs: Number(process.env.GEMMA4_TIMEOUT_MS || options.requestTimeoutMs || 90000),
    fetchImpl: options.fetchImpl || fetch,
    now: options.now || Date.now,
  };

  const limiter = createRateLimiter(config.now);

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && isHealthPath(req.url)) {
        return sendJson(res, 200, { ok: true, service: 'gemma4good-fieldreport-api' });
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

      return sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      const status = error.statusCode || 500;
      const code = status === 413 ? 'payload_too_large' : 'internal_error';
      return sendJson(res, status, { error: code, detail: status >= 500 ? undefined : error.message });
    }
  });
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
  const issueTag = ALLOWED_TAGS.has(payload.tag)
    ? payload.tag
    : 'not provided; infer the best category from the image and metadata';
  const metadata = [
    `Issue tag: ${issueTag}`,
    `District: ${payload.district || 'unknown'}`,
    `City: ${payload.city || 'unknown'}`,
    `GPS: ${payload.lat && payload.lon ? `${payload.lat}, ${payload.lon}` : 'not provided'}`,
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
  return {
    summary: 'Gemma4 could not return structured JSON; field review is still recommended.',
    severity: payload.tag === 'health_risk' ? 'high' : 'medium',
    category: ALLOWED_TAGS.has(payload.tag) ? payload.tag : 'unknown',
    observedIssues: ['Submitted image and field metadata need manual review.'],
    recommendedActions: ['Escalate to the local coordinator if the issue affects active water access or safety.'],
    needsEscalation: payload.tag === 'health_risk',
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
  if (payload.tag && !ALLOWED_TAGS.has(payload.tag)) return { ok: false, error: 'invalid_tag' };
  if (!payload.district && !payload.city && !(payload.lat && payload.lon)) {
    return { ok: false, error: 'location_required' };
  }
  return { ok: true };
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
  const path = new URL(url, 'http://local').pathname;
  return path === '/health' || path === '/api/fieldreport/health';
}

function isAnalyzePath(url) {
  return new URL(url, 'http://local').pathname === '/api/fieldreport/analyze';
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
