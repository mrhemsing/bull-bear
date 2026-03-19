# Bull Bear

A BTC-driven cinematic creature generator.

## Concept

Bull Bear turns Bitcoin's 1-hour price movement into an evolving monster portrait:

- **0%** = balanced 50/50 bull-bear hybrid
- **Positive move** = increasingly bull-dominant creature
- **Negative move** = increasingly bear-dominant creature
- **Same creature identity** across every frame
- **Hourly generation** with saved history for timelapse scrubbing

## Product goals

1. Fetch Bitcoin price every hour.
2. Compute 1-hour percentage change.
3. Map that change to a dramatic bull/bear transformation scale.
4. Generate a cinematic creature image with a stable art direction.
5. Save image + metadata for history playback.
6. Present the latest frame and historical timeline in a simple web UI.

## Architecture

```text
BTC price source
  -> market state mapper
  -> prompt composer
  -> image generation adapter
  -> frame archive
  -> web UI (latest view + timeline scrubber)
```

## Repository structure

```text
src/
  lib/
    btc.ts
    state.ts
    prompts.ts
    types.ts
    frames.ts
  app/
    page.tsx
    api/
      frames/route.ts
      generate/route.ts
public/
  frames/
    .gitkeep
docs/
  architecture.md
  style-bible.md
  prompt-system.md
  roadmap.md
data/
  frames.json
```

## State model

We map 1-hour BTC movement to a dramatic but bounded transformation scale.

Example visual bands:

- `<= -3.0%` -> max bear
- `-2.0%` -> very bear
- `-1.0%` -> strong bear
- `0.0%` -> hybrid baseline
- `+1.0%` -> strong bull
- `+2.0%` -> very bull
- `>= +3.0%` -> max bull

The final implementation can interpolate continuously between these bands while preserving a fixed creature identity.

## MVP plan

### Phase 1
- Scaffold app and data model
- Simulate hourly frames without real image generation
- Render latest state + history in UI

### Phase 2
- Integrate image generation provider
- Save generated images and prompts
- Add hourly scheduled generation

### Phase 3
- Add timelapse scrubber
- Add chart sync and richer playback

## Getting started

```bash
npm install
npm run dev
```

## Notes

The most important constraint is **consistency**. This is not a random image generator; it is a single market beast evolving over time.
