# Bull Bear

A BTC market-beast app that turns Bitcoin sentiment and trend into a cinematic recurring creature.

## Concept

Bull Bear represents Bitcoin market psychology as a single recurring hybrid bull-bear titan.

The creature is driven by a **composite market score** based on:

- Fear & Greed sentiment
- BTC price vs 7-day moving average
- BTC price vs 30-day moving average

That score is mapped into **20 canonical market states** ranging from deeply bearish to extremely bullish.

Instead of generating a brand new image every hour, V1 uses a pre-generated canonical asset library:

- **20 still hero images**
- **3 looped animations per state**

## Product behavior

### V1 runtime flow
1. Evaluate the market every hour.
2. Compute the composite score from `-100` to `+100`.
3. Map the score to one of 20 states.
4. If the state changed, swap to the corresponding still/loop asset.
5. Save the hourly evaluation for history and playback.

## Current implementation status

### Shipped
- Next.js app scaffold
- Architecture, style bible, prompt system, state ladder, and animation docs
- State manifest for 20 canonical states
- Live composite signal engine foundation
- Timeline-first UI foundation
- Frame persistence foundation

### Live signal engine
Current live data sources:
- Fear & Greed API (`alternative.me`)
- CoinGecko daily BTC price history

Current calculations:
- Fear & Greed sentiment score
- price vs MA7 score
- price vs MA30 score
- weighted final score
- 20-state band resolution

### Next up
- add manifest-driven current-state rendering in UI
- only persist hourly evaluations when the band changes
- generate the 20 canonical still prompts and production workflow
- fal.ai animation loop workflow

## Docs

- `docs/architecture.md`
- `docs/style-bible.md`
- `docs/prompt-system.md`
- `docs/state-ladder.md`
- `docs/animation-system.md`
- `docs/asset-production-plan.md`
- `docs/roadmap.md`

## Repository structure

```text
src/
  lib/
  app/
  api/
docs/
  architecture.md
  style-bible.md
  prompt-system.md
  state-ladder.md
  animation-system.md
  asset-production-plan.md
  roadmap.md
data/
  frames.json
  state-manifest.json
public/
  frames/
```

## Getting started

```bash
npm install
npm run dev
```

## Notes

The most important constraint is **consistency**. This is not a random image generator. It is a single market beast evolving across 20 canonical states.
