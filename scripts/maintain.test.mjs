import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  detectOneDrivePath,
  validateDemoData,
  validateRepoShape,
} from './maintain.mjs';

test('detectOneDrivePath flags OneDrive-backed paths', () => {
  assert.equal(detectOneDrivePath('C:\\Users\\Admin\\OneDrive\\Documents\\Repo'), true);
  assert.equal(detectOneDrivePath('C:\\Users\\Admin\\src\\Repo'), false);
});

test('validateRepoShape reports missing expected files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'g4g-shape-'));
  await writeFile(join(root, 'README.md'), '# test\n');

  const result = await validateRepoShape(root);

  assert.equal(result.ok, false);
  assert(result.failures.some((failure) => failure.includes('AGENTS.md')));
});

test('validateRepoShape accepts the expected repo skeleton', async () => {
  const root = await mkdtemp(join(tmpdir(), 'g4g-shape-ok-'));
  await mkdir(join(root, 'api'), { recursive: true });
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(root, 'public', 'menu', 'fieldreport'), { recursive: true });
  await mkdir(join(root, 'public', 'menu', 'missioncontrol'), { recursive: true });
  await writeFile(join(root, 'README.md'), '# test\n');
  await writeFile(join(root, 'AGENTS.md'), 'Read DOMAIN_CONTEXT.md\n');
  await writeFile(join(root, 'DOMAIN_CONTEXT.md'), '# Domain\n');
  await writeFile(join(root, 'TODO.md'), '# Todo\n');
  await writeFile(join(root, 'remote.ps1'), 'param()\n');
  await writeFile(join(root, 'api', 'package.json'), '{"scripts":{"test":"node --test"}}\n');
  await writeFile(join(root, 'api', 'server.mjs'), 'export {}\n');
  await writeFile(join(root, 'api', 'server.test.mjs'), 'export {}\n');
  await writeFile(join(root, 'docs', 'architecture.md'), '# Architecture\n');
  await writeFile(join(root, 'docs', 'deployment.md'), '# Deployment\n');
  await writeFile(join(root, 'public', 'menu', 'index.html'), '<!doctype html>\n');
  await writeFile(join(root, 'public', 'menu', 'fieldreport', 'index.html'), '<!doctype html>\n');
  await writeFile(join(root, 'public', 'menu', 'missioncontrol', 'index.html'), '<!doctype html>\n');

  const result = await validateRepoShape(root);

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test('validateDemoData accepts paired demo metadata and image files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'g4g-demo-'));
  const dir = join(root, 'demo-images', 'water_quality');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'sample.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await writeFile(join(dir, 'sample.json'), JSON.stringify({
    id: 'sample',
    image_file: 'sample.jpg',
    categories: ['water_quality'],
    severity: 'high',
    timestamp: '2026-05-18T00:00:00.000Z',
    location: { city: 'Mogadishu', country: 'Somalia' },
  }));

  const result = await validateDemoData(root);

  assert.equal(result.ok, true);
  assert.equal(result.checked, 1);
  assert.deepEqual(result.failures, []);
});

test('validateDemoData reports missing referenced images', async () => {
  const root = await mkdtemp(join(tmpdir(), 'g4g-demo-missing-'));
  const dir = join(root, 'demo-images', 'water_quality');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'sample.json'), JSON.stringify({
    id: 'sample',
    image_file: 'missing.jpg',
    categories: ['water_quality'],
    severity: 'high',
    timestamp: '2026-05-18T00:00:00.000Z',
  }));

  const result = await validateDemoData(root);

  assert.equal(result.ok, false);
  assert.equal(result.checked, 1);
  assert(result.failures.some((failure) => failure.includes('missing.jpg')));
});
