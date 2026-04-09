# veriagent:generate-test

Guided wizard that walks you through creating a VeriAgent browser automation script. Supports codebase exploration, test-before-save workflow, and reusable templates.

## Usage

```
/veriagent:generate-test
/veriagent:generate-test --from-template signup-flow
```

### Arguments

| Argument | Description |
|----------|-------------|
| (none) | Start the wizard from scratch |
| `--from-template <name>` | Create a script from a saved template |

## Wizard Flow

The wizard walks through each section one at a time:

```
1. Input Mode    → "Describe it" or "Manual"
2. Target        → URL, browser, viewport (codebase exploration in Describe mode)
3. Context       → Background info (pre-filled in Describe mode)
4. Steps         → Numbered instructions (drafted by Claude in Describe mode)
5. Expected      → What the end result should look like
6. Generate      → Which outputs to produce (test report, docs, bug report)
7. Data          → Variables and pick lists
8. Review        → See the complete script, request changes
9. Test          → Run with veriagent:execute, fix problems together
10. Save         → Save as .md file, GitHub issue, or both
11. Template     → Optionally save as reusable template
```

## Input Modes

### Describe Mode

You tell Claude what you want to test ("test the signup flow"). Claude explores your codebase to understand the app:

- **Config files:** package.json, .env, docker-compose.yml, README
- **Application structure:** routes, page components, navigation, forms
- **Framework detection:** Next.js, React Router, Express, Vue/Nuxt, etc.

Claude presents what it found and drafts the steps for your review.

### Manual Mode

You provide clear step-by-step instructions. Claude formats them into the script structure.

## Test-Before-Save

After generating the script (Step 8), the wizard asks if you want to test it:

1. Claude invokes `veriagent:execute` on the generated script
2. You review results together
3. If steps fail, Claude helps diagnose: reads screenshots, suggests fixes
4. Edit and re-test until working
5. Then proceed to save

This ensures you save a working script, not a broken one.

## Saving

Two save destinations:

- **File:** Saves as `.md` in your project (default: `scripts/` directory)
- **GitHub Issue:** Creates an issue with the script as the body — ready for `veriagent:execute --issue`

## Templates

Templates are scripts with parameterized values, stored in `.veriagent/templates/`.

### Template Format

```markdown
---
name: signup-flow
description: Tests the user signup flow including email verification
tags: [auth, signup, onboarding]
placeholders:
  url: Enter the target URL
  tier: Select pricing tier (Free/Starter/Pro)
---

## Target
URL: {{prompt:url}}

## Context
This tests the signup flow for new users selecting the {{tier}} tier.

## Steps
1. Navigate to the signup page
2. Select the "{{tier}}" pricing tier
3. Fill in registration form with test user details
4. Complete email verification
5. Click "Create Account"

## Expected
User sees the dashboard with a welcome message.

## Data
tier: {{prompt:tier}}
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Template identifier (used with `--from-template`) |
| `description` | Yes | What this template tests |
| `tags` | No | For discovery and suggestion |
| `placeholders` | No | Map of placeholder name to prompt question |

### Using Templates

```
/veriagent:generate-test --from-template signup-flow
```

Claude loads the template, asks each placeholder question, resolves the values, and drops you at the Review step (Step 8) so you can edit before testing.

### Creating Templates

At Step 11 of the wizard, Claude:
1. Asks for template name, description, tags
2. Suggests which values to parameterize (URLs, emails, tier names)
3. You confirm or adjust
4. Saves to `.veriagent/templates/<name>.md`

## Components

| File | Purpose |
|------|---------|
| `SKILL.md` | Full wizard instructions — 11 steps |
| `template-parser.mjs` | Parse, list, and resolve templates |

### template-parser.mjs

```bash
# List available templates
node template-parser.mjs list .veriagent/templates
# [{ "name": "signup-flow", "description": "...", "tags": [...], "placeholders": {...} }]

# Parse a template
node template-parser.mjs parse .veriagent/templates/signup-flow.md
# { "meta": { "name": "...", ... }, "body": "## Target\n..." }

# Resolve a template with answers
node template-parser.mjs resolve .veriagent/templates/signup-flow.md \
  --answers '{"url":"https://example.com","tier":"Pro"}'
# Outputs resolved markdown to stdout
```

## For AI Agents

### Invoking the Skill

```
Skill tool: name="veriagent:generate-test"
Skill tool: name="veriagent:generate-test", args="--from-template signup-flow"
```

### Creating Scripts Programmatically

If you need to generate scripts without the interactive wizard:

1. **From a template:**
   ```bash
   node generate-test/template-parser.mjs resolve \
     .veriagent/templates/signup-flow.md \
     --answers '{"url":"https://example.com","tier":"Pro"}' \
     > scripts/my-test.md
   ```

2. **Then execute:**
   ```
   Skill tool: name="veriagent:execute", args="scripts/my-test.md"
   ```

### Template Discovery

To suggest templates based on what the user wants to test:

```bash
# List all templates with metadata
node generate-test/template-parser.mjs list .veriagent/templates
```

Match the user's description against template `tags` and `description` fields to suggest relevant templates.

### Workflow Integration

Common agent workflow:
1. User says "test my signup flow"
2. Check for matching templates: `template-parser.mjs list`
3. If match found: offer to use it (`--from-template`)
4. If no match: start the full wizard
5. After testing and saving: offer to save as template for next time
