#!/usr/bin/env node

import { readFileSync } from 'node:fs';

/**
 * Parse a VeriAgent markdown script into structured JSON.
 * @param {string} markdown - The raw markdown content
 * @returns {object} Parsed script object
 */
export function parse(markdown) {
  const sections = splitSections(markdown);

  // Validate required sections
  if (!sections.Target) {
    throw new Error('Missing required section: ## Target');
  }
  if (!sections.Steps) {
    throw new Error('Missing required section: ## Steps');
  }

  const target = parseTarget(sections.Target);
  const context = sections.Context ? sections.Context.trim() : undefined;
  const data = sections.Data ? parseData(sections.Data) : undefined;
  const steps = parseSteps(sections.Steps, data);
  const expected = sections.Expected ? sections.Expected.trim() : undefined;
  const generate = sections.Generate ? parseGenerate(sections.Generate) : undefined;

  const result = { target };
  if (context !== undefined) result.context = context;
  result.steps = steps;
  if (expected !== undefined) result.expected = expected;
  if (generate !== undefined) result.generate = generate;
  if (data !== undefined) result.data = data;

  return result;
}

/**
 * Split markdown into sections by ## headers.
 * @param {string} markdown
 * @returns {Object<string, string>}
 */
function splitSections(markdown) {
  const sections = {};
  const parts = markdown.split(/^## /m);

  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf('\n');
    if (newlineIdx === -1) {
      // Header with no body
      const name = part.trim();
      sections[name] = '';
    } else {
      const name = part.slice(0, newlineIdx).trim();
      const body = part.slice(newlineIdx + 1);
      sections[name] = body;
    }
  }

  return sections;
}

/**
 * Parse the Target section.
 */
function parseTarget(body) {
  const lines = body.trim().split('\n');
  let url = null;
  let browser = 'chromium';
  let viewport = { width: 1280, height: 720 };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^URL:\s*/i.test(trimmed)) {
      url = trimmed.replace(/^URL:\s*/i, '').trim();
    } else if (/^Browser:\s*/i.test(trimmed)) {
      browser = trimmed.replace(/^Browser:\s*/i, '').trim();
    } else if (/^Viewport:\s*/i.test(trimmed)) {
      const vp = trimmed.replace(/^Viewport:\s*/i, '').trim();
      const match = vp.match(/^(\d+)\s*x\s*(\d+)$/i);
      if (match) {
        viewport = { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
      }
    }
  }

  if (!url) {
    throw new Error('Target section missing URL');
  }

  return { url, browser, viewport };
}

/**
 * Parse the Steps section (numbered list).
 */
function parseSteps(body, data) {
  const steps = [];
  const lines = body.trim().split('\n');

  for (const line of lines) {
    const match = line.trim().match(/^(\d+)\.\s+(.+)$/);
    if (match) {
      let instruction = match[2].trim();
      instruction = substituteVariables(instruction, data);
      steps.push({ number: parseInt(match[1], 10), instruction });
    }
  }

  if (steps.length === 0) {
    throw new Error('Steps section contains no steps');
  }

  return steps;
}

/**
 * Parse the Data section (key: value pairs).
 */
function parseData(body) {
  const data = {};
  const lines = body.trim().split('\n');

  for (const line of lines) {
    const match = line.trim().match(/^([^:]+):\s*(.+)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Handle {{pick:A,B,C}} syntax
      value = value.replace(/\{\{pick:([^}]+)\}\}/g, (_match, options) => {
        const choices = options.split(',').map(c => c.trim());
        return choices[Math.floor(Math.random() * choices.length)];
      });
      data[key] = value;
    }
  }

  return data;
}

/**
 * Substitute {{variable}} placeholders in text from data.
 */
function substituteVariables(text, data) {
  if (!data) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name) => {
    return data[name] !== undefined ? data[name] : `{{${name}}}`;
  });
}

/**
 * Parse the Generate section (checkbox list).
 */
function parseGenerate(body) {
  const generate = {
    testReport: false,
    documentation: false,
    bugReport: false,
  };

  const lines = body.trim().split('\n');
  for (const line of lines) {
    const match = line.trim().match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (match) {
      const checked = match[1].toLowerCase() === 'x';
      const label = match[2].trim().toLowerCase();

      if (label === 'test report' || label === 'test validation') {
        generate.testReport = checked;
      } else if (label === 'step-by-step documentation' || label === 'help documentation') {
        generate.documentation = checked;
      } else if (label === 'bug report') {
        generate.bugReport = checked;
      }
    }
  }

  return generate;
}

// CLI entry point
const isMain = process.argv[1] && (
  process.argv[1].endsWith('/parse.mjs') ||
  process.argv[1].endsWith('\\parse.mjs')
);

if (isMain) {
  try {
    let markdown;
    if (process.argv.includes('--stdin')) {
      markdown = readFileSync(0, 'utf-8');
    } else if (process.argv[2] && !process.argv[2].startsWith('-')) {
      markdown = readFileSync(process.argv[2], 'utf-8');
    } else {
      console.error('Usage: node parse.mjs <script.md> | node parse.mjs --stdin');
      process.exit(1);
    }

    const result = parse(markdown);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
