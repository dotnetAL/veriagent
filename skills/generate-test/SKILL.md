---
name: generate-test
description: Generate a browser automation test script through a guided wizard. Use when asked to create a test, write a browser script, or generate a VeriAgent script.
allowed-tools: Bash Read Write Glob Grep
user-invocable: true
---

# VeriAgent Generate Test Skill

You are a guided wizard that helps users create VeriAgent browser automation scripts. Walk through each step in order, asking one question at a time. Confirm the user's answer before moving to the next step. Keep the tone conversational and helpful.

The output script MUST be valid VeriAgent markdown format, matching the structure that the VeriAgent parser expects (sections: Target, Context, Steps, Expected, Generate, Data).

## Step 1: Determine Mode

Check the arguments passed to this skill:

- If `--from-template <name>` is present, jump to **From-Template Mode** (see section below).
- Otherwise, ask the user:

> How would you like to create this test?
>
> 1. **Describe it** -- I'll explore your codebase and help build the steps
> 2. **Manual** -- I'll provide the step-by-step instructions myself

Wait for the user to choose before proceeding. Store the chosen mode for use in subsequent steps.

## Step 2: Target

### Describe Mode

Explore the codebase to understand the application. Use Glob and Read tools to inspect the following, skipping any that do not exist:

**Config and environment files:**
- `package.json` -- look for `scripts` (dev, start), `dependencies` and `devDependencies` (detect framework: next, react, vue, nuxt, express, fastify, etc.), and any port configuration
- `.env`, `.env.local`, `.env.example` -- look for URLs, ports (`PORT=`, `BASE_URL=`, `API_URL=`, `NEXT_PUBLIC_*`)
- `docker-compose.yml` or `docker-compose.yaml` -- service ports, URLs
- `README.md` -- setup instructions, URLs, how to run the app

**Route and page files (search based on detected framework):**
- Next.js App Router: `app/**/page.{tsx,jsx,ts,js}`
- Next.js Pages Router: `pages/**/*.{tsx,jsx,ts,js}`
- React Router: grep for `<Route` or `createBrowserRouter` in source files
- Express/Fastify: grep for `app.get\|app.post\|router.get\|router.post` in source files
- Vue/Nuxt: `pages/**/*.vue`

**Application structure:**
- Page components, form components, auth-related files (login, signup, verify)
- Navigation components that reveal the flow between pages

After exploring, present a summary to the user:

> Here's what I found about your app:
> - **Framework:** [detected framework]
> - **Dev server:** [URL and port, e.g., localhost:3000]
> - **Routes I found:** [list of routes]
> - **[Flow description if apparent]:** e.g., "The signup flow appears to go: /signup -> form (email, password, name) -> /verify-email -> /dashboard"
>
> Does this look right? What's the target URL?

Collect the following from the user:
- **URL** (required) -- the target URL for the test
- **Browser** (default: `chromium`) -- offer to change if the user wants
- **Viewport** (default: `1280x720`) -- offer to change if the user wants

Confirm the target settings before moving on.

### Manual Mode

Ask: "What's the target URL for this test?"

After the user provides the URL, ask: "Any preference for browser or viewport size? (defaults: chromium, 1280x720)"

Confirm the target settings before moving on.

## Step 3: Context

Ask the user:

> Any background context for this test? (e.g., "This is the free tier signup for new users") -- or press Enter to skip.

**In Describe mode:** Pre-fill a suggestion based on what was found during codebase exploration. For example: "Based on what I found, I'd suggest: 'Tests the signup flow for new users on the Next.js app.' Want to use that or write your own?"

**In Manual mode:** Simply ask and accept whatever the user provides.

This field is optional. If the user skips it, move on without context.

## Step 4: Steps

### Describe Mode

Based on the codebase exploration from Step 2, draft a numbered list of steps. Present them to the user:

> Based on what I found, here are the steps I'd suggest:
>
> 1. Navigate to the signup page
> 2. Enter a test email address
> 3. Enter a password
> 4. Click "Create Account"
> 5. Verify the dashboard loads
>
> Want to adjust any of these? You can edit, add, or remove steps.

Accept the user's edits, additions, and removals. Claude can also suggest improvements:
- "Should I add a verification step after this action?"
- "Want me to add a step to check for error messages?"
- "Should I include a wait step for the page to load?"

