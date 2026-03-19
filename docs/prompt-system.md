# Prompt System

## Prompt stack
Each generated asset should be composed from four layers.

### 1. Master style
Fixed art direction.

### 2. Identity lock
Fixed creature identity and consistency constraints.

### 3. State descriptor
One of the 20 canonical market states.

### 4. Variation modifier
Only used for animation loops (A/B/C motion treatment).

## Master style prompt

colossal cinematic market beast portrait, hyper-detailed semi-photoreal dark fantasy creature, Wall Street financial district destruction, smoke, dust, debris, money swirling in the air, low-angle hero composition, dramatic blockbuster lighting, high-contrast atmosphere, same visual DNA across every frame, same cinematic universe, ultra-detailed textures and consistent anatomy

## Identity lock prompt

the same creature in every image, a singular hybrid bull-bear market titan, consistent face structure, eyes, skull, body proportions, and presence, recognizable recurring identity, never a different species, always centered and dominant in frame

## State prompt structure

Each of the 20 states should specify:
- bull vs bear dominance
- eye color
- horn vs claw vs hoof emphasis
- posture intensity
- atmosphere temperature
- aggression level

## Example extremes

### State 01 — Extremely Bearish
extreme bearish dominance, massive bear skull and jaw, enormous claws, thick dark fur, crushing low predatory posture, red crimson eyes, cold blue-black atmosphere, overwhelming menace

### State 10 — Neutral
perfectly balanced 50-50 bull-bear hybrid, equal horn and bear traits, believable integration of hoof and claw structure, controlled cinematic menace, amber white-gold eyes

### State 20 — Extremely Bullish
extreme bullish dominance, colossal horns, maximum muscle and forward force, heavy hoof impact, blazing green eyes, heated gold-ember atmosphere, unstoppable upward market fury

## Still prompt pattern

```text
[MASTER_STYLE], [IDENTITY_LOCK], [STATE_DESCRIPTOR], still hero image, no text, no logo, no collage, one believable species
```

## Animation prompt pattern

```text
[MASTER_STYLE], [IDENTITY_LOCK], [STATE_DESCRIPTOR], short cinematic loop, subtle motion only, preserve exact framing and character identity, [VARIATION_MODIFIER]
```

## Variation modifiers

### Variation A — Contained menace
subtle breathing, restrained tension, slight eye glow pulse, minimal motion, premium hero loop

### Variation B — Atmospheric pressure
drifting smoke, floating bills, subtle haze movement, environmental tension, creature remains imposing and controlled

### Variation C — Creature energy
slight head movement, stronger body tension, horn or claw highlight flicker, contained intimidation, still fixed hero composition

## Production recommendation

1. Approve the 20 stills first.
2. Use each still as the anchor reference for its 3 looped animations.
3. Do not attempt state-to-state morph animation in V1.
