# Release Prep Checklist

Bull Bear has now shipped full canonical asset coverage across all 20 states:

- 20 approved stills
- 60 approved loop variants
- completion-aware production dashboard state

That means the critical path has shifted from asset generation to launch readiness.

## 1. Runtime smoke check
- [x] Run `npm run assets:prepare` and confirm it still reports 20 approved stills, 60 approved loops, and 0 ready loop targets.
- [x] Run `npm run build` and confirm the production build stays green with the full asset library present.
- [x] Boot the app locally with `npm run dev` or `npm run start` and manually verify:
  - [x] hero media resolves with shipped canonical assets
  - [x] timeline scrubber still works with history navigation
  - [x] completion banner / shipped-proof dashboard copy appears
  - [x] review / production panels degrade cleanly when no backlog exists

Smoke-check evidence from 2026-03-25 / 2026-03-26 verification pass:
- `npm run assets:prepare` reported 20 approved stills, 60 approved loops, and 0 ready loop targets.
- `npm run build` completed cleanly after the post-coverage release-prep changes.
- Local browser verification at `http://localhost:3000` showed the live hero resolving canonical media (`/states/state-08/still.png` plus `/states/state-08/loop-b.mp4`), the full-coverage completion banner, and zero backlog-oriented production actions.
- Timeline scrubber smoke test passed in-browser: switching from the latest `state-08` entry to the older `strong-bull` transition updated the selected timeline detail card correctly.

## 2. Data and scheduler readiness
- [x] Confirm the hourly capture route is callable in the intended deployment environment.
- [x] Verify required secrets are present for runtime data fetches and any future asset-generation reruns.
- [x] Decide where the scheduled capture will run in production and document the exact trigger path.
- [x] Confirm failure visibility for missed hourly captures (logs, alerts, or manual operator checks).
- [x] Add a lightweight operator-facing stale-history check that can be run without rebuilding the whole release flow.

Verification notes from 2026-03-25 / 2026-03-26:
- Local dev route check: `GET http://localhost:3000/api/capture` returned `mode: "scheduled-capture"`, a live state-08 payload, and `shouldPersist: false` when the canonical state had not changed, confirming the route is callable and idempotent for no-change hours.
- Required runtime secrets are currently just provider keys for optional reruns (`OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `FAL_KEY`, `FAL_VIDEO_MODEL`); the live hourly capture itself uses public Fear & Greed + CoinGecko fetches.
- Recommended production scheduler path: run Bull Bear on a persistent OpenClaw-managed host and fire the hourly capture with an OpenClaw cron/system scheduler hitting `GET /api/capture` on the local app origin once per hour.
- Failure visibility recommendation: rely on the scheduler's run history plus app/server logs for immediate debugging, and add a simple operator check for stale `data/frames.json` timestamps if a run is missed.

## 3. Deployment packaging
- [x] Pick the deployment target (Vercel, VPS, OpenClaw-managed host, or other).
- [x] Document production env vars and secret ownership.
- [x] Confirm large canonical media assets are handled correctly by the deployment target.
- [x] Record the deploy + rollback path in one operator-facing doc.

Recommended production packaging:
- Deployment target: persistent OpenClaw-managed host (or equivalent VPS process host) running `next start`, not a serverless filesystem target.
- Why this target fits best: Bull Bear writes transition history into `data/frames.json`, serves a fully local canonical media library under `public/states/`, and already has a native cron facility available from OpenClaw for hourly scheduling.
- Env/secret ownership: runtime host owns `.env.local`; only optional rerun credentials live there (`OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `FAL_KEY`, `FAL_VIDEO_MODEL`).
- Media handling: canonical stills and loop MP4s should ship with the deployment artifact or persistent app directory so `public/states/**` remains locally readable by Next.js at runtime.
- Deploy path: build on the host with `npm install`, `npm run assets:prepare`, `npm run build`, then run the app with `npm run start` under a persistent process manager.
- Rollback path: restore the previous release directory (including `public/states/**` and `data/**`), restart the app process, and re-run `npm run assets:prepare` if you need to confirm the restored asset summary before reopening traffic.

## 4. Post-launch operator loop
- [x] Define what “healthy” looks like daily: fresh market timestamp, clean state resolution, and expected history growth.
- [x] Define what should trigger intervention: broken live fetches, missing media resolution, or failed scheduled captures.
- [x] Decide whether future work should prioritize release hardening, visual polish, or V2 creative expansion.

