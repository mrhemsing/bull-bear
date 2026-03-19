import type { CreatureState, PromptBundle } from './types';

export const MASTER_STYLE_PROMPT = [
  'colossal cinematic market beast portrait',
  'hyper-detailed semi-photoreal dark fantasy creature',
  'Wall Street financial district destruction',
  'smoke, dust, debris, money swirling in the air',
  'low-angle hero composition',
  'dramatic blockbuster lighting',
  'high-contrast atmosphere',
  'same visual DNA across every frame',
  'same cinematic universe',
  'ultra-detailed textures and consistent anatomy'
].join(', ');

export const IDENTITY_LOCK_PROMPT = [
  'the same creature in every image',
  'a singular hybrid bull-bear market titan',
  'consistent face structure, eyes, skull, body proportions, and presence',
  'recognizable recurring identity',
  'never a different species',
  'always centered and dominant in frame'
].join(', ');

function eyeColorPrompt(state: CreatureState): string {
  if (state.direction === 'bull') {
    return 'glowing green eyes, emerald market-fire in the eyes';
  }

  if (state.direction === 'bear') {
    return 'glowing red eyes, deep crimson market-fire in the eyes';
  }

  return 'balanced neutral eyes, white-gold or amber glow';
}

function anatomySignalPrompt(state: CreatureState): string {
  if (state.direction === 'bull') {
    return 'bull-side anatomy emphasized with heavy hoofed impact limbs, bear-side traits still present in a balanced genetic fusion';
  }

  if (state.direction === 'bear') {
    return 'bear-side anatomy emphasized with brutal claws and predatory forelimbs, bull-side traits still present in a balanced genetic fusion';
  }

  return 'balanced hybrid anatomy with believable integration of bull hoof structure and bear claw structure';
}

export function stateModifierPrompt(state: CreatureState): string {
  const eyePrompt = eyeColorPrompt(state);
  const anatomyPrompt = anatomySignalPrompt(state);

  switch (state.stage) {
    case 'max-bear':
      return ['extreme bearish dominance, massive bear skull and jaw, enormous claws, thick dark fur, crushing low predatory posture, cold blue-black atmosphere, maximum menace', eyePrompt, anatomyPrompt].join(', ');
    case 'very-bear':
      return ['very strong bearish dominance, broader skull, heavier claws, dense fur mass, looming posture, darker colder shadows, brutal predator energy', eyePrompt, anatomyPrompt].join(', ');
    case 'strong-bear':
      return ['clear bearish dominance, stronger bear morphology, heavier paws and fur, lower stalking posture, colder atmosphere, shadow-heavy menace', eyePrompt, anatomyPrompt].join(', ');
    case 'hybrid':
      return ['perfectly balanced 50-50 bull-bear hybrid, equal horn and bear traits, symmetrical hybrid anatomy, controlled cinematic menace', eyePrompt, anatomyPrompt].join(', ');
    case 'strong-bull':
      return ['clear bullish dominance, longer horns, stronger chest and shoulders, forward charging posture, hotter amber glow, aggressive upward force', eyePrompt, anatomyPrompt].join(', ');
    case 'very-bull':
      return ['very strong bullish dominance, massive horns, muscular forward power, heated gold and ember accents, dominant charging energy, intense upward aggression', eyePrompt, anatomyPrompt].join(', ');
    case 'max-bull':
      return ['extreme bullish dominance, colossal horns, maximum muscle and forward force, blazing amber-gold eyes, explosive charging posture, unstoppable upward market fury', eyePrompt, anatomyPrompt].join(', ');
  }
}

export function buildPromptBundle(state: CreatureState): PromptBundle {
  const stateModifier = stateModifierPrompt(state);
  const finalPrompt = [MASTER_STYLE_PROMPT, IDENTITY_LOCK_PROMPT, stateModifier].join(', ');

  return {
    masterStyle: MASTER_STYLE_PROMPT,
    identityLock: IDENTITY_LOCK_PROMPT,
    stateModifier,
    finalPrompt
  };
}
