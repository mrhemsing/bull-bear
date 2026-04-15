# State 04 refreshed loop review bundle

Generated: 2026-04-12T19:38:39.281Z

- Variant A handoff: `data/generated/state-04-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-04-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-04-loop-c-review-handoff.md`
- Shared review gallery: `data/generated/loop-review-frames.html`
- Shared review manifest: `data/generated/loop-review-frames.md`

Current seam checks:
- `state-04 / A`: `ready-for-comparison`, SSIM `0.623439`
- `state-04 / B`: `ready-for-comparison`, SSIM `0.870850`
- `state-04 / C`: `ready-for-comparison`, SSIM `0.630492`

Review recommendation:
- Current approval candidate: `state-04 / B`
- Ranking: `B > C > A`
- Why `B` leads: the start and end frames stay closest in pose, scale, and lighting, so the seam reads the most stable overall.
- Watchout on `B`: there is still slight head and face drift plus residual background texture change at the seam.
- Why `C` trails: the horn, ear silhouette, and face alignment shift more visibly than `B`, with a stronger floor and fire lighting change.
- Why `A` trails most: the start/end jump is the most obvious, with a large face and fire brightness reveal that reads as a clear seam pop.

Next review action:
- Put `state-04 / B` in front of Matt as the current approval candidate, then continue the Runway-first rerender queue with `state-05` variant `A`.
