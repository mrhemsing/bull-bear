# Production Runbook

This runbook turns the chosen Bull Bear release path into an operator-ready setup on a persistent OpenClaw-managed host (or equivalent VPS/process host).

## What this host must do

- run the Next.js app continuously from the Bull Bear project directory
- keep `public/states/**` available locally at runtime
- keep `data/**` writable so `data/frames.json` can grow over time
- hit the local capture endpoint once per hour
- expose logs and scheduler run history for debugging

## 1. Deploy/update the app on the host

From the Bull Bear project directory:

```bash
npm install
npm run assets:prepare
npm run build
npm run start
```

Recommended: run `npm run start` under a persistent process manager so the app survives shell exits and host restarts.

## 2. Required runtime env

Bull Bear's hourly capture path works with the shipped canonical asset library and public market-data fetches.

Only optional rerun/regeneration credentials need to exist in `.env.local` for asset generation itself:

- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL`
- `FAL_KEY`
- `FAL_VIDEO_MODEL`

Those keys are not required for normal hourly state capture when canonical manifest assets are present.

Optional operator-rollout env defaults:

- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_GATEWAY_TOKEN`
- `BULL_BEAR_CRON_NAME`
- `BULL_BEAR_CAPTURE_URL`
- `BULL_BEAR_CAPTURE_TIMEOUT_MS`

When these are set on the target host, `npm run install:cron`, `npm run verify:cron`, `npm run status:operator`, and `npm run audit:capture` can reuse them automatically instead of requiring repeated host flags during rollout and checks.

## 3. Hourly scheduler target

Bull Bear's production-safe hourly target is:

```text
GET http://localhost:3000/api/capture
```

Expected behavior:

- resolves the latest market snapshot
- maps it to the canonical state ladder
- writes a new frame only when the canonical state changed
- persists the shipped manifest still for the new state instead of trying to generate a fresh runtime image

## 4. OpenClaw cron job

Use an OpenClaw cron `agentTurn` job that triggers the local capture route and returns a concise run summary.

Copy-ready job artifact: `docs/openclaw-hourly-capture-cron.json`

Example job payload:

```json
{
  "name": "bull-bear-hourly-capture",
  "schedule": {
    "kind": "cron",
    "expr": "0 * * * *",
    "tz": "America/Los_Angeles"
  },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "In the Bull Bear project, call http://localhost:3000/api/capture once, summarize the result in one brief operator-facing update, explicitly include whether a new frame was persisted, whether shouldPersist was true, the resolved state id and label, the asset provider used for the resolved frame, and report any failure clearly.",
    "timeoutSeconds": 300
  },
  "delivery": {
    "mode": "announce"
  },
  "enabled": true
}
```

Why this shape:

- keeps the scheduler action visible in OpenClaw run history
- returns a human-readable success/failure summary
- avoids requiring external webhook plumbing for the first production pass
- keeps the capture call local to the host running the app

If you prefer a host-native scheduler instead, the equivalent command is:

