# Asset Generation Workflow

## Objective

Turn the canonical Bull Bear state library into production-ready assets:

- 20 still images
- 60 animation loops

## Source files

- `data/state-manifest.json` -> canonical state IDs, labels, and asset paths
- `data/state-prompts.json` -> exportable still + loop prompts for every state
- `docs/canonical-prompt-pack.md` -> human-readable still prompt reference
- `docs/fal-animation-prompts.md` -> animation prompt rules for fal.ai

## Batch strategy

Before generating, run:

```bash
npm run assets:prepare
```

This scaffolds the canonical `public/states/state-xx/` folders and exports machine-readable + human-readable production checklists under `data/generated/`.

Generated coordination files:
- `data/generated/canonical-asset-checklist.md` -> human-readable per-state status table including live loop readiness
- `data/generated/canonical-asset-checklist.json` -> machine-readable asset status + prompts
- `data/generated/canonical-review-queue.json` -> review-ready still candidates and approved anchors detected from `out/`
- `data/generated/canonical-still-generation-queue.{md,json}` -> exact next outward still frontier unlocked by the contiguous approved run
- `data/generated/canonical-still-render-jobs.{md,json}` -> per-frontier render handoff with copy-ready prompts, suggested output filenames, and bridge-reference copies staged into each `out/state-xx-adjacent/` directory
- `data/generated/canonical-image-generation-jobs.{md,json}` -> provider-ready still image-edit requests derived from those frontier handoffs so the next adjacent render pass can be run without rebuilding request payloads manually
- `data/generated/canonical-image-generation-results.json` -> execution report from `npm run generate:stills`, including either generated output paths or a dry-run / missing-auth blocker summary plus per-run timestamps; the production dashboard now surfaces this directly so auth blockers, generated frontier outputs, and the latest attempt time are visible in-app
- `data/generated/canonical-loop-generation-queue.{md,json}` -> exact loop targets that are now unblocked by approved canonical stills
- `data/generated/canonical-loop-generation-results.json` -> execution report from `npm run generate:loops`, including dry-run / missing-auth blocker status plus per-run timestamps for every currently staged loop job; the production dashboard now surfaces this directly so loop execution state and the latest attempt time are visible in-app too
- `data/generated/canonical-loop-render-jobs.{md,json}` -> render-ready loop handoff plus per-loop `out/loop-renders/state-xx-loop-y/` prompt + manifest folders with staged still reference copies
- `data/generated/canonical-staged-render-handoff.{md,json}` -> one merged operator handoff that points directly at the exact staged render manifest, prompt, and reference-copy files for every currently actionable still or loop job
- `data/generated/canonical-production-next-actions.{md,json}` -> one prioritized production plan that merges frontier still work and unblocked loop renders into a single queue, now surfaced directly in the app dashboard as the canonical handoff order

The prep step now auto-detects:
- approved still selections recorded in `data/generated/anchor-selection.json`
- adjacent still candidate batches stored under `out/state-xx-adjacent/`
- approved canonical loop files already present under `public/states/state-xx/`

Loop status meanings in the generated checklist:
- `approved` -> canonical loop file exists at the runtime target
- `ready-to-generate` -> still is approved, but that loop target is still missing
- `blocked-until-still-approved` -> no approved still yet, so loop work should wait

### Batch 1 — still generation
Generate all 20 stills using the `stillPrompt` field from `data/state-prompts.json`.

For the currently unlocked outward frontier, the prep step now emits provider-ready edit jobs. Run:

```bash
npm run generate:stills
```

Optional dry-run / targeting helpers:

```bash
npm run generate:stills -- --dry-run
npm run generate:stills -- --state=state-07
```

This consumes `data/generated/canonical-image-generation-jobs.json`, sends the queued image-edit requests when `OPENAI_API_KEY` is present, writes the returned candidates into each `out/state-xx-adjacent/` folder, and records a machine-readable execution report in `data/generated/canonical-image-generation-results.json`.

Output targets:
- `public/states/state-01/still.png`
- ...
- `public/states/state-20/still.png`

For the currently unlocked loop backlog, you can now also write a real execution report with:

```bash
npm run generate:loops
```

Optional dry-run / targeting helpers:

