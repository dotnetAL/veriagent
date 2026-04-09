#!/usr/bin/env node

import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const INFO_PATH = join(tmpdir(), 'veriagent-browser.json');
const CONNECT_TIMEOUT = 10_000;
const ACTION_TIMEOUT = 30_000;

/**
 * Dynamically import playwright, trying several resolution strategies.
 */
async function loadPlaywright() {
  // Try standard import (works if playwright is in node_modules)
  try {
    return await import('playwright');
  } catch { /* fall through */ }

  // Try playwright-core as fallback
  try {
    return await import('playwright-core');
  } catch { /* fall through */ }

  // Try using createRequire from the project root for monorepo/hoisted setups
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(resolve(process.cwd(), 'package.json'));
    const pw = require('playwright');
    return pw;
  } catch { /* fall through */ }

  throw new Error(
    'Could not find playwright. Install it with:\n' +
    '  npm install -D playwright && npx playwright install chromium'
  );
}

/**
 * Output JSON to stdout.
 */
function output(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

/**
 * Parse CLI arguments into a simple object.
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const positional = [];
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      // Check if next arg is a value (not a flag)
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(args[i]);
    }
  }

  return { command, positional, flags };
}

// ─── Commands ──────────────────────────────────────────────────────────

/**
 * Launch Chromium with a remote debugging port, output the CDP websocket URL.
 * The browser runs as a detached child process; this command stays alive to
 * track its PID but the caller runs it in the background.
 *
 * Uses connectOverCDP so that page state persists across connect/disconnect cycles.
 */
async function cmdLaunch(flags) {
  const { chromium } = await loadPlaywright();
  const headless = !flags.headed;
  const viewport = flags.viewport
    ? { width: parseInt(flags.viewport.split('x')[0], 10), height: parseInt(flags.viewport.split('x')[1], 10) }
    : { width: 1280, height: 720 };

  const execPath = chromium.executablePath();
  if (!execPath) {
    throw new Error('Chromium executable not found. Run: npx playwright install chromium');
  }
  // Verify the executable actually exists
  try {
    const { accessSync } = await import('node:fs');
    accessSync(execPath);
  } catch {
    throw new Error(
      `Chromium executable not found at ${execPath}\n` +
      'Run: npx playwright install chromium'
    );
  }
  const userDataDir = mkdtempSync(join(tmpdir(), 'veriagent-chrome-'));

  const launchArgs = [
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    `--user-data-dir=${userDataDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
  ];

  if (headless) {
    launchArgs.push('--headless=new');
  }

  const child = spawn(execPath, launchArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });

  // The CDP endpoint is printed to stderr by Chromium
  const cdpEndpoint = await new Promise((resolve, reject) => {
    let stderrData = '';
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for CDP endpoint')), 15_000);

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
      const match = stderrData.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chromium exited with code ${code} before CDP was ready`));
    });
  });

  // Open a default page with the desired viewport
  try {
    const browser = await chromium.connectOverCDP(cdpEndpoint);
    const context = browser.contexts()[0];
    if (context) {
      // Set viewport on the default page
      const pages = context.pages();
      if (pages.length > 0) {
        await pages[0].setViewportSize(viewport);
      }
    }
    // Disconnect client, browser stays alive
    await browser.close();
  } catch { /* best effort */ }

  // Write info file so close can find the PID
  writeFileSync(INFO_PATH, JSON.stringify({
    wsEndpoint: cdpEndpoint,
    pid: child.pid,
    viewport,
    userDataDir,
  }));

  // Output the wsEndpoint for the caller
  output({ wsEndpoint: cdpEndpoint });

  // Keep process alive so we can track the child, but unref so it doesn't
  // prevent the caller from reading stdout and continuing
  child.unref();

  // Stay alive to maintain the tracking, clean up on signals
  process.stdin.resume();

  const cleanup = () => {
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
    try { unlinkSync(INFO_PATH); } catch { /* ignore */ }
  };

  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
}

/**
 * Connect to a running browser via CDP, get the active page, run fn, then disconnect.
 * Page state persists across connections because we use connectOverCDP.
 */
async function withPage(wsEndpoint, fn) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: CONNECT_TIMEOUT });
  try {
    const contexts = browser.contexts();
    let page;
    if (contexts.length > 0 && contexts[0].pages().length > 0) {
      page = contexts[0].pages()[0];
    } else {
      const ctx = contexts.length > 0 ? contexts[0] : await browser.newContext();
      page = await ctx.newPage();
    }
    return await fn(page, browser);
  } finally {
    // Disconnect only — connectOverCDP's close() disconnects without killing the browser
    await browser.close().catch(() => {});
  }
}

async function cmdGoto(wsEndpoint, url) {
  await withPage(wsEndpoint, async (page) => {
    await page.goto(url, { timeout: ACTION_TIMEOUT, waitUntil: 'domcontentloaded' });
    output({ ok: true });
  });
}

async function cmdScreenshot(wsEndpoint, savePath) {
  await withPage(wsEndpoint, async (page) => {
    const absPath = resolve(savePath);
    await page.screenshot({ path: absPath, timeout: ACTION_TIMEOUT });
    output({ ok: true, path: absPath });
  });
}

async function cmdClick(wsEndpoint, selector) {
  await withPage(wsEndpoint, async (page) => {
    await page.click(selector, { timeout: ACTION_TIMEOUT });
    output({ ok: true });
  });
}

