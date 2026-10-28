---
name: ui-screenshot-validation
description: "Visually validate frontend changes with browser screenshots at desktop and mobile widths before reporting completion. Use after any change that affects an interface, screen, modal, layout or style."
---

# UI screenshot validation

Every interface change is validated in the browser with screenshots before completion. DOM assertions, builds and type checks do not replace visual inspection.

1. Run the app (use the `run` skill or the project's dev/Playwright setup; Playwright configs live in `frontend/playwright.*.config.ts`).
2. Capture the affected screen and every changed state (empty, loading, error, expanded, modal open) at a desktop width and a mobile width, including the reported viewport when the user gave one.
3. Inspect each screenshot. Fix spacing, alignment, overflow and responsive regressions.
4. After the final change, capture fresh screenshots and inspect them again; earlier ones do not count.
5. Report the screenshot paths and any validation limitations (missing data, unreachable state, environment limits).

Save screenshots outside the repository (scratchpad or a temp folder) unless the user asks to keep them.
