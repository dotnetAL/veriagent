# execute

Execute a browser automation script using Claude's vision. Claude drives Playwright directly — screenshots the page, decides what to click/type, executes, and reports results.

## Usage

```
/execute script.md
/execute script.md --headed
/execute --issue 42
/execute --issue 42 --repo owner/repo
```

### Arguments

| Argument | Description |
|----------|-------------|
| `<script.md>` | Path to a VeriAgent markdown script |
| `--issue <number>` | Fetch script from a GitHub issue body |
| `--repo <owner/repo>` | GitHub repo (auto-detected if not provided) |
| `--headed` | Run browser in visible mode (default: headless) |

## What It Does

1. Parses the script (from file or GitHub issue)
2. Launches a Playwright Chromium browser
3. Navigates to the target URL
4. For each step:
   - Screenshots the page
   - Claude reads the screenshot (multimodal vision)
   - Gets a DOM snapshot for selector context
   - Decides the Playwright action (click, fill, type, press, select)
   - Executes the action
   - Self-heals on failure (retries with different selector, up to 2 retries)
5. Validates the expected outcome (if `## Expected` section present)
6. Generates outputs (if `## Generate` section present): test report, documentation, bug report
7. Posts results to GitHub issue (if source was `--issue`), including screenshots uploaded to a release

## GitHub Integration

When the script source is `--issue`:
- Results are automatically posted as a comment on the issue
- Screenshots are uploaded to a `veriagent-assets` GitHub release (created automatically)
- Screenshots render inline in the issue comment
- No opt-out — if it came from an issue, results go back

## Components

| File | Purpose |
|------|---------|
| `SKILL.md` | Full execution protocol — 13 steps Claude follows |
| `parse.mjs` | Script parser: markdown to JSON |
| `driver.mjs` | Playwright CDP driver: launch, navigate, click, fill, screenshot, etc. |

### parse.mjs

Converts VeriAgent markdown scripts to structured JSON.

```bash
# Parse from file
node parse.mjs script.md

# Parse from stdin (for piping GitHub issue bodies)
echo "markdown content" | node parse.mjs --stdin
```

Output:
```json
{
  "target": { "url": "https://...", "browser": "chromium", "viewport": { "width": 1280, "height": 720 } },
  "context": "optional context",
  "steps": [{ "number": 1, "instruction": "Click the button" }],
  "expected": "User sees dashboard",
  "generate": { "testReport": true, "documentation": false, "bugReport": false },
  "data": { "tier": "Free" }
}
```

### driver.mjs

Wraps Playwright commands via Chrome DevTools Protocol. Each command connects to a running browser, executes, and disconnects.

```bash
# Launch browser (runs in background)
node driver.mjs launch --viewport 1280x720

# Navigate
node driver.mjs goto <wsEndpoint> "https://example.com"

# Screenshot
node driver.mjs screenshot <wsEndpoint> /tmp/step-1.png

# Click element
node driver.mjs click <wsEndpoint> "button:has-text('Sign In')"

# Fill input
node driver.mjs fill <wsEndpoint> "#email" "test@example.com"

# Type with delay (for OTP inputs)
node driver.mjs type <wsEndpoint> "#otp" "742195" --delay 100

# Press key
node driver.mjs press <wsEndpoint> "#field" "Enter"

# Select dropdown
node driver.mjs select <wsEndpoint> "#plan" "Pro"

# Get DOM snapshot (interactive elements)
node driver.mjs snapshot <wsEndpoint>

# Get page info
node driver.mjs info <wsEndpoint>

# Close browser
node driver.mjs close <wsEndpoint>
```

All commands output JSON: `{ "ok": true }` or `{ "ok": false, "error": "..." }`.

## For AI Agents

### Invoking the Skill

```
Skill tool: name="execute", args="path/to/script.md"
Skill tool: name="execute", args="--issue 42 --repo owner/repo"
```

### Using Components Directly

If you need more control than the skill provides, use the components directly via Bash:

```bash
# 1. Parse the script
SCRIPT_JSON=$(node execute/parse.mjs script.md)

# 2. Launch browser (capture wsEndpoint from stdout)
node execute/driver.mjs launch > /tmp/veriagent-launch.json &
sleep 3
WS=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/tmp/veriagent-launch.json','utf8')).wsEndpoint)")

# 3. Navigate
node execute/driver.mjs goto "$WS" "https://example.com"

# 4. Screenshot and decide actions
node execute/driver.mjs screenshot "$WS" /tmp/page.png
# Read /tmp/page.png with the Read tool (vision)
# Decide what to click based on the screenshot

# 5. Execute action
node execute/driver.mjs click "$WS" "button:has-text('Login')"

# 6. Cleanup
node execute/driver.mjs close "$WS"
```

### Selector Patterns

Common Playwright selectors the driver accepts:

| Pattern | Example | Use When |
|---------|---------|----------|
| Text match | `button:has-text('Submit')` | Button/link with visible text |
| By ID | `#submit-btn` | Element has an id attribute |
| By name | `input[name="email"]` | Form input with name |
| By placeholder | `input[placeholder="Enter email"]` | Input with placeholder text |
| By label | `label:has-text('Email') >> input` | Input associated with a label |
| By test ID | `[data-testid="login-btn"]` | Element has data-testid |
| By role | `role=button[name="Submit"]` | ARIA role with accessible name |
| Nth element | `button >> nth=0` | First matching element |
