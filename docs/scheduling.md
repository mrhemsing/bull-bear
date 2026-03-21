# Scheduling capture

The app now exposes a dedicated capture endpoint:

- `GET /api/capture`
- `POST /api/capture`

This endpoint evaluates the live market, resolves the canonical state, and persists a new history record only when the state changes.

## Recommended production behavior

Run the app continuously, then trigger `/api/capture` on an hourly schedule.

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
- If `OPENAI_API_KEY` is not configured, capture still works and records a placeholder/preview result.
