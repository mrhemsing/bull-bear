# 20-State Ladder

This project now uses a **continuous composite market score** in the range `-100` to `+100`, mapped into **20 canonical creature states**.

## Signal model

The creature state is determined from a weighted composite:

- **35%** Fear & Greed sentiment
- **40%** BTC price vs **7-day moving average**
- **25%** BTC price vs **30-day moving average**

### Component formulas

```text
sentiment_score = (fng - 50) * 2
trend7_pct = ((price / ma7) - 1) * 100
trend30_pct = ((price / ma30) - 1) * 100
trend7_score = clamp(trend7_pct * 8, -100, 100)
trend30_score = clamp(trend30_pct * 5, -100, 100)
final_score = clamp(
  sentiment_score * 0.35 +
  trend7_score * 0.40 +
  trend30_score * 0.25,
  -100,
  100
)
```

## Canonical band map

| State | Score Range | Label |
|---|---:|---|
| 01 | -100 to -85 | Extremely Bearish |
| 02 | -84 to -75 | Very Strong Bearish |
| 03 | -74 to -65 | Strong Bearish |
| 04 | -64 to -55 | Firmly Bearish |
| 05 | -54 to -45 | Bearish |
| 06 | -44 to -35 | Moderately Bearish |
| 07 | -34 to -25 | Lean Bearish |
| 08 | -24 to -15 | Slightly Bearish |
| 09 | -14 to -5 | Mildly Bearish |
| 10 | -4 to +4 | Neutral |
| 11 | +5 to +14 | Mildly Bullish |
| 12 | +15 to +24 | Slightly Bullish |
| 13 | +25 to +34 | Lean Bullish |
| 14 | +35 to +44 | Moderately Bullish |
| 15 | +45 to +54 | Bullish |
| 16 | +55 to +64 | Firmly Bullish |
| 17 | +65 to +74 | Strong Bullish |
| 18 | +75 to +84 | Very Strong Bullish |
| 19 | +85 to +94 | Exceptionally Bullish |
| 20 | +95 to +100 | Extremely Bullish |

## Generation policy

V1 product behavior:

- Evaluate the composite score **hourly**
- Map the score to one of the **20 canonical states**
- Update the live creature only when the mapped state changes
- Use **pre-generated stills and animation loops** for each state

## Why pre-generate

Pre-generating the 20 states gives the product:

- stronger identity consistency
- lower runtime cost
- instant state switching
- more reliable animation quality
- tighter artistic control
