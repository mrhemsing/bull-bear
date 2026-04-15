# State 01 rerender review bundle

Generated: 2026-04-08T02:10:00Z

This bundle consolidates the refreshed Runway-first rerenders for `state-01` so Matt can review the full A/B/C set from one handoff.

## Review surface

- Review gallery: `data/generated/loop-review-frames.html`
- Variant A handoff: `data/generated/state-01-loop-a-review-handoff.md`
- Variant B handoff: `data/generated/state-01-loop-b-review-handoff.md`
- Variant C handoff: `data/generated/state-01-loop-c-review-handoff.md`

## Canonical outputs

| Variant | Loop MP4 | Start frame | End frame | Diff frame | Seam status | SSIM |
| --- | --- | --- | --- | --- | --- | --- |
| A | `public/states/state-01/loop-a.mp4` | `out/loop-review-frames/state-01-a/state-01-a-frame-0.png` | `out/loop-review-frames/state-01-a/state-01-a-frame-end.png` | `out/loop-review-frames/state-01-a/state-01-a-frame-diff.png` | `ready-for-comparison` | `0.5878` |
| B | `public/states/state-01/loop-b.mp4` | `out/loop-review-frames/state-01-b/state-01-b-frame-0.png` | `out/loop-review-frames/state-01-b/state-01-b-frame-end.png` | `out/loop-review-frames/state-01-b/state-01-b-frame-diff.png` | `ready-for-comparison` | `0.6700` |
| C | `public/states/state-01/loop-c.mp4` | `out/loop-review-frames/state-01-c/state-01-c-frame-0.png` | `out/loop-review-frames/state-01-c/state-01-c-frame-end.png` | `out/loop-review-frames/state-01-c/state-01-c-frame-diff.png` | `ready-for-comparison` | `0.5688` |

## Review focus

1. Confirm the paper-money cleanup is gone across all three canonical loops.
2. Check each seam against its start/end/diff frame set before re-approval.
3. Use this bundle as the single handoff before moving to the next affected loop state.
