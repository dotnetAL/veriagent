---
name: execute
description: Execute a browser automation script. Use when asked to test a website, run a browser flow, execute a UI test, or run a VeriAgent script.
allowed-tools: Bash Read Write Glob
user-invocable: true
---

# VeriAgent Execute Skill

You are a browser automation agent. You execute plain-English scripts by launching a real browser, reading screenshots with your vision, and driving actions through Playwright. There are no external LLM calls -- YOU are the AI that sees the page and decides what to do.

## Step 1: Parse Arguments

Examine the arguments passed to this skill:

- **File path** (ends in `.md`): The script file to execute.
- **`--issue <number>`**: Fetch the script from a GitHub issue body.
- **`--repo owner/repo`**: GitHub repo for issue fetch. If omitted, detect it:
  ```bash
  gh repo view --json nameWithOwner -q .nameWithOwner
  ```
- **`--headed`**: Run the browser in headed (visible) mode. Default is headless.
- **`--record`**: Record a video of the entire test run. Saved as `.webm` file.

If no arguments are provided, ask the user for a script file path or issue number.

If `--headed` was not explicitly passed, ask the user:

> "Would you like to see the browser while it runs?"
> 1. **Headed** — visible browser window (useful for watching/debugging)
> 2. **Headless** — runs in background (faster, default)

Also ask:

> "Would you like to record a video of the test run?"

Use their choices for the launch step.

## Step 2: Locate Skill Helpers

Find the skill directory containing `parse.mjs` and `driver.mjs`:

```bash
SKILL_DIR="$(dirname "$(find ~/.claude .claude -path '*/execute/driver.mjs' -print -quit 2>/dev/null || find . -path '*/execute/driver.mjs' -print -quit 2>/dev/null)")"
```

**Verify** the directory was found:
```bash
test -f "$SKILL_DIR/driver.mjs" && test -f "$SKILL_DIR/parse.mjs"
```

If either file is missing, use the Glob tool to search for `**/execute/driver.mjs` and extract the directory from the result.

Store `SKILL_DIR` for all subsequent commands.

## Step 3: Check Playwright

Verify both the playwright package AND browser are installed:

```bash
node -e "require('playwright')" 2>/dev/null
```

If this fails, tell the user: "The `playwright` npm package is not installed. Shall I install it?" and run:
```bash
npm install -D playwright && npx playwright install chromium
```

If the package is installed but the browser is missing (driver.mjs launch will fail with "Executable not found"), run:
```bash
npx playwright install chromium
```

Wait for user confirmation before installing.

## Step 4: Create Working Directory

```bash
WORKDIR=$(mktemp -d /tmp/veriagent-XXXXXX)
```

Use `WORKDIR` to store all screenshots and temporary files during execution.

## Step 5: Parse the Script

**From a file:**
```bash
node "$SKILL_DIR/parse.mjs" <script-path>
```

**From a GitHub issue:**
```bash
gh issue view <number> --repo <repo> --json body -q .body | node "$SKILL_DIR/parse.mjs" --stdin
```

Capture the JSON output. The parsed script has this structure:
```json
{
  "target": {
    "url": "https://example.com",
    "browser": "chromium",
    "viewport": { "width": 1280, "height": 720 }
  },
  "context": "Optional context about the app",
  "steps": [
    { "number": 1, "instruction": "Click the Sign In button" },
    { "number": 2, "instruction": "Enter 'user@test.com' in the email field" }
  ],
  "expected": "Optional expected outcome description",
  "data": { "key": "value" },
  "generate": { "testReport": true, "documentation": false, "bugReport": false }
}
```

If parsing fails, report the error to the user and stop.

## Step 6: Launch Browser

```bash
node "$SKILL_DIR/driver.mjs" launch [--headed] [--viewport WIDTHxHEIGHT] [--record WORKDIR]
```

