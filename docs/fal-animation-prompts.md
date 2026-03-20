# fal.ai Animation Prompt Pack

This file defines the animation prompt system for generating the 60 canonical Bull Bear loops with fal.ai.

## Core principle

Each animation loop must be generated **from an approved still anchor** for its state.
Do not invent a new creature. Animate the approved creature.

## Universal animation base prompt

```text
Animate this exact creature as a short 3 to 5 second cinematic loop. Preserve the exact character identity, anatomy, framing, environment, and visual style from the source image. Keep the camera mostly fixed. Motion should be subtle, premium, and loopable. No scene cuts, no new subjects, no text, no logos, no drastic camera moves, no anatomy drift.
```

## Variation prompts

### Variation A — Contained menace
```text
Subtle breathing, slight eye glow pulsing, restrained body tension, minimal movement, premium hero loop, same Wall Street atmosphere, same low-angle composition.
```

### Variation B — Atmospheric pressure
```text
Subtle drifting smoke, floating paper money, haze movement, environmental pressure, faint motion in fur and lighting, creature remains imposing and controlled, same hero composition.
```

### Variation C — Creature energy
```text
Slight head movement, stronger body tension, subtle horn or claw highlight flicker, controlled intimidation, contained power, still loopable, still in the same fixed hero framing.
```

## State-specific motion notes

### Bearish side motion bias
For states 01-09:
- heavier breathing
- lower posture tension
- claw emphasis
- colder, darker atmosphere
- red eye pulse
- more looming predator energy than forward motion

### Neutral motion bias
For state 10:
- balanced tension
- amber / white-gold eye pulse
- symmetrical breathing
- restrained centered presence

### Bullish side motion bias
For states 11-20:
- more forward tension
- hoof impact readiness
- horn highlight emphasis
- warmer atmosphere
- green eye pulse
- stronger charge energy without breaking composition

## fal.ai request guidance

Recommended settings (adjust per model availability):
- duration: 3-5 seconds
- fixed / low camera motion
- source image strength high enough to preserve identity
- loop-friendly output when supported
- avoid prompt additions that introduce action scenes or new environments

## Production workflow

1. Approve the still for a state.
2. Run Variation A from that still.
3. Run Variation B from that still.
4. Run Variation C from that still.
5. Review all three before moving to the next state.

## Naming convention

- `state-01/loop-a.mp4`
- `state-01/loop-b.mp4`
- `state-01/loop-c.mp4`
- ...
- `state-20/loop-a.mp4`
- `state-20/loop-b.mp4`
- `state-20/loop-c.mp4`
