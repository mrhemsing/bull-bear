# State 16 refreshed loop review bundle

Generated: 2026-04-12T05:37:47.655Z

- Variant A handoff: `data/generated/state-16-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-16-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-16-loop-c-review-handoff.md`
- Shared review gallery: `data/generated/loop-review-frames.html`
- Shared review manifest: `data/generated/loop-review-frames.md`

Current seam checks:
- `state-16 / A`: `ready-for-comparison`, SSIM `0.853123`
- `state-16 / B`: `ready-for-comparison`, SSIM `0.931135`
- `state-16 / C`: `ready-for-comparison`, SSIM `0.814122`

Review recommendation:
- Current approval candidate: `state-16 / A`
- Ranking: `A > B > C`
- Why `A` leads: the body silhouette and overall scene stay the most structurally consistent across the seam, with the cleanest continuity between the start and end frames.
- Watchout on `A`: there is still mild horn and eye ghosting plus a small whole-frame brightness shift at the seam.
- Why `B` trails: the form stays fairly stable, but the seam reads more because the full frame darkens and the background haze and bills drift harder.
- Why `C` trails most: a foreground bill crosses the face near the seam, creating the most obvious facial discontinuity and the strongest object drift.

Next review action:
- Put `state-16 / A` in front of Matt as the current approval candidate, then continue the Runway-first rerender queue with `state-17` variant `A`.
