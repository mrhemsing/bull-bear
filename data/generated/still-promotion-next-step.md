# Still promotion next step

Recorded at: 2026-04-02T04:54:00.826Z
State: state-20 · Extremely Bullish
Promoted candidate: 6
Canonical target: /states/state-20/still.png
Backup file: out/still-promotion-backups/state-20/state-20-still-before-candidate-06.png
Loop variant for follow-up: b
Timeout override ms: 900000
Loop model override: fal-ai/kling-video/v2.1/standard/image-to-video

## Next command

```bash
"C:\\Program Files\\nodejs\\node.exe" scripts/run-paper-money-rerender.mjs --states=state-20 --variant=b --overwrite-review-frames --timeout-ms=900000 --model=fal-ai/kling-video/v2.1/standard/image-to-video
```

## Notes

- Review the regenerated start/end/diff seam evidence before accepting the loop.
- Reject the loop if paper-like debris is gone but composition still snaps or drifts at the seam.

## Queue staging

- Prep-only rerender staging completed successfully; reopen `data/generated/paper-money-rerender-report.md` before running the full rerender.
