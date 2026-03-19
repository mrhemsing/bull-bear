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

## Current implementation status

### Shipped
- Next.js app scaffold
- Architecture, style bible, and prompt system docs
- BTC 1-hour state mapping logic
- Sample frame archive and timeline-first UI
- Live BTC snapshot fetch via CoinGecko public API
- OpenAI / ChatGPT image generation adapter foundation

### Not wired yet
- Persisting new generated frames to storage
- Saving returned images to the public frame archive
- Scheduled hourly job
- Full interactive scrubber UI

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
    image-provider.ts
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

## Environment

Copy `.env.example` to `.env.local` and set your image-generation credentials when ready.

```bash
OPENAI_API_KEY=your_key_here
OPENAI_IMAGE_MODEL=gpt-image-1
```

## API routes

### `POST /api/generate`
Returns:
- live BTC snapshot
- mapped creature state
- prompt bundle
- image-generation adapter response

If `OPENAI_API_KEY` is not set, the route still works and returns a provider preview payload.

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

## Getting started

```bash
npm install
npm run dev
```

## Notes

The most important constraint is **consistency**. This is not a random image generator; it is a single market beast evolving over time.
