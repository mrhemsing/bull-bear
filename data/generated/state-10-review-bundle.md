# State 10 rerender review bundle

Generated: 2026-04-08T05:09:30Z

This bundle consolidates the refreshed Runway-first rerenders for `state-10` so Matt can review the full A/B/C set from one handoff.

## Review surface

- Review gallery: `data/generated/loop-review-frames.html`
- Variant A handoff: `data/generated/state-10-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-10-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-10-loop-c-review-handoff.md`

## Canonical outputs

| Variant | Loop MP4 | Start frame | End frame | Diff frame | Seam status | SSIM |
| --- | --- | --- | --- | --- | --- | --- |
| A | `public/states/state-10/loop-a.mp4` | `out/loop-review-frames/state-10-a/state-10-a-frame-0.png` | `out/loop-review-frames/state-10-a/state-10-a-frame-end.png` | `out/loop-review-frames/state-10-a/state-10-a-frame-diff.png` | `ready-for-comparison` | `0.6674` |
| B | `public/states/state-10/loop-b.mp4` | `out/loop-review-frames/state-10-b/state-10-b-frame-0.png` | `out/loop-review-frames/state-10-b/state-10-b-frame-end.png` | `out/loop-review-frames/state-10-b/state-10-b-frame-diff.png` | `ready-for-comparison` | `0.9488` |
| C | `public/states/state-10/loop-c.mp4` | `out/loop-review-frames/state-10-c/state-10-c-frame-0.png` | `out/loop-review-frames/state-10-c/state-10-c-frame-end.png` | `out/loop-review-frames/state-10-c/state-10-c-frame-diff.png` | `ready-for-comparison` | `0.7283` |

## Review focus

1. Confirm the paper-money cleanup is gone across all three canonical loops.
2. Check each seam against its start/end/diff frame set before re-approval.
3. Use this bundle as the single handoff before moving to the next affected loop state.
