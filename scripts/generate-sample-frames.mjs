import fs from 'node:fs/promises';
import path from 'node:path';

const outputPath = path.resolve('data/frames.generated.json');

const samples = Array.from({ length: 12 }).map((_, index) => {
  const percentChange1h = Number(((Math.sin(index / 2) * 2.4)).toFixed(2));
  const direction = percentChange1h > 0.05 ? 'bull' : percentChange1h < -0.05 ? 'bear' : 'neutral';
  const signedScore = Math.max(-1, Math.min(1, percentChange1h / 3));
  const intensity = Math.round(Math.abs(signedScore) * 100);
  const stage = signedScore <= -0.85
    ? 'max-bear'
    : signedScore <= -0.55
      ? 'very-bear'
      : signedScore <= -0.2
        ? 'strong-bear'
        : signedScore < 0.2
          ? 'hybrid'
          : signedScore < 0.55
            ? 'strong-bull'
            : signedScore < 0.85
              ? 'very-bull'
              : 'max-bull';

  return {
    id: `sample-${index}`,
    timestamp: new Date(Date.now() - (11 - index) * 60 * 60 * 1000).toISOString(),
    currentPrice: 80000 + index * 170,
    previousPrice: 80000 + index * 170 - 100,
    percentChange1h,
    direction,
    intensity,
    signedScore,
    stage,
    prompt: `${stage} sample prompt`,
    imageUrl: `/frames/sample-${index}.jpg`,
    provider: 'placeholder'
  };
});

await fs.writeFile(outputPath, JSON.stringify(samples, null, 2));
console.log(`Generated ${samples.length} sample frames at ${outputPath}`);
