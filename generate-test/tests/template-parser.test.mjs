import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseFrontmatter,
  resolvePlaceholders,
  listTemplates,
} from '../template-parser.mjs';

describe('parseFrontmatter', () => {
  it('extracts all fields when present', () => {
    const content = `---
name: signup-flow
description: Tests the user signup flow
tags: [auth, signup, onboarding]
placeholders:
  url: Enter the target URL
  tier: Select pricing tier (Free/Starter/Pro)
---
# Step 1
Navigate to {{prompt:url}}
`;

    const { meta, body } = parseFrontmatter(content);
    assert.strictEqual(meta.name, 'signup-flow');
    assert.strictEqual(meta.description, 'Tests the user signup flow');
    assert.deepStrictEqual(meta.tags, ['auth', 'signup', 'onboarding']);
    assert.deepStrictEqual(meta.placeholders, {
      url: 'Enter the target URL',
      tier: 'Select pricing tier (Free/Starter/Pro)',
    });
    assert.ok(body.includes('# Step 1'));
    assert.ok(body.includes('{{prompt:url}}'));
  });

  it('defaults to empty tags and placeholders when optional fields missing', () => {
    const content = `---
name: basic-test
description: A basic test
---
Some body content
`;

    const { meta, body } = parseFrontmatter(content);
    assert.strictEqual(meta.name, 'basic-test');
    assert.strictEqual(meta.description, 'A basic test');
    assert.deepStrictEqual(meta.tags, []);
    assert.deepStrictEqual(meta.placeholders, {});
    assert.ok(body.includes('Some body content'));
  });

  it('returns null meta with full body when no frontmatter', () => {
    const content = `# Just a regular markdown file
No frontmatter here.
`;

    const { meta, body } = parseFrontmatter(content);
    assert.strictEqual(meta, null);
    assert.strictEqual(body, content);
  });
});

describe('resolvePlaceholders', () => {
  it('resolves all placeholders', () => {
    const body = 'Navigate to {{prompt:url}} and select {{prompt:tier}} plan.';
    const answers = { url: 'https://example.com', tier: 'Pro' };
    const result = resolvePlaceholders(body, answers);
    assert.strictEqual(result, 'Navigate to https://example.com and select Pro plan.');
  });

  it('throws with key name when answer is missing', () => {
    const body = 'Go to {{prompt:url}} and pick {{prompt:tier}}.';
    const answers = { url: 'https://example.com' };
    assert.throws(
      () => resolvePlaceholders(body, answers),
      (err) => {
        assert.ok(err.message.includes('tier'));
        return true;
      }
    );
  });

  it('returns body unchanged when no placeholders present', () => {
    const body = 'This body has no placeholders at all.';
    const result = resolvePlaceholders(body, {});
    assert.strictEqual(result, body);
  });
});

describe('listTemplates', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tpl-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds .md files and returns metadata array', () => {
    writeFileSync(
      join(tmpDir, 'login.md'),
      `---
name: login-flow
description: Tests login
tags: [auth]
placeholders:
  url: The URL
---
Body here
`
    );
    writeFileSync(
      join(tmpDir, 'signup.md'),
      `---
name: signup-flow
description: Tests signup
tags: [auth, signup]
---
Body here
`
    );
    // Non-md file should be ignored
    writeFileSync(join(tmpDir, 'notes.txt'), 'not a template');

    const results = listTemplates(tmpDir);
    assert.strictEqual(results.length, 2);

    const names = results.map((r) => r.name).sort();
    assert.deepStrictEqual(names, ['login-flow', 'signup-flow']);

    const login = results.find((r) => r.name === 'login-flow');
    assert.deepStrictEqual(login.placeholders, { url: 'The URL' });
  });

  it('returns empty array for empty directory', () => {
    const results = listTemplates(tmpDir);
    assert.deepStrictEqual(results, []);
  });
});