Pass `--headed` if the user requested it. Pass `--viewport` from the parsed script's `target.viewport` (e.g., `--viewport 1280x720`). Pass `--record $WORKDIR` if the user wants a video recording of the test run.

**Important:** Run this command with the Bash tool's `run_in_background` option, OR capture its first line of stdout which contains the JSON with `wsEndpoint`. The launch process stays alive to track the browser.

The launch command outputs JSON to stdout:
```json
{"wsEndpoint":"ws://127.0.0.1:XXXXX/devtools/browser/..."}
```

Extract the `wsEndpoint` value from this output. Store it as `WS` for all subsequent driver commands.

If stdout capture is difficult with backgrounding, read the info file the driver writes:
```bash
cat "$(node -e "process.stdout.write(require('os').tmpdir())")/veriagent-browser.json"
```

## Step 7: Navigate to Target URL

```bash
node "$SKILL_DIR/driver.mjs" goto "$WS" "<target-url>"
```

Verify the output contains `"ok": true`. If not, report the error and proceed to cleanup.

## Step 8: Execute Each Step

For each step in the parsed script, follow this loop:

### 8a. Take a Screenshot

```bash
node "$SKILL_DIR/driver.mjs" screenshot "$WS" "$WORKDIR/step-N-before.png"
```

### 8b. Read the Screenshot

Use the Read tool on the PNG file. You are multimodal -- you can see the page. Study what is visible: layout, text, buttons, inputs, current state.

### 8c. Get DOM Snapshot (if needed)

```bash
node "$SKILL_DIR/driver.mjs" snapshot "$WS"
```

This returns a list of all interactive elements on the page with their attributes:
```
[1] button "Sign In" id="sign-in-btn"
[2] input name="email" placeholder="Enter your email" type="text"
[3] a "Learn more" href="/about"
```

Use this to find precise selectors when the screenshot alone is not sufficient.

### 8d. Decide the Action

Based on the screenshot, DOM snapshot, and the step instruction, determine:
1. **What command to use**: `click`, `fill`, `type`, `press`, `select`, or `goto`
2. **What selector to target**
3. **What value to provide** (for fill, type, select, press)

**Driver commands reference:**

| Command | Usage | Description |
|---------|-------|-------------|
| `goto` | `goto <ws> <url>` | Navigate to URL |
| `click` | `click <ws> <selector>` | Click an element |
| `fill` | `fill <ws> <selector> <value>` | Clear and fill an input |
| `type` | `type <ws> <selector> <text> [--delay ms]` | Type text character by character |
| `press` | `press <ws> <selector> <key>` | Press a keyboard key (Enter, Tab, Escape, etc.) |
| `select` | `select <ws> <selector> <label>` | Select a dropdown option by label text |
| `screenshot` | `screenshot <ws> <path>` | Take a screenshot |
| `snapshot` | `snapshot <ws>` | Get interactive DOM elements |
| `info` | `info <ws>` | Get current page URL and title |

**Selector patterns -- use the most specific one available:**

| Pattern | Example | When to Use |
|---------|---------|-------------|
| By ID | `#submit-btn` | Element has a unique ID |
| By test ID | `[data-testid="login-btn"]` | Element has a data-testid attribute |
| By name | `input[name="email"]` | Form input with name attribute |
| By placeholder | `input[placeholder="Enter email"]` | Input with placeholder text |
| Button by text | `button:has-text('Submit')` | Button with visible text |
| Link by text | `a:has-text('Learn more')` | Link with visible text |
| By label | `label:has-text('Email') >> input` | Input associated with a label |
| By role | `[role="button"]:has-text('OK')` | Element with ARIA role |
| Nth element | `button >> nth=0` | When multiple matches exist |

**Prefer specific selectors in this order:** ID > data-testid > name > placeholder > text content > tag + position.

### 8e. Execute the Action

```bash
node "$SKILL_DIR/driver.mjs" <command> "$WS" "<selector>" ["<value>"]
```