### PowerShell

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/capture | Select-Object -ExpandProperty Content
```

### curl

```bash
curl http://localhost:3000/api/capture
```

## 5. Healthy daily state

Treat Bull Bear as healthy when:

- the app loads and resolves canonical media from `public/states/**`
- `data/frames.json` continues to gain fresh hourly timestamps when the canonical state changes
- the latest capture responses resolve a valid state and do not report fetch/provider errors
- OpenClaw cron run history shows regular successful hourly runs

## 6. Intervention triggers

Investigate immediately if any of these appear:

- `/api/capture` fails or times out
- market-data fetches fail repeatedly
- returned payloads stop resolving a valid canonical state
- hero media paths no longer resolve for the latest saved state
- `data/frames.json` stays stale longer than expected during active market movement
- cron runs stop appearing or start failing repeatedly

## 7. Fast operator checks

### Check the latest capture response manually

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/capture | Select-Object -ExpandProperty Content
```

### Check the newest saved frame timestamp

```powershell
Get-Content .\data\frames.json | Select-Object -First 20
```

### Run the lightweight runtime health summary

```bash
npm run health:runtime
```

Optional thresholds:

```bash
npm run health:runtime -- --warn-hours=6 --stale-hours=24
```

This reports latest saved transition recency, latest state, transition count, and full canonical asset coverage in one operator-friendly summary. Treat a stale result as a prompt to inspect OpenClaw cron run history or manually hit `GET /api/capture`, not as proof that the app is broken, because Bull Bear only appends history when the canonical state changes.

### Write a capture audit artifact

```bash
npm run audit:capture
```

Optional overrides:

```bash
npm run audit:capture -- --url=http://localhost:3000/api/capture --timeout-ms=30000
```

This hits the live capture route once, prints a concise response summary, writes the latest result to `data/generated/runtime-capture-audit/latest.json`, and appends an NDJSON history row to `data/generated/runtime-capture-audit/history.ndjson` so operators have a concrete per-run proof artifact in addition to scheduler logs.

### Validate the shipped OpenClaw cron artifact before install

```bash
npm run check:cron
```

This confirms `docs/openclaw-hourly-capture-cron.json` still uses the hourly Los Angeles schedule, isolated `agentTurn` execution, the local `http://localhost:3000/api/capture` target, and the required operator summary fields (`persisted`, `shouldPersist`, state id/label, provider, clear failure reporting).

### Generate or apply the install command from the validated artifact

Dry run (prints the exact `openclaw cron add ...` command without creating the job):

```bash
npm run install:cron
```

Apply it directly:

```bash
npm run install:cron -- --apply
```

Apply it and immediately run the post-install verifier:

```bash
npm run install:cron -- --apply --verify
```

Apply it, verify it, and persist the installed-cron evidence bundle (`data/generated/cron-verification/latest.json|txt|md` plus `history.ndjson`):

```bash
npm run install:cron -- --apply --verify-record
```

Recommended first target-host acceptance pass (scheduler install proof + capture proof + final operator handoff in one chain):

```bash
npm run install:cron -- --apply --verify-record --audit --status --status-record
```

Apply it, verify the install, write a fresh capture-audit proof artifact, and finish with a recorded operator-status handoff snapshot:

```bash
npm run install:cron -- --apply --verify --audit --status --status-record
```

Useful overrides:

```bash
npm run install:cron -- --json
npm run install:cron -- --channel=telegram --to=@yourchat
npm run install:cron -- --url=ws://127.0.0.1:19001 --token=YOUR_GATEWAY_TOKEN
npm run install:cron -- --disabled
npm run install:cron -- --apply --verify-strict --verify-runs-limit=10
npm run install:cron -- --apply --verify --audit --audit-url=http://localhost:3000/api/capture
npm run install:cron -- --apply --verify --audit --status --status-record --status-fail-on-watch
npm run install:cron -- --apply --verify --audit --status --status-record --run-stale-hours=3 --audit-stale-hours=12
```

This helper re-validates the committed artifact first, then converts it into the supported OpenClaw CLI shape (`openclaw cron add`). It is intentionally dry-run by default so operators can inspect the exact install command before execution. Add `-- --json` when you want the helper itself to emit a machine-readable rollout plan (install/verify/audit/status commands included) instead of human-oriented text. If `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `BULL_BEAR_CRON_NAME`, `BULL_BEAR_CAPTURE_URL`, or `BULL_BEAR_CAPTURE_TIMEOUT_MS` are already set on the host, the helper reuses those as defaults so the rollout command can stay short. When `--verify` is added during apply, it immediately runs the installed-cron verifier against the same host settings so rollout acceptance becomes one command instead of a manual handoff; add `--verify-record` when that acceptance step should also persist the installed-cron proof bundle under `data/generated/cron-verification/`. When `--audit` is added, it also writes a fresh `npm run audit:capture` proof artifact right after install/verification so the rollout leaves behind both scheduler acceptance and an operator-visible capture record. When `--status` is added, it finishes by running `npm run status:operator` against the same host context; `--status-record` persists the final acceptance snapshot to `data/generated/operator-status/`, and `--status-fail-on-watch` lets that final handoff act as a strict READY-only rollout gate.

### Verify the installed cron and catch duplicates after install

```bash
npm run verify:cron
```

Useful overrides:

```bash
npm run verify:cron -- --strict
npm run verify:cron -- --stale-hours=3
npm run verify:cron -- --url=ws://127.0.0.1:19001 --token=YOUR_GATEWAY_TOKEN
npm run verify:cron -- --json
npm run verify:cron -- --record
```

This helper reads `docs/openclaw-hourly-capture-cron.json`, queries `openclaw cron list --json --all`, and confirms there is exactly one installed `bull-bear-hourly-capture` job matching the committed schedule / payload / delivery shape. It also inspects recent `openclaw cron runs` history for the matched job, then classifies the latest run as `healthy`, `stale`, `failing`, `running`, `queued`, `unknown`, or `no-history` so operators can judge scheduler health at a glance without mistaking an in-flight run for an opaque unknown state. The latest-run details now preserve finished-at and duration too, which makes rollout evidence more useful when a job completes slowly or times out near the edge of the acceptance window. Add `-- --record` when you want that installed-cron verification persisted as `data/generated/cron-verification/latest.json`, `latest.txt`, `latest.md`, and `history.ndjson`, giving the target host a durable scheduler-evidence bundle instead of only terminal output. Use `-- --stale-hours=<n>` if your host intentionally runs on a looser cadence or you want a wider rollout-acceptance window. It fails if the job is missing, duplicated, or drifted from the artifact, making post-install rollout checks much safer.

### Run the one-shot release gate against the live app

```bash
npm run status:release -- --base-url=http://localhost:3000
```

Useful overrides:

```bash
npm run status:release -- --json
npm run status:release -- --fail-on-watch
npm run status:release -- --require-app-route
npm run status:release -- --base-url=http://127.0.0.1:3025 --timeout-ms=30000
```

This helper prefers the app-native `/api/release-status` summary route, automatically falls back to `/api/operator-status` plus `/api/asset-production-status` on older hosts, merges the result into one PASS/WATCH/FAIL summary, and returns a non-zero exit when release blockers are present. Add `-- --fail-on-watch` when deployment automation should treat any non-PASS verdict as a hard gate instead of allowing WATCH-level cautions through. Add `-- --require-app-route` when rollout should fail unless the host is already serving the combined `/api/release-status` route, which prevents older builds from silently passing by way of the fallback summary pair. Add `-- --record` when the latest release verdict should also be written to `data/generated/release-status/latest.json`, `latest.txt`, `latest.md`, and `history.ndjson` for durable rollout proof and handoff history. The app-native route now also supports stable `ETag` / `Last-Modified` revalidation on both `GET` and `HEAD`, so lightweight monitors can prove the combined release summary is unchanged with `304 Not Modified` instead of repeatedly downloading the full JSON body.

### Get one operator-facing release snapshot

```bash
npm run status:operator
```

Useful overrides:

```bash
npm run status:operator -- --json
npm run status:operator -- --record
npm run status:operator -- --fail-on-watch
npm run status:operator -- --run-stale-hours=3 --audit-stale-hours=12 --snapshot-stale-hours=4
npm run status:operator -- --url=ws://127.0.0.1:19001 --token=YOUR_GATEWAY_TOKEN
```

This summary command rolls `npm run health:runtime`, cron-artifact validation, installed-cron verification/run-health, the latest installed scheduler run summary, and the latest `data/generated/runtime-capture-audit/latest.json` proof artifact into one concise operator snapshot. It now also classifies the audit artifact as `fresh`, `stale`, `error`, or `missing` so operators can judge whether the proof evidence is still current, not just present, and the recorded/latest in-app capture-proof view now includes the audit HTTP status plus whether the capture response itself was marked ok/failed. The recorded summary and app UI now also surface both freshness ages and the active stale thresholds for scheduler runs and capture audits, and they now explicitly call out the recorded operator snapshot's own freshness in CLI/text/Markdown handoffs too, which makes it easier to judge whether evidence is merely present or actually fresh enough for rollout. Use `-- --run-stale-hours=<n>`, `-- --audit-stale-hours=<n>`, and `-- --snapshot-stale-hours=<n>` when a specific host needs different freshness expectations for scheduler history, audit proof age, or the recorded handoff itself. `BULL_BEAR_OPERATOR_SNAPSHOT_STALE_HOURS` provides the same recorded-snapshot override through environment defaults on persistent hosts. When the cron is missing, the suggested next action intentionally stays focused on the install flow (`--apply --verify --audit --status --status-record`) instead of also emitting a redundant standalone `audit:capture` command, because the install path already leaves behind fresh audit/status evidence. Add `-- --record` when you want that snapshot persisted to `data/generated/operator-status/latest.json`, rendered as a human-readable `data/generated/operator-status/latest.txt`, exported as paste-friendly Markdown in `data/generated/operator-status/latest.md`, and appended to `data/generated/operator-status/history.ndjson` for rollout evidence or handoff logs. Recorded snapshots now also carry a small trend summary (previous level, whether the level changed, the latest few recorded levels, recent level counts, and the current same-level streak) so the app and handoffs can show whether release readiness is improving, flatlining, or regressing without manually opening the NDJSON history. The app's operator artifact route now also exposes that `history.ndjson` log directly alongside the latest JSON/text/Markdown files, returns clean filename / last-modified / byte-size headers plus stable conditional revalidation on both `GET` and `HEAD`, and keeps the proof bundle one click away during rollout review or lightweight automation while allowing either `If-None-Match` or `If-Modified-Since` rechecks to return `304 Not Modified` instead of redownloading the full artifact body. Add `-- --fail-on-watch` when you want deployment automation or CI to fail on any non-READY result instead of only on ATTENTION. It is useful as a pre-launch checklist item and as a fast post-deploy sanity pass.

### Re-verify the shipped app after a deploy

```bash
npm run assets:prepare
npm run build
```

### Paper-money loop cleanup rerender handoff

If approved runtime loops still visibly contain paper-money imagery, do not trust the old `approved` MP4s just because the prompt text has been sanitized. Prepare a rerender backlog and execute it on a host with fal auth:

```bash
npm run assets:prepare -- --force-loop-regeneration
npm run generate:loops
```

For a smaller acceptance batch, target only the affected states/variants:

```bash
npm run assets:prepare -- --force-loop-states=state-01,state-10,state-20
npm run generate:loops -- --state=state-10 --variant=b
```

Expected handoff/proof surfaces:
- `data/generated/canonical-loop-generation-queue.json|md`
- `data/generated/canonical-loop-render-jobs.json|md`
- `data/generated/canonical-production-next-actions.json|md`
- `data/generated/canonical-loop-generation-results.json`

Acceptance after rerender:
1. confirm the generated queue/results metadata stays clear of paper-money language
2. extract representative first frames from the replacement MP4s and visually confirm paper-money imagery is gone before re-approving the loops

Recommended single-command rerender handoff for the current targeted cleanup batch:

```bash
npm run rerender:paper-money -- --states=state-01,state-10,state-20 --variant=b --overwrite-review-frames
```

This wrapper re-prepares the forced queue, runs the matching loop jobs, extracts review PNGs to `out/loop-review-frames/`, writes a single gallery view to `data/generated/loop-review-frames.html`, and writes a portable batch summary to `data/generated/paper-money-rerender-report.json|md` alongside the existing generation/review artifacts.

If you only need the proof extraction step after generation, the lower-level review command still works directly:

```bash
npm run review:loops -- --states=state-01,state-10,state-20 --variant=b --overwrite
```

That lower-level review step now also writes `data/generated/loop-review-frames.html`, which is the fastest acceptance surface when an operator needs to inspect the targeted rerender batch in one place.

If `FAL_KEY` is absent on the current host, stop after queue preparation and move the rerender batch to the first host with provider auth instead of pretending the cleanup is complete.

## 8. Rollback

If a deploy goes bad:

1. restore the previous release directory, including `public/states/**` and `data/**`
2. restart the app process
3. call `GET /api/capture` manually once to confirm the app responds cleanly
4. review scheduler run history before re-enabling normal operator trust
