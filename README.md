# VeriAgent — AI Browser Automation for Claude Code

AI-driven browser automation skills for Claude Code. Write plain English scripts, Claude executes them using its own vision — no API keys, no external AI calls.

## Skills

| Skill | Command | Description |
|-------|---------|-------------|
| [execute](./veriagent-execute/) | `/veriagent-execute` | Run a browser automation script |
| [generate-test](./veriagent-generate-test/) | `/veriagent-generate-test` | Create a script via guided wizard |

## How It Works

1. You write a markdown script describing what to do in a browser
2. Claude launches Playwright, navigates to the target URL
3. For each step: Claude screenshots the page, reads it with its vision, decides what to click/type, and executes via Playwright
4. Claude validates the outcome and reports results

Claude **is** the AI — no separate LLM calls, no tokens consumed beyond the conversation itself.

## Installation

### Prerequisites

Before installing VeriAgent skills, ensure you have:

1. **Claude Code** — available as [CLI](https://claude.ai/code), [desktop app](https://claude.ai/code) (Mac/Windows), [web app](https://claude.ai/code), or IDE extension ([VS Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code), [JetBrains](https://plugins.jetbrains.com/plugin/claude-code))
2. **Node.js 22+** — required for the helper scripts (`parse.mjs`, `driver.mjs`)
3. **Playwright** — browser automation engine (installed in step 3 below)
4. **GitHub CLI** (optional) — only needed if you want `--issue` mode to fetch scripts from / post results to GitHub issues

### Step 1: Clone the repo

Clone VeriAgent into your project's `skills/` directory. Claude Code auto-discovers skills from this location.

Claude Code discovers skills at `.claude/skills/<name>/SKILL.md`. Clone the repo, then symlink or copy the skill directories into place:

```bash
cd /path/to/your/project

# Clone the repo
git clone https://github.com/dotnetAL/veriagent.git .claude/skills/veriagent

# Symlink each skill to the discovery level
ln -s veriagent/veriagent-execute .claude/skills/veriagent-execute
ln -s veriagent/veriagent-generate-test .claude/skills/veriagent-generate-test
```

Your project should now look like:
```
your-project/
├── .claude/
│   └── skills/
│       ├── veriagent/                    ← cloned repo
│       ├── veriagent-execute/            ← symlink → veriagent/veriagent-execute/
│       │   └── SKILL.md                  ← discovered by Claude Code
│       └── veriagent-generate-test/      ← symlink → veriagent/veriagent-generate-test/
│           └── SKILL.md                  ← discovered by Claude Code
├── src/
└── ...
```

**Alternative — add as git submodule:**
```bash
git submodule add https://github.com/dotnetAL/veriagent.git .claude/skills/veriagent
ln -s veriagent/veriagent-execute .claude/skills/veriagent-execute
ln -s veriagent/veriagent-generate-test .claude/skills/veriagent-generate-test
```

### Step 2: Install Playwright

VeriAgent uses Playwright to drive the browser. If you don't already have it:

```bash
npx playwright install chromium
```

This downloads a Chromium binary (~165 MB). Only Chromium is needed — you don't need Firefox or WebKit.

The skill will check for Playwright on first run and prompt you to install if it's missing.

### Step 3: Verify installation

Open Claude Code in your project and type:

```
/veriagent-execute
```

If the skill loads, you'll see Claude ask for a script path. That means it's installed correctly.

### Step 4: (Optional) Install GitHub CLI

For `--issue` mode (fetch scripts from GitHub issues, post results back):

```bash
# macOS
brew install gh

# Linux
sudo apt install gh

# Windows
winget install GitHub.cli

# Then authenticate
gh auth login
```

### Updating

```bash
cd .claude/skills/veriagent && git pull
```

Symlinks continue to work — no need to re-create them after updating.

## Quick Start

### Run a Script

```
/veriagent-execute path/to/script.md
```

### Create a Script

```
/veriagent-generate-test
```

### Run from a GitHub Issue

```
/veriagent-execute --issue 42
```

### Run in Headed Mode (see the browser)

```
/veriagent-execute script.md --headed
```

### Use a Template

```
/veriagent-generate-test --from-template example-navigation
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
/veriagent-generate-test --from-template login-flow
```

Templates are stored in `.veriagent/templates/` in your project. See [examples/templates/](./examples/templates/) for samples.

## GitHub Integration

When a script is sourced from a GitHub issue (`--issue`):
- Results are posted as a comment on the issue
- Screenshots are uploaded to a `browser-pilot-assets` release
- Screenshots render inline in the issue comment

## For AI Agents

These skills are designed for Claude Code but work with any compatible AI coding assistant.

### Invocation

```
Skill tool: name="veriagent-execute", args="script.md"
Skill tool: name="veriagent-generate-test"
Skill tool: name="veriagent-generate-test", args="--from-template signup-flow"
```

### Programmatic Access

```bash
# Validate a script
node veriagent-execute/parse.mjs script.md

# Drive a browser directly
node veriagent-execute/driver.mjs launch --headless
node veriagent-execute/driver.mjs goto <wsEndpoint> "https://example.com"
node veriagent-execute/driver.mjs screenshot <wsEndpoint> /tmp/page.png
node veriagent-execute/driver.mjs click <wsEndpoint> "button:has-text('Login')"
node veriagent-execute/driver.mjs close <wsEndpoint>

# List templates
node veriagent-generate-test/template-parser.mjs list .veriagent/templates

# Resolve a template
node veriagent-generate-test/template-parser.mjs resolve template.md --answers '{"url":"https://example.com"}'
```

## Project Structure

```
veriagent/
├── veriagent-execute/                  # veriagent-execute skill
│   ├── SKILL.md              # Execution protocol (13 steps)
│   ├── parse.mjs             # Script parser (markdown → JSON)
│   ├── driver.mjs            # Playwright CDP driver
│   ├── README.md
│   └── tests/
├── veriagent-generate-test/            # veriagent-generate-test skill
│   ├── SKILL.md              # Wizard protocol (11 steps)
│   ├── template-parser.mjs
│   ├── README.md
│   └── tests/
├── examples/
│   └── templates/            # Example templates
├── README.md
└── LICENSE
```

## License

MIT
