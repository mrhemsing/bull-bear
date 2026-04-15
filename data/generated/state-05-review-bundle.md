# State 05 refreshed loop review bundle

Generated: 2026-04-12T23:38:07.445Z

- Variant A handoff: `data/generated/state-05-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-05-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-05-loop-c-review-handoff.md`
- Shared review gallery: `data/generated/loop-review-frames.html`
- Shared review manifest: `data/generated/loop-review-frames.md`

Current seam checks:
- `state-05 / A`: `ready-for-comparison`, SSIM `0.620763`
- `state-05 / B`: `ready-for-comparison`, SSIM `0.818681`
- `state-05 / C`: `ready-for-comparison`, SSIM `0.607631`

Review recommendation:
- Current approval candidate: `state-05 / B`
- Ranking: `B > C > A`
- Why `B` leads: the start and end frames stay closest in pose, framing, and overall brightness, so the seam reads the most stable across the set.
- Watchout on `B`: there is still a visible face and horn highlight lift at the seam that could flash on loop.
- Why `C` trails: the horn shape and upper silhouette drift more than `B`, with a brighter shoulder and back halo change that leaves a visible ghost seam.
- Why `A` trails most: the global brightness jump plus floating bill and facial highlight drift makes the seam pop immediately.

Next review action:
- Put `state-05 / B` in front of Matt as the current approval candidate, then continue the Runway-first rerender queue with `state-06` variant `A`.
