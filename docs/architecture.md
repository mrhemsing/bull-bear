# Architecture

## Goal

Represent Bitcoin market psychology as a single recurring cinematic bull-bear creature, driven by a composite score and rendered through a pre-generated library of still and looped visual states.

## Core product model

The product no longer relies on raw 1-hour BTC percentage movement alone.

Instead it uses:
- Fear & Greed sentiment
- BTC price vs 7-day moving average
- BTC price vs 30-day moving average

These are blended into a **continuous composite score** from `-100` to `+100`.

That score is then mapped into **20 canonical visual states**.

## System layers

### 1. Market data
Responsibilities:
- Fetch Fear & Greed score
- Fetch BTC price history
- Compute MA7 and MA30
- Store raw market inputs for each evaluation cycle

### 2. Signal engine
Responsibilities:
- Convert Fear & Greed into a centered sentiment score
- Convert price distance from MA7 and MA30 into trend scores
- Blend component scores with configurable weights
- Clamp final score to `-100` to `+100`

### 3. State mapper
Responsibilities:
- Map the composite score into one of 20 canonical states
- Return both the discrete state and the underlying continuous score
- Determine whether the live band has changed since the previous evaluation

### 4. Asset library
Responsibilities:
- Maintain 20 canonical still images
- Maintain 3 looped animations per state
- Keep asset paths and metadata in a manifest

### 5. Presentation layer
Responsibilities:
- Show the currently active state instantly
- Prefer looped animation when available
- Fall back to still imagery if needed
- Support historical playback and scrubbing via saved state records

## Evaluation policy

V1 behavior:
- evaluate market inputs every hour
- compute composite score
- map score to one of 20 states
- update the displayed creature only when the state changes

## Critical design rule

The product only works if the creature is perceived as one recurring being rather than a new monster every time.

That means the system must favor:
- stable framing
- stable art direction
- stable identity prompt
- pre-generated canonical state assets
- bounded transformation logic
- animation loops that preserve composition and anatomy
