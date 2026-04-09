---
name: example-navigation
description: Tests basic navigation on a website — visits a URL and clicks a link
tags: [navigation, smoke-test]
placeholders:
  url: Enter the target URL (e.g., https://example.com)
  link_text: Text of the link to click (e.g., "More information...")
---

## Target
URL: {{prompt:url}}

## Steps
1. Observe the page heading
2. Click the "{{prompt:link_text}}" link

## Expected
User is navigated to a new page after clicking the link.

## Generate
- [x] Test report
- [ ] Step-by-step documentation
- [ ] Bug report
