export type MarketDirection = 'bull' | 'bear' | 'neutral';

export type VisualStage =
  | 'max-bear'
  | 'very-bear'
  | 'strong-bear'
  | 'hybrid'
  | 'strong-bull'
  | 'very-bull'
  | 'max-bull';

export interface StateManifestEntry {
  id: string;
  index: number;
  label: string;
  scoreMin: number;
  scoreMax: number;
  still: string;
  loops: string[];
}

export interface CompositeMarketSnapshot {
  timestamp: string;
  source: string;
  currentPrice: number;
  previousPrice: number;
  percentChange1h: number;
  ma7: number;
  ma30: number;
  priceChange24h: number;
  priceChange7d: number;
  fearAndGreed: number;
  fearGreedScore: number;
  marketBiasScore: number;
  momentumScore: number;
  derivativesScore: number;
  fundingRate: number;
  basisPct: number;
  openInterestChangePct1h: number;
  takerBuySellRatio: number;
  finalScore: number;
  stateIndex: number;
  stateLabel: string;
  stateId: string;
}

export interface MarketSnapshot {
  currentPrice: number;
  previousPrice: number;
  percentChange1h: number;
  timestamp: string;
  source: string;
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

export interface GenerationPreview {
  provider: string;
  status: 'configured' | 'not-configured';
  imageUrl?: string;
  imageBase64?: string;
  imageMimeType?: string;
  model?: string;
  revisedPrompt?: string;
  note: string;
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
  source?: string;
  stateIndex?: number;
  stateLabel?: string;
  finalScore?: number;
  fearAndGreed?: number;
  ma7?: number;
  ma30?: number;
  notes?: string;
}
