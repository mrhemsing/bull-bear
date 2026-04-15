# Bull Bear operator status: ATTENTION

- Checked at: 2026-04-14T09:41:39.600Z
- Recorded snapshot freshness: fresh - Recorded operator snapshot was refreshed 0m ago. | age 0m | stale threshold 2h
- Runtime health: STALE - Latest saved transition is older than 24h.
- Cron artifact: valid
- Installed cron matches: 1
- Installed cron run health: healthy - Latest cron run succeeded 37m ago. | latest run age 37m | stale threshold 2h
- Latest installed cron run: ok @ 1776157247370 | finished 1776157352090 | duration 2m | Unable to complete exactly as requested.
- Latest capture audit: error - Latest capture audit recorded an error: fetch failed | stale threshold 6h | 2026-04-14T09:37:11.567Z | HTTP 0 | ok=false | state unknown (unknown) | provider unknown | shouldPersist=unknown | error: fetch failed

## Issues
- Latest saved transition is older than 24h.

## Warnings
- Loaded installed cron jobs from local file ..\..\cron\jobs.json for local verification.
- Latest successful cron run summary does not preserve the canonical lowercase shouldPersist boolean from /api/capture.
- Latest successful cron run summary does not include the canonical Bull Bear state id/label; it appears to be using a degraded state summary instead.
- Latest capture audit recorded an error: fetch failed

## Next actions
- **medium** (scheduler-proof) Tighten the installed Bull Bear cron payload/proof path so successful runs echo the exact /api/capture fields instead of degraded null/summary values.
  - Command: `npm run verify:cron`
- **medium** (runtime) Write a fresh capture proof artifact and confirm the local /api/capture route still resolves cleanly.
  - Command: `npm run audit:capture -- --url="http://127.0.0.1:3078/api/capture"`
- **medium** (audit) Retry the capture audit after the latest recorded audit error.
  - Command: `npm run audit:capture -- --url="http://127.0.0.1:3078/api/capture"`

## Recent trend
- Previous recorded level: ATTENTION @ 2026-04-14T07:42:16.965Z
- Level changed on this run: no
- Recent levels: WATCH (2026-04-08T17:22:18.413Z) -> WATCH (2026-04-08T17:24:06.297Z) -> ATTENTION (2026-04-14T06:42:01.790Z) -> ATTENTION (2026-04-14T07:42:16.965Z) -> ATTENTION (2026-04-14T09:41:39.600Z)
- Recent level counts: WATCH=2, ATTENTION=3
- Current streak: ATTENTION x3 since 2026-04-14T06:42:01.790Z

## Recorded operator snapshot
- JSON: `data\generated\operator-status\latest.json` (6.0 KB, updated 2026-04-14T09:41:39.609Z)
- Text: `data\generated\operator-status\latest.txt` (2.5 KB, updated 2026-04-14T09:41:39.609Z)
- Markdown: `data\generated\operator-status\latest.md` (2.7 KB, updated 2026-04-14T09:41:39.610Z)
- History: `data\generated\operator-status\history.ndjson` (4.0 MB, updated 2026-04-14T09:41:39.607Z)
