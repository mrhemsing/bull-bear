# State 12 refreshed loop review bundle

Generated: 2026-04-11T13:37:24.181Z

- Variant A handoff: `data/generated/state-12-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-12-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-12-loop-c-review-handoff.md`
- Shared review gallery: `data/generated/loop-review-frames.html`
- Shared review manifest: `data/generated/loop-review-frames.md`

Current seam checks:
- `state-12 / A`: `ready-for-comparison`, SSIM `0.737543`
- `state-12 / B`: `ready-for-comparison`, SSIM `0.760389`
- `state-12 / C`: `ready-for-comparison`, SSIM `0.742048`

Review recommendation:
- Strongest clean rerender candidate: `state-12 / B`
- Ranking after comparing the staged seam surfaces: `B > C > A`
- Why `B` leads: it keeps the head, horns, and body mass most aligned across the seam, and the diff frame stays tighter than the broader silhouette drift visible in `A` and the slightly noisier flank and tail separation in `C`.
- Watchout for Matt's review: `B` is the best staged option, but there is still a small tail and background shift to check in motion before approval.

Next review action:
- Put `state-12 / B` in front of Matt as the current approval candidate, then continue the rerender queue with the next affected state.
