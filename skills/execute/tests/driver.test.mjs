import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIVER = resolve(__dirname, '..', 'driver.mjs');
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const INFO_PATH = join(tmpdir(), 'veriagent-browser.json');

/**
 * Run a driver command synchronously and return parsed JSON output.
 */
function run(...args) {
  const cmd = args.map(a => typeof a === 'string' && a.includes(' ') ? `'${a}'` : a).join(' ');
  const result = execSync(`node ${DRIVER} ${cmd}`, {
    encoding: 'utf-8',
    timeout: 60_000,
  });
  // Parse the last non-empty line as JSON (in case of extra output)
  const lines = result.trim().split('\n').filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

describe('driver.mjs', () => {
  let wsEndpoint;
  let launchProc;

  before(async () => {
    // Clean up any leftover info file
    try { unlinkSync(INFO_PATH); } catch { /* ignore */ }

    // Launch browser in background
    launchProc = spawn('node', [DRIVER, 'launch', '--headless'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    // Collect stdout to get the wsEndpoint
    const launchOutput = await new Promise((resolve, reject) => {
      let data = '';
      const timeout = setTimeout(() => reject(new Error('Launch timed out')), 30_000);

      launchProc.stdout.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('\n')) {
          clearTimeout(timeout);
          resolve(data.trim());
        }
      });

      launchProc.stderr.on('data', (chunk) => {
        // Log stderr for debugging but don't fail
        process.stderr.write(`[launch stderr] ${chunk}`);
      });

      launchProc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      launchProc.on('exit', (code) => {
        if (!data.includes('\n')) {
          clearTimeout(timeout);
          reject(new Error(`Launch exited with code ${code} before producing output`));
        }
      });
    });

    const parsed = JSON.parse(launchOutput.split('\n').filter(Boolean)[0]);
    wsEndpoint = parsed.wsEndpoint;
    assert.ok(wsEndpoint, 'wsEndpoint should be defined');
    assert.ok(wsEndpoint.startsWith('ws://'), 'wsEndpoint should be a ws:// URL');

    // Give the browser a moment to be ready
    await sleep(500);
  });

  after(async () => {
    // Close the browser via the close command (kills Chromium)
    if (wsEndpoint) {
      try { run('close', wsEndpoint); } catch { /* ignore */ }
    }
    // Ensure the launch wrapper process is also dead
    if (launchProc && !launchProc.killed) {
      launchProc.kill('SIGTERM');
    }
    // Clean up
    try { unlinkSync(INFO_PATH); } catch { /* ignore */ }
    // Give processes time to clean up
    await sleep(500);
  });

  it('launch outputs valid JSON with wsEndpoint', () => {
    assert.ok(wsEndpoint, 'wsEndpoint was captured from launch');
    assert.ok(wsEndpoint.startsWith('ws://'), 'wsEndpoint is a websocket URL');
    assert.ok(existsSync(INFO_PATH), 'info file was created');
    const info = JSON.parse(readFileSync(INFO_PATH, 'utf-8'));
    assert.ok(info.pid, 'info file contains pid');
    assert.ok(info.wsEndpoint, 'info file contains wsEndpoint');
  });

  it('goto navigates to a URL', () => {
    const result = run('goto', wsEndpoint, 'https://example.com');
    assert.deepStrictEqual(result, { ok: true });
  });

  it('info returns current URL and title', () => {
    const result = run('info', wsEndpoint);
    assert.strictEqual(result.ok, true);
    assert.ok(result.url.includes('example.com'), `URL should contain example.com, got: ${result.url}`);
    assert.ok(typeof result.title === 'string', 'title should be a string');
  });

  it('screenshot creates a file', () => {
    const screenshotPath = join(tmpdir(), 'veriagent-test-screenshot.png');
    try { unlinkSync(screenshotPath); } catch { /* ignore */ }

    const result = run('screenshot', wsEndpoint, screenshotPath);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.path, screenshotPath);
    assert.ok(existsSync(screenshotPath), 'screenshot file should exist');

    // Clean up
    try { unlinkSync(screenshotPath); } catch { /* ignore */ }
  });

  it('snapshot returns element descriptions', () => {
    // example.com has links and headings
    const result = run('snapshot', wsEndpoint);
    assert.strictEqual(result.ok, true);
    assert.ok(typeof result.elements === 'string', 'elements should be a string');
    assert.ok(result.elements.length > 0, 'elements should not be empty');
    // example.com has at least a "More information..." link
    assert.ok(result.elements.includes('a '), 'should contain anchor elements');
  });

  it('returns error for invalid wsEndpoint', () => {
    const result = run('goto', 'ws://127.0.0.1:99999/invalid', 'https://example.com');
    assert.strictEqual(result.ok, false);
    assert.ok(typeof result.error === 'string', 'error should be a string');
    assert.ok(result.error.length > 0, 'error message should not be empty');
  });

  it('returns error for unknown command', () => {
    const result = run('nonexistent');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes('Unknown command'), 'should report unknown command');
  });
});
