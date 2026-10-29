// The store name: long and searchable in the store ("KeepKeep – … for
// Instagram"), just "KeepKeep" inside the extension; scripts/package.sh
// accepts it and still refuses names that misuse the trademark.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));

test('the manifest has the store name and the short name', () => {
  expect(manifest.name).toBe('KeepKeep – Downloader & Anonymous Story Viewer for Instagram');
  expect([...manifest.name].length).toBeLessThanOrEqual(75);
  expect(manifest.short_name).toBe('KeepKeep');
  expect(manifest.action.default_title).toBe('KeepKeep');
});

// Runs package.sh on a copy of the extension whose manifest has `name`.
function packageWith(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepkeep-pkg-'));
  fs.cpSync(path.join(ROOT, 'extension'), path.join(dir, 'extension'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'LICENSE'), path.join(dir, 'LICENSE'));
  const file = path.join(dir, 'extension', 'manifest.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^  "name": ".*",$/m, `  "name": ${JSON.stringify(name)},`));
  try {
    execFileSync('bash', [path.join(dir, 'scripts', 'package.sh')], { stdio: 'pipe' });
    return 'ok';
  } catch (e) {
    return e.stderr.toString().trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('package.sh accepts the store name', () => {
  expect(packageWith(manifest.name)).toBe('ok');
});

test('package.sh counts characters, not bytes', () => {
  const at75 = 'KeepKeep – ' + 'x'.repeat(75 - 'KeepKeep – '.length - ' for Instagram'.length) + ' for Instagram';
  expect([...at75].length).toBe(75); // 77 bytes, because of the en dash
  expect(packageWith(at75)).toBe('ok');
  expect(packageWith(at75.replace('x', 'xx'))).toMatch(/76 characters; the store allows 75/);
});

test('the ZIP carries the license, and every file of KeepKeep\'s own points to it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keepkeep-pkg-'));
  try {
    for (const d of ['extension', 'scripts']) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
    fs.cpSync(path.join(ROOT, 'LICENSE'), path.join(dir, 'LICENSE'));
    execFileSync('bash', [path.join(dir, 'scripts', 'package.sh')], { stdio: 'pipe' });
    const zip = fs.readdirSync(path.join(dir, 'dist')).find((f) => f.endsWith('.zip'));
    const names = execFileSync('unzip', ['-Z1', path.join(dir, 'dist', zip)]).toString().split('\n');
    expect(names).toContain('LICENSE');
    expect(names).toContain('manifest.json');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const own = (d) => fs.readdirSync(path.join(ROOT, 'extension', d)).filter((f) => /\.(js|css|html)$/.test(f)).map((f) => path.join(d, f));
  for (const f of [...own(''), ...own('app')]) {
    expect(fs.readFileSync(path.join(ROOT, 'extension', f), 'utf8').split('\n').slice(0, 2).join('\n'), f).toContain('All rights reserved. Not open source: see LICENSE.');
  }
});

test('package.sh refuses names that misuse the trademark', () => {
  for (const bad of ['InstaKeep – Downloader', 'KeepKeep – Instagram Downloader', 'KeepKeep – Gram Saver for Instagram', 'KeepKeep for Insta']) {
    expect(packageWith(bad), bad).toMatch(/may only end the name/);
  }
});
