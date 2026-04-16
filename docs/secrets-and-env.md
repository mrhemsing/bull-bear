# Secrets and Environment

## Local secrets
Store provider credentials in `.env.local`.
Do not commit real keys into the repository.

## Supported variables

### Media hosting
- `NEXT_PUBLIC_MEDIA_BASE_URL` optional public base URL for canonical Bull Bear media like `/states/01.png` and `/states/01-a.mp4`
- `MEDIA_BASE_URL` optional server-side fallback if you prefer setting only a server variable in some environments
- if neither is set, the app falls back to local paths under `public/`

Example:

```env
NEXT_PUBLIC_MEDIA_BASE_URL=https://media.example.com
```


### OpenClaw / Bull Bear operator rollout
- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_GATEWAY_TOKEN`
- `BULL_BEAR_CRON_NAME` (optional override; defaults to the artifact name when unset)
- `BULL_BEAR_CAPTURE_URL` (optional override for the live capture endpoint used by audit/install helpers)
- `BULL_BEAR_CAPTURE_TIMEOUT_MS` (optional override for capture-audit timeout)
- `BULL_BEAR_OPERATOR_SNAPSHOT_STALE_HOURS` (optional override for recorded operator-snapshot freshness)
- `BULL_BEAR_ASSET_LEDGER_STALE_HOURS` (optional override for still/loop execution-ledger freshness in the dashboard)
- `BULL_BEAR_ASSET_ARTIFACT_STALE_HOURS` (optional override for generated asset-handoff artifact freshness in the dashboard)
- `BULL_BEAR_RELEASE_ARTIFACT_STALE_HOURS` (optional override for recorded release-artifact freshness in the dashboard and release-artifact route headers)

`npm run install:cron`, `npm run verify:cron`, and `npm run status:operator` now read the OpenClaw gateway URL/token and optional Bull Bear cron name from env by default, so rollout commands do not need repeated `--url`, `--token`, or `--name` flags on hosts where those values already live in the environment. `npm run audit:capture` also reads `BULL_BEAR_CAPTURE_URL` / `BULL_BEAR_CAPTURE_TIMEOUT_MS`, `npm run status:operator` can reuse `BULL_BEAR_OPERATOR_SNAPSHOT_STALE_HOURS` for recorded-snapshot freshness expectations, the dashboard can reuse `BULL_BEAR_ASSET_LEDGER_STALE_HOURS` for still/loop execution-ledger freshness expectations, `BULL_BEAR_ASSET_ARTIFACT_STALE_HOURS` for generated handoff-file freshness expectations plus the `/api/asset-production-status` summary route's threshold/completeness metadata, and `BULL_BEAR_RELEASE_ARTIFACT_STALE_HOURS` for recorded release-verdict handoff freshness expectations plus the `/api/release-artifact-status` summary route's threshold/completeness metadata, and `npm run install:cron -- --audit` reuses the capture defaults for the immediate proof step.

### OpenAI / ChatGPT image generation
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL`

`npm run generate:stills` uses `OPENAI_API_KEY` to execute the queued frontier still image-edit jobs from `data/generated/canonical-image-generation-jobs.json`. Without that key, the script intentionally stays in dry-run mode and writes a blocker report instead of pretending assets were generated. That execution report is also surfaced by the production dashboard so the missing-auth blocker and latest attempted run time are obvious in-app.

### fal.ai animation generation
- `FAL_KEY`
- `FAL_VIDEO_MODEL` (optional override; defaults to `fal-ai/minimax/video-01/image-to-video`)

`npm run generate:loops` uses `FAL_KEY` to progress past dry-run mode, submit staged image-to-video jobs through fal, download the returned MP4s into the canonical runtime targets, and write `data/generated/canonical-loop-generation-results.json` so the dashboard can show loop auth blockers, provider failures, generated outputs, and the latest attempted run time in-app.

## Notes
- `.env.local` is ignored by git.
- Prefer environment variables over hardcoded keys in scripts or source files.
- If a key is ever exposed in chat, rotate it after wiring it locally.