All commands return JSON. Check the output:
- `{"ok": true}` -- action succeeded
- `{"ok": false, "error": "..."}` -- action failed

### 8f. Handle Failures (Self-Healing)

If the action fails (`"ok": false`):

1. Take a fresh screenshot and read it
2. Get a new DOM snapshot
3. Reason about what went wrong -- wrong selector? Element not visible? Page not fully loaded?
4. Try a different selector or approach
5. Allow up to **2 retries** per step

If all retries fail, mark the step as FAILED and continue to the next step.

### 8g. Confirm Success

After a successful action:

```bash
node "$SKILL_DIR/driver.mjs" screenshot "$WS" "$WORKDIR/step-N-after.png"
```

Read the after-screenshot to confirm the action had the expected effect (e.g., page changed, input was filled, modal appeared).

### 8h. Track Results

For each step, record:
- Step number and instruction
- Action taken (command + selector + value)
- Duration (note the time before and after)
- Result: PASS or FAIL
- Error message if failed

### Handling Special Step Types

**"Wait for..." steps** (e.g., "Wait for the dashboard to load"):
1. Take a screenshot and read it
2. Check if the condition is met
3. If not, wait 3 seconds and repeat
4. Timeout after 30 seconds
5. Mark as FAIL if condition is never met

**"Verify..." / "Check..." / "Confirm..." steps** (e.g., "Verify the welcome message appears"):
1. Take a screenshot and read it
2. Optionally get a DOM snapshot
3. Evaluate whether the assertion is true based on what you see
4. No browser action needed -- this is observation only
5. Mark as PASS if the condition is visible, FAIL otherwise

**"Scroll..." steps**:
1. Use `press` with the `PageDown` or `PageUp` key on `body`:
   ```bash
   node "$SKILL_DIR/driver.mjs" press "$WS" "body" "PageDown"
   ```

**"Go to..." / "Navigate to..." steps**:
1. Use the `goto` command with the URL

**"Select..." from dropdown steps**:
1. Use the `select` command with the dropdown selector and the option label

## Step 9: Validate Expected Outcome

If the parsed script has an `expected` field:

1. Take a final screenshot:
   ```bash
   node "$SKILL_DIR/driver.mjs" screenshot "$WS" "$WORKDIR/final.png"
   ```
2. Read it with the Read tool
3. Optionally get page info:
   ```bash
   node "$SKILL_DIR/driver.mjs" info "$WS"
   ```
4. Compare what you see against the `expected` text
5. Determine verdict: **PASS** if the expected outcome is satisfied, **FAIL** if not
6. Write a brief explanation of your reasoning

## Step 10: Generate Outputs (if generate section present)

Check the parsed script's `generate` object. For each enabled output, create the corresponding file. Skip this step entirely if `generate` is missing or all values are false.

### Test Report (when testReport is true)

Create a markdown file `$WORKDIR/test-report.md` with:

```markdown
# Test Report: <script name or target URL>

**Date:** <current date>
**Target:** <URL>
**Verdict:** PASS ✅ / FAIL ❌
**Duration:** <total>

## Summary

<brief description of what was tested and the outcome>

## Step Results

| # | Step | Result | Duration | Details |
|---|------|--------|----------|---------|
| 1 | Click "Get Started" | ✅ Pass | 2.1s | Clicked button successfully |
| 2 | Enter email | ✅ Pass | 1.8s | Filled email field |
...

## Validation

**Expected:** <from script>
**Observed:** <what Claude saw in final screenshot>
**Verdict:** <PASS/FAIL with reasoning>

## Screenshots

### Step 1: Click "Get Started"
![step-1](<path or URL>)
...
```

Save to `$WORKDIR/test-report.md` and print the path.

### Step-by-Step Documentation (when documentation is true)

Create a user-guide style document `$WORKDIR/documentation.md`:

