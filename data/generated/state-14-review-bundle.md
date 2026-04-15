# State 14 refreshed loop review bundle

Generated: 2026-04-11T21:37:40.500Z

- Variant A handoff: `data/generated/state-14-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-14-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-14-loop-c-review-handoff.md`
- Shared review gallery: `data/generated/loop-review-frames.html`
- Shared review manifest: `data/generated/loop-review-frames.md`

Current seam checks:
- `state-14 / A`: `ready-for-comparison`, SSIM `0.828877`
- `state-14 / B`: `ready-for-comparison`, SSIM `0.826905`
- `state-14 / C`: `ready-for-comparison`, SSIM `0.688028`

Review recommendation:
- Current approval candidate: `state-14 / B`
- Ranking: `B > A > C`
- Why `B` leads: the start/end seam surfaces stay the most structurally consistent overall, with less scene relighting than `A` and less facial/fire flare-up than `C`.
- Watchout on `B`: the seam still shows visible horn, outer-body, and leg contour drift, so expect a moderate silhouette pop at the loop.
- Why `A` trails: the lower-scene fire and ground glow brighten noticeably at the end frame, which reads as a lighting seam.
- Why `C` trails most: the end frame adds glowing eyes, mouth, and stronger fire, producing the largest facial and illumination pop.

Next review action:
- Put `state-14 / B` in front of Matt as the current approval candidate, then continue the Runway-first rerender queue with `state-15` variant `A`.