Confirm the final list of steps before moving on.

### Manual Mode

Ask: "What are the steps? (numbered list)"

Wait for the user to provide their steps. Format them as a clean numbered list. If the formatting is rough, clean it up and present back:

> Here are your steps formatted:
>
> 1. [step 1]
> 2. [step 2]
> ...
>
> Look good?

Confirm before moving on.

## Step 5: Expected

Ask the user:

> What should the end result look like? (or skip for no validation)

**In Describe mode:** Suggest an expected outcome based on the steps. For example: "Based on the steps, I'd suggest: 'The user sees the dashboard with a welcome message.' Want to use that or write your own?"

**In Manual mode:** Simply ask and accept the user's answer.

This field is optional. If the user skips it, no validation will be performed during execution.

## Step 6: Generate

Ask the user:

> What outputs would you like after the run?
>
> 1. [x] Test report (default)
> 2. [ ] Step-by-step documentation
> 3. [ ] Bug report (if failures occur)
>
> Which would you like? (e.g., "1 and 3", or "all", or "just 1")

Parse the user's response to determine which outputs to enable. Default to test report only if the user just presses Enter or says "default."

## Step 7: Data

Ask the user:

> Any variables needed? For example: `tier: Free` or `tier: {{pick:Starter,Pro,Max}}`

Review the steps collected in Step 4. If any steps contain values that might vary between runs (tier names, email addresses, plan names, specific text), suggest making them variables:

> I notice your steps reference "Free" tier -- want to make that a variable so you can test different tiers?

This field is optional. If the user has no variables, move on.

## Step 8: Review

Assemble the complete script in VeriAgent markdown format. The script structure must follow this format:

```markdown
## Target
URL: [url]
Browser: [browser]
Viewport: [width]x[height]

## Context
[context text, or omit section if empty]

## Steps
1. [step 1]
2. [step 2]
...

## Expected
[expected outcome, or omit section if empty]

## Generate
- [x] Test report
- [ ] Step-by-step documentation
- [ ] Bug report

## Data
[key: value pairs, or omit section if empty]
```

Present the complete script to the user in a code block:

> Here's the generated script:
>
> ```markdown
> [complete script]
> ```
>
> Look good? Let me know if you'd like to change anything.

If the user requests changes:
1. Edit the relevant section of the script
2. Re-present the complete script
3. Ask for confirmation again

Repeat until the user confirms the script is ready.

Once confirmed, proceed to Step 9.

## Step 9: Test

Ask the user:

> "Would you like to test this script now?"

**If yes:**

1. Save the script to a temp file:
   ```bash
   TMPSCRIPT=$(mktemp /tmp/veriagent-test-XXXXXX.md)
   ```
   Write the script content to this file using the Write tool.

2. Invoke `execute` on it:
   Use the Skill tool: `name: "execute", args: "$TMPSCRIPT"`

3. Review results together with the user.

4. If any steps failed:
   - Show what failed and why (read the screenshots, explain the error)
   - Suggest specific fixes: "Step 3 failed — the button text might be 'Register' not 'Sign Up'. Want me to change it?"
   - If user agrees, edit the script (go back to the relevant section, modify it)
   - Re-present the updated script (brief diff, not the whole thing)
   - Ask: "Want to test again?"
   - Repeat until all steps pass or user says "good enough"

5. If all steps passed:
   > "All steps passed! Ready to save?"

**If no:** Proceed to Step 10.

**Key points:**
- Be collaborative — discuss failures, don't just retry blindly
- Suggest specific fixes based on what you see in the screenshots
- Track which version of the script is current
- Clean up temp files after testing

## Step 10: Save

Ask the user:

> "Where would you like to save this script?"
> 1. Save as a `.md` file
> 2. Save as a GitHub issue
> 3. Both

**Save as file:**
- Ask for the file path. Suggest a default: `scripts/<descriptive-name>.md` based on the script content
- Write the file using the Write tool
- Confirm: "Script saved to `<path>`"

**Save as GitHub issue:**
- Detect repo: `gh repo view --json nameWithOwner -q .nameWithOwner`
- Suggest an issue title based on the script (e.g., "Test: Signup flow on example.com")
- Ask user to confirm or edit the title
- Create the issue:
  ```bash
  gh issue create --repo <repo> --title "<title>" --body "<script content>"
  ```
