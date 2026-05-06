# Easteregg Background Pattern Mix Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add an opt-in easteregg mode that can remix background patterns in a seeded, reproducible way without affecting layout, readability, or default output.

**Architecture:** Keep the current deterministic rendering path as the default. Introduce a small pattern-composition seam that selects and layers background pattern primitives only when an explicit easteregg flag is enabled. The composer should be seeded, reproducible, and constrained to a curated set of safe combinations so the result feels like a design-system remix, not random noise.

**Tech Stack:** Node.js, node:test, canvas, existing `render-config.js` / `render.js` pattern pipeline.

---

## Product / design constraints

- Default output must remain unchanged unless easteregg mode is explicitly enabled.
- The mode must be reproducible with a `seed`.
- The mode must not affect text layout, pagination, or content order.
- The mode should only alter background visuals: pattern selection, layering, opacity, blend, and limited accents.
- If composition fails, fall back to the normal single-pattern render.
- The feature should feel like a polished easteregg, not a gimmick.

---

## Proposed API

### JSON contract

Add an optional top-level field:

```json
{
  "easterEgg": {
    "mode": "random-patterns",
    "seed": "deck-optional-seed",
    "intensity": "low"
  }
}
```

Recommended shape:

- `easterEgg.mode`: `"random-patterns" | "off"`
- `easterEgg.seed`: string | number
- `easterEgg.intensity`: `"low" | "medium"` (keep `"high"` out of v1)

Alternative if you want a flatter config:

- `easterEgg: true`
- `easterEggSeed: "..."`

Prefer the nested object only if it stays simple. Otherwise use the flatter version.

### CLI

Optional flag for ad-hoc previewing:

- `--easteregg` or `--easter-egg`
- `--seed <value>`

CLI should only override or enable, not invent new behavior.

---

## Allowed visual primitives

Keep the remix constrained to a curated set:

- base pattern: `none`, `dot-grid`, `line-grid`, `diagonal`, `halftone`, `dither`, `ascii`, `paper`
- overlay pattern: same list, but exclude anything too dense if the base is already noisy
- blend modes: `source-over`, `multiply`, `overlay`, `screen`, `soft-light`
- opacity cap: e.g. `0.04`–`0.16`
- optional accent: subtle corner motif or small secondary texture only on cover/CTA

Avoid introducing new primitives unless needed.

---

## Implementation tasks

### Task 1: Define the config surface for easteregg mode

**Objective:** Add a minimal config path that can enable/seed the mode without affecting existing templates.

**Files:**
- Modify: `render-config.js`
- Modify: `README.md`
- Test: `test/render-table-pagination.test.mjs` or a new focused test file

**Behavior to define:**
- `easterEgg` defaults to off.
- Existing JSON decks render exactly the same.
- Seed normalization should be stable for string/number input.

**Test cases:**
- `resolveThemeConfig` / config resolution returns no easteregg state by default.
- Enabling easteregg via content config preserves all existing theme defaults.
- Seed normalization produces the same internal seed for the same input.

---

### Task 2: Extract a pattern-composition seam

**Objective:** Move pattern remix logic out of `render.js` into a dedicated helper so the feature stays local and testable.

**Files:**
- Create: `render-pattern.js`
- Modify: `render.js`
- Modify: `package.json` (`files`, `lint`)

**Suggested exports:**
- `normalizeEastereggConfig(content, cliArgs)`
- `resolveBackgroundPattern(theme, easteregg, seed)`
- `composeBackgroundPatternPlan(theme, easteregg)`
- `applyPatternLayer(ctx, plan, tokens)`

**Implementation notes:**
- Keep the normal pattern render path as the default branch.
- The composer should return a small “plan” object rather than mutate theme in place.
- The plan should be serializable for debugging/tests.

**Test cases:**
- Default mode returns a single pattern plan.
- Easteregg mode returns a deterministic multi-layer plan for the same seed.
- Invalid or unknown pattern choices fall back to the default plan.

---

### Task 3: Add seeded selection and layering logic

**Objective:** Make the remix deterministic and constrained.

**Files:**
- Create or modify: `render-pattern.js`
- Modify: `render.js`

**Behavior:**
- Use a small deterministic PRNG seeded from `seed + deck identity + template name`.
- Select from a curated list of 2-layer combos.
- Limit opacity, blend modes, and density based on intensity.
- Never select combinations that damage readability.

**Suggested rules:**
- If `theme.pattern === "none"`, the composer may still add a very light texture overlay.
- If base pattern is already dense (`dither`, `ascii`), overlay must be subtle or absent.
- No more than 2 pattern layers in v1.
- No text-area mutation.

**Test cases:**
- Same seed + same input => same plan.
- Different seed => different plan, within allowed combo set.
- Dense base pattern prevents dense overlay.

---

### Task 4: Keep rendering fallback-safe

**Objective:** Ensure any pattern-composition failure quietly falls back to the existing renderer.

**Files:**
- Modify: `render.js`
- Modify: `render-pattern.js`

**Behavior:**
- If the composer throws, catch and fall back to the standard `theme.pattern` path.
- Keep error logging quiet unless debug mode is enabled.
- Do not block render generation.

**Test cases:**
- Composer throw -> output still renders with default pattern.
- Fallback path does not alter layout or slide count.

---

### Task 5: Add render regression tests

**Objective:** Prove the easteregg mode is deterministic, visually different, and non-breaking.

**Files:**
- Modify or create: `test/render-pattern.test.mjs`
- Potentially modify: `test/render-table-pagination.test.mjs`

**Test matrix:**
1. Default render remains unchanged.
2. Easteregg mode with fixed seed produces stable output across two runs.
3. Easteregg mode actually changes background pixels compared with baseline.
4. Layout, pagination, and slide count remain unchanged.
5. Fallback when composer fails still renders successfully.

**Suggested approach:**
- Render a tiny deck twice with same seed and compare a checksum or sampled pixels.
- Compare against non-easteregg output with the same content.
- Use an existing deterministic slide or add a small fixture deck.

---

### Task 6: Document the easteregg mode

**Objective:** Tell users how to use it without polluting the main README.

**Files:**
- Modify: `README.md`
- Optional: `docs/` preview asset if you want a screenshot later

**Docs should say:**
- The mode is opt-in.
- It is seeded and reproducible.
- It affects background patterns only.
- Default behavior is unchanged.

**Keep it brief.** One short section is enough.

---

## Verification checklist

After implementation:

- [ ] `npm run lint`
- [ ] `npm test --silent`
- [ ] `npm pack --dry-run`
- [ ] One manual render with easteregg mode enabled
- [ ] One manual render with easteregg mode disabled to confirm no regression

---

## Recommended implementation order

1. Add config surface
2. Extract pattern composer seam
3. Add seeded composition logic
4. Add fallback handling
5. Add tests
6. Update docs

---

## Notes / taste guardrails

- Keep the feature hidden unless explicitly enabled.
- Favor reproducibility over maximum randomness.
- Favor subtle remix over visual chaos.
- If a combination looks too noisy on a slide, ban it from the allowed set instead of adding more controls.

---

## Success criteria

- Default renders are identical to today.
- Seeded easteregg renders are reproducible.
- Backgrounds feel playfully varied, but text remains clean.
- Tests prove the mode is safe.
