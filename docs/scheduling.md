# Scheduling capture

The app now exposes a dedicated capture endpoint:

- `GET /api/capture`
- `POST /api/capture`

This endpoint evaluates the live market, resolves the canonical state, and persists a new history record only when the state changes.

## Recommended production behavior

Run the app continuously, then trigger `/api/capture` on an hourly schedule.

For the production-ready OpenClaw host path, use `docs/production-runbook.md`, which now includes the exact hourly cron payload, health checks, rollback flow, the `npm run check:cron` validation step, the `npm run install:cron` helper that can print or apply the validated OpenClaw install command (and optionally chain straight into `--verify --audit --status --status-record` after apply), `npm run verify:cron` for post-install verification / duplicate-job detection plus latest-run health verdicts (with overrideable `-- --stale-hours=<n>`), and `npm run status:operator` for the combined operator snapshot including the latest installed scheduler run summary plus overrideable run/audit freshness thresholds. The repo also now ships a copy-ready job artifact at `docs/openclaw-hourly-capture-cron.json`.

## Local example

If the app is running on port 3000:

### PowerShell

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/capture | Select-Object -ExpandProperty Content
```

### curl

```bash
curl http://localhost:3000/api/capture
```

## Windows Task Scheduler

Create an hourly task that runs:

```powershell
powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/capture | Out-Null"
```

## Expected response shape

The endpoint returns:

- `snapshot` — live market inputs and composite score
- `state` — resolved creature state
- `prompts` — prompt bundle used for generation
- `generation` — provider response or skip note
- `frame` — frame payload that would be saved
- `shouldPersist` — whether a new transition was actually recorded

## Notes

- The endpoint is idempotent with respect to unchanged canonical states.
- If canonical state does not change, no new record is written.
- When a new transition is saved, Bull Bear now records the shipped canonical still from `data/state-manifest.json` for that state instead of depending on runtime image generation.
- OpenAI image generation remains a fallback path only if a manifest entry is unexpectedly missing, so hourly capture is production-safe with the canonical library alone.
