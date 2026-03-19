# Architecture

## Goal

Convert Bitcoin's 1-hour move into an evolving cinematic bull-bear creature, archive every frame, and expose that archive through a web UI with history playback.

## System layers

### 1. Market data
Responsibilities:
- Fetch BTC current price
- Fetch BTC price from 1 hour ago
- Calculate percentage move
- Store raw market snapshot for each generation event

### 2. State mapping
Responsibilities:
- Convert percentage move into a signed bull/bear score
- Clamp the score to a visually useful range
- Determine stage labels such as `hybrid`, `strong-bull`, `very-bear`

### 3. Prompt composition
Responsibilities:
- Keep a master style prompt fixed
- Keep a creature identity lock fixed
- Apply a state modifier based on the signed score
- Produce a final generation prompt for the image provider

### 4. Image generation
Responsibilities:
- Send prompt + reference images to the selected model
- Receive generated image
- Save image path and provider metadata

### 5. Frame archive
Responsibilities:
- Save timestamp, prices, percent move, state, prompt, image URL, provider
- Support historical querying for timeline and timelapse

### 6. Presentation UI
Responsibilities:
- Show latest frame prominently
- Show state metadata and market movement
- Support history scrubbing and later playback

## Critical design rule

The product only works if the creature is perceived as one recurring being rather than a new monster each hour.

That means the system must favor:
- stable framing
- stable art direction
- stable identity prompt
- reference-driven generation
- bounded transformation logic
