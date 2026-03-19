# Animation System

## Asset strategy

Each of the 20 canonical states will have:

- **1 hero still image**
- **3 short animation loops** (3-5 seconds each)

Total asset target:

- **20 stills**
- **60 looped video clips**

## Why loops instead of live video generation

Pre-rendered loops are preferred for V1 because they provide:

- faster load times
- stable creature identity
- predictable quality
- lower operating cost
- easier batching through fal.ai

## Variation model

Each state gets 3 motion variations:

### Variation A — Contained menace
Subtle breathing, eye glow pulsing, restrained tension, minimal camera movement.

### Variation B — Atmospheric pressure
Smoke, drifting money, haze, environmental movement, stronger atmosphere while the creature remains largely composed.

### Variation C — Creature energy
More body tension, slight head motion, horn/claw emphasis, stronger intimidation, still within a fixed hero composition.

## Motion rules

Keep all loops:

- subtle and cinematic
- mostly fixed camera
- front-facing or slight 3/4 hero framing
- visually loopable
- identity-preserving

Avoid:

- major camera moves
- full action scenes
- dramatic repositioning
- anatomy drift
- environment changes that break continuity

## Suggested frontend behavior

- Default to the active state's loop
- Randomly rotate between variations A/B/C on revisit or refresh
- Crossfade between loops when the market state changes
- Fall back to the still image if video is unavailable

## fal.ai production note

Generate loops from approved still anchors whenever possible. The still image should be treated as the canonical reference for that state.
