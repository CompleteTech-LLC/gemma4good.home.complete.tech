import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
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

async function startTestServer(options = {}) {
  const server = createServer({
    model: 'test-model',
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
