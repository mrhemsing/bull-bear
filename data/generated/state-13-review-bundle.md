# State 13 refreshed loop review bundle

Generated: 2026-04-11T17:37:35.967Z

- Variant A handoff: `data/generated/state-13-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-13-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-13-loop-c-review-handoff.md`
- Shared review gallery: `data/generated/loop-review-frames.html`
- Shared review manifest: `data/generated/loop-review-frames.md`

Current seam checks:
- `state-13 / A`: `ready-for-comparison`, SSIM `0.795047`
- `state-13 / B`: `ready-for-comparison`, SSIM `0.662337`
- `state-13 / C`: `ready-for-comparison`, SSIM `0.699337`

Review recommendation:
- Strongest clean rerender candidate: `state-13 / A`
- Ranking after comparing the staged seam surfaces: `A > C > B`
- Why `A` leads: it returns closest to the start pose and framing, with the diff concentrated mostly in broad lighting haze plus smaller horn and body-edge ghosting instead of the larger subject mismatch visible in `C` and the major lighting flip in `B`.
- Watchout for Matt's review: `A` is the best staged option, but there is still a noticeable full-frame brightness haze shift and some horn/right-body edge ghosting to check in motion before approval.

Next review action:
- Put `state-13 / A` in front of Matt as the current approval candidate, then continue the rerender queue with the next affected state.
