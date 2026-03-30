# Roadmap

## Milestone 1 - foundation
- [x] Define architecture
- [x] Define style bible
- [x] Define prompt system
- [x] Scaffold Next.js UI and API routes
- [x] Add sample archived frames

## Milestone 2 - live market signal engine
- [x] Fetch Fear & Greed index
- [x] Fetch BTC price history for MA7 / MA30
- [x] Compute weighted composite score
- [x] Map composite score to 20 canonical bands
- [x] Persist hourly evaluation records only when state changes

## Milestone 3 - canonical asset system
- [x] Define 20-state ladder
- [x] Define animation system
- [x] Add state manifest
- [x] Generate 20 canonical stills
- [x] Generate 3 loop variants per state via fal.ai

## Milestone 6 - release prep
- [x] Add completion-state production dashboard copy/logic for full asset coverage
- [x] Add a release checklist for launch readiness, monitoring, and operator cadence
- [x] Smoke-test the shipped app against the full canonical asset library
- [x] Decide deployment target and production schedule path for hourly captures
- [x] Remove runtime image-generation dependency from scheduled capture when canonical manifest assets already exist
- [x] Add an operator runtime-health check for stale transition history / asset coverage visibility
- [x] Add a capture-audit utility that records timestamped `/api/capture` proof artifacts for operators
- [x] Tighten the shipped hourly OpenClaw cron artifact so scheduler updates surface key capture fields inline (`shouldPersist`, state id/label, provider, persisted/not)
- [x] Add a validator for the shipped OpenClaw cron artifact so operators can verify the install payload before launch
- [x] Add a dry-run/apply helper that converts the validated OpenClaw cron artifact into a supported `openclaw cron add` install command
- [x] Add a post-install cron verifier that compares installed OpenClaw jobs against the committed artifact, flags duplicate Bull Bear jobs, summarizes recent cron run history, and emits a compact latest-run health verdict
- [x] Add a single operator-status summary command that rolls runtime health, cron artifact validity, installed-cron/run-health, and latest capture-audit proof into one pre/post-launch check
- [x] Let the cron install helper optionally chain straight into a fresh capture-audit proof artifact after install/verify so rollout leaves behind immediate operator evidence
- [x] Classify the latest capture-audit proof in the operator-status snapshot as fresh/stale/error/missing so rollout evidence freshness is visible at a glance
- [x] Let cron verification and operator-status freshness thresholds be overrideable per host without editing code
- [x] Let the operator-status snapshot optionally persist latest/history proof artifacts for rollout evidence and handoffs
- [x] Render human-readable text and Markdown operator-status handoff artifacts alongside the recorded JSON snapshot so release checks are easy to inspect and paste into handoffs without reformatting
- [x] Surface the latest recorded operator snapshot in the app UI so release readiness is visible without dropping to CLI output
- [x] Let the operator-status snapshot optionally fail on WATCH conditions so deployment automation can gate on READY instead of only catching ATTENTION
- [x] Let the cron install helper optionally finish with a final operator-status snapshot/record so first install can leave behind verification, audit proof, and handoff evidence in one flow
- [x] Let the cron install helper emit a machine-readable dry-run rollout plan (`--json`) so automation can consume install/verify/audit/status commands without scraping console prose
- [x] Trim redundant `audit:capture` next actions from the operator snapshot when the recommended missing-cron install flow already includes `--audit --status`
- [x] Add recent-trend context to recorded operator snapshots so regressions/improvements are visible in the app and handoffs without opening NDJSON history by hand
- [x] Expose the latest recorded operator JSON/text/Markdown handoff artifacts directly in-app through a safe download route so rollout proof is one click away
- [x] Expose the recorded operator snapshot history log (`history.ndjson`) through the same in-app artifact route so full rollout trend evidence is one click away too
- [x] Enrich recorded operator trend snapshots with recent level counts and the current same-level streak so rollout momentum is clearer in both handoffs and the app
- [x] Surface scheduler-run and capture-audit evidence age/threshold context directly in recorded operator snapshots and the app UI so freshness is obvious without timestamp math
- [x] Flag recorded operator snapshot freshness in-app so operators can tell when the latest saved handoff itself is stale
- [x] Return clean filename / freshness metadata headers from the in-app operator artifact route so saved handoffs and lightweight tooling preserve clearer proof metadata
- [x] Support `HEAD` on the in-app operator artifact route so automation can inspect proof freshness/size headers without downloading the full handoff artifact
- [x] Add conditional `304 Not Modified` revalidation support (`ETag` / `If-None-Match` and `Last-Modified` / `If-Modified-Since`) to the in-app operator artifact route so browsers and lightweight automation can recheck saved proof freshness without redownloading unchanged artifacts
- [x] Classify in-flight installed cron runs as `running` / `queued` instead of lumping them into `unknown`, so rollout checks show live scheduler progress more clearly
- [x] Surface latest installed cron run completion time + duration in operator snapshots and the app UI so rollout proof shows not only that a run started, but how long it took to finish
- [x] Surface recorded operator snapshot freshness directly in the CLI/text/Markdown handoff output so terminal handoffs show when the saved proof itself is stale, not just the app UI
- [x] Make the recorded operator snapshot freshness threshold host-tunable via CLI/env so rollout handoffs can use stricter or looser freshness expectations without code edits
- [x] Expose generated asset-production handoff JSON/Markdown artifacts directly in-app with freshness/size metadata so operators can open current render queues without filesystem spelunking
- [x] Include still/loop execution result ledgers in the same in-app asset-production artifact surface so operators can open the latest queue files and run-proof JSON from one place
- [x] Summarize still/loop execution ledgers inline in the dashboard with latest run age and status mixes so operators can distinguish fresh generated output from dry-run or auth-blocked proof without opening raw JSON
- [x] Derive still/loop ledger freshness from the true newest recorded execution entry (not array order) and surface fresh/stale verdicts with a host-tunable threshold in the dashboard
- [x] Flag each generated asset-production handoff artifact itself as fresh/stale in the dashboard list so operators can spot stale queue/export files before opening them
- [x] Return asset-production artifact label / relative-path / freshness headers alongside existing `GET` / `HEAD` metadata so lightweight automation can inspect queue/export provenance without downloading or parsing the file body
- [x] Expose the full asset-production dashboard summary at `/api/asset-production-status` with lightweight `HEAD` metadata headers so automation can read one stable JSON/metadata surface instead of scraping the homepage or polling each artifact separately, including generated-handoff completeness (expected/missing/all-present) and the active asset-artifact freshness threshold
- [x] Expose the recorded operator dashboard summary at `/api/operator-status` with lightweight `HEAD` metadata headers so automation can read one stable JSON/metadata surface instead of scraping the homepage or polling handoff artifacts separately
- [x] Add a one-shot release-status script that consumes `/api/operator-status` and `/api/asset-production-status` together so rollout checks can gate on one PASS/WATCH/FAIL summary instead of manually inspecting both surfaces
- [x] Expose that combined release summary at `/api/release-status` with lightweight `HEAD` metadata headers plus conditional `ETag` / `Last-Modified` revalidation so dashboards and monitors can consume one stable app-native release gate without shelling out to the CLI script or redownloading unchanged JSON
- [x] Let the release-status CLI gate require the app-native `/api/release-status` route explicitly so rollout acceptance can fail on older fallback-only hosts instead of silently downgrading
- [x] Let the release-status CLI gate optionally persist JSON/text/Markdown/history handoff artifacts so rollout verdicts leave behind durable proof instead of only terminal output
- [x] Expose the recorded release-status JSON/text/Markdown/history handoff artifacts directly in-app through a safe download route so operators can open saved rollout verdict proof without filesystem access
- [x] Return release-artifact provenance/freshness headers and show the same fresh/stale age context inline in the dashboard so saved rollout verdict proof is easier to trust (or reject) at a glance
- [x] Expose a machine-readable `/api/release-artifact-status` summary with lightweight `HEAD` metadata so automation can check recorded rollout-proof freshness in one request instead of polling each saved file
- [x] Report expected-count / missing-count / all-present metadata from `/api/release-artifact-status` so monitors can distinguish incomplete recorded release proof from merely stale proof in one request
- [x] Surface expected and currently missing saved filenames from `/api/release-artifact-status` so monitors can tell exactly which recorded release-proof files are absent without separate route probes
- [x] Expose a machine-readable `/api/operator-artifact-status` summary with lightweight `HEAD` metadata so automation can check recorded operator-proof freshness in one request instead of polling each saved file
- [x] Report expected-count / missing-count / all-present metadata from `/api/operator-artifact-status` so monitors can distinguish incomplete operator proof from merely stale proof in one request
- [x] Surface expected and currently missing saved filenames from `/api/operator-artifact-status` so monitors can tell exactly which recorded operator-proof files are absent without separate route probes
- [x] Show operator-artifact freshness, age, threshold, and relative path inline on the homepage so saved operator proof is easier to trust at a glance before opening files
- [x] Expose a focused `/api/review-status` summary with lightweight `HEAD` metadata so automation can inspect the canonical still-review queue / frontier / next-action slice without fetching the full asset-production dashboard payload
- [x] Report expected and currently missing generated review-workflow source files from `/api/review-status` so monitors can distinguish incomplete review proof from merely stale review proof in one request
- [x] Mirror review-workflow source completeness inline on the homepage Canonical asset production panel so operators can judge whether the in-app review queue is complete before acting on it

## Milestone 4 - app integration
- [x] Load current state from composite score
- [x] Resolve current still + loop assets from manifest
- [x] Show animation-first hero state in UI
- [x] Add timeline scrubber and state history

## Milestone 5 - polish
- [x] Add component-score debug panel
- [x] Add chart-to-state synchronization
- [x] Improve responsive layout and visual design
- [x] Add variant rotation logic for loop selection