```markdown
# <App Name/Flow Name> — Step-by-Step Guide

<Context from script, or a generated intro>

## Step 1: <Human-friendly title>

<Description of what the user should do, written for an end-user audience — not the raw test instruction>

![step-1](<screenshot path>)

## Step 2: <Title>
...

## Result

<What the user should see at the end>
```

This should be written in a helpful, clear tone — suitable for help documentation or onboarding guides. Use the step screenshots as illustrations.

Save to `$WORKDIR/documentation.md` and print the path.

### Bug Report (when bugReport is true AND any step failed)

Only generate if there were actual failures. Create `$WORKDIR/bug-report.md`:

```markdown
# Bug Report: <brief description of failure>

**Date:** <current date>
**URL:** <target URL>
**Browser:** <browser from target>
**Viewport:** <viewport>

## Summary

<One paragraph describing the bug>

## Steps to Reproduce

1. Navigate to <URL>
2. <step that worked>
3. <step that worked>
4. <step that FAILED> ← **fails here**

## Expected Behavior

<From the Expected section of the script>

## Actual Behavior

<What Claude observed at the point of failure>

## Screenshots

### Before failure (Step N)
![before](<path>)

### At failure (Step N)
![after](<path>)

## Environment

- Browser: <browser>
- Viewport: <viewport>
- Date: <date>
```

Save to `$WORKDIR/bug-report.md` and print the path.

If the source was a GitHub issue, also offer: "Would you like me to create a sub-issue with this bug report?"

## Step 11: GitHub Integration (when source is --issue)

**Only execute this step if the script was fetched via `--issue`.** Skip entirely for file-based runs.

After all steps are executed and validation is complete, upload screenshots and post a structured results comment on the GitHub issue.

### 11a. Determine Repo

Use the `--repo` flag if provided. Otherwise, detect it:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

### 11b. Upload Screenshots to GitHub Release

1. Check if the `veriagent-assets` release exists:
   ```bash
   gh release view veriagent-assets --repo "$REPO" 2>/dev/null
   ```

2. If it doesn't exist, create it:
   ```bash
   gh release create veriagent-assets --repo "$REPO" --title "VeriAgent Assets" --notes "Screenshot storage for execute skill results. Do not delete." --latest=false
   ```

3. Generate a unique run ID for this execution:
   ```bash
   RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c 4 /dev/urandom | xxd -p)
   ```
   This produces something like `20260409-143052-a1b2c3d4` — unique per run.

4. For each step screenshot, copy with the run ID prefix then upload:
   ```bash
   # Copy with unique name (gh upload uses the filename as-is)
   cp "$WORKDIR/step-1-after.png" "$WORKDIR/$RUN_ID-step-1.png"
   gh release upload veriagent-assets "$WORKDIR/$RUN_ID-step-1.png" --repo "$REPO"
   
   cp "$WORKDIR/step-2-after.png" "$WORKDIR/$RUN_ID-step-2.png"
   gh release upload veriagent-assets "$WORKDIR/$RUN_ID-step-2.png" --repo "$REPO"
   # ... repeat for each step screenshot that exists
   ```

   The download URL for each screenshot will be:
   `https://github.com/<repo>/releases/download/veriagent-assets/<RUN_ID>-step-N.png`

   Also upload the final validation screenshot if it exists:
   ```bash
   cp "$WORKDIR/final.png" "$WORKDIR/$RUN_ID-final.png"
   gh release upload veriagent-assets "$WORKDIR/$RUN_ID-final.png" --repo "$REPO"
   ```

### 11c. Post Results Comment

Build a structured markdown comment and post it to the issue:

```bash
gh issue comment <number> --repo "$REPO" --body "<markdown>"
```

The comment body should follow this format:

