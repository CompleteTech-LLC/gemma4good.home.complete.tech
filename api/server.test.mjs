import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from './server.mjs';

const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

test('health endpoint returns ok', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/fieldreport/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  } finally {
    await close();
  }
});

test('rejects missing image', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const res = await post(baseUrl, { tag: 'water_quality', district: 'Hodan' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'image_required');
  } finally {
    await close();
  }
});

test('analyze returns normalized model JSON', async () => {
  const { baseUrl, close } = await startTestServer({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Visible standing water near a damaged pipe.',
                  severity: 'high',
                  category: 'infrastructure',
                  observedIssues: ['Damaged pipe', 'Standing water'],
                  recommendedActions: ['Mark the area', 'Escalate repair'],
                  needsEscalation: true,
                  confidence: 0.82,
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ),
  });

  try {
    const res = await post(baseUrl, {
      imageDataUrl,
      tag: 'infrastructure',
      district: 'Hodan',
      city: 'Mogadishu',
      note: 'Pipe damage near queue.',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.severity, 'high');
    assert.equal(body.category, 'infrastructure');
    assert.equal(body.needsEscalation, true);
    assert.equal(body.model, 'test-model');
  } finally {
    await close();
  }
});

test('analyze can infer category without a user-selected tag', async () => {
  let modelRequest;
  const { baseUrl, close } = await startTestServer({
    fetchImpl: async (url, options) => {
      modelRequest = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Long queue at a water point suggests access pressure.',
                  severity: 'medium',
                  category: 'water_quality',
                  observedIssues: ['Long queue'],
                  recommendedActions: ['Verify queue duration'],
                  needsEscalation: false,
                  confidence: 0.63,
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    },
  });

  try {
    const res = await post(baseUrl, {
      imageDataUrl,
      district: 'Hodan',
      city: 'Mogadishu',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.category, 'water_quality');
    assert.match(modelRequest.messages[1].content[0].text, /infer the best category/);
  } finally {
    await close();
  }
});

test('falls back when model content is empty', async () => {
  const { baseUrl, close } = await startTestServer({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '', reasoning_content: 'thinking only' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ),
  });

  try {
    const res = await post(baseUrl, {
      imageDataUrl,
      tag: 'health_risk',
      district: 'Hodan',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.severity, 'high');
    assert.equal(body.category, 'health_risk');
    assert.equal(body.confidence, 0.2);
  } finally {
    await close();
  }
});

test('submit stores a reviewed draft report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gemma4good-report-'));
  const reportStorePath = join(dir, 'reports.jsonl');
  const { baseUrl, close } = await startTestServer({ reportStorePath });

  try {
    const res = await fetch(`${baseUrl}/api/fieldreport/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl,
        tag: 'infrastructure',
        district: 'Hodan',
        city: 'Mogadishu',
        note: 'Damaged pipe near a long queue.',
        analysis: {
          summary: 'Damaged pipe near a long queue.',
          severity: 'high',
          category: 'infrastructure',
          observedIssues: ['Damaged pipe'],
          recommendedActions: ['Inspect pipe'],
          needsEscalation: true,
          confidence: 0.75,
        },
      }),
    });

    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.match(body.reportId, /^[0-9a-f-]+$/);

    const stored = JSON.parse((await readFile(reportStorePath, 'utf8')).trim());
    assert.equal(stored.tag, 'infrastructure');
    assert.equal(stored.analysis.severity, 'high');
  } finally {
    await close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('reports endpoint returns submitted reports without image payloads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gemma4good-report-list-'));
  const reportStorePath = join(dir, 'reports.jsonl');
  const { baseUrl, close } = await startTestServer({ reportStorePath });

  try {
    const submitRes = await fetch(`${baseUrl}/api/fieldreport/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl,
        tag: 'water_quality',
        district: 'Hodan',
        city: 'Mogadishu',
        note: 'Discolored water near a queue.',
        lat: '2.0469',
        lon: '45.3182',
        analysis: {
          summary: 'Discolored water near a queue.',
          severity: 'high',
          category: 'water_quality',
          observedIssues: ['Discolored water'],
          recommendedActions: ['Test water quality'],
          needsEscalation: true,
          confidence: 0.7,
        },
      }),
    });
    assert.equal(submitRes.status, 202);

    const reportsRes = await fetch(`${baseUrl}/api/fieldreport/reports`);
    assert.equal(reportsRes.status, 200);
    const body = await reportsRes.json();
    assert.equal(body.ok, true);
    assert.equal(body.reports.length, 1);
    assert.equal(body.reports[0].district, 'Hodan');
    assert.equal(body.reports[0].analysis.severity, 'high');
    assert.equal(body.reports[0].imageDataUrl, undefined);
  } finally {
    await close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function startTestServer(options = {}) {
  const server = createServer({
    model: 'test-model',
    reportStorePath: options.reportStorePath,
    fetchImpl: options.fetchImpl || (async () => new Response('{}', { status: 500 })),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function post(baseUrl, payload) {
  return fetch(`${baseUrl}/api/fieldreport/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
