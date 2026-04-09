import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { meta, body } where meta is null if no frontmatter found.
 */
export function parseFrontmatter(content) {
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(fmRegex);

  if (!match) {
    return { meta: null, body: content };
  }

  const yamlBlock = match[1];
  const body = match[2];
  const meta = { name: '', description: '', tags: [], placeholders: {} };

  const lines = yamlBlock.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === '') {
      i++;
      continue;
    }

    const kvMatch = line.match(/^(\w+):\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const value = kvMatch[2].trim();

    if (key === 'name') {
      meta.name = value;
    } else if (key === 'description') {
      meta.description = value;
    } else if (key === 'tags') {
      // Parse [a, b, c] notation
      const bracketMatch = value.match(/^\[(.*)\]$/);
      if (bracketMatch) {
        meta.tags = bracketMatch[1]
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
      } else {
        meta.tags = value ? [value] : [];
      }
    } else if (key === 'placeholders') {
      // If value is on the same line, it's a single-line form (unlikely but handle)
      if (value) {
        // Try bracket notation
        const bracketMatch2 = value.match(/^\{(.*)\}$/);
        if (bracketMatch2) {
          // Not expected, but skip
        }
      }
      // Read indented key: value lines
      i++;
      while (i < lines.length) {
        const pLine = lines[i];
        const indentMatch = pLine.match(/^[ \t]+(\w[\w-]*):\s*(.*)/);
        if (!indentMatch) break;
        meta.placeholders[indentMatch[1]] = indentMatch[2].trim();
        i++;
      }
      continue; // skip the i++ at bottom since we already advanced
    }

    i++;
  }

  return { meta, body };
}

/**
 * Replace all {{prompt:key}} placeholders in body with answers.
 * Throws if any placeholder has no corresponding answer.
 */
export function resolvePlaceholders(body, answers) {
  const placeholderRegex = /\{\{prompt:(\w[\w-]*)\}\}/g;
  const missing = [];

  // First pass: find all placeholders and check for missing answers
  let m;
  while ((m = placeholderRegex.exec(body)) !== null) {
    const key = m[1];
    if (!(key in answers)) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing answers for placeholders: ${missing.join(', ')}`);
  }

  // Second pass: replace
  return body.replace(placeholderRegex, (_, key) => answers[key]);
}

/**
 * List all .md templates in a directory. Returns array of metadata objects.
 */
export function listTemplates(dir) {
  const resolvedDir = resolve(dir);
  let entries;
  try {
    entries = readdirSync(resolvedDir);
  } catch {
    return [];
  }

  const results = [];

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    try {
      const content = readFileSync(join(resolvedDir, entry), 'utf-8');
      const { meta } = parseFrontmatter(content);
      if (!meta) continue;
      results.push({
        name: meta.name,
        description: meta.description,
        tags: meta.tags,
        placeholders: meta.placeholders,
      });
    } catch {
      // skip files that fail to parse
    }
  }

  return results;
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'list') {
    const dir = args[1] || '.veriagent/templates';
    const templates = listTemplates(dir);
    process.stdout.write(JSON.stringify(templates, null, 2) + '\n');
  } else if (command === 'parse') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Usage: template-parser.mjs parse <path>');
      process.exit(1);
    }
    const content = readFileSync(filePath, 'utf-8');
    const result = parseFrontmatter(content);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (command === 'resolve') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Usage: template-parser.mjs resolve <path> --answers \'{"key":"value"}\'');
      process.exit(1);
    }
    const answersIdx = args.indexOf('--answers');
    if (answersIdx === -1 || !args[answersIdx + 1]) {
      console.error('Missing --answers argument');
      process.exit(1);
    }
    const answers = JSON.parse(args[answersIdx + 1]);
    const content = readFileSync(filePath, 'utf-8');
    const { body } = parseFrontmatter(content);
    const resolved = resolvePlaceholders(body, answers);
    process.stdout.write(resolved);
  } else {
    console.error('Usage: template-parser.mjs <list|parse|resolve> [args]');
    process.exit(1);
  }
}

const isMain = process.argv[1]?.endsWith('template-parser.mjs');
if (isMain) {
  main();
}
