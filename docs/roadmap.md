# Roadmap

## Milestone 1 - foundation
- [x] Define architecture
- [x] Define style bible
- [x] Define prompt system
- [x] Scaffold Next.js UI and API routes
- [x] Add sample archived frames

## Milestone 2 - live market signal engine
- [x] Fetch Fear & Greed index
- [x] Fetch BTC price history for MA7 / MA30
- [x] Compute weighted composite score
- [x] Map composite score to 20 canonical bands
- [ ] Persist hourly evaluation records only when state changes

## Milestone 3 - canonical asset system
- [x] Define 20-state ladder
- [x] Define animation system
- [x] Add state manifest
- [ ] Generate 20 canonical stills
- [ ] Generate 3 loop variants per state via fal.ai

## Milestone 4 - app integration
- [ ] Load current state from composite score
- [ ] Resolve current still + loop assets from manifest
- [ ] Show animation-first hero state in UI
- [ ] Add timeline scrubber and state history

## Milestone 5 - polish
- [ ] Add component-score debug panel
- [ ] Add chart-to-state synchronization
- [ ] Improve responsive layout and visual design
- [ ] Add variant rotation logic for loop selection
