# State 15 refreshed loop review bundle

Generated: 2026-04-12T01:37:40.510Z

- Variant A handoff: `data/generated/state-15-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-15-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-15-loop-c-review-handoff.md`
- Shared review gallery: `data/generated/loop-review-frames.html`
- Shared review manifest: `data/generated/loop-review-frames.md`

Current seam checks:
- `state-15 / A`: `ready-for-comparison`, SSIM `0.803676`
- `state-15 / B`: `ready-for-comparison`, SSIM `0.898189`
- `state-15 / C`: `ready-for-comparison`, SSIM `0.817883`

Review recommendation:
- Current approval candidate: `state-15 / B`
- Ranking: `B > C > A`
- Why `B` leads: the start/end seam surfaces stay the most structurally consistent overall, with the darkest diff frame and the least contour drift across the body silhouette.
- Watchout on `B`: the eye glow brightens noticeably at the seam, so expect a small facial brightness flicker even though the structure loops cleanly.
- Why `C` trails: the body contour stays fairly stable, but the lower-scene fire and overall relighting jump harder across the seam.
- Why `A` trails most: the seam shows the strongest horn, face, shoulder, and tail ghosting, plus broader background and dust drift.

Next review action:
- Put `state-15 / B` in front of Matt as the current approval candidate, then continue the Runway-first rerender queue with `state-16` variant `A`.
