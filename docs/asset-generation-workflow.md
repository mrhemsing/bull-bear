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

### Batch 1 — still generation
Generate all 20 stills using the `stillPrompt` field from `data/state-prompts.json`.

Output targets:
- `public/states/state-01/still.png`
- ...
- `public/states/state-20/still.png`

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
