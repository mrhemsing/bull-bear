# State 09 refreshed loop review bundle

Generated: 2026-04-13T14:40:06.8776542Z

- Variant A handoff: `data/generated/state-09-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-09-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-09-loop-c-review-handoff.md`
- Shared review gallery: `data/generated/loop-review-frames.html`
- Shared review manifest: `data/generated/loop-review-frames.md`

Current seam checks:
- `state-09 / A`: `ready-for-comparison`, SSIM `0.675552`
- `state-09 / B`: `ready-for-comparison`, SSIM `0.757280`
- `state-09 / C`: `ready-for-comparison`, SSIM `0.743222`

Review recommendation:
- Current approval candidate: `state-09 / C`
- Ranking: `C > A > B`
- Why `C` leads: the refreshed start and end frames stay closest in pose, framing, and lighting continuity, and the diff frame keeps the seam changes more localized than the other two variants.
- Watchout on `C`: there is still a visible brightness and eye-glow shift into the fiery end frame, so the seam is cleaner structurally than it is tonally.
- Why `A` trails: it stays usable, but the diff frame still shows broader lighting drift and some horn/body ghosting at the reset.
- Why `B` trails most: the seam carries the clearest structural doubling around the head, horns, and body silhouette, which makes the loop reset read hardest.

Next review action:
- Put `state-09 / C` in front of Matt as the current approval candidate, then continue the Runway-first rerender queue with the next affected state.