async function cmdFill(wsEndpoint, selector, value) {
  await withPage(wsEndpoint, async (page) => {
    await page.fill(selector, value, { timeout: ACTION_TIMEOUT });
    output({ ok: true });
  });
}

async function cmdType(wsEndpoint, selector, text, delay) {
  await withPage(wsEndpoint, async (page) => {
    await page.click(selector, { timeout: ACTION_TIMEOUT });
    await page.type(selector, text, { delay: delay || 0, timeout: ACTION_TIMEOUT });
    output({ ok: true });
  });
}

async function cmdPress(wsEndpoint, selector, key) {
  await withPage(wsEndpoint, async (page) => {
    await page.press(selector, key, { timeout: ACTION_TIMEOUT });
    output({ ok: true });
  });
}

async function cmdSelect(wsEndpoint, selector, value) {
  await withPage(wsEndpoint, async (page) => {
    await page.selectOption(selector, { label: value }, { timeout: ACTION_TIMEOUT });
    output({ ok: true });
  });
}

async function cmdSnapshot(wsEndpoint) {
  await withPage(wsEndpoint, async (page) => {
    const elements = await page.evaluate(() => {
      const SELECTORS = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [onclick], [tabindex]';
      const results = [];
      let id = 1;
      for (const el of document.querySelectorAll(SELECTORS)) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent ?? '').trim().slice(0, 100);
        let line = `[${id}] ${tag}`;
        if (text) line += ` "${text}"`;
        for (const attr of ['id', 'name', 'type', 'placeholder', 'aria-label', 'role', 'href']) {
          const v = el.getAttribute(attr);
          if (v) line += ` ${attr}="${v}"`;
        }
        results.push(line);
        id++;
      }
      return results.join('\n');
    });
    output({ ok: true, elements });
  });
}

async function cmdInfo(wsEndpoint) {
  await withPage(wsEndpoint, async (page) => {
    const url = page.url();
    const title = await page.title();
    output({ ok: true, url, title });
  });
}

async function cmdClose(wsEndpoint) {
  // Try to read PID from info file
  let pid = null;
  try {
    const info = JSON.parse(readFileSync(INFO_PATH, 'utf-8'));
    pid = info.pid;
  } catch { /* ignore */ }

  // Kill the Chromium process directly
  if (pid) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* ignore, maybe already dead */ }
  }

  // Clean up info file
  try { unlinkSync(INFO_PATH); } catch { /* ignore */ }

  output({ ok: true });
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const { command, positional, flags } = parseArgs(process.argv);

  if (!command) {
    console.error('Usage: node driver.mjs <command> [wsEndpoint] [args...] [--flags]');
    console.error('Commands: launch, goto, screenshot, click, fill, type, press, select, snapshot, info, close');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'launch':
        await cmdLaunch(flags);
        break;

      case 'goto': {
        const [wsEndpoint, url] = positional;
        if (!wsEndpoint || !url) throw new Error('Usage: goto <wsEndpoint> <url>');
        await cmdGoto(wsEndpoint, url);
        break;
      }

      case 'screenshot': {
        const [wsEndpoint, path] = positional;
        if (!wsEndpoint || !path) throw new Error('Usage: screenshot <wsEndpoint> <path>');
        await cmdScreenshot(wsEndpoint, path);
        break;
      }

      case 'click': {
        const [wsEndpoint, selector] = positional;
        if (!wsEndpoint || !selector) throw new Error('Usage: click <wsEndpoint> <selector>');
        await cmdClick(wsEndpoint, selector);
        break;
      }

      case 'fill': {
        const [wsEndpoint, selector, value] = positional;
        if (!wsEndpoint || !selector || value === undefined) throw new Error('Usage: fill <wsEndpoint> <selector> <value>');
        await cmdFill(wsEndpoint, selector, value);
        break;
      }

      case 'type': {
        const [wsEndpoint, selector, text] = positional;
        if (!wsEndpoint || !selector || text === undefined) throw new Error('Usage: type <wsEndpoint> <selector> <text> [--delay ms]');
        const delay = flags.delay ? parseInt(flags.delay, 10) : 0;
        await cmdType(wsEndpoint, selector, text, delay);
        break;
      }

      case 'press': {
        const [wsEndpoint, selector, key] = positional;
        if (!wsEndpoint || !selector || !key) throw new Error('Usage: press <wsEndpoint> <selector> <key>');
        await cmdPress(wsEndpoint, selector, key);
        break;
      }

      case 'select': {
        const [wsEndpoint, selector, value] = positional;
        if (!wsEndpoint || !selector || value === undefined) throw new Error('Usage: select <wsEndpoint> <selector> <value>');
        await cmdSelect(wsEndpoint, selector, value);
        break;
      }

      case 'snapshot': {
        const [wsEndpoint] = positional;
        if (!wsEndpoint) throw new Error('Usage: snapshot <wsEndpoint>');
        await cmdSnapshot(wsEndpoint);
        break;
      }

      case 'info': {
        const [wsEndpoint] = positional;
        if (!wsEndpoint) throw new Error('Usage: info <wsEndpoint>');
        await cmdInfo(wsEndpoint);
        break;
      }

      case 'close': {
        const [wsEndpoint] = positional;
        if (!wsEndpoint) throw new Error('Usage: close <wsEndpoint>');
        await cmdClose(wsEndpoint);
        break;
      }

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (err) {
    output({ ok: false, error: err.message });
  }
}

main();
