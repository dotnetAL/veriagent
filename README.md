# VeriAgent — AI Browser Automation for Claude Code

AI-driven browser automation skills for Claude Code. Write plain English scripts, Claude executes them using its own vision — no API keys, no external AI calls.

## Skills

| Skill | Command | Description |
|-------|---------|-------------|
| [execute](./skills/execute/) | `/veriagent:execute` | Run a browser automation script |
| [generate-test](./skills/generate-test/) | `/veriagent:generate-test` | Create a script via guided wizard |

## How It Works

1. You write a markdown script describing what to do in a browser
2. Claude launches Playwright, navigates to the target URL
3. For each step: Claude screenshots the page, reads it with its vision, decides what to click/type, and executes via Playwright
4. Claude validates the outcome and reports results

Claude **is** the AI — no separate LLM calls, no tokens consumed beyond the conversation itself.

## Quick Start

### Install

```bash
# Clone into your project's skills directory
git clone https://github.com/dotnetAL/veriagent.git skills/veriagent

# Install Playwright (if not already installed)
npx playwright install chromium
```

Claude Code discovers skills automatically from the `skills/` directory.

### Run a Script

```
/veriagent:execute path/to/script.md
```

### Create a Script

```
/veriagent:generate-test
```

### Run from a GitHub Issue

```
/veriagent:execute --issue 42
```

## Script Format

```markdown
## Target
URL: https://example.com/signup

## Context
Free tier signup flow for new users.

## Steps
1. Click the "Get Started" button
2. Enter "test@example.com" into the email field
3. Enter "SecurePass123" into the password field
4. Click "Create Account"
5. Wait for the dashboard to load

## Expected
User sees the dashboard with a welcome message.

## Generate
- [x] Test report
- [ ] Step-by-step documentation
- [ ] Bug report

## Data
tier: Free
```

### Sections

| Section | Required | Description |
|---------|----------|-------------|
| `## Target` | Yes | `URL:` (required), `Browser:` (default chromium), `Viewport:` (default 1280x720) |
| `## Context` | No | Background info to help Claude make better decisions |
| `## Steps` | Yes | Numbered plain English instructions. Supports `{{variables}}` from Data |
| `## Expected` | No | If present, Claude validates the final state and gives pass/fail |
| `## Generate` | No | Checkbox list: test report, step-by-step documentation, bug report |
| `## Data` | No | Key-value pairs. Supports `{{pick:A,B,C}}` for random selection |

## Templates

Create reusable test templates with parameterized values:

```markdown
---
name: login-flow
description: Tests user login
tags: [auth, login]
placeholders:
  url: Target URL
  email: Test user email
---

## Target
URL: {{prompt:url}}

## Steps
1. Enter "{{prompt:email}}" into the email field
...
```

Use templates:
```
/veriagent:generate-test --from-template login-flow
```

Templates are stored in `.veriagent/templates/` in your project. See [examples/templates/](./examples/templates/) for samples.

## Prerequisites

- [Claude Code](https://claude.ai/code) CLI, desktop app, or IDE extension
- [Playwright](https://playwright.dev/) (`npx playwright install chromium`)
- [GitHub CLI](https://cli.github.com/) (optional, for `--issue` mode)

## GitHub Integration

When a script is sourced from a GitHub issue (`--issue`):
- Results are posted as a comment on the issue
- Screenshots are uploaded to a `browser-pilot-assets` release
- Screenshots render inline in the issue comment

## For AI Agents

These skills are designed for Claude Code but work with any compatible AI coding assistant.

### Invocation

```
Skill tool: name="veriagent:execute", args="script.md"
Skill tool: name="veriagent:generate-test"
Skill tool: name="veriagent:generate-test", args="--from-template signup-flow"
```

### Programmatic Access

```bash
# Validate a script
node skills/execute/parse.mjs script.md

# Drive a browser directly
node skills/execute/driver.mjs launch --headless
node skills/execute/driver.mjs goto <wsEndpoint> "https://example.com"
node skills/execute/driver.mjs screenshot <wsEndpoint> /tmp/page.png
node skills/execute/driver.mjs click <wsEndpoint> "button:has-text('Login')"
node skills/execute/driver.mjs close <wsEndpoint>

# List templates
node skills/generate-test/template-parser.mjs list .veriagent/templates

# Resolve a template
node skills/generate-test/template-parser.mjs resolve template.md --answers '{"url":"https://example.com"}'
```

## Project Structure

```
veriagent/
├── skills/
│   ├── execute/              # veriagent:execute skill
│   │   ├── SKILL.md          # Execution protocol (13 steps)
│   │   ├── parse.mjs         # Script parser (markdown → JSON)
│   │   ├── driver.mjs        # Playwright CDP driver
│   │   ├── README.md
│   │   └── tests/
│   └── generate-test/        # veriagent:generate-test skill
│       ├── SKILL.md          # Wizard protocol (11 steps)
│       ├── template-parser.mjs
│       ├── README.md
│       └── tests/
├── examples/
│   └── templates/            # Example templates
├── README.md
└── LICENSE
```

## License

MIT