Operator loop decisions locked in this pass:
- Healthy daily state and intervention triggers now live in `docs/production-runbook.md` sections 5-7.
- The exact hourly OpenClaw scheduler artifact now ships in `docs/openclaw-hourly-capture-cron.json`, so operators can install the documented job without rebuilding the payload by hand.
- Near-term priority remains lightweight release hardening / operator visibility over V2 expansion until the first production host is actually stood up.
- The shipped hourly OpenClaw cron artifact is now tightened to surface persisted/not, `shouldPersist`, resolved state id/label, and provider inline in the scheduler update so operators do not need a separate audit lookup for the basics.
- Operators can now run `npm run check:cron` to validate the committed cron artifact before installation, reducing the chance of drifting the hourly schedule or losing the required summary fields during release edits.
- Operators can now run `npm run verify:cron` after installation to confirm there is exactly one installed Bull Bear cron job, that it still matches the committed artifact instead of silently drifting or duplicating, that recent scheduler run history is actually showing up, and that the latest run is classified into a compact health verdict (`healthy`, `stale`, `failing`, `unknown`, or `no-history`). The scheduler freshness threshold is now overrideable with `-- --stale-hours=<n>` when a host needs a looser acceptance window.
- That installed-cron verification can now also be persisted with `npm run verify:cron -- --record` (or `npm run install:cron -- --apply --verify-record`) into `data/generated/cron-verification/latest.json`, `latest.txt`, `latest.md`, and `history.ndjson`, so the target host can leave behind durable scheduler proof instead of only terminal output.
- The recommended first target-host acceptance chain is now `npm run install:cron -- --apply --verify-record --audit --status --status-record`, because it leaves behind all three proof layers in one pass: recorded scheduler install evidence, a fresh capture-audit artifact, and a recorded operator-status handoff snapshot.
- The installer helper now supports `npm run install:cron -- --apply --verify --audit --status --status-record`, so the install step can immediately chain into post-install acceptance, a fresh capture-audit proof artifact, and a recorded final operator-status handoff instead of relying on manual follow-up commands.
- Operators can now run `npm run status:operator` for one concise pre/post-launch snapshot that combines runtime health, cron-artifact validation, installed-cron/run-health, the latest installed scheduler run summary, and the latest capture-audit proof artifact without hopping across multiple commands.
- That operator snapshot now also classifies the capture-audit proof as `fresh`, `stale`, `error`, or `missing`, which makes it easier to spot when scheduler evidence exists but has gone too old to trust as current rollout proof. Its scheduler-run, audit-proof, and recorded-snapshot freshness thresholds are now overrideable with `-- --run-stale-hours=<n>`, `-- --audit-stale-hours=<n>`, and `-- --snapshot-stale-hours=<n>` (or `BULL_BEAR_OPERATOR_SNAPSHOT_STALE_HOURS` for persistent host defaults), and the recorded snapshot/app UI now show both the current evidence age and the active threshold inline so operators do not have to infer freshness from timestamps by hand. The app now also flags when the recorded operator snapshot itself is stale, so a yesterday handoff is less likely to be mistaken for live readiness.
- Operators can now add `-- --record` to `npm run status:operator` to persist each release snapshot into `data/generated/operator-status/latest.json`, render the same snapshot as a human-readable `data/generated/operator-status/latest.txt`, export a paste-friendly Markdown handoff at `data/generated/operator-status/latest.md`, and append `data/generated/operator-status/history.ndjson`, which gives post-deploy checks a durable proof trail instead of only terminal output.
- Those recorded snapshots now also summarize the recent READY/WATCH/ATTENTION trend (previous level, whether the level changed, the latest few recorded levels, recent level counts, and the current same-level streak), so rollout handoffs can show momentum, flatlines, or regressions without manually parsing the NDJSON history log.
- The in-app operator artifact links now also expose `data/generated/operator-status/history.ndjson`, so operators can open the full recorded trend log from the app instead of dropping to the filesystem.
- Those artifact responses now also return clean filename, last-modified, and byte-size headers, and they now honor both `If-None-Match` and `If-Modified-Since` revalidation requests with `304 Not Modified`, which makes saved/exported handoff proof cleaner in browsers and lightweight automation.
- Operators can now add `-- --fail-on-watch` to `npm run status:operator` when a rollout gate or CI check should fail on any non-READY snapshot, not just ATTENTION-level breakage.
- Operators can now run `npm run status:release` against a live app origin to prefer the combined `/api/release-status` summary route, automatically fall back to `/api/operator-status` plus `/api/asset-production-status` on older hosts, and produce one PASS/WATCH/FAIL release summary with the active summary source reported inline. Add `-- --fail-on-watch` when rollout automation should block on any non-PASS verdict, `-- --require-app-route` when acceptance should fail unless the host is already serving the app-native combined release route instead of the compatibility fallback, or `-- --record` when the latest release verdict should also be persisted to `data/generated/release-status/latest.json`, `latest.txt`, `latest.md`, and `history.ndjson` for handoff proof. That app-native route now also supports cache-friendly `ETag` / `Last-Modified` revalidation on `GET` and `HEAD`, so monitors can cheaply re-check release proof without redownloading unchanged JSON.

## Suggested immediate next move
Instantiate the documented hourly OpenClaw cron job on the target host, then use `npm run status:operator` as the fast acceptance snapshot while the first live scheduled runs start landing.
