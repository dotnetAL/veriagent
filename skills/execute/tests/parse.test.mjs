import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parse } from '../parse.mjs';

describe('parse()', () => {
  it('parses a full script with all sections', () => {
    const md = `## Target
URL: http://demo.lvh.me:5002
Browser: chromium
Viewport: 1280x720

## Context
This is the paid tier signup flow.

## Steps
1. Select the pricing tier
2. Fill in the registration form
3. Complete payment

## Expected
User arrives at the dashboard.

## Generate
- [x] Test validation
- [ ] Help documentation
- [x] Bug report

## Data
tier: Pro
`;

    const result = parse(md);

    assert.deepStrictEqual(result.target, {
      url: 'http://demo.lvh.me:5002',
      browser: 'chromium',
      viewport: { width: 1280, height: 720 },
    });
    assert.strictEqual(result.context, 'This is the paid tier signup flow.');
    assert.strictEqual(result.steps.length, 3);
    assert.deepStrictEqual(result.steps[0], { number: 1, instruction: 'Select the pricing tier' });
    assert.deepStrictEqual(result.steps[2], { number: 3, instruction: 'Complete payment' });
    assert.strictEqual(result.expected, 'User arrives at the dashboard.');
    assert.deepStrictEqual(result.generate, {
      testReport: true,
      documentation: false,
      bugReport: true,
    });
    assert.deepStrictEqual(result.data, { tier: 'Pro' });
  });

  it('parses a minimal script (Target + Steps only) with defaults', () => {
    const md = `## Target
URL: https://example.com

## Steps
1. Observe the page heading
2. Click the "More information..." link
`;

    const result = parse(md);

    assert.deepStrictEqual(result.target, {
      url: 'https://example.com',
      browser: 'chromium',
      viewport: { width: 1280, height: 720 },
    });
    assert.strictEqual(result.steps.length, 2);
    assert.strictEqual(result.context, undefined);
    assert.strictEqual(result.expected, undefined);
    assert.strictEqual(result.generate, undefined);
    assert.strictEqual(result.data, undefined);
  });

  it('substitutes {{variable}} from Data into step instructions', () => {
    const md = `## Target
URL: https://example.com

## Steps
1. Select the "{{tier}}" pricing tier
2. Click "{{action}}" button

## Data
tier: Pro
action: Subscribe
`;

    const result = parse(md);

    assert.strictEqual(result.steps[0].instruction, 'Select the "Pro" pricing tier');
    assert.strictEqual(result.steps[1].instruction, 'Click "Subscribe" button');
  });

  it('resolves {{pick:A,B,C}} to one of the options', () => {
    const md = `## Target
URL: https://example.com

## Steps
1. Do something

## Data
color: {{pick:Red,Green,Blue}}
`;

    const result = parse(md);
    assert.ok(
      ['Red', 'Green', 'Blue'].includes(result.data.color),
      `Expected one of Red,Green,Blue but got "${result.data.color}"`
    );
  });

  it('throws on missing Target section', () => {
    const md = `## Steps
1. Do something
`;

    assert.throws(() => parse(md), /Missing required section: ## Target/);
  });

  it('throws on missing Steps section', () => {
    const md = `## Target
URL: https://example.com
`;

    assert.throws(() => parse(md), /Missing required section: ## Steps/);
  });

  it('throws on Target section with no URL', () => {
    const md = `## Target
Browser: chromium

## Steps
1. Do something
`;

    assert.throws(() => parse(md), /Target section missing URL/);
  });

  it('preserves multiline Expected section', () => {
    const md = `## Target
URL: https://example.com

## Steps
1. Do something

## Expected
User sees the dashboard.
The sidebar contains navigation links.
A welcome message is displayed.
`;

    const result = parse(md);
    assert.ok(result.expected.includes('User sees the dashboard.'));
    assert.ok(result.expected.includes('The sidebar contains navigation links.'));
    assert.ok(result.expected.includes('A welcome message is displayed.'));
  });

  it('parses Generate checkboxes correctly (checked vs unchecked)', () => {
    const md = `## Target
URL: https://example.com

## Steps
1. Do something

## Generate
- [x] Test report
- [ ] Step-by-step documentation
- [x] Bug report
`;

    const result = parse(md);
    assert.deepStrictEqual(result.generate, {
      testReport: true,
      documentation: false,
      bugReport: true,
    });
  });

  it('parses Viewport "WxH" format correctly', () => {
    const md = `## Target
URL: https://example.com
Viewport: 1920x1080

## Steps
1. Do something
`;

    const result = parse(md);
    assert.deepStrictEqual(result.target.viewport, { width: 1920, height: 1080 });
  });
});
