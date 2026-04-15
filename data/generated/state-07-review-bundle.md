# State 07 refreshed loop review bundle

Generated: 2026-04-13T07:37:56.7429499Z

- Variant A handoff: `data/generated/state-07-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-07-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-07-loop-c-review-handoff.md`
- Shared review gallery: `data/generated/loop-review-frames.html`
- Shared review manifest: `data/generated/loop-review-frames.md`

Current seam checks:
- `state-07 / A`: `ready-for-comparison`, SSIM `0.788086`
- `state-07 / B`: `ready-for-comparison`, SSIM `0.748740`
- `state-07 / C`: `ready-for-comparison`, SSIM `0.712541`

Review recommendation:
- Current approval candidate: `state-07 / B`
- Ranking: `B > C > A`
- Why `B` leads: the start and end pose stay closest in head position, shoulder mass, and leg placement, so the seam reads as the most continuous across the refreshed set.
- Watchout on `B`: the end frame adds a strong warm underlight across the muzzle, chest, paws, and horns, so the seam can still pop tonally even when the structure holds.
- Why `C` trails: it keeps a usable stance, but horn, face, and upper-body drift make the seam more noticeable than `B`.
- Why `A` trails most: the face shape, horn orientation, and overall silhouette shift the most, making the seam read like a snap.

Next review action:
- Put `state-07 / B` in front of Matt as the current approval candidate, then continue the Runway-first rerender queue with `state-08` variant `A`.
