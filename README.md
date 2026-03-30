# Bull Bear

A BTC market-beast app that turns Bitcoin sentiment and trend into a cinematic recurring creature.

## Concept

Bull Bear represents Bitcoin market psychology as a single recurring hybrid bull-bear titan.

The creature is driven by a **composite market score** based on:

- Fear & Greed sentiment
- BTC price vs 7-day moving average
- BTC price vs 30-day moving average

That score is mapped into **20 canonical market states** ranging from deeply bearish to extremely bullish.

Instead of generating a brand new image every hour, V1 uses a pre-generated canonical asset library:

- **20 still hero images**
- **3 looped animations per state**

## Product behavior

### V1 runtime flow
1. Evaluate the market every hour.
2. Compute the composite score from `-100` to `+100`.
3. Map the score to one of 20 states.
4. If the state changed, swap to the corresponding still/loop asset.
5. Save the hourly evaluation for history and playback.

## Current implementation status

### Current milestone
- Full canonical asset coverage is now shipped: **20/20 stills approved** and **60/60 loop variants approved** in the runtime asset paths.
- The production dashboard now detects completion correctly and switches from backlog language to shipped-proof coverage reporting when the library is fully present.
- Current focus has moved from asset generation to **post-coverage polish and release prep**, with the release path now narrowed to a persistent OpenClaw-managed host (or equivalent VPS process host) running the app locally and triggering `GET /api/capture` on an hourly schedule.
- A lightweight operator health check now ships as `npm run health:runtime`, summarizing latest saved transition recency, state, transition count, and canonical asset coverage so stale history is easier to spot before launch.
- A capture-audit helper now ships as `npm run audit:capture`, hitting the live `/api/capture` route once and writing operator-proof artifacts under `data/generated/runtime-capture-audit/`.
- The shipped OpenClaw hourly cron artifact now asks each scheduled run to report the key capture fields inline: persisted/not, `shouldPersist`, resolved state id/label, and frame provider.
- A cron-artifact validator now ships as `npm run check:cron`, so operators can confirm the committed OpenClaw job still targets the local capture route and includes the required summary fields before installing it.
- A dry-run/apply installer helper now ships as `npm run install:cron`, which turns the validated cron artifact into an exact `openclaw cron add ...` command, can execute it directly with `-- --apply`, can emit a machine-readable rollout plan with `-- --json`, can read host defaults from `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `BULL_BEAR_CRON_NAME`, `BULL_BEAR_CAPTURE_URL`, and `BULL_BEAR_CAPTURE_TIMEOUT_MS`, and can chain straight into post-install verification, a fresh capture-audit proof, and a final recorded operator-status snapshot with `-- --apply --verify --audit --status --status-record`.
- A post-install verifier now ships as `npm run verify:cron`, which checks the installed OpenClaw cron list for exactly one Bull Bear job, compares it back to the committed artifact, flags duplicate-job drift before launch, summarizes recent scheduler run history from `openclaw cron runs`, and classifies the latest run as healthy, stale, failing, running, queued, unknown, or no-history so operators can spot rollout trouble faster without misreading an in-flight run as an opaque unknown state. The latest-run summary now also carries finished-at and duration fields so rollout evidence shows how long the most recent scheduler pass actually took, not only that it started. The scheduler stale threshold is now overrideable with `-- --stale-hours=<n>`.
- A single operator-status summary now ships as `npm run status:operator`, which rolls runtime health, cron artifact validity, installed-cron/run-health, the latest installed scheduler run details (now including finished-at and duration when present), and the latest capture-audit proof into one pre/post-launch snapshot; its suggested follow-up audit command now targets `BULL_BEAR_CAPTURE_URL` (or the local default) instead of mistakenly deriving from the OpenClaw gateway URL, and it now avoids redundant standalone audit follow-ups when the recommended install flow already includes `--audit --status`.
- A one-shot release gate now ships as `npm run status:release`, which prefers the app-native `/api/release-status` summary route when it is available and automatically falls back to `/api/operator-status` plus `/api/asset-production-status` on older hosts, merging the result into a single PASS/WATCH/FAIL verdict. It can hard-fail on any non-PASS result with `-- --fail-on-watch`, and its output now reports which summary source it used so rollout automation can block on the same machine-readable proof surfaces operators already review in the UI. When a rollout should require the combined app-native route instead of silently accepting the older fallback path, `-- --require-app-route` now fails the check unless `/api/release-status` is the active summary source. Add `-- --record` to persist the latest release gate as `data/generated/release-status/latest.json`, `latest.txt`, `latest.md`, and `history.ndjson`, giving operators a durable machine-readable + human-readable handoff trail just like the recorded operator snapshot flow. The app exposes that combined summary directly at `/api/release-status`, with JSON on `GET`, lightweight verdict/evidence/blocker metadata on `HEAD`, and stable conditional revalidation support (`ETag` plus `If-None-Match` / `If-Modified-Since`) so dashboards, lightweight monitors, and the CLI gate can all consume one stable release surface without extra route fan-out or repeated full-body downloads when nothing changed. Those recorded release handoff files are now also exposed directly in-app through `/api/release-artifact/[artifactName]`, so the saved JSON/text/Markdown/history proof can be opened or revalidated from the dashboard without filesystem access. That recorded release-artifact surface now also returns label / relative-path / freshness / age / threshold headers and the homepage shows the same freshness metadata inline, so operators and lightweight monitors can tell whether a saved rollout verdict is still current before trusting it. For automation that wants one cheap machine-readable summary of the recorded release proof itself instead of checking each saved file individually, the app now also exposes `/api/release-artifact-status` with JSON on `GET` plus lightweight `HEAD` metadata headers for recorded artifact counts, expected-count / missing-count / all-present completeness, the expected and currently missing saved filenames, fresh/stale totals, the active stale-threshold hours, and latest/oldest saved-proof freshness. The release-artifact freshness window defaults to 24h and can be tuned with `BULL_BEAR_RELEASE_ARTIFACT_STALE_HOURS`.
- The operator-status snapshot now also classifies the latest capture-audit artifact as `fresh`, `stale`, `error`, or `missing`, so operators can tell whether proof evidence is current instead of merely present, and its run/audit freshness thresholds are now overrideable with `-- --run-stale-hours=<n>` and `-- --audit-stale-hours=<n>`. The recorded operator snapshot freshness threshold is now host-tunable too via `-- --snapshot-stale-hours=<n>` or `BULL_BEAR_OPERATOR_SNAPSHOT_STALE_HOURS`, so the saved handoff itself can follow stricter or looser rollout expectations without editing code.
- The recorded operator-artifact summary route (`/api/operator-artifact-status`) now also reports the active operator-artifact freshness threshold in both JSON and `HEAD` metadata (`X-Operator-Artifact-Stale-Threshold-Hours`), and it now includes expected-count / missing-count / all-present metadata plus the expected and currently missing saved filenames, so lightweight monitors can tell the difference between stale proof and incomplete proof without needing separate env/config knowledge.
- The app summary routes `/api/operator-status` and `/api/asset-production-status` now also support stable conditional revalidation on both `GET` and `HEAD` via `ETag`, `Last-Modified`, `If-None-Match`, and `If-Modified-Since`, so dashboards and lightweight monitors can cheaply confirm the operator/asset summaries have not changed without redownloading the full JSON payload every poll.
- `npm run status:operator -- --record` now writes a machine-readable operator proof snapshot (`data/generated/operator-status/latest.json`), a human-readable text handoff (`data/generated/operator-status/latest.txt`), a Markdown handoff (`data/generated/operator-status/latest.md`), and an NDJSON history row in `data/generated/operator-status/history.ndjson`, so release checks leave behind concrete evidence that is easy to inspect or paste into chats/issues without reformatting.
- Recorded operator snapshots now also carry a small trend summary: previous recorded level, whether the status level changed on this run, the latest few READY/WATCH/ATTENTION levels pulled from snapshot history, recent level counts across that window, and the current same-level streak, so operators can spot regressions or improving momentum without opening the NDJSON log by hand.
- The homepage now reads the recorded operator snapshot at runtime from `data/generated/operator-status/latest.json` and surfaces release readiness in-app: overall READY/WATCH/ATTENTION level, installed-cron/run-health, latest capture proof, recent recorded trend, recorded issues/warnings, the top recommended next actions, and direct links to the latest JSON/text/Markdown handoff artifacts plus the raw `history.ndjson` trend log. The latest capture-proof card now also shows the recorded HTTP status plus whether the audit response itself was marked ok/failed, so operators can spot a bad capture attempt without opening raw JSON, both the scheduler run-health row and capture-audit row now include the recorded age and freshness threshold so stale evidence is easier to judge at a glance, and the app now explicitly flags when the recorded operator snapshot itself has gone stale so operators do not mistake an old handoff for current release readiness. That same recorded-snapshot freshness signal now also appears in the CLI/text/Markdown operator handoff output, so terminal-only rollout reviews no longer have to infer whether the saved proof itself is old. The recorded artifact block now also shows each file's size, last-updated time, freshness verdict, age, threshold, and relative path so operators can tell at a glance whether the handoff proof they are about to open is current, and the artifact download route now returns filename / label / relative-path / freshness / age / threshold / last-modified / byte-size headers plus stable conditional revalidation on both `GET` and `HEAD`, supporting both `If-None-Match` and `If-Modified-Since` `304 Not Modified` checks so saved handoffs carry clearer provenance/freshness metadata and lightweight automation can recheck proof freshness without redownloading the full file. For automation that wants one stable machine-readable operator surface instead of scraping the homepage or pulling individual proof files, the app now also exposes `/api/operator-status` with the full recorded operator summary plus lightweight `HEAD` metadata headers for overall level, snapshot freshness, cron/run health, audit health, issue/warning counts, and trend sample size. It also now exposes `/api/operator-artifact-status`, a one-request JSON/`HEAD` summary of the saved operator handoff files themselves (artifact count, fresh/stale totals, and latest/oldest saved-proof freshness), so lightweight monitors can inspect recorded operator-proof freshness without polling each saved artifact individually. The operator-artifact freshness window defaults to 24h and can be tuned with `BULL_BEAR_OPERATOR_ARTIFACT_STALE_HOURS`. If no recorded snapshot exists yet, the app now falls back gracefully with a clear `npm run status:operator -- --record` next step instead of depending on a baked-in build artifact.
- The production dashboard now also exposes the generated asset handoff bundle directly in-app through `/api/asset-production-artifact/[artifactName]`, so operators can open the current next-actions, staged-render, still-job, and loop-job JSON/Markdown exports from the UI instead of digging through `data/generated/`. That artifact surface now includes the recorded still-generation and loop-generation result ledgers too, so the same in-app download route covers both queued work and the latest execution proof. Those artifact links carry the same filename / last-modified / byte-size metadata plus cache-friendly `GET` / `HEAD` revalidation support used by the operator-proof route, and they now also return asset-specific label / relative-path / freshness / age / threshold headers, which makes asset handoffs easier to inspect manually and cheaper to poll from lightweight automation. The dashboard now also summarizes each execution ledger inline with the true latest run timestamp/status (derived from the newest recorded entry, not array order), a freshness verdict/threshold, and a status mix (for example generated vs dry-run vs auth-blocked), so operators can tell at a glance whether the recorded proof reflects fresh asset output, a dry-run verification pass, or a blocked provider run without opening raw JSON. The artifact download list now also flags each generated handoff file itself as fresh/stale with age + threshold context, so operators can tell when a queue/export is old before opening it. For automation that wants one cheap JSON summary instead of scraping the homepage or probing every artifact individually, the app now also exposes `/api/asset-production-status` with the full asset-production dashboard summary plus lightweight `HEAD` metadata headers for counts, artifact expected-count / missing-count / all-present completeness, the expected and currently missing generated handoff filenames, artifact freshness totals, the active asset-artifact stale-threshold hours, ledger freshness, and full-coverage state. It now also exposes `/api/review-status`, a focused machine-readable summary of the canonical still-review queue / frontier / next-action slice with lightweight `HEAD` metadata for candidate counts, queue depth, active range, frontier states, full-coverage status, and the expected/missing generated review-workflow source files backing that slice, so operators and lightweight monitors can tell stale review proof from incomplete review proof without pulling the full dashboard payload. The homepage Canonical asset production panel now mirrors that same review-source completeness proof inline, including expected vs missing generated review inputs and the latest review-input update timestamp, so operators can judge whether the in-app review queue is complete before acting on it. Asset-ledger freshness defaults to 24h and can be tuned per host with `BULL_BEAR_ASSET_LEDGER_STALE_HOURS`; artifact-list freshness defaults to 24h and can be tuned with `BULL_BEAR_ASSET_ARTIFACT_STALE_HOURS`.
- `npm run status:operator -- --fail-on-watch` now lets rollout automation treat any non-READY operator snapshot as a failing gate, instead of only hard-failing ATTENTION states.

### Shipped
- Next.js app scaffold
- Architecture, style bible, prompt system, state ladder, and animation docs
- State manifest for 20 canonical states
- Live composite signal engine foundation
- State-aware UI foundation
- State-transition-only persistence gating
- Live state resolver for current display + transition history
- Interactive transition timeline scrubber
- Debug panel for component-score and band-mapping transparency
- Deterministic still/loop asset resolver with loop variant rotation
- Animation-first hero that prefers canonical loops and falls back to stills
- State-band chart synced to transition timeline selection
- Dedicated scheduled capture endpoint for hourly persistence
- More responsive layout behavior for hero, metric grids, chart, and timeline detail views
- Canonical still prompt pack
- Exportable state prompt dataset for stills + loops
- fal.ai animation prompt documentation and workflow scaffolding
- Reproducible asset-prep workflow that auto-detects approved anchors and adjacent still candidate batches
- Frontier still render handoff export that stages copy-ready prompts and bridge-reference files into each next `out/state-xx-adjacent/` folder
- Provider-ready still image-edit request export (`canonical-image-generation-jobs.{json,md}`) so the next frontier batches can be executed without rebuilding prompts by hand
- Executable still-render runner (`npm run generate:stills`) that consumes those queued image-edit jobs, writes adjacent outputs into each `out/state-xx-adjacent/` folder, and falls back to a safe dry-run report when `OPENAI_API_KEY` is not configured
- Executable fal-powered loop runner (`npm run generate:loops`) that consumes the staged loop jobs, can submit real image-to-video requests through fal when `FAL_KEY` is configured, writes generated MP4s to the canonical runtime targets, and records a machine-readable execution report / auth-blocker summary for every queued loop target
- Full canonical runtime asset library shipped: 20 approved stills plus 60 approved loop MP4s covering every state/variant combination from state 01 through state 20
- Loop render handoff export that stages per-variant prompts, manifests, and still-reference copies into `out/loop-renders/state-xx-loop-y/` for every currently unlocked loop target
- Staged render handoff index that merges still + loop jobs into one concrete operator queue with exact prompt/manifest/reference file paths
- In-app canonical production dashboard that now highlights the approved contiguous state range, the next outward frontier states, the exact queued loop targets unlocked by approved stills, the merged production next-actions handoff, the staged render files to open next, and the latest still-generation + loop-generation execution reports / auth blockers from `canonical-image-generation-results.json` and `canonical-loop-generation-results.json`
- Completion-state production dashboard copy/logic that recognizes full coverage, counts shipped loop execution results correctly, and swaps backlog-oriented messaging for completion proof once the entire canonical library is present
- Timestamped still/loop execution reports so the dashboard shows when generation was last attempted, not just whether it was blocked, dry-run, or generated

### Live signal engine
Current live data sources:
- Fear & Greed API (`alternative.me`)
- CoinGecko daily BTC price history

Current calculations:
- Fear & Greed sentiment score
- price vs MA7 score
- price vs MA30 score
- weighted final score
- 20-state band resolution

### Production assets
Canonical production files now include:
- `data/state-manifest.json`
- `data/state-prompts.json`
- `docs/canonical-prompt-pack.md`
- `docs/fal-animation-prompts.md`
- `docs/asset-generation-workflow.md`

## Docs

- `docs/architecture.md`
- `docs/style-bible.md`
- `docs/prompt-system.md`
- `docs/state-ladder.md`
- `docs/animation-system.md`
- `docs/asset-production-plan.md`
- `docs/canonical-prompt-pack.md`
- `docs/fal-animation-prompts.md`
- `docs/asset-generation-workflow.md`
- `docs/release-prep-checklist.md`
- `docs/production-runbook.md`
- `docs/openclaw-hourly-capture-cron.json`
- `docs/roadmap.md`
- `docs/secrets-and-env.md`

## Repository structure

```text
src/
  lib/
  app/
  api/
docs/
  architecture.md
  style-bible.md
  prompt-system.md
  state-ladder.md
  animation-system.md
  asset-production-plan.md
  canonical-prompt-pack.md
  fal-animation-prompts.md
  asset-generation-workflow.md
  release-prep-checklist.md
  roadmap.md
data/
  frames.json
  state-manifest.json
  state-prompts.json
public/
  frames/
```

## Getting started

```bash
npm install
npm run dev
npm run assets:prepare
```

## Notes

The most important constraint is **consistency**. This is not a random image generator. It is a single market beast evolving across 20 canonical states.