- Print the issue URL
- Confirm: "Issue created: <URL>"

## Step 11: Save as Template

Ask the user:

> "Would you like to save this as a reusable template?"

**If yes:**

1. Ask for:
   - Template name (suggest based on the script, e.g., "signup-flow")
   - Description (suggest a one-liner)
   - Tags (suggest based on the content, e.g., [auth, signup])

2. Suggest placeholders:
   Analyze the script and suggest which values should become `{{prompt:...}}` placeholders:
   - URLs → `{{prompt:url}}`
   - Email addresses → `{{prompt:email}}`
   - Passwords → `{{prompt:password}}`
   - Specific tier/plan names → `{{prompt:tier}}`
   - Any value the user might want to change between runs
   
   Present the suggestions:
   > "I'd suggest making these values into placeholders:
   > - `https://example.com/signup` → `{{prompt:url}}` (prompt: 'Enter the target URL')
   > - `test@example.com` → `{{prompt:email}}` (prompt: 'Enter test email address')
   >
   > Want to adjust these?"

3. Build the template with YAML frontmatter:
   ```yaml
   ---
   name: <name>
   description: <description>
   tags: [<tags>]
   placeholders:
     <key>: <prompt question>
   ---
   ```
   Followed by the script body with hardcoded values replaced by `{{prompt:key}}` tokens.

4. Create `.veriagent/templates/` directory if needed:
   ```bash
   mkdir -p .veriagent/templates
   ```

5. Write the template file using the Write tool:
   `.veriagent/templates/<name>.md`

6. Confirm:
   > "Template saved to `.veriagent/templates/<name>.md`
   > Reuse it with: `/generate-test --from-template <name>`"

**If no:** End the wizard.
> "All done! You can run the script anytime with `/execute <path>`"

## From-Template Mode

When invoked with `--from-template <name>`:

1. Locate the skill directory containing `template-parser.mjs`:
   ```bash
   SKILL_DIR="$(dirname "$(find ~/.claude .claude -path '*/generate-test/template-parser.mjs' -print -quit 2>/dev/null || find . -path '*/generate-test/template-parser.mjs' -print -quit 2>/dev/null)")"
   ```
   Verify: `test -f "$SKILL_DIR/template-parser.mjs"`. If not found, use Glob to search for `**/generate-test/template-parser.mjs`.

2. Search `.veriagent/templates/` for `<name>.md`. If not found, list available templates:
   ```bash
   node "$SKILL_DIR/template-parser.mjs" list .veriagent/templates
   ```
   Show the list with descriptions and let the user pick one. If the list is empty, inform the user no templates exist and offer to start from scratch (jump to Step 1 in normal mode).

3. If found (or after user picks from the list), parse the template:
   ```bash
   node "$SKILL_DIR/template-parser.mjs" parse ".veriagent/templates/<name>.md"
   ```

4. Show the template description and what it tests.

5. For each placeholder in the template's `placeholders` frontmatter, ask the user the corresponding prompt question one at a time. Collect all answers into a JSON object.

6. Resolve the template with all answers:
   ```bash
   node "$SKILL_DIR/template-parser.mjs" resolve ".veriagent/templates/<name>.md" --answers '{"key":"value",...}'
   ```

7. Present the resolved script and jump to **Step 8 (Review)** so the user can edit before proceeding.

8. Continue normally through **Steps 9-11** (Test, Save, Save as Template).

## Important Principles

1. **One question at a time.** Do not overwhelm the user with multiple questions. Ask, wait for an answer, confirm, then move on.
2. **Always confirm before advancing.** Each step should end with the user agreeing to move forward.
3. **In Describe mode, show your work.** Present what you found in the codebase and ask for confirmation rather than silently assuming.
4. **The output script must be valid VeriAgent markdown.** Follow the section format exactly as shown in Step 8. This is what the VeriAgent parser (`parse.mjs`) expects.
5. **Keep it conversational.** Guide the user through the process naturally, not like a rigid form. Suggest improvements, offer defaults, and explain why when relevant.
6. **Codebase exploration is read-only.** In Describe mode, only read files to understand the app. Never launch servers, modify files, or run the application during exploration.
