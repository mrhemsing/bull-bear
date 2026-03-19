export type MarketDirection = 'bull' | 'bear' | 'neutral';

export type VisualStage =
  | 'max-bear'
  | 'very-bear'
  | 'strong-bear'
  | 'hybrid'
  | 'strong-bull'
  | 'very-bull'
  | 'max-bull';

export interface MarketSnapshot {
  currentPrice: number;
  previousPrice: number;
  percentChange1h: number;
  timestamp: string;
}

export interface CreatureState {
  direction: MarketDirection;
  intensity: number;
  stage: VisualStage;
  signedScore: number;
}

export interface PromptBundle {
  masterStyle: string;
  identityLock: string;
  stateModifier: string;
  finalPrompt: string;
}

export interface FrameRecord {
  id: string;
  timestamp: string;
  currentPrice: number;
  previousPrice: number;
  percentChange1h: number;
  direction: MarketDirection;
  intensity: number;
  signedScore: number;
  stage: VisualStage;
  prompt: string;
  imageUrl: string;
  provider: string;
  notes?: string;
}
