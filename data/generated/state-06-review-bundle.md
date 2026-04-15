# State 06 refreshed loop review bundle

Generated: 2026-04-13T03:38:43.962Z

- Variant A handoff: `data/generated/state-06-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-06-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-06-loop-c-review-handoff.md`
- Shared review gallery: `data/generated/loop-review-frames.html`
- Shared review manifest: `data/generated/loop-review-frames.md`

Current seam checks:
- `state-06 / A`: `ready-for-comparison`, SSIM `0.594757`
- `state-06 / B`: `ready-for-comparison`, SSIM `0.858257`
- `state-06 / C`: `ready-for-comparison`, SSIM `0.665503`

Review recommendation:
- Current approval candidate: `state-06 / C`
- Ranking: `C > A > B`
- Why `C` leads: the start and end pose stay closest in head angle, shoulder mass, and leg placement, so the seam reads as the most continuous across the refreshed set.
- Watchout on `C`: there is still a visible lighting jump into the fiery end frame, so the seam is cleaner structurally than it is tonally.
- Why `A` trails: framing stays usable, but the loop carries a broad brightness jump plus facial and horn shape drift that keeps the seam visible.
- Why `B` trails most: the head, muzzle, and body silhouette shift the most, creating the clearest structural mismatch at the loop seam.

Next review action:
- Put `state-06 / C` in front of Matt as the current approval candidate, then continue the Runway-first rerender queue with `state-07` variant `A`.
