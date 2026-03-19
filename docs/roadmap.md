# Roadmap

## Milestone 1 - foundation
- [x] Define architecture
- [x] Define style bible
- [x] Define prompt system
- [x] Scaffold Next.js UI and API routes
- [x] Add sample archived frames

## Milestone 2 - live market data
- [x] Replace mock BTC snapshot with live provider
- [ ] Persist newly generated frame metadata to storage
- [ ] Add hourly generation job

## Milestone 3 - image generation integration
- [x] Add provider adapter foundation for ChatGPT/OpenAI image generation
- [ ] Evaluate ChatGPT image generation as primary engine
- [ ] Test reference-image consistency workflow
- [ ] Wire provider adapter into saved frame workflow
- [ ] Save generated images to public frame archive

## Milestone 4 - product UI
- [ ] Build actual timeline scrubber
- [ ] Add image thumbnails / real image rendering
- [ ] Add chart-to-frame synchronization
- [ ] Add timelapse playback mode

## Milestone 5 - polish
- [ ] Add provider abstraction for future bakeoffs
- [ ] Add frame detail drawer with full prompt and metadata
- [ ] Improve responsive layout and visual design
