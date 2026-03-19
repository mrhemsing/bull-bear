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

export function stateModifierPrompt(state: CreatureState): string {
  switch (state.stage) {
    case 'max-bear':
      return 'extreme bearish dominance, massive bear skull and jaw, enormous claws, thick dark fur, crushing low predatory posture, cold blue-black atmosphere, maximum menace';
    case 'very-bear':
      return 'very strong bearish dominance, broader skull, heavier claws, dense fur mass, looming posture, darker colder shadows, brutal predator energy';
    case 'strong-bear':
      return 'clear bearish dominance, stronger bear morphology, heavier paws and fur, lower stalking posture, colder atmosphere, shadow-heavy menace';
    case 'hybrid':
      return 'perfectly balanced 50-50 bull-bear hybrid, equal horn and bear traits, symmetrical hybrid anatomy, controlled cinematic menace';
    case 'strong-bull':
      return 'clear bullish dominance, longer horns, stronger chest and shoulders, forward charging posture, hotter amber glow, aggressive upward force';
    case 'very-bull':
      return 'very strong bullish dominance, massive horns, muscular forward power, heated gold and ember accents, dominant charging energy, intense upward aggression';
    case 'max-bull':
      return 'extreme bullish dominance, colossal horns, maximum muscle and forward force, blazing amber-gold eyes, explosive charging posture, unstoppable upward market fury';
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