```bash
npm run generate:loops -- --dry-run
npm run generate:loops -- --state=state-10
npm run generate:loops -- --state=state-10 --variant=b
```

This consumes `data/generated/canonical-loop-render-jobs.json`, submits real fal image-to-video requests when `FAL_KEY` is present, writes returned MP4s into the canonical runtime targets under `public/states/state-xx/`, and records a machine-readable execution report in `data/generated/canonical-loop-generation-results.json`, so loop auth blockers, provider failures, generated outputs, and invocation status are visible without digging through CLI output.

### Forced rerender flow for the paper-money cleanup

When previously approved loop MP4s still contain visible paper-money imagery, regenerate the queue instead of trusting the already-approved runtime files:

```bash
npm run assets:prepare -- --force-loop-regeneration
npm run generate:loops
```

Target only specific states when you want a smaller rerender batch:

```bash
npm run assets:prepare -- --force-loop-states=state-01,state-10,state-20
npm run generate:loops -- --state=state-10 --variant=b
```

What this does:
- repopulates `data/generated/canonical-loop-generation-queue.json|md`, `canonical-loop-render-jobs.json|md`, and `canonical-production-next-actions.json|md` with the rerender backlog
- preserves already approved loop status in the canonical checklist while still staging forced rerender jobs in the generated queue/handoff
- preserves the sanitized non-paper prompts in the rerender handoff so the replacement queue does not reintroduce paper-money language

Current blocker on this host: if `FAL_KEY` is missing, the queue can still be prepared and inspected here, but actual fal rerender execution must happen on a host with provider auth.

After rerendering, verify the replacements with the same two checks used during cleanup:
1. text-check the regenerated queue/results metadata for money-language regressions
2. extract representative frames from the new MP4s and visually confirm paper-money imagery is gone before re-approving the loops

The extraction step is now scriptable for the active rerender queue:

```bash
npm run review:loops -- --states=state-01,state-10,state-20 --variant=b --overwrite
```

That command writes representative PNGs under `out/loop-review-frames/` plus a concise manifest in `data/generated/loop-review-frames.json|md`, so the keyed rerender host can leave behind a reviewable proof bundle instead of an ad hoc ffmpeg command history.

It now also writes `data/generated/loop-review-frames.html`, a single gallery file for side-by-side visual review of the targeted batch.

For the current paper-money cleanup, the whole targeted rerender handoff is now also collapsed into one operator command:

```bash
npm run rerender:paper-money -- --states=state-01,state-10,state-20 --variant=b --overwrite-review-frames
```

What this wrapper does:
- re-prepares the forced rerender queue for the requested states
- runs the matching loop-generation jobs state by state
- extracts the review-frame proof bundle immediately after generation
- writes a single HTML review gallery alongside the PNG/JSON/Markdown proof bundle for faster acceptance on the keyed host
- writes a compact summary to `data/generated/paper-money-rerender-report.json|md`

If `FAL_KEY` is missing, the wrapper still leaves behind the prepared queue, the blocked generation results, the review-frame status, and the summary report so the next authenticated host can pick up the exact same command.

### Batch 2 — loop A generation
For each state, use the approved still as the image anchor and the following prompt stack:
- `animationBasePrompt`
- `loopPrompts.a`

Output targets:
- `public/states/state-01/loop-a.mp4`
- ...
- `public/states/state-20/loop-a.mp4`

### Batch 3 — loop B generation
Use the approved still plus:
- `animationBasePrompt`
- `loopPrompts.b`

### Batch 4 — loop C generation
Use the approved still plus:
- `animationBasePrompt`
- `loopPrompts.c`

## Review rules

Review every state in sequence from 01 -> 20.

Questions:
- Does the creature remain recognizable?
- Does each state feel one step away from adjacent states?
- Are eye colors and limb signals correct?
- Is Wall Street still legible?
- Do loops stay subtle and premium?

## Shipping sequence

Recommended:
1. ship still-backed UI first if needed
2. add A loops once approved
3. add B loops
4. add C loops

## Runtime behavior

The app should resolve the current state from the composite score, then:
- prefer a loop variant if available
- otherwise fall back to the still image
- rotate between loop A/B/C when appropriate