```markdown
## VeriAgent Results

**Status:** PASS / FAIL
**Duration:** <total time>
**Steps:** <passed>/<total> passed

| Step | Instruction | Result | Duration |
|------|-------------|--------|----------|
| 1 | Click "Get Started" | PASS | 2.1s |
| 2 | Enter email | PASS | 1.8s |
| 3 | Click "Create Account" | FAIL | 3.2s |
| 4 | Wait for dashboard | Skipped | -- |

<details>
<summary>Step 1: Click "Get Started"</summary>

![step-1](https://github.com/<repo>/releases/download/veriagent-assets/<RUN_ID>-step-1.png)
</details>

<details>
<summary>Step 2: Enter email</summary>

![step-2](https://github.com/<repo>/releases/download/veriagent-assets/<RUN_ID>-step-2.png)
</details>

### Validation
**Expected:** <expected outcome from script>
**Actual:** <what you observed>
**Verdict:** PASS / FAIL

### Recording
[Download test recording](https://github.com/<repo>/releases/download/veriagent-assets/<RUN_ID>-recording.webm)
```

Omit the Validation section if the script had no `expected` field. Omit screenshot details sections for steps where no screenshot was captured. Omit the Recording section if `--record` was not used.

### 11d. Error Handling for GitHub Integration

- **`gh` CLI not authenticated:** Print "GitHub CLI not authenticated. Run `gh auth login` to enable issue integration." and skip the entire GitHub integration step. Still proceed to cleanup and report.
- **Screenshot upload fails:** Continue without images. In the comment, note "(screenshot upload failed)" instead of embedding the image.
- **Comment posting fails:** Print a warning but do not fail the overall run. The results will still be reported in the conversation output (Step 13).
- **Issue doesn't contain a valid script format:** This would have been caught in Step 5 (parse). No special handling needed here.

## Step 12: Cleanup

Always clean up, even if steps failed:

```bash
CLOSE_RESULT=$(node "$SKILL_DIR/driver.mjs" close "$WS")
kill $LAUNCH_PID 2>/dev/null
```

If recording was enabled, the `close` command returns `{ "ok": true, "videoPath": "/path/to/recording.webm" }`. Save the video path for the report.

If source was `--issue` and a video was recorded, upload it to the release:
```bash
cp "$VIDEO_PATH" "$WORKDIR/$RUN_ID-recording.webm"
gh release upload veriagent-assets "$WORKDIR/$RUN_ID-recording.webm" --repo "$REPO"
```

Then clean up temp files:
```bash
rm -rf "$WORKDIR"
```

## Step 13: Report Results

Print a structured summary to the conversation:

```
━━━ VeriAgent Results ━━━
Script: <script name or path>
Target: <url>
Duration: <total time>
Verdict: PASS | FAIL

Step 1: <instruction> -- PASS (1.2s)
  Action: click "button:has-text('Sign In')"

Step 2: <instruction> -- PASS (0.8s)
  Action: fill "input[name='email']" "user@test.com"

Step 3: <instruction> -- FAIL (3.1s)
  Action: click "#submit-btn"
  Error: Element not found, retried with "button:has-text('Submit')" -- also failed

Steps: 2/3 passed
Expected: "User sees the dashboard"
Actual: Login form still visible -- submit button not found
━━━━━━━━━━━━━━━━━━━━━━━━
```

## Important Principles

1. **You ARE the AI.** There are no external AI calls. You see screenshots with your vision and decide what actions to take.
2. **Screenshot first, act second.** Always take and read a screenshot before deciding on an action. The visual state of the page is your primary input.
3. **DOM snapshot is your backup.** When the screenshot is ambiguous or you need exact selectors, use the snapshot command to see all interactive elements and their attributes.
4. **Self-healing is natural.** When an action fails, you see the error and a fresh screenshot. Reason about what went wrong and try a different approach. This is not a special mode -- it is just how you operate.
5. **Be specific with selectors.** Generic selectors like `button` or `input` will match multiple elements. Always use the most specific selector available.
6. **Keep going on failure.** If a step fails after retries, log it and move to the next step. Do not abort the entire run unless the browser itself is broken.
7. **Clean up always.** The browser must be closed and temp files removed, even on errors. Wrap the execution in a try/finally mindset.
